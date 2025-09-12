import * as assert from 'assert';

// Simple tests for the rewrite_lines action prompt logic
suite('rewrite_lines Action', () => {
    test('should generate correct prompt for single line content', () => {
        const params = { startLine: 2, endLine: 4, content: 'only one line' };
        const lineCount = params.content.trim().split('\n').length;
        const prompt = `rewrite lines ${params.startLine}-${params.endLine} with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        assert.strictEqual(prompt, 'rewrite lines 2-4 with 1 line of content.');
    });

    test('should generate correct prompt for multiple line content', () => {
        const params = { startLine: 5, endLine: 10, content: 'a\nb\nc' };
        const lineCount = params.content.trim().split('\n').length;
        const prompt = `rewrite lines ${params.startLine}-${params.endLine} with ${lineCount} line${lineCount === 1 ? '' : 's'} of content.`;
        assert.strictEqual(prompt, 'rewrite lines 5-10 with 3 lines of content.');
    });
});


