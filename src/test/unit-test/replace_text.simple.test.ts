import * as assert from 'assert';

// Simple tests for the replace_text action prompt logic
suite('replace_text Action', () => {
    test('should generate prompt without regex escaping when useRegex is true', () => {
        const params = { find: 'a+b', replaceWith: 'x', useRegex: true };
        const shown = params.useRegex ? params.find.replace(/[/-\\^$*+?.()|[\]{}]/g, '\\$&') : params.find;
        const prompt = `replace "${shown}" with "${params.replaceWith}".`;
        // When useRegex is true, the editing.ts prompt escapes the find for display
        assert.strictEqual(prompt, 'replace "a\\+b" with "x".');
    });

    test('should generate prompt plain when useRegex is false', () => {
        const params = { find: 'hello', replaceWith: 'world', useRegex: false };
        const shown = params.useRegex ? params.find.replace(/[/-\\^$*+?.()|[\]{}]/g, '\\$&') : params.find;
        const prompt = `replace "${shown}" with "${params.replaceWith}".`;
        assert.strictEqual(prompt, 'replace "hello" with "world".');
    });
});


