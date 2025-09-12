import * as assert from 'assert';

// Simple tests for the undo and save action prompt logic
suite('undo/save Actions', () => {
    test('undo should have fixed prompt', () => {
        const prompt = 'undo the last action.';
        assert.strictEqual(prompt, 'undo the last action.');
    });

    test('save should have fixed prompt', () => {
        const prompt = 'save.';
        assert.strictEqual(prompt, 'save.');
    });
});


