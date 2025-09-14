import * as assert from 'assert';
import { fileActions } from '@/file_actions';
import { ActionData } from '@/neuro_client_helper';

// Tests for file action prompt generators using real logic with loose checks
suite('file Actions', () => {
    test('get_files has a non-empty fixed prompt', () => {
        const prompt = fileActions.get_files.promptGenerator as string;
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('open_file prompt formats path', () => {
        const prompt = fileActions.open_file.promptGenerator({ params: { filePath: 'src/index.ts' } } as ActionData);
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('src/index.ts'));
    });

    test('read_file prompt formats path', () => {
        const prompt = fileActions.read_file.promptGenerator({ params: { filePath: 'README.md' } } as ActionData);
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('README.md'));
    });

    test('create_file prompt formats path', () => {
        const prompt = fileActions.create_file.promptGenerator({ params: { filePath: 'new/file.txt' } } as ActionData);
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/file.txt'));
    });

    test('create_folder prompt formats path', () => {
        const prompt = fileActions.create_folder.promptGenerator({ params: { folderPath: 'new/folder' } } as ActionData);
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('new/folder'));
    });

    test('rename_file_or_folder prompt formats paths', () => {
        const prompt = fileActions.rename_file_or_folder.promptGenerator({ params: { oldPath: 'old/a.txt', newPath: 'new/a.txt' } } as ActionData);
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/a.txt'));
        assert.ok(prompt.includes('new/a.txt'));
    });

    test('delete_file_or_folder prompt formats path', () => {
        const prompt = fileActions.delete_file_or_folder.promptGenerator({ params: { pathToDelete: 'old/file.txt' } } as ActionData);
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('old/file.txt'));
    });
});


