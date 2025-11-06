import type { ActionNode, ActionsViewState, ActionsViewMessage, ActionsViewProviderMessage } from '../src/views/actions';
import { PermissionLevel } from '../src/config';

(function () {
    const vscode = acquireVsCodeApi<ActionsViewState>();

    const oldState = vscode.getState();
    const state: ActionsViewState = oldState ?? { actions: [] };
    if (!oldState) {
        vscode.setState(state);
    }
    vscode.postMessage({ type: 'requestInitialization' });

    updateActionsList(state.actions);

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message: ActionsViewProviderMessage = event.data;
        switch (message.type) {
            case 'refreshActions': {
                state.actions = message.actions;
                vscode.setState(state);
                updateActionsList(state.actions);
                break;
            }
        }
    });

    function updateActionsList(actionNodes: ActionNode[]) {
        const actionsList = document.querySelector<HTMLUListElement>('.actions-list')!;
        actionsList.textContent = '';
        for (const actionNode of actionNodes) {
            const actionEntry = document.createElement('li');
            actionEntry.className = 'action-entry';
            actionEntry.id = `action-${actionNode.id}`;

            const actionLabel = document.createElement('span');
            actionLabel.className = 'action-label';
            actionLabel.textContent = actionNode.label;
            actionEntry.appendChild(actionLabel);

            const autopilotToggle = createPermissionCheckbox(actionNode, PermissionLevel.AUTOPILOT);
            actionEntry.appendChild(autopilotToggle);
            const copilotToggle = createPermissionCheckbox(actionNode, PermissionLevel.COPILOT);
            actionEntry.appendChild(copilotToggle);
            const offToggle = createPermissionCheckbox(actionNode, PermissionLevel.OFF);
            actionEntry.appendChild(offToggle);

            actionsList.appendChild(actionEntry);
        }

        function createPermissionCheckbox(actionNode: ActionNode, permissionLevel: PermissionLevel): HTMLInputElement {
            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.className = 'permission-toggle';
            toggle.checked = actionNode.permissionLevel === permissionLevel;

            toggle.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'viewToggledPermission',
                    actionId: actionNode.id,
                    newPermissionLevel: permissionLevel,
                } satisfies ActionsViewMessage);
            });

            return toggle;
        }
    }
}());
