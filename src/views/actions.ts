import * as vscode from 'vscode';
import { PermissionLevel } from '@/config';
import { NEURO } from '../constants';

export interface ActionNode {
    id: string;
    label: string;
    description?: string;
    permissionLevel: PermissionLevel;
}

export class ActionsViewProvider implements vscode.TreeDataProvider<ActionNode> {
    // Don't know if we need this event
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    getTreeItem(element: ActionNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return {
            label: element.label,
            description:
                element.permissionLevel === PermissionLevel.AUTOPILOT ? 'Autopilot' :
                element.permissionLevel === PermissionLevel.COPILOT ? 'Copilot' :
                'Off',
            id: element.id,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            tooltip: element.description,
            // iconPath: NEURO.context!.asAbsolutePath('assets/evilpilot.png'),
            command: {
                title: 'Toggle Permission Level',
                command: 'neuropilot.toggleActionPermission',
                arguments: [element],
            } satisfies vscode.Command,
        };
    }
    getChildren(element?: ActionNode | undefined): vscode.ProviderResult<ActionNode[]> {
        return element ? [] : [
            {
                id: 'sample_autopilot_action',
                label: 'Sample Autopilot Action',
                description: 'This action has Autopilot permission level.',
                permissionLevel: PermissionLevel.AUTOPILOT,
            },
            {
                id: 'sample_copilot_action',
                label: 'Sample Copilot Action',
                description: 'This action has Copilot permission level.',
                permissionLevel: PermissionLevel.COPILOT,
            },
            {
                id: 'sample_off_action',
                label: 'Sample Off Action',
                description: 'This action has Off permission level.',
                permissionLevel: PermissionLevel.OFF,
            },
        ];
    }
    // getParent?(element: ActionNode): vscode.ProviderResult<ActionNode> {
    //     throw new Error('Method not implemented.');
    // }
    // resolveTreeItem?(item: vscode.TreeItem, element: ActionNode, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TreeItem> {
    //     throw new Error('Method not implemented.');
    // }
}
