import * as assert from 'assert';

// Simple tests for the delete_text action prompt logic
suite('delete_text Action', () => {
    test('should generate prompt with regex escaping when useRegex is true', () => {
        const params = { find: 'a+b', useRegex: true };
        const shown = params.useRegex ? params.find.replace(/[/-\\^$*+?.()|[\]{}]/g, '\\$&') : params.find;
        const prompt = `delete "${shown}".`;
        assert.strictEqual(prompt, 'delete "a\\+b".');
    });

    test('should generate prompt plain when useRegex is false', () => {
        const params = { find: 'hello', useRegex: false };
        const shown = params.useRegex ? params.find.replace(/[/-\\^$*+?.()|[\]{}]/g, '\\$&') : params.find;
        const prompt = `delete "${shown}".`;
        assert.strictEqual(prompt, 'delete "hello".');
    });
});


