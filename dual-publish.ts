#!/usr/bin/env node
/**
 * dual-publish-cli.ts
 *
 * Usage:
 *   # default: build then publish both targets (if tokens present)
 *   npx ts-node scripts/dual-publish-cli.ts
 *
 * Example:
 *   OVSX_PAT=... VSCE_PAT=... npx ts-node scripts/dual-publish-cli.ts --project . 
 *
 * Flags:
 *   --no-build            : skip building via @vscode/vsce (use existing .vsix or --vsix)
 *   --vsix <path>         : path to a prebuilt .vsix to publish (skips find step)
 *   --project <dir>       : project directory to package (default: cwd)
 *   --registry <url>      : Open VSX registry base (default: https://open-vsx.org)
 *   --vsce-pat <token>    : VS Marketplace PAT (env VSCE_PAT also supported)
 *   --ovsx-pat <token>    : Open VSX PAT (env OVSX_PAT also supported)
 *   --skip-marketplace    : don't publish to Visual Studio Marketplace
 *   --skip-openvsx        : don't publish to Open VSX
 *   --retries <n>         : retry attempts for Open VSX (default: 2)
 *   --help                : show help
 */

import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import axios from 'axios';
import FormData from 'form-data';
import { createVSIX, publishVSIX } from '@vscode/vsce';

function log(...s: unknown[]) {
    console.log('[dual-publish]', ...s);
}

async function findLatestVsix(dir = process.cwd()): Promise<string | null> {
    const files = await fs.promises.readdir(dir);
    const vsixFiles = files.filter((f) => f.endsWith('.vsix'));
    if (vsixFiles.length === 0) return null;
    let latestName: string | null = null;
    let latestMtime = 0;
    for (const name of vsixFiles) {
        const st = await fs.promises.stat(path.join(dir, name));
        if (!latestName || st.mtimeMs > latestMtime) {
            latestName = name;
            latestMtime = st.mtimeMs;
        }
    }
    return latestName ? path.join(dir, latestName) : null;
}

/** Try to package with the @vscode/vsce programmatic API.
 *  Returns the vsix path if successful, otherwise throws.
 */
async function packageWithVsce(projectDir: string): Promise<string> {
    // attempt to import the programmatic API
    try {
    // dynamic import so script still runs if @vscode/vsce isn't installed
        await createVSIX({ cwd: projectDir });

        // If we got here but didn't receive a path, find a .vsix in projectDir
        const found = await findLatestVsix(projectDir);
        if (found) return found;
        throw new Error('Packaging completed but no .vsix was located in project directory.');
    } catch (erm) {
    // rethrow with helpful message
        throw new Error(
            `Failed to package with @vscode/vsce programmatic API: ${erm}\n` +
            'If you prefer to avoid the programmatic API or it\'s not available, run with --no-build and supply a prebuilt .vsix via --vsix or place it in the project root.',
        );
    }
}

/** Publish to Visual Studio Marketplace via programmatic vsce API */
async function publishToMarketplace(vsixPath: string, pat: string | undefined) {
    if (!pat) throw new Error('VSCE PAT missing (pass --vsce-pat or set VSCE_PAT env)');
    log('Publishing to Visual Studio Marketplace...');
    try {
        await publishVSIX(vsixPath);
    } catch (erm) {
    // provide a helpful error note: maybe version mismatch
        throw new Error(`Failed to publish to VS Marketplace using @vscode/vsce: ${erm}\n` +
        'Ensure you have @vscode/vsce installed and a compatible version, or publish manually.');
    }
}

/** Publish to Open VSX via HTTP multipart upload */
async function publishToOpenVSX(
    vsixPath: string,
    registryBase: string,
    token: string,
    retries = 2,
    backoffMs = 1000,
) {
    if (!token) throw new Error('OVSX PAT missing (pass --ovsx-pat or set OVSX_PAT env)');
    const url = registryBase.replace(/\/$/, '') + '/api/-/publish';
    log(`Uploading to Open VSX registry ${url} ...`);
    const form = new FormData();
    form.append('file', fs.createReadStream(vsixPath));

    const headers = {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
    };

    let attempt = 0;
    while (true) {
        try {
            const resp = await axios.post(url, form, {
                headers,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                validateStatus: (s) => s < 500,
            });
            if (resp.status >= 400) {
                if (resp.status === 429 && attempt < retries) {
                    await delay(backoffMs * Math.pow(2, attempt));
                    attempt++;
                    continue;
                }
                throw new Error(`Open VSX publish failed: HTTP ${resp.status} - ${JSON.stringify(resp.data)}`);
            }
            log('Open VSX publish successful:', resp.data);
            return resp.data;
        } catch (erm) {
            attempt++;
            const shouldRetry = attempt <= retries;
            if (!shouldRetry) {
                throw new Error(`Open VSX publish failed after ${attempt} attempts: ${erm}`);
            }
            log(`Open VSX publish attempt ${attempt} failed: ${erm} — retrying...`);
            await delay(backoffMs * Math.pow(2, attempt - 1));
        }
    }
}

function delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

async function main() {
    const argv = minimist(process.argv.slice(2), {
        boolean: ['no-build', 'skip-marketplace', 'skip-openvsx', 'help'],
        alias: { h: 'help', p: 'project', r: 'registry' },
        default: { registry: 'https://open-vsx.org', retries: 2 },
    });

    if (argv.help) {
        console.log(`dual-publish-cli flags:
  --no-build           Skip building via @vscode/vsce (use existing .vsix)
  --vsix <path>        Path to a prebuilt .vsix
  --project <dir>      Project directory to package (default: cwd)
  --registry <url>     Open VSX registry base (default: https://open-vsx.org)
  --vsce-pat <token>   VS Marketplace PAT (env VSCE_PAT also)
  --ovsx-pat <token>   Open VSX PAT (env OVSX_PAT also)
  --skip-marketplace   Don't publish to Visual Studio Marketplace
  --skip-openvsx       Don't publish to Open VSX
  --retries <n>        Open VSX retries (default: 2)
  --help               Show this help
`);
        process.exit(0);
    }

    const projectDir = path.resolve(argv.project || argv.p || '.');
    const noBuild = Boolean(argv['no-build']);
    const vsixArg = argv.vsix;
    const registry = argv.registry;
    const vscePat = argv['vsce-pat'] || process.env.VSCE_PAT;
    const ovsxPat = argv['ovsx-pat'] || process.env.OVSX_PAT;
    const skipMarketplace = Boolean(argv['skip-marketplace']);
    const skipOpenVSX = Boolean(argv['skip-openvsx']);
    const retries = Number(argv.retries ?? 2);

    let vsixPath: string | null = null;

    try {
        if (!noBuild) {
            log('Packaging extension (using @vscode/vsce programmatic API)...');
            try {
                vsixPath = await packageWithVsce(projectDir);
                log('Packaged VSIX at:', vsixPath);
            } catch (erm) {
                log('Error packaging via programmatic API:', erm);
                // Fall back: suggest using --no-build or installing a compatible vsce
                throw erm;
            }
        } else {
            log('--no-build specified; skipping packaging step.');
        }

        if (!vsixPath && typeof vsixArg === 'string') {
            vsixPath = path.resolve(String(vsixArg));
        }

        if (!vsixPath) {
            // try to find a .vsix in cwd or project dir
            const found = await findLatestVsix(projectDir);
            if (found) {
                vsixPath = found;
                log('Found VSIX at:', vsixPath);
            }
        }

        if (!vsixPath) {
            throw new Error('No VSIX available to publish. Either build (omit --no-build) or pass --vsix <path>.');
        }

        // publish to Marketplace
        if (!skipMarketplace) {
            if (!vscePat) {
                log('Skipping Marketplace publish — no VSCE PAT provided (set --vsce-pat or VSCE_PAT).');
            } else {
                try {
                    await publishToMarketplace(vsixPath, vscePat);
                } catch (erm) {
                    log('Marketplace publish failed:', erm);
                }
            }
        } else {
            log('Skipping Marketplace publish (--skip-marketplace).');
        }

        // publish to Open VSX
        if (!skipOpenVSX) {
            if (!ovsxPat) {
                log('Skipping Open VSX publish — no OVSX PAT provided (set --ovsx-pat or OVSX_PAT).');
            } else {
                try {
                    await publishToOpenVSX(vsixPath, registry, ovsxPat, retries);
                } catch (erm) {
                    log('Open VSX publish failed:', erm);
                }
            }
        } else {
            log('Skipping Open VSX publish (--skip-openvsx).');
        }

        log('dual-publish: finished.');
        process.exit(0);
    } catch (erm) {
        console.error('[dual-publish] ERROR:', erm);
        process.exit(1);
    }
}

main();
