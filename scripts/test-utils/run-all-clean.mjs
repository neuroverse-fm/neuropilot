import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOG_DIR = path.join('test-results', 'logs');
const DEFAULT_SUMMARY_PATH = path.join('test-results', 'reports', 'failures-summary.md');

function readArgValue(args, names) {
    for (let i = 0; i < args.length; i++) {
        const token = args[i];
        if (names.includes(token) && i + 1 < args.length) {
            return args[i + 1];
        }
        for (const name of names) {
            if (token.startsWith(`${name}=`)) {
                return token.slice(name.length + 1);
            }
        }
    }
    return undefined;
}

const args = process.argv.slice(2);
const summaryPath = readArgValue(args, ['--summary-path', '-SummaryPath']) ?? DEFAULT_SUMMARY_PATH;
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const logDir = DEFAULT_LOG_DIR;
const rawLog = path.join(logDir, `full-${timestamp}.log`);
const exitCodePath = path.join(logDir, `full-${timestamp}.exitcode`);

fs.mkdirSync(logDir, { recursive: true });
cleanupGeneratedArtifacts(logDir, summaryPath);

console.log('Running full test suite with compact console output...');
console.log(`Raw log will be captured at: ${rawLog}`);

const logFd = fs.openSync(rawLog, 'w');
const testResult = spawnSync('pnpm test', {
    shell: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
});
fs.closeSync(logFd);

const testExitCode = testResult.status ?? 1;
fs.writeFileSync(exitCodePath, String(testExitCode), 'utf8');

console.log('');
console.log(`Test command finished with exit code: ${testExitCode}`);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const parserScript = path.join(scriptDir, 'parse-failures.mjs');
const parserResult = spawnSync(process.execPath, [parserScript, '--log-path', rawLog, '--summary-path', summaryPath], {
    stdio: 'inherit',
    env: process.env,
});

if ((parserResult.status ?? 1) !== 0) {
    process.exit(parserResult.status ?? 1);
}

console.log('');
console.log('Failure summary:');
console.log(fs.readFileSync(summaryPath, 'utf8'));

if (testExitCode !== 0) {
    process.exit(testExitCode);
}

function cleanupGeneratedArtifacts(rawLogDir, summaryFilePath) {
    let removedRawCount = 0;
    for (const entry of fs.readdirSync(rawLogDir, { withFileTypes: true })) {
        if (!entry.isFile()) {
            continue;
        }
        if (!entry.name.endsWith('.log') && !entry.name.endsWith('.exitcode')) {
            continue;
        }
        fs.rmSync(path.join(rawLogDir, entry.name), { force: true });
        removedRawCount += 1;
    }

    let removedSummary = false;
    if (fs.existsSync(summaryFilePath)) {
        fs.rmSync(summaryFilePath, { force: true });
        removedSummary = true;
    }

    if (removedRawCount > 0 || removedSummary) {
        console.log(
            `Cleaned previous test artifacts: raw=${removedRawCount}, summary=${removedSummary ? 1 : 0}`,
        );
    }
}
