import { defineConfig } from 'rolldown';

const NODE_ENV = (process.env.NODE_ENV ?? 'production').toLowerCase();

if (!['production', 'development'].includes(NODE_ENV)) {
    throw new Error('Invalid NODE_ENV.');
}

export default defineConfig({
    input: 'webview/**/*.tsx',
    output: {
        minify: !!(process.env.NODE_ENV === 'production'),
        dir: 'out/webview',
        sourcemap: !(process.env.NODE_ENV === 'production'),
    },
    tsconfig: true,
});
