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
            output: './coverage-desktop',
        },
        env: {
            NEUROPILOT_TEST: 'true',
        },
    },
    {
        label: 'webUnitTest',
        platform: 'desktop',
        files: 'out/web/test/index.js',
        workspaceFolder: './test-playground',
        // no browser needed; runs under Electron extension host
        browser: '',
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['src/test/**/*.test.ts', 'src/test/suite/web/index.ts', 'src/test/suite/web/index.browser.ts', 'src/desktop/**/*'],
            output: './coverage-web',
        },
        env: {
            NEUROPILOT_TEST: 'true',
        },
    },
    {
        label: 'browserUnitTest',
        platform: 'desktop',
        files: 'out/web/test/browser.js',
        workspaceFolder: './test-playground',
        // Browser NEEDS to be provided at runtime
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['src/test/**/*.test.ts', 'src/test/suite/web/index.ts', 'src/test/suite/web/index.browser.ts', 'src/desktop/**/*'],
            output: './coverage-browser',
        },
        env: {
            NEUROPILOT_TEST: 'true',
        },
    },
]);
