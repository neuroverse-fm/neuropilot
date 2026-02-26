import { defineConfig } from 'rolldown';

export default defineConfig({
    input: 'src/test/suite/web/index.browser.ts',
    output: {
        minify: false,
        file: 'out/web/test/browser.js',
        sourcemap: true,
    },
    tsconfig: true,
});
