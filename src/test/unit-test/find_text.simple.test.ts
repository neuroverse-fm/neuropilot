import * as assert from 'assert';

// Simple tests for the find_text action prompt logic
suite('find_text Action', () => {
    test('should generate prompt with regex escaping when useRegex is true', () => {
        const params = { find: 'foo(bar)', useRegex: true };
        const shown = params.useRegex ? params.find.replace(/[/-\\^$*+?.()|[\]{}]/g, '\\$&') : params.find;
        const prompt = `find "${shown}".`;
        assert.strictEqual(prompt, 'find "foo\\(bar\\)".');
    });

    test('should generate prompt plain when useRegex is false', () => {
        const params = { find: 'baz', useRegex: false };
        const shown = params.useRegex ? params.find.replace(/[/-\\^$*+?.()|[\]{}]/g, '\\$&') : params.find;
        const prompt = `find "${shown}".`;
        assert.strictEqual(prompt, 'find "baz".');
    });
});


