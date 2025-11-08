import type { ActionNode, ActionsViewMessage, ActionsViewProviderMessage } from '@/views/actions';
import { PermissionLevel } from '@/config';

interface State {
    actions: ActionNode[];
}

(function () {
    const vscode = acquireVsCodeApi<State>();

    const oldState = vscode.getState();
    const state: State = oldState ?? { actions: [] };
    if (!oldState) {
        vscode.setState(state);
    }
    vscode.postMessage({ type: 'requestInitialization' });

    updateActionsList();

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message: ActionsViewProviderMessage = event.data;
        switch (message.type) {
            case 'refreshActions': {
                state.actions = message.actions;
                vscode.setState(state);
                updateActionsList();
                break;
            }
        }
    });

    function updateActionsList() {
        const categories = state.actions.reduce<Record<string, ActionNode[]>>((acc, action) => {
            if (!acc[action.category]) {
                acc[action.category] = [];
            }
            acc[action.category].push(action);
            return acc;
        }, {});

        const actionsList = document.querySelector<HTMLUListElement>('.actions-list')!;
        actionsList.textContent = '';

        const categoryKeys = Object.keys(categories)
            .sort()
            .sort((a, b) => a === 'Miscellaneous' ? 1 : b === 'Miscellaneous' ? -1 : 0)
            .sort((a, b) => a === 'No Category Specified' ? 1 : b === 'No Category Specified' ? -1 : 0);
        for (const category of categoryKeys) {
            // <div class="category-header">
            //   <span class="action-label">Category Name</span>
            //   [checkboxes]
            // </div>
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'category-header';
            actionsList.appendChild(categoryHeader);

            const categoryLabel = document.createElement('span');
            categoryLabel.className = 'category-label';
            categoryLabel.textContent = category;
            categoryHeader.appendChild(categoryLabel);

            const autopilotToggle = createCategoryCheckbox(category, categories[category], PermissionLevel.AUTOPILOT);
            categoryHeader.appendChild(autopilotToggle);
            const copilotToggle = createCategoryCheckbox(category, categories[category], PermissionLevel.COPILOT);
            categoryHeader.appendChild(copilotToggle);
            const offToggle = createCategoryCheckbox(category, categories[category], PermissionLevel.OFF);
            categoryHeader.appendChild(offToggle);

            for (const actionNode of categories[category]) {
                // <div class="action-entry" id="action-{id}">
                //   <span class="action-label">Action Label</span>
                //   [checkboxes]
                // </div>
                const actionEntry = document.createElement('div');
                actionEntry.className = 'action-entry';
                actionEntry.id = `action-${actionNode.id}`;

                const actionLabel = document.createElement('span');
                actionLabel.className = 'action-label';
                actionLabel.textContent = actionNode.label;
                actionEntry.appendChild(actionLabel);

                const autopilotToggle = createActionRadioButton(actionNode, PermissionLevel.AUTOPILOT);
                actionEntry.appendChild(autopilotToggle);
                const copilotToggle = createActionRadioButton(actionNode, PermissionLevel.COPILOT);
                actionEntry.appendChild(copilotToggle);
                const offToggle = createActionRadioButton(actionNode, PermissionLevel.OFF);
                actionEntry.appendChild(offToggle);

                actionsList.appendChild(actionEntry);
            }
        }

        function createCategoryCheckbox(category: string, actionNodes: ActionNode[], permissionLevel: PermissionLevel): HTMLDivElement {
            // <div class="permission-radio-container">
            //   <input type="radio" class="permission-radio">
            // </div>
            const container = document.createElement('div');
            container.className = 'permission-radio-container';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.className = 'permission-radio';
            radio.name = `permission-category-${category}`;
            container.appendChild(radio);

            radio.checked = actionNodes.every(action => action.permissionLevel === permissionLevel);

            radio.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'viewToggledPermissions',
                    actionIds: actionNodes.map(a => a.id),
                    newPermissionLevel: permissionLevel,
                } satisfies ActionsViewMessage);
            });

            return container;
        }

        function createActionRadioButton(actionNode: ActionNode, permissionLevel: PermissionLevel): HTMLDivElement {
            // <div class="permission-radio-container">
            //   <input type="radio" class="permission-radio">
            // </div>
            const container = document.createElement('div');
            container.className = 'permission-radio-container';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.className = 'permission-radio';
            radio.checked = actionNode.permissionLevel === permissionLevel;
            radio.name = `permission-${actionNode.id}`;
            container.appendChild(radio);

            radio.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'viewToggledPermissions',
                    actionIds: [actionNode.id],
                    newPermissionLevel: permissionLevel,
                } satisfies ActionsViewMessage);
            });

            return container;
        }
    }
}());
