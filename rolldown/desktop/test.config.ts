import { defineConfig } from 'rolldown';

export default defineConfig({
    input: 'src/test/suite/desktop/index.ts',
    output: {
        minify: false,
        file: 'out/desktop/test.js',
        sourcemap: true,
    },
    tsconfig: true,
});

