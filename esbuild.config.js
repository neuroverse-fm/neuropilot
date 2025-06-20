/* eslint-disable no-undef */
import { build, context } from 'esbuild';

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const desktopFlag = args.includes('--desktop');
const webFlag = args.includes('--web');

// Determine targets: if neither desktop nor web specified, build/watch both
const doDesktop = desktopFlag || !desktopFlag && !webFlag;
const doWeb = webFlag || !desktopFlag && !webFlag;

// Common build options for desktop
const desktopOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    target: ['node16'],
    sourcemap: true,
    outfile: 'out/extension.js',
    external: ['vscode'],
    tsconfig: 'tsconfig.json',
    define: { 'process.env.NODE_ENV': '"production"' },
};

// Common build options for web
const webOptions = {
    entryPoints: ['src/web/extension.ts'],
    bundle: true,
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
    outfile: 'out/web/extension.js',
    external: ['vscode'],
    tsconfig: 'tsconfig.web.json',
    define: { 'process.env.NODE_ENV': '"production"' },
};

async function run() {
    if (watchMode) {
        if (doDesktop) {
            const desktopCtx = await context(desktopOptions);
            desktopCtx.watch();
            console.log('esbuild: watching desktop build...');
        }
        if (doWeb) {
            const webCtx = await context(webOptions);
            webCtx.watch();
            console.log('esbuild: watching web build...');
        }
    } else {
        if (doDesktop) {
            await build(desktopOptions);
            console.log('esbuild: desktop build complete');
        }
        if (doWeb) {
            await build(webOptions);
            console.log('esbuild: web build complete');
        }
    }
}

run().catch(erm => {
    console.error(erm);
    process.exit(1);
});
