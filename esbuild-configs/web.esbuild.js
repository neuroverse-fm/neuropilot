/* eslint-disable no-undef */
import { context } from 'esbuild';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const assertPolyfill = {
    name: 'assert-polyfill',
    setup(build) {
    // Redirect both import "assert" and import "node:assert"
        build.onResolve({ filter: /^(node:)?assert$/ }, () => ({
            path: require.resolve('assert/'),
            namespace: 'file',
        }));
    },
};

export async function web(prodFlag, watchFlag) {
    const ctx = await context({
        entryPoints: ['src/web/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: prodFlag,
        sourcemap: !prodFlag,
        sourcesContent: false,
        platform: 'browser',
        outfile: 'out/web/extension.js',
        external: ['vscode'],
        logLevel: 'warning',
        plugins: [
            assertPolyfill,
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
        ],
    });
    if (watchFlag) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
    }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd(result => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location == null) return;
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};
