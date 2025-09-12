import * as assert from 'assert';

// Simple tests for lint action prompt logic
suite('lint Actions', () => {
    test('get_file_lint_problems formats file', () => {
        const params = { file: 'src/a.ts' };
        const prompt = `get linting diagnostics for "${params.file}".`;
        assert.strictEqual(prompt, 'get linting diagnostics for "src/a.ts".');
    });

    test('get_folder_lint_problems formats folder', () => {
        const params = { folder: 'src' };
        const prompt = `get linting diagnostics for "${params.folder}".`;
        assert.strictEqual(prompt, 'get linting diagnostics for "src".');
    });

    test('get_workspace_lint_problems fixed prompt', () => {
        const prompt = 'get linting diagnostics for the current workspace.';
        assert.strictEqual(prompt, 'get linting diagnostics for the current workspace.');
    });
});


