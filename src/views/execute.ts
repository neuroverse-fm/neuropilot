import { BaseWebviewViewProvider, Message } from './base';
import { onDidAttemptAction, type ActionsEventData, type ActionStatus } from '../events/actions';
import * as vscode from 'vscode';

export interface ExecuteResult {
    status: ActionStatus;
    action: string;
    message?: string;
    executionId: string;
    sessionId: string;
}

export interface ExecutionHistoryItem extends ExecuteResult {
    timestamp: number;
}

export type ExecuteViewProviderMessage = {
    type: 'executionResult';
    result: ExecutionHistoryItem;
} | {
    type: 'updateStatus';
    executionId: string;
    status: ActionStatus;
    message?: string;
} | {
    type: 'currentSession';
    sessionId: string;
} | {
    type: 'addHistoryItem';
    item: ExecutionHistoryItem;
};

export class ExecuteViewProvider extends BaseWebviewViewProvider<Message, ExecuteViewProviderMessage> {
    private static readonly sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    public static readonly viewId: string = 'neuropilot.executionView';

    constructor() {
        super('execute/index.html', 'execute/main.js', ['execute/style.css']);
    }

    protected handleMessage(_message: Message): void { }

    protected onViewReady(): void {
        // Send current session ID to webview
        this.postMessage({
            type: 'currentSession',
            sessionId: ExecuteViewProvider.sessionId,
        });

        // Listen to action execution events and send them to the webview
        // The webview will handle deduplication using its persisted state
        onDidAttemptAction((data: ActionsEventData) => {
            this.sendExecutionResult({
                ...data,
                sessionId: ExecuteViewProvider.sessionId,
            });
        });
    }

    /**
     * Sends an execution result to the execute view.
     * The webview will determine whether to create a new entry or update an existing one.
     */
    public sendExecutionResult(result: ExecuteResult) {
        if (!this._view) {
            return;
        }

        this.postMessage({
            type: 'executionResult',
            result: {
                ...result,
                timestamp: Date.now(),
            },
        });
    }

    /**
     * Adds a custom history item to the execution view.
     * This is primarily for development/testing purposes.
     */
    public addCustomHistoryItem(item: ExecutionHistoryItem) {
        if (!this._view) {
            return;
        }

        this.postMessage({
            type: 'addHistoryItem',
            item,
        });
    }
}

/**
 * Dev command to add a custom history item for testing purposes.
 */
export async function addCustomExecutionHistoryItem(executeViewProvider: ExecuteViewProvider) {
    // Get action name
    const action = await vscode.window.showInputBox({
        prompt: 'Action name',
        placeHolder: 'e.g., place_cursor',
        validateInput: (value) => value.trim() ? null : 'Action name cannot be empty',
    });
    if (!action) return;

    // Get status
    const statusOptions: { label: string; value: ActionStatus }[] = [
        { label: 'Pending', value: 'pending' },
        { label: 'Success', value: 'success' },
        { label: 'Failure', value: 'failure' },
        { label: 'Denied', value: 'denied' },
        { label: 'Schema', value: 'schema' },
        { label: 'Timeout', value: 'timeout' },
        { label: 'Exception', value: 'exception' },
        { label: 'Cancelled', value: 'cancelled' },
    ];
    const selectedStatus = await vscode.window.showQuickPick(statusOptions, {
        placeHolder: 'Select status',
    });
    if (!selectedStatus) return;

    // Get message (optional)
    const message = await vscode.window.showInputBox({
        prompt: 'Status message (optional)',
        placeHolder: 'e.g., Cursor placed at line 42',
    });

    // Get timestamp offset
    const timeOffset = await vscode.window.showInputBox({
        prompt: 'Time offset from now in minutes (negative for past, positive for future)',
        placeHolder: 'e.g., -1440 for 1 day ago, 0 for now',
        value: '0',
        validateInput: (value) => {
            const num = parseFloat(value);
            return !isNaN(num) ? null : 'Must be a valid number';
        },
    });
    if (timeOffset === undefined) return;

    const timestamp = Date.now() + parseFloat(timeOffset) * 60 * 1000;

    // Create the history item
    const historyItem: ExecutionHistoryItem = {
        action,
        status: selectedStatus.value,
        message: message || undefined,
        executionId: `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        sessionId: `dev_session_${Date.now()}`,
        timestamp,
    };

    executeViewProvider.addCustomHistoryItem(historyItem);
    vscode.window.showInformationMessage(`Added custom history item: ${action} (${selectedStatus.label})`);
}
