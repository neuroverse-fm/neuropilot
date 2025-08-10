import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
    {
        label: 'desktopUnitTest',
        platform: 'desktop',
        files: 'out/desktop/test.js',
        workspaceFolder: './test-playground',
        browser: '',
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['src/test/**/*.test.ts', 'src/test/suite/desktop/index.ts', 'src/web/**/*'],
            output: './coverage',
        },
        env: {
            NEUROPILOT_TEST: 'true',
        },
    },
    // Web tests go here...
]);
