import { render } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import type { ExecuteViewProviderMessage } from '@/views/execute';

interface ExecutionHistoryItem {
    success: boolean;
    action: string;
    message?: string;
    timestamp: number;
}

interface State {
    history: ExecutionHistoryItem[];
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
        return date.toLocaleTimeString();
    }

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function ExecutionWindow() {
    const vscode = useMemo(acquireVsCodeApi<State>, []);
    const oldState = useMemo(vscode.getState, [vscode]);
    const [history, setHistory] = useState<ExecutionHistoryItem[]>(oldState?.history ?? []);

    // Save state whenever it changes
    useEffect(() => {
        vscode.setState({ history });
    }, [history]);

    // Listen for messages from the extension
    useEffect(() => {
        const messageHandler = (event: MessageEvent<ExecuteViewProviderMessage>) => {
            const message = event.data;
            if (message.type === 'executionResult') {
                setHistory(prev => [message.result, ...prev].slice(0, 100)); // Keep last 100 items
            }
        };

        window.addEventListener('message', messageHandler);
        return () => window.removeEventListener('message', messageHandler);
    }, []);

    const clearHistory = () => {
        setHistory([]);
    };

    return (
        <div class="execution-container">
            <div class="header">
                <h3>Action Execution History</h3>
                {history.length > 0 &&
                    <button class="clear-button" onClick={clearHistory} title="Clear history">
                        <i class="codicon codicon-clear-all"></i>
                    </button>
                }
            </div>
            {history.length === 0 ?
                <div class="empty-state">
                    <i class="codicon codicon-info"></i>
                    <p>No actions executed yet</p>
                </div>
                :
                <div class="history-list">
                    {history.map((item, index) =>
                        <div
                            key={`${item.timestamp}-${index}`}
                            class={`history-item ${item.success ? 'success' : 'failure'}`}
                        >
                            <div class="item-header">
                                <i class={`codicon ${item.success ? 'codicon-pass' : 'codicon-error'}`}></i>
                                <span class="action-name">{item.action}</span>
                                <span class="timestamp">{formatTime(item.timestamp)}</span>
                            </div>
                            {item.message &&
                                <div class="item-message">{item.message}</div>
                            }
                        </div>,
                    )}
                </div>
            }
        </div>
    );
}

render(<ExecutionWindow />, document.getElementById('root')!);
