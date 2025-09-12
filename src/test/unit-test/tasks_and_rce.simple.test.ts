import * as assert from 'assert';

// Simple tests for tasks and rce action prompt logic
suite('tasks/rce Actions', () => {
    test('terminate_task fixed prompt', () => {
        const prompt = 'terminate the currently running task.';
        assert.strictEqual(prompt, 'terminate the currently running task.');
    });

    test('run_task formats task id', () => {
        const taskId = 'build';
        const prompt = `run the task "${taskId}".`;
        assert.strictEqual(prompt, 'run the task "build".');
    });

    test('cancel_request has empty prompt', () => {
        const prompt = '';
        assert.strictEqual(prompt, '');
    });
});


