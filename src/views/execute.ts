import { BaseWebviewViewProvider, Message } from './base';
import { onDidAttemptAction, type ActionsEventData, type ActionStatus } from '../events/actions';

export interface ExecuteResult {
    status: ActionStatus;
    action: string;
    message?: string;
    executionId: string;
    sessionId: string;
}

export type ExecuteViewProviderMessage = {
    type: 'executionResult';
    result: ExecuteResult & { timestamp: number };
} | {
    type: 'updateStatus';
    executionId: string;
    status: ActionStatus;
    message?: string;
} | {
    type: 'markAllPendingAsFailed';
    message: string;
} | {
    type: 'currentSession';
    sessionId: string;
};

export class ExecuteViewProvider extends BaseWebviewViewProvider<Message, ExecuteViewProviderMessage> {
    private static readonly sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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
     * Marks all pending executions as failed.
     * Used when the extension is deactivating to clean up pending items.
     */
    public markAllPendingAsFailed(message: string) {
        if (!this._view) {
            return;
        }

        this.postMessage({
            type: 'markAllPendingAsFailed',
            message,
        });
    }
}
