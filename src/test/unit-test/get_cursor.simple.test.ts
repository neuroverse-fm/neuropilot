import * as assert from 'assert';
import { editingActions } from '@/editing';

// Test for the get_cursor action prompt generator using real logic
suite('get_cursor Action', () => {
    test('returns a non-empty fixed prompt', () => {
        const prompt = editingActions.get_cursor.promptGenerator as string;
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});


