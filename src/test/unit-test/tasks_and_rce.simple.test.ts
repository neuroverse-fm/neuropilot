import * as assert from 'assert';
import { taskHandlers } from '@/tasks';
import { cancelRequestAction } from '@/rce';

// Tests for tasks and rce action prompt generators using real logic
suite('tasks/rce Actions', () => {
    test('terminate_task fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = taskHandlers.terminate_task.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('cancel_request has empty prompt', () => {
        // === Arrange & Act ===
        const prompt = (cancelRequestAction.promptGenerator as () => string)();

        // === Assert ===
        assert.ok(typeof prompt === 'string');
        assert.strictEqual(prompt.length, 0);
    });
});


