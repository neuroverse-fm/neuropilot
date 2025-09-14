import * as assert from 'assert';
import { taskHandlers } from '@/tasks';
import { cancelRequestAction } from '@/rce';

// Tests for tasks and rce action prompt generators using real logic
suite('tasks/rce Actions', () => {
    test('terminate_task fixed prompt', () => {
        const prompt = taskHandlers.terminate_task.promptGenerator as string;
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });

    test('cancel_request has empty prompt', () => {
        const prompt = (cancelRequestAction.promptGenerator as () => string)();
        assert.ok(typeof prompt === 'string');
        assert.strictEqual(prompt.length, 0);
    });
});


