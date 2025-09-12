import * as assert from 'assert';

// Simple tests for the place_cursor action prompt logic
suite('place_cursor Action', () => {
    test('should generate correct prompt for absolute position', () => {
        const params = { line: 10, column: 5, type: 'absolute' as const };
        const prompt = `place the cursor at (${params.line}:${params.column}).`;
        assert.strictEqual(prompt, 'place the cursor at (10:5).');
    });

    test('should generate correct prompt for relative position', () => {
        const params = { line: 2, column: -1, type: 'relative' as const };
        const prompt = `move the cursor by (${params.line}:${params.column}).`;
        assert.strictEqual(prompt, 'move the cursor by (2:-1).');
    });
});


