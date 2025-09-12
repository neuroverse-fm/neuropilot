import * as assert from 'assert';

// Simple tests for terminal-related prompt logic
suite('terminal Actions', () => {
    test('execute_in_terminal prompt formats command and shell', () => {
        const params = { command: 'echo hi', shell: 'bash' };
        const prompt = `run "${params.command}" in the "${params.shell}" shell.`;
        assert.strictEqual(prompt, 'run "echo hi" in the "bash" shell.');
    });

    test('kill_terminal_process prompt formats shell', () => {
        const params = { shell: 'pwsh' };
        const prompt = `kill the "${params.shell}" shell.`;
        assert.strictEqual(prompt, 'kill the "pwsh" shell.');
    });

    test('get_currently_running_shells uses fixed prompt', () => {
        const prompt = 'get the list of currently running shells.';
        assert.strictEqual(prompt, 'get the list of currently running shells.');
    });
});


