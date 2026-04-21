import fs from 'node:fs';
import path from 'node:path';

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

function uniqueBy(items, keyFn) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = keyFn(item);
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }
    return result;
}

const args = process.argv.slice(2);
const logPath = readArgValue(args, ['--log-path', '-LogPath']);
const summaryPath = readArgValue(args, ['--summary-path', '-SummaryPath']) ?? DEFAULT_SUMMARY_PATH;

if (!logPath) {
    console.error('Missing required argument: --log-path (or -LogPath)');
    process.exit(1);
}

if (!fs.existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`);
    process.exit(1);
}

cleanupGeneratedArtifacts(logPath, summaryPath);

const summaryDir = path.dirname(summaryPath);
if (summaryDir && summaryDir !== '.' && !fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
}

const content = fs.readFileSync(logPath, 'utf8');
const normalized = content
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replaceAll('\0', '');

const tsPattern = /^(?<file>[\w./\\-]+\.ts)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+): (?<msg>.+)$/gm;
const cmdPattern = /^ERROR:\s+"(?<script>[^"]+)" exited with (?<code>\d+)\.$/gm;
const mochaFailPattern = /^\s*\d+\)\s+(?<name>.+)$/gm;
const errorLinePattern = /^\s*(?<kind>AssertionError|TypeError|ReferenceError|Error):\s*(?<msg>.+)$/gm;
const runtimeDetailPattern = /^\s*(?<idx>\d+)\)\s+(?<suite>[^\r\n]+)\r?\n\s+(?<name>[^\r\n]+):\r?\n\s+Error:\s*(?<msg>[^\r\n]+)/gm;

const tsErrors = uniqueBy(
    [...normalized.matchAll(tsPattern)].map(match => ({
        file: match.groups.file,
        line: Number(match.groups.line),
        col: Number(match.groups.col),
        code: match.groups.code,
        msg: match.groups.msg.trim(),
    })),
    item => `${item.file}:${item.line}:${item.col}:${item.code}`,
).sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col,
);

const cmdFailures = uniqueBy(
    [...normalized.matchAll(cmdPattern)].map(match => ({
        script: match.groups.script,
        code: Number(match.groups.code),
    })),
    item => item.script,
).sort((a, b) => a.script.localeCompare(b.script));

const mochaFailures = [...new Set([...normalized.matchAll(mochaFailPattern)].map(match => match.groups.name.trim()))].sort();

const runtimeFailures = uniqueBy(
    [...normalized.matchAll(runtimeDetailPattern)].map(match => ({
        suite: match.groups.suite.trim(),
        name: match.groups.name.trim(),
        msg: match.groups.msg.trim(),
    })),
    item => `${item.suite}::${item.name}`,
).sort((a, b) => a.suite.localeCompare(b.suite) || a.name.localeCompare(b.name));

const firstErrors = [];
for (const match of normalized.matchAll(errorLinePattern)) {
    const line = `${match.groups.kind}: ${match.groups.msg.trim()}`;
    if (!firstErrors.includes(line)) {
        firstErrors.push(line);
    }
    if (firstErrors.length >= 10) {
        break;
    }
}

const hasIcuIssue = normalized.includes('Invalid file descriptor to ICU data received');
const hasPortConflict = normalized.includes('EADDRINUSE');

const generated = new Date();
const report = [];

report.push('# Test Failure Summary');
report.push('');
report.push(`- Generated: ${generated.toISOString()}`);
report.push(`- Source log: ${logPath}`);
report.push('');

report.push('## Command Failures');
report.push('');
if (cmdFailures.length === 0) {
    report.push('- None detected');
} else {
    for (const failure of cmdFailures) {
        report.push(`- ${failure.script} exited with code ${failure.code}`);
    }
}
report.push('');

report.push('## TypeScript Compile Errors');
report.push('');
if (tsErrors.length === 0) {
    report.push('- None detected');
} else {
    for (const err of tsErrors) {
        report.push(`- ${err.code} in ${err.file}:${err.line}:${err.col} - ${err.msg}`);
    }
}
report.push('');

report.push('## Runtime Test Failures');
report.push('');
if (runtimeFailures.length > 0) {
    for (const failure of runtimeFailures) {
        report.push(`- ${failure.suite} / ${failure.name}: ${failure.msg}`);
    }
} else if (mochaFailures.length === 0) {
    report.push('- None detected');
} else {
    for (const failureName of mochaFailures) {
        report.push(`- ${failureName}`);
    }
}
report.push('');

report.push('## Error Lines (first unique matches)');
report.push('');
if (firstErrors.length === 0) {
    report.push('- None detected');
} else {
    for (const line of firstErrors) {
        report.push(`- ${line}`);
    }
}
report.push('');

report.push('## Triage Notes');
report.push('');
if (tsErrors.length > 0 && runtimeFailures.length === 0 && mochaFailures.length === 0) {
    report.push('- Current failures are test compile/type-level mismatches.');
    report.push('- Service runtime behavior is not yet executed in the failing stages.');
    report.push('- Priority: fix test code signatures/types first, then rerun full suite for runtime regressions.');
} else if (runtimeFailures.length > 0 || mochaFailures.length > 0) {
    report.push('- Runtime test failures detected; inspect assertion stacks for service vs test defects.');
} else if (cmdFailures.length > 0) {
    report.push('- Failures appear to be test-runner infrastructure issues (command-level), not assertion/type failures.');
    if (hasIcuIssue) {
        report.push('- Detected Chromium/VS Code launch issue: `Invalid file descriptor to ICU data received`.');
    }
    if (hasPortConflict) {
        report.push('- Detected local port collision on 3000 (`EADDRINUSE`) during web test server startup.');
    }
} else {
    report.push('- No explicit failures parsed; inspect raw log for non-standard output formats.');
}

fs.writeFileSync(summaryPath, report.join('\n') + '\n', 'utf8');

console.log(`SUMMARY_PATH=${summaryPath}`);
console.log(`COMMAND_FAILURES=${cmdFailures.length}`);
console.log(`TS_ERRORS=${tsErrors.length}`);
console.log(`RUNTIME_FAILURES=${runtimeFailures.length + mochaFailures.length}`);

function cleanupGeneratedArtifacts(currentLogPath, summaryFilePath) {
    const currentLogAbsPath = path.resolve(currentLogPath);
    const currentExitCodeAbsPath = currentLogAbsPath.endsWith('.log')
        ? `${currentLogAbsPath.slice(0, -'.log'.length)}.exitcode`
        : null;
    const logDirAbsPath = path.resolve(DEFAULT_LOG_DIR);

    let removedRawCount = 0;
    if (fs.existsSync(logDirAbsPath)) {
        for (const entry of fs.readdirSync(logDirAbsPath, { withFileTypes: true })) {
            if (!entry.isFile()) {
                continue;
            }
            if (!entry.name.endsWith('.log') && !entry.name.endsWith('.exitcode')) {
                continue;
            }

            const entryPath = path.resolve(path.join(logDirAbsPath, entry.name));
            if (entryPath === currentLogAbsPath) {
                continue;
            }
            if (currentExitCodeAbsPath && entryPath === currentExitCodeAbsPath) {
                continue;
            }

            fs.rmSync(entryPath, { force: true });
            removedRawCount += 1;
        }
    }

    let removedSummary = false;
    if (fs.existsSync(summaryFilePath)) {
        fs.rmSync(summaryFilePath, { force: true });
        removedSummary = true;
    }

    if (removedRawCount > 0 || removedSummary) {
        console.log(
            `Cleaned previous parse artifacts: raw=${removedRawCount}, summary=${removedSummary ? 1 : 0}`,
        );
    }
}
