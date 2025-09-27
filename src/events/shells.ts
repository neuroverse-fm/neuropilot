import * as vscode from 'vscode';
import { RCECancelEvent } from './utils';
import { NEURO } from '../constants';

export function notifyOnTerminalClose(terminal: string): RCECancelEvent | null {
    const shell = NEURO.terminalRegistry.get(terminal);
    if (!shell) return null;
    const event = new RCECancelEvent({
        reason: `the terminal ${terminal} was closed.`,
    });
    shell!.shellProcess!.on('close', event.fire);
    return event;
}

export function notifyOnTaskFinish(): RCECancelEvent {
    return new RCECancelEvent({
        reason: 'the task finished.',
        events: [
            [vscode.tasks.onDidEndTask, null],
        ],
    });
}
