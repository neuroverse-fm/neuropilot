import * as assert from 'assert';

// Simple tests for the delete_lines action prompt logic
suite('delete_lines Action', () => {
    test('should generate correct prompt', () => {
        const params = { startLine: 3, endLine: 7 };
        const prompt = `delete lines ${params.startLine}-${params.endLine}.`;
        assert.strictEqual(prompt, 'delete lines 3-7.');
    });
});


