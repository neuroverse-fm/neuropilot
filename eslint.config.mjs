/* eslint-disable @stylistic/quotes */
/* eslint-disable @stylistic/indent */
/**
 * ESLint configuration for the project.
 * 
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
	{
		files: ['**/*.{js,mjs,cjs,ts}'],
		ignores: [
			'out',
			'playground/**',
			'**/vscode*.d.ts',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.stylistic,
	{
		plugins: {
			'@stylistic': stylistic,
		},
		rules: {
			// 'curly': ['warn', 'multi-or-nest'],
			'@stylistic/semi': ['warn', 'always'],
			'@stylistic/indent': ['error', 4],
			'@stylistic/comma-dangle': ['warn', 'always-multiline'],
			'@stylistic/eol-last': ["warn", "always"],
			'@stylistic/no-extra-parens': ["warn", "all"],
			'@stylistic/no-trailing-spaces': ['warn', { 'ignoreComments': true }],
			'@stylistic/quotes': ['error', 'single', { 'avoidEscape': true }],
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					'selector': 'import',
					'format': ['camelCase', 'PascalCase'],
				},
			],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					'argsIgnorePattern': '^_',
				},
			],
		},
	},
);
