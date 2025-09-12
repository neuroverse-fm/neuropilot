import * as assert from 'assert';

// Simple tests for the insert_text action prompt logic
suite('insert_text Action', () => {
    test('should generate correct prompt for single line', () => {
        const text = 'hello world';
        const lineCount = text.trim().split('\n').length;
        const prompt = `insert ${lineCount} line${lineCount === 1 ? '' : 's'} of code.`;
        assert.strictEqual(prompt, 'insert 1 line of code.');
    });

    test('should generate correct prompt for multiple lines', () => {
        const text = 'a\nb\nc';
        const lineCount = text.trim().split('\n').length;
        const prompt = `insert ${lineCount} line${lineCount === 1 ? '' : 's'} of code.`;
        assert.strictEqual(prompt, 'insert 3 lines of code.');
    });
});


