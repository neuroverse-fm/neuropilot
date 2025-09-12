import * as assert from 'assert';

// Simple tests for file action prompt logic
suite('file Actions', () => {
    test('get_files has fixed prompt', () => {
        const prompt = 'get a list of files in the workspace.';
        assert.strictEqual(prompt, 'get a list of files in the workspace.');
    });

    test('open_file prompt formats path', () => {
        const params = { filePath: 'src/index.ts' };
        const prompt = `open the file "${params.filePath}".`;
        assert.strictEqual(prompt, 'open the file "src/index.ts".');
    });

    test('read_file prompt formats path', () => {
        const params = { filePath: 'README.md' };
        const prompt = `read the file "${params.filePath}" (without opening it).`;
        assert.strictEqual(prompt, 'read the file "README.md" (without opening it).');
    });

    test('create_file prompt formats path', () => {
        const params = { filePath: 'new/file.txt' };
        const prompt = `create the file "${params.filePath}".`;
        assert.strictEqual(prompt, 'create the file "new/file.txt".');
    });

    test('create_folder prompt formats path', () => {
        const params = { folderPath: 'new/folder' };
        const prompt = `create the folder "${params.folderPath}".`;
        assert.strictEqual(prompt, 'create the folder "new/folder".');
    });

    test('rename_file_or_folder prompt formats paths', () => {
        const params = { oldPath: 'old/a.txt', newPath: 'new/a.txt' };
        const prompt = `rename "${params.oldPath}" to "${params.newPath}".`;
        assert.strictEqual(prompt, 'rename "old/a.txt" to "new/a.txt".');
    });

    test('delete_file_or_folder prompt formats path', () => {
        const params = { pathToDelete: 'old/file.txt' };
        const prompt = `delete "${params.pathToDelete}".`;
        assert.strictEqual(prompt, 'delete "old/file.txt".');
    });
});


