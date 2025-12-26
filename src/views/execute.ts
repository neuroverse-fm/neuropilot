import { BaseWebviewViewProvider, Message } from './base';
import { onDidExecuteAction, type ActionsEventData } from '../events/actions';

export interface ExecuteResult {
    success: boolean;
    action: string;
    message?: string;
}

export interface ExecuteViewProviderMessage extends Message {
    type: 'executionResult';
    result: ExecuteResult & { timestamp: number };
}

export class ExecuteViewProvider extends BaseWebviewViewProvider<Message, ExecuteViewProviderMessage> {
    constructor() {
        super('execute/index.html', 'execute/main.js', ['execute/style.css']);
    }

    protected handleMessage(_message: Message): void { }

    protected onViewReady(): void {
        // Listen to action execution events and send them to the webview
        onDidExecuteAction((data: ActionsEventData) => {
            this.sendExecutionResult({
                success: data.success === true,
                action: data.action,
                message: data.message,
            });
        });
    }

    /**
     * Sends the execution result to the execute view.
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
}
