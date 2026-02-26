import { defineConfig } from 'rolldown';

const NODE_ENV = (process.env.NODE_ENV ?? 'production').toLowerCase();

if (!['production', 'development'].includes(NODE_ENV)) {
    throw new Error('Invalid NODE_ENV.');
}

export default defineConfig({
    input: 'src/in/desktop/extension.ts',
    output: {
        minify: !!(process.env.NODE_ENV === 'production'),
        file: 'out/desktop/extension.js',
        sourcemap: !(process.env.NODE_ENV === 'production'),
    },
    tsconfig: true,
});
