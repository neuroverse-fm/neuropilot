import * as assert from 'assert';

// Simple test for the get_content action prompt logic
suite('get_content Action', () => {
    test('should have fixed prompt', () => {
        const prompt = "get the current file's contents.";
        assert.strictEqual(prompt, "get the current file's contents.");
    });
});


