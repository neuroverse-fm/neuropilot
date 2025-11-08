import * as vscode from 'vscode';
import { getAllPermissions, PermissionLevel, setPermissions } from '@/config';
import { BaseWebviewViewProvider } from './base';
import { getActions } from '@/rce';
import { toTitleCase } from '@/utils';

export interface ActionNode {
    id: string;
    label: string;
    category: string;
    // TODO: Not sure this is useful since I don't know how to do tooltips
    // description?: string;
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
        super('actions/index.html', 'actions/main.js', ['actions/style.css']);
    }

    public refreshActions() {
        const permissionLevels = getAllPermissions(); // Get all permissions once to avoid multiple calls
        const actionNodes = getActions().map(action => ({
            id: action.name,
            label: action.displayName ?? toTitleCase(action.name),
            category: action.category ?? 'No Category Specified', // TODO: Handle null category better?
            // description: action.description,
            permissionLevel: permissionLevels[action.name] ?? PermissionLevel.OFF,
        } satisfies ActionNode));
        this._view?.webview.postMessage({
            type: 'refreshActions',
            actions: actionNodes,
        });
    }

    protected handleMessage(message: ActionsViewMessage): void {
        switch (message.type) {
            case 'viewToggledPermissions': {
                const permissionLevels = getAllPermissions(); // Get all permissions once to avoid multiple calls
                const actionsToUpdate = message.actionIds
                    .filter(id => permissionLevels[id] !== message.newPermissionLevel);
                const permissionUpdates: Record<string, PermissionLevel> = {};
                for (const actionId of actionsToUpdate) {
                    permissionUpdates[actionId] = message.newPermissionLevel;
                }
                setPermissions(permissionUpdates).then(
                    () => {
                        // Updating permissions should automatically refresh the view via the config change listener
                        // this.refreshActions();
                    },
                    (erm) => {
                        vscode.window.showErrorMessage(`Failed to update action permissions: ${erm}`);
                    },
                );
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
