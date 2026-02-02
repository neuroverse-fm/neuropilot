import * as assert from 'assert';
import { terminalActions } from '@/pseudoterminal';
import { ActionData } from '@/neuro_client_helper';

// Tests for terminal-related prompt generators using real logic with loose checks
suite('terminal Actions', () => {
    test('execute_in_terminal prompt formats command and shell', () => {
        // === Arrange & Act ===
        const prompt = terminalActions.execute_in_terminal.promptGenerator({ params: { command: 'echo hi', shell: 'bash' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.includes('echo hi'));
        assert.ok(prompt.toLowerCase().includes('bash'));
    });

    test('kill_terminal_process prompt formats shell', () => {
        // === Arrange & Act ===
        const prompt = terminalActions.kill_terminal_process.promptGenerator({ params: { shell: 'pwsh' } } as ActionData);

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('pwsh'));
    });

    test('get_currently_running_shells uses fixed prompt', () => {
        // === Arrange & Act ===
        const prompt = terminalActions.get_currently_running_shells.promptGenerator as string;

        // === Assert ===
        assert.ok(typeof prompt === 'string' && prompt.length > 0);
    });
});


