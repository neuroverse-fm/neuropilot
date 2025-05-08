import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import stylisticJs from '@stylistic/eslint-plugin';

export default defineConfig([
    tseslint.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        plugins: { js, stylisticJs },
        extends: [js.configs.recommended, stylisticJs.configs['recommended-flat']],
        rules: {
            // 'indent': ['error', 4],
            '@stylistic/indent': ['error', 4],
            '@stylistic/semi': ['error', 'always'],
        },
    },
    { files: ['**/*.{js,mjs,cjs,ts}'], languageOptions: { globals: globals.node } },
]);
