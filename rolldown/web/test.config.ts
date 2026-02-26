import { defineConfig } from 'rolldown';

export default defineConfig({
    input: 'src/test/suite/web/index.ts',
    output: {
        minify: false,
        file: 'out/web/test/index.js',
        sourcemap: true,
    },
    tsconfig: true,
});
