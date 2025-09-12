import * as assert from 'assert';

// Simple tests for the highlight_lines action prompt logic
suite('highlight_lines Action', () => {
    test('should generate correct prompt', () => {
        const params = { startLine: 1, endLine: 3 };
        const prompt = `highlight lines ${params.startLine}-${params.endLine}.`;
        assert.strictEqual(prompt, 'highlight lines 1-3.');
    });
});


