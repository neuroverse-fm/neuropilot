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
    {
        label: 'webUnitTest',
        platform: 'desktop',
        files: 'out/web/test.js',
        workspaceFolder: './test-playground',
        // no browser needed; runs under Electron extension host
        browser: '',
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['src/test/**/*.test.ts', 'src/test/suite/web/index.ts', 'src/desktop/**/*'],
            output: './coverage',
        },
        env: {
            NEUROPILOT_TEST: 'true',
        },
    },
]);
