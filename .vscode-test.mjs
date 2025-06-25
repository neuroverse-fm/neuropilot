import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    label: 'desktopUnitTest',
    files: 'out/test/**/*.test.js',
    workspaceFolder: './test-playground',
});
