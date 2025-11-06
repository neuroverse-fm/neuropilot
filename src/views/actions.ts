import * as vscode from 'vscode';
import { PermissionLevel } from '@/config';
import { NEURO } from '../constants';

export interface ActionNode {
    id: string;
    label: string;
    category: string;
    description?: string;
    permissionLevel: PermissionLevel;
}

export interface ActionsViewState {
    actions: ActionNode[];
}

export type ActionsViewProviderMessage = {
    type: 'providerToggledPermission';
    actionId: string;
    newPermissionLevel: PermissionLevel;
} | {
    type: 'refreshActions';
    actions: ActionNode[];
};

export type ActionsViewMessage = {
    type: 'viewToggledPermission';
    actionId: string;
    newPermissionLevel: PermissionLevel;
} | {
    type: 'error';
    message: string;
} | {
    type: 'requestInitialization';
};

export class ActionsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'neuropilot.actionsView';

    private _view?: vscode.WebviewView;

    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): Thenable<void> | void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [NEURO.context!.extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((data: ActionsViewMessage) => {
            switch (data.type) {
                case 'requestInitialization': {
                    this.refreshActions();
                    break;
                }
                case 'viewToggledPermission': {
                    // TODO: Handle permission toggle
                    break;
                }
                case 'error': {
                    vscode.window.showErrorMessage(data.message);
                    break;
                }
            }
        });
    }

    public refreshActions() {
        // TODO: Placeholder implementation
        this._view?.webview.postMessage({
            type: 'refreshActions',
            actions: [
                {
                    id: 'sample_action_autopilot',
                    label: 'Autopilot Sample Action',
                    category: 'Category A',
                    description: 'This is the first action.',
                    permissionLevel: PermissionLevel.AUTOPILOT,
                },
                {
                    id: 'sample_action_copilot',
                    label: 'Copilot Sample Action',
                    category: 'Category B',
                    description: 'This is the second action.',
                    permissionLevel: PermissionLevel.COPILOT,
                },
                {
                    id: 'sample_action_off',
                    label: 'Off Sample Action',
                    category: 'Category C',
                    description: 'This is the third action.',
                    permissionLevel: PermissionLevel.OFF,
                },
            ],
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(NEURO.context!.extensionUri, 'webviews', 'actions.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(NEURO.context!.extensionUri, 'webviews', 'actions.css'));
        const nonce = getNonce();

        return `\
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Actions</title>
            </head>
            <body>
                A = Autopilot, C = Copilot, O = Off

                <div class="actions-header">
                    Action
                    <div class="spacer"></div>
                    <div class="permission-level-letter">A</div>
                    <div class="permission-level-letter">C</div>
                    <div class="permission-level-letter">O</div>
                </div>
                <ul class="actions-list"></ul>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return result;
}
