import * as assert from 'assert';
import { editingActions } from '@/editing';

// Tests for the undo and save action prompt generators using real logic
suite('undo/save Actions', () => {
    test('undo has non-empty fixed prompt', () => {
        const prompt = editingActions.undo.promptGenerator as string;
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('save has non-empty fixed prompt', () => {
        const prompt = editingActions.save.promptGenerator as string;
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});


