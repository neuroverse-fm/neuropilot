import * as vscode from 'vscode';
import { PermissionLevel } from '@/config';
import { BaseWebviewViewProvider } from './base';

export interface ActionNode {
    id: string;
    label: string;
    category: string;
    description?: string;
    permissionLevel: PermissionLevel;
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
    type: 'viewToggledPermissions';
    actionIds: string[];
    newPermissionLevel: PermissionLevel;
} | {
    type: 'error';
    message: string;
} | {
    type: 'requestInitialization';
};

export class ActionsViewProvider extends BaseWebviewViewProvider<ActionsViewMessage, ActionsViewProviderMessage> {
    public static readonly viewType = 'neuropilot.actionsView';

    constructor() {
        super('actions.html', 'actions.js', ['actions.css']);
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
                    id: 'sample_action_copilot_2',
                    label: 'Copilot Sample Action 2',
                    category: 'Category A',
                    description: 'This is the second first action.',
                    permissionLevel: PermissionLevel.COPILOT,
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

    protected handleMessage(message: ActionsViewMessage): void {
        switch (message.type) {
            case 'viewToggledPermissions': {
                // TODO: Handle permission toggle
                vscode.window.showInformationMessage(`Toggled permissions for actions: ${message.actionIds.join(', ')} to ${message.newPermissionLevel}`);
                this.refreshActions();
                break;
            }
            case 'error': {
                vscode.window.showErrorMessage(message.message);
                break;
            }
            case 'requestInitialization': {
                this.refreshActions();
                break;
            }
        }
    }
}
