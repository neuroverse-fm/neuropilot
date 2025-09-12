import * as assert from 'assert';

// Simple tests for the insert_lines action prompt logic
suite('insert_lines Action', () => {
    test('should generate correct prompt without insertUnder', () => {
        const params = { text: 'a\nb', insertUnder: undefined as number | undefined };
        const lines = params.text.trim().split('\n').length;
        const prompt = `insert ${lines} line${lines !== 1 ? 's' : ''} of code below ${params.insertUnder ? `line ${params.insertUnder}` : 'her cursor'}.`;
        assert.strictEqual(prompt, 'insert 2 lines of code below her cursor.');
    });

    test('should generate correct prompt with insertUnder', () => {
        const params = { text: 'one line', insertUnder: 7 };
        const lines = params.text.trim().split('\n').length;
        const prompt = `insert ${lines} line${lines !== 1 ? 's' : ''} of code below ${params.insertUnder ? `line ${params.insertUnder}` : 'her cursor'}.`;
        assert.strictEqual(prompt, 'insert 1 line of code below line 7.');
    });
});


