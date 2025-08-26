import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Web Extension Tests', () => {
    test('Sanity Check', () => {
        assert.strictEqual(9 + 10, 19, '9 + 10 shouldn\'t be 21, it should be 19!');
    });

    test('Extension exists', async () => {
        const extension = vscode.extensions.getExtension('Pasu4.neuropilot');
        assert.ok(extension, 'Extension Pasu4.neuropilot should be installed!');
        await extension.activate();
        assert.ok(extension.isActive, 'Extension Pasu4.neuropilot should be active!');
    });

    test('Workspace folder is correct', () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should be defined!');
        assert.strictEqual(workspaceFolder.name, 'test-playground', 'test-playground should be the selected workspace folder!');
    });

    // We also need a test to ensure that polyfilled modules (i.e. assert) are successfully bundled.
});
