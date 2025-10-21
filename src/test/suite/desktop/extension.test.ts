import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Integration: Desktop extension smoke', () => {
    test('Sanity Check', () => {
        assert.strictEqual(1 + 1, 2, '1 + 1 should equal 2'); // can we do the sanity test using 9 + 10
    });

    test('Extension exists', async () => {
        const extension = vscode.extensions.getExtension('VSC-NeuroPilot.neuropilot-base');
        assert.ok(extension, 'Expected extension to be installed (VSC-NeuroPilot.neuropilot-base)');
        await extension.activate();
        assert.ok(extension.isActive, 'Extension should be active');
    });

    test('Workspace folder is correct', function() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder should be defined!');
        assert.strictEqual(workspaceFolder.name, 'test-playground', 'Workspace folder name should be test-playground!');
    });
});
