/* eslint-disable no-undef */
import { web } from './esbuild-configs/web.esbuild.js';
import { desktop } from './esbuild-configs/desktop.esbuild.js';
import * as fs from 'fs';

// Checks production mode
function determineProductionMode() {
    const prodFlag = process.argv.includes('--production');
    const devFlag = process.argv.includes('--development');
    if (prodFlag && devFlag) {
        console.error("Can't build for both prod and dev at the same time.");
    }
    // Check for explicit command line flags first
    if (prodFlag) {
        return true;
    }
    if (devFlag) {
        return false;
    }

    // Check environment variable
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv) {
        return nodeEnv.toLowerCase() === 'production';
    }

    // Default to development
    return false;
}

const production = determineProductionMode();
const watch = process.argv.includes('--watch');
const modeArgIndex = process.argv.indexOf('--mode');
const mode = modeArgIndex !== -1 && process.argv[modeArgIndex + 1] ? process.argv[modeArgIndex + 1] : 'default';

// Log the build configuration
console.log(`Build mode: ${production ? 'Production' : 'Development'}`);
if (process.env.NODE_ENV) {
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
}

let outDir;
switch (mode.toLowerCase()) {
    case 'web':
        outDir = './out/web';
        break;
    case 'desktop':
        outDir = './out/desktop';
        break;
    default:
        outDir = './out';
}
if (fs.existsSync(outDir)) {
    console.log(`Output directory ${outDir} already exists, removing dir...`);
    fs.rmSync(outDir, {recursive: true});
} else {
    console.log(`Output directory ${outDir} doesn't exist, skipping removal step.`);
}

(async () => {
    try {
        switch (mode.toLowerCase()) {
            case 'web':
                console.log((watch ? 'Watching' : 'Running') + ' web build...');
                await web(production, watch).catch(erm => {
                    console.error(erm);
                    process.exit(1);
                });
                break;
            case 'desktop':
                console.log((watch ? 'Watching' : 'Running') + ' desktop build...');
                await desktop(production, watch).catch(erm => {
                    console.error(erm);
                    process.exit(1);
                });
                break;
            case 'default':
                // Can't use watch while building both.
                if (watch) {
                    console.error('Cannot use flag --watch while building both desktop and web');
                    process.exit(1);
                }
                console.log('Running desktop build...');
                await desktop(production, false).catch(erm => {
                    console.error(erm);
                    process.exit(1);
                });
                console.log('Running web build...');
                await web(production, false).catch(erm => {
                    console.error(erm);
                    process.exit(1);
                });
                console.log('Build completed.');
                break;
            default:
                console.error(`Unknown mode: ${mode}`);
                process.exit(1);
        }
    } catch (erm) {
        console.error('Build failed:', erm);
        process.exit(1);
    }
})();
