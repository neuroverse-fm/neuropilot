import * as assert from 'assert';
import * as vscode from 'vscode';
import rewire from 'rewire';
import * as fileActions from '../../file_actions';
import { assertProperties } from '../test_utils';

const rewireFileActions = rewire('../../file_actions');

async function createTestFile(name: string): Promise<vscode.Uri> {
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'test_files', name);
    await vscode.workspace.fs.writeFile(uri, new Uint8Array(0));
    return uri;
}

suite('File Actions Tests', () => {
    teardown(async function() {
        // Delete all test files created during the tests
        const testFilesDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'test_files');
        vscode.workspace.fs.delete(testFilesDir, { recursive: true, useTrash: false });
    });

    test('Test file creation', async function() {
        const uri = await createTestFile('testFile.js');
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch (erm) {
            assert.fail(`File testFile.js should exist but does not: ${erm}`);
        }

        assert.strictEqual(stat.type, vscode.FileType.File, 'testFile.js should be a file');
    });

    test('Test path validation', async () => {
        const validatePath = rewireFileActions.__get__('validatePath');

        // Arrange
        const validUri = await createTestFile('validFile.js');
        const validPath = vscode.workspace.asRelativePath(validUri, false);
        const invalidPath = '.invalid/file.js'; // Neuro-unsafe because it starts with a dot
        const nonexistentPath = 'nonexistent/file.js';

        // Act & Assert
        assertProperties(await validatePath('', true, 'file'), { success: false, retry: true });

        assertProperties(await validatePath(validPath, true, 'file'), { success: true });
        assertProperties(await validatePath(validPath, false, 'file'), { success: false, retry: false });
        assertProperties(await validatePath(invalidPath, true, 'file'), { success: false, retry: false });
        assertProperties(await validatePath(invalidPath, false, 'file'), { success: false, retry: false });
        assertProperties(await validatePath(nonexistentPath, true, 'file'), { success: false, retry: false });
        assertProperties(await validatePath(nonexistentPath, false, 'file'), { success: true });
    });
});
