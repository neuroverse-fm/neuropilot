import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// @ts-check

const fsp = fs.promises;

async function exists(p) {
    try { await fsp.access(p); return true; } catch { return false; }
}

/**
 * Compute SHA-256 hash of a file
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function computeFileHash(filePath) {
    const content = await fsp.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively compute hashes of all files in a directory
 * @param {string} dir
 * @returns {Promise<Record<string, string>>}
 */
async function computeDirectoryHashes(dir) {
    const hashes = {};

    async function walk(currentPath, relativePath = '') {
        const stat = await fsp.lstat(currentPath);

        if (stat.isSymbolicLink()) {
            const real = await fsp.realpath(currentPath);
            return walk(real, relativePath);
        }

        if (stat.isDirectory()) {
            const items = await fsp.readdir(currentPath);
            for (const item of items) {
                const itemPath = path.join(currentPath, item);
                const itemRelative = relativePath ? path.join(relativePath, item) : item;
                await walk(itemPath, itemRelative);
            }
        } else if (stat.isFile()) {
            hashes[relativePath] = await computeFileHash(currentPath);
        }
    }

    await walk(dir);
    return hashes;
}

/**
 * Load cache from file
 * @param {string} cacheFile
 * @returns {Promise<Record<string, string>>}
 */
async function loadCache(cacheFile) {
    if (!await exists(cacheFile)) {
        return {};
    }
    try {
        const content = await fsp.readFile(cacheFile, 'utf-8');
        return JSON.parse(content);
    } catch (erm) {
        console.error(`Error while loading cache file: ${erm}`);
        return {};
    }
}

/**
 * Save cache to file
 * @param {string} cacheFile
 * @param {Record<string, string>} hashes
 */
async function saveCache(cacheFile, hashes) {
    await fsp.writeFile(cacheFile, JSON.stringify(hashes, null, 2), 'utf-8');
}

async function copyRecursiveFallback(src, dest) {
    const lst = await fsp.lstat(src);
    if (lst.isSymbolicLink()) {
        const real = await fsp.realpath(src);
        return copyRecursiveFallback(real, dest);
    }
    if (lst.isDirectory()) {
        await fsp.mkdir(dest, { recursive: true });
        const items = await fsp.readdir(src);
        for (const it of items) {
            await copyRecursiveFallback(path.join(src, it), path.join(dest, it));
        }
    } else if (lst.isFile()) {
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.copyFile(src, dest);
    } else {
        // other (socket, fifo...) — skip
    }
}

async function copyDir(src, dest) {
    // prefer fs.cp when available (Node 16.7+)
    if (typeof fs.cp === 'function') {
        // use dereference so symlinked files are copied as files (pnpm virtual store)
        await fs.promises.mkdir(dest, { recursive: true });
        await fs.promises.cp(src, dest, { recursive: true, dereference: true });
    } else {
        await copyRecursiveFallback(src, dest);
    }
}

async function main() {
    try {
        const destArg = process.argv[2] || 'media/codicons';
        const destDir = path.resolve(destArg);
        const cacheFile = path.join(destDir, '.cache-hash.json');

        let pkgJsonPath;
        try {
            // find the package.json for @vscode/codicons
            pkgJsonPath = path.resolve('./node_modules/@vscode/codicons/package.json');
        } catch {
            console.error('Could not resolve @vscode/codicons. Make sure it is installed (run pnpm install).');
            process.exit(2);
        }

        const pkgDir = path.dirname(pkgJsonPath);
        const candidates = [
            path.join(pkgDir, 'dist'),
            path.join(pkgDir, 'out'),
            path.join(pkgDir, 'lib'),
            pkgDir,
        ];

        let srcDir = null;
        for (const c of candidates) {
            if (await exists(c)) { srcDir = c; break; }
        }

        if (!srcDir) {
            console.error('Could not find codicons files in the package (no dist/out/lib). Aborting.');
            process.exit(3);
        }

        console.log(`Checking @vscode/codicons from: ${srcDir}`);

        // Compute hashes of source files
        console.log('Computing hashes...');
        const sourceHashes = await computeDirectoryHashes(srcDir);

        // Load cached hashes
        const cachedHashes = await loadCache(cacheFile);

        // Compare hashes to determine if update is needed
        const sourceKeys = Object.keys(sourceHashes).sort();
        const cachedKeys = Object.keys(cachedHashes).sort();

        let needsUpdate = false;

        if (sourceKeys.length !== cachedKeys.length) {
            needsUpdate = true;
            console.log('File count changed, update needed.');
        } else {
            for (const key of sourceKeys) {
                if (sourceHashes[key] !== cachedHashes[key]) {
                    needsUpdate = true;
                    console.log(`File changed: ${key}`);
                    break;
                }
            }
        }

        if (!needsUpdate) {
            console.log('✓ Codicons are up to date, no vendoring needed.');
            return;
        }

        console.log(`Vendoring @vscode/codicons from: ${srcDir}`);
        console.log(`→ destination: ${destDir}`);

        // copy
        await copyDir(srcDir, destDir);

        // Update cache
        await saveCache(cacheFile, sourceHashes);

        console.log('Done.');
    } catch (erm) {
        console.error('Error while vendoring codicons:', erm);
        process.exit(1);
    }
}

main();
