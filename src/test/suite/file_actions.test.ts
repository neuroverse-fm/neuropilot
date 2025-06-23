import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fileActions from '../../file_actions';
import rewire from 'rewire';
import { assertProperties, checkNoErrorWithTimeout, createTestDirectory, createTestFile } from '../test_utils';
import { ActionData, ActionValidationResult } from '../../neuro_client_helper';
import { NeuroClient } from 'neuro-game-sdk';
import { NEURO } from '../../constants';
import { anything, capture, instance, mock, verify } from 'ts-mockito';

const rewireFileActions = rewire('../../file_actions');

suite('File Actions Tests', () => {
    let originalClient: NeuroClient | null = null;
    let mockedClient: NeuroClient;

    setup(async function() {
        // Mock the NeuroClient to avoid actual network calls
        originalClient = NEURO.client;
        mockedClient = mock(NeuroClient);
        NEURO.client = instance(mockedClient);
    });


    teardown(async function() {
        // Delete all test files created during the tests
        const testFilesDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'test_files');
        await vscode.workspace.fs.delete(testFilesDir, { recursive: true, useTrash: false });

        // Restore the original NeuroClient
        NEURO.client = originalClient;
        originalClient = null;
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

    test('Test path validation', async function() {
        const validatePath: (path: string, shouldExist: boolean, pathType: string) => Promise<ActionValidationResult>
            = rewireFileActions.__get__('validatePath');

        // === Arrange ===
        const existingFileUri = await createTestFile('validFile.js');
        const unsafeFileUri = await createTestFile('.unsafeFile.js'); // Neuro-unsafe because it starts with a dot
        const existingFilePath = vscode.workspace.asRelativePath(existingFileUri, false);
        const unsafeFilePath = vscode.workspace.asRelativePath(unsafeFileUri, false);
        const nonexistentPath = 'nonexistent/file.js';

        // === Act & Assert ===
        assertProperties(await validatePath('', true, 'file'), { success: false, retry: true }, 'Empty path should be invalid');

        assertProperties(await validatePath(existingFilePath, true, 'file'), { success: true }, 'Existing path should be valid if shouldExist is true');
        assertProperties(await validatePath(existingFilePath, false, 'file'), { success: false, retry: false }, 'Existing path should not be valid if shouldExist is false');
        assertProperties(await validatePath(unsafeFilePath, true, 'file'), { success: false, retry: false }, 'Unsafe path should be invalid if shouldExist is true');
        assertProperties(await validatePath(unsafeFilePath, false, 'file'), { success: false, retry: false }, 'Unsafe path should not be valid if shouldExist is false');
        assertProperties(await validatePath(nonexistentPath, true, 'file'), { success: false, retry: false }, 'Nonexistent path should be invalid if shouldExist is true');
        assertProperties(await validatePath(nonexistentPath, false, 'file'), { success: true }, 'Nonexistent path should be valid if shouldExist is false');
    });

    test('Test Neuro-safe rename validation', async function() {
        const neuroSafeRenameValidation: (actionData: ActionData) => Promise<ActionValidationResult>
            = rewireFileActions.__get__('neuroSafeRenameValidation');

        // === Arrange ===
        const fileUri1 = await createTestFile('file1.js');
        const fileUri2 = await createTestFile('file2.js');
        const unsafeUri = await createTestFile('.unsafe/file.js'); // Neuro-unsafe because it starts with a dot
        const filePath1 = vscode.workspace.asRelativePath(fileUri1, false);
        const filePath2 = vscode.workspace.asRelativePath(fileUri2, false);
        const unsafePath = vscode.workspace.asRelativePath(unsafeUri, false);
        const nonexistentPath = 'nonexistent/file.js';
        const nonexistentPath2 = 'nonexistent/file2.js';
        const unsafeNonexistentPath = '.unsafe/nonexistent/file.js';

        // === Act & Assert ===

        assertProperties(await neuroSafeRenameValidation({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: nonexistentPath,
            },
        }), { success: true }, 'Rename should succeed if there is no file with the new name');

        assertProperties(await neuroSafeRenameValidation({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: filePath2,
            },
        }), { success: false, retry: false }, 'Rename should fail if a file with the new name already exists');

        assertProperties(await neuroSafeRenameValidation({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: unsafeNonexistentPath,
            },
        }), { success: false, retry: false }, 'Rename should fail if the new path is unsafe');

        assertProperties(await neuroSafeRenameValidation({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: unsafePath,
                newPath: nonexistentPath,
            },
        }), { success: false, retry: false }, 'Rename should fail if the old path is unsafe');

        assertProperties(await neuroSafeRenameValidation({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: nonexistentPath,
                newPath: nonexistentPath2,
            },
        }), { success: false, retry: false }, 'Rename should fail if the old path does not exist');

        assertProperties(await neuroSafeRenameValidation({
            id: 'abc',
            name: 'rename_file_or_folder',
            params: {
                oldPath: filePath1,
                newPath: filePath1,
            },
        }), { success: false, retry: false }, 'Rename should fail if the old and new paths are the same');
    });

    test('Test Neuro-safe delete validation', async function() {
        const neuroSafeDeleteValidation: (actionData: ActionData) => Promise<ActionValidationResult>
            = rewireFileActions.__get__('neuroSafeDeleteValidation');

        // === Arrange ===
        const fileUri = await createTestFile('fileToDelete.js');
        const unsafeUri = await createTestFile('.unsafe/file.js'); // Neuro-unsafe because it starts with a dot
        const dirUri = await createTestDirectory('dirToDelete');
        const filePath = vscode.workspace.asRelativePath(fileUri, false);
        const dirPath = vscode.workspace.asRelativePath(dirUri, false);
        const unsafePath = vscode.workspace.asRelativePath(unsafeUri, false);
        const nonexistentFilePath = 'nonexistent/file.js';
        const nonexistentDirPath = 'nonexistent/dir';

        // === Act & Assert ===
        assertProperties(await neuroSafeDeleteValidation({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: filePath,
                recursive: false,
            },
        }), { success: true }, 'Non-recursive delete should succeed for an existing file');

        assertProperties(await neuroSafeDeleteValidation({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: filePath,
                recursive: true,
            },
        }), { success: false, retry: false }, 'Recursive delete should fail for an existing file');

        assertProperties(await neuroSafeDeleteValidation({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: dirPath,
                recursive: false,
            },
        }), { success: false, retry: false }, 'Non-recursive delete should fail for an existing directory');

        assertProperties(await neuroSafeDeleteValidation({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: dirPath,
                recursive: true,
            },
        }), { success: true }, 'Recursive delete should succeed for an existing directory');

        assertProperties(await neuroSafeDeleteValidation({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: unsafePath,
                recursive: false,
            },
        }), { success: false, retry: false }, 'Delete should fail for an unsafe file');

        assertProperties(await neuroSafeDeleteValidation({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: nonexistentFilePath,
                recursive: false,
            },
        }), { success: false, retry: false }, 'Non-recursive delete should fail for a nonexistent file');

        assertProperties(await neuroSafeDeleteValidation({
            id: 'abc',
            name: 'delete_file_or_folder',
            params: {
                path: nonexistentDirPath,
                recursive: true,
            },
        }), { success: false, retry: false }, 'Recursive delete should fail for a nonexistent directory');
    });

    test('Test getting files', async function() {
        // === Arrange ===
        const fileUri1 = await createTestFile('file1.js');
        const fileUri2 = await createTestFile('sub/file2.js');
        const unsafeFileUri = await createTestFile('.unsafe/file.js'); // Neuro-unsafe because it starts with a dot
        const emptyDirUri = await createTestDirectory('testDir');
        const filePath1 = vscode.workspace.asRelativePath(fileUri1, false);
        const filePath2 = vscode.workspace.asRelativePath(fileUri2, false);
        const unsafeFilePath = vscode.workspace.asRelativePath(unsafeFileUri, false);
        const emptyDirPath = vscode.workspace.asRelativePath(emptyDirUri, false);

        // === Act ===

        fileActions.handleGetFiles({ id: 'abc', name: 'get_files' });
        // NEURO.client!.sendContext('test');

        // Wait for context to be sent
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); });

        const [files] = capture(mockedClient.sendContext).last();
        const lines = files.split(/\r?\n/);
        lines.shift(); // Remove header line

        // === Assert ===
        assert.strictEqual(lines.includes(filePath1), true, 'File file1.js should be in the list of files');
        assert.strictEqual(lines.includes(filePath2), true, 'File sub/file2.js should be in the list of files');
        assert.strictEqual(lines.includes(unsafeFilePath), false, 'Unsafe file .unsafe/file.js should not be in the list of files');
        assert.strictEqual(lines.includes(emptyDirPath), false, 'Empty directory testDir should not be in the list of files');
    });
});
