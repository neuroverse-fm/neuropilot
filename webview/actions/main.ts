import type { ActionNode, ActionsViewMessage, ActionsViewProviderMessage, SettingsContext } from '@/views/actions';
import { PermissionLevel } from '@/config';

interface State {
    actions: ActionNode[];
    context: SettingsContext;
}

(function () {
    const vscode = acquireVsCodeApi<State>();

    const oldState = vscode.getState();
    const state: State = oldState ?? {
        actions: [],
        context: 'workspace',
    };
    if (!oldState) {
        vscode.setState(state);
    }
    vscode.postMessage({
        type: 'requestInitialization',
        currentContext: state.context,
    } satisfies ActionsViewMessage);

    updateContextSwitcher();
    renderActionsList();

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

    function createPermissionLevelRadio(name: string, currentLevel: PermissionLevel | undefined, onChange: (l: PermissionLevel) => void): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'permission-level-radio';

        function makeRadio(level: PermissionLevel) {
            const label = document.createElement('label');
            label.setAttribute('data-permission-level', `${level}`);
            switch (level) {
                case PermissionLevel.AUTOPILOT:
                    label.innerHTML = '<i class="codicon codicon-check"></i>';
                    label.title = 'Autopilot - allow';
                    break;
                case PermissionLevel.COPILOT:
                    label.innerHTML = '<i class="codicon codicon-question"></i>';
                    label.title = 'Copilot - ask for permission';
                    break;
                case PermissionLevel.OFF:
                    label.innerHTML = '<i class="codicon codicon-chrome-close"></i>';
                    label.title = 'Off - do not allow';
                    break;
            }

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.value = `${level}`;
            radio.checked = level === currentLevel;

            radio.addEventListener('change', () => onChange(level));

            label.appendChild(radio);
            return label;
        }

        container.appendChild(makeRadio(PermissionLevel.AUTOPILOT));
        container.appendChild(makeRadio(PermissionLevel.COPILOT));
        container.appendChild(makeRadio(PermissionLevel.OFF));

        return container;
    }


    function renderActionsList() {
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
        categoryKeys.forEach(c => categories[c].sort((a, b) => a.label.localeCompare(b.label)));
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

            const actionNodes = categories[category];

            let commonLevel: PermissionLevel | undefined = undefined;
            if (actionNodes.every((n) => n.permissionLevel === PermissionLevel.AUTOPILOT)) commonLevel = PermissionLevel.AUTOPILOT;
            if (actionNodes.every((n) => n.permissionLevel === PermissionLevel.COPILOT)) commonLevel = PermissionLevel.COPILOT;
            if (actionNodes.every((n) => n.permissionLevel === PermissionLevel.OFF)) commonLevel = PermissionLevel.OFF;

            categoryHeader.appendChild(createPermissionLevelRadio(`category-${category}`, commonLevel, (level) => vscode.postMessage({
                type: 'viewToggledPermissions',
                actionIds: actionNodes.map(a => a.id),
                newPermissionLevel: level,
            } satisfies ActionsViewMessage)));

            for (const actionNode of actionNodes) {
                // <div class="action-entry" id="action-{id}">
                //   <span class="action-label" title="Action Description">Action Label</span>
                //   [checkboxes]
                // </div>
                const actionEntry = document.createElement('div');
                actionEntry.className = 'action-entry';
                actionEntry.id = `action-${actionNode.id}`;

                const actionLabel = document.createElement('span');
                actionLabel.classList.add('action-label');
                if (actionNode.modifiedExternally)
                    actionLabel.classList.add('modified-externally');
                // if (actionNode.modifiedInCurrentContext)
                //     actionLabel.classList.add('modified-in-current-context');
                if (!actionNode.isRegistered)
                    actionLabel.classList.add('unregistered-action');
                if (actionNode.description)
                    actionLabel.title = actionNode.description;
                actionLabel.textContent = actionNode.label;
                actionEntry.appendChild(actionLabel);

                // const autopilotToggle = createActionRadioButton(actionNode, PermissionLevel.AUTOPILOT);
                actionEntry.appendChild(createPermissionLevelRadio(`action-${actionNode.id}`, actionNode.permissionLevel, (level) => vscode.postMessage({
                    type: 'viewToggledPermissions',
                    actionIds: [actionNode.id],
                    newPermissionLevel: level,
                } satisfies ActionsViewMessage),
                ));

                actionsList.appendChild(actionEntry);
            }
        }
    }
    function updateActionsList() {
        const categories = state.actions.reduce<Record<string, ActionNode[]>>((acc, action) => {
            if (!acc[action.category]) {
                acc[action.category] = [];
            }
            acc[action.category].push(action);
            return acc;
        }, {});

        const actionsList = document.querySelector<HTMLUListElement>('.actions-list')!;

        const categoryKeys = Object.keys(categories)
            .sort()
            .sort((a, b) => a === 'Miscellaneous' ? 1 : b === 'Miscellaneous' ? -1 : 0)
            .sort((a, b) => a === 'No Category Specified' ? 1 : b === 'No Category Specified' ? -1 : 0);
        categoryKeys.forEach(c => categories[c].sort((a, b) => a.label.localeCompare(b.label)));
        for (const category of categoryKeys) {
            const actionNodes = categories[category];

            let commonLevel: PermissionLevel | undefined = undefined;
            if (actionNodes.every((n) => n.permissionLevel === PermissionLevel.AUTOPILOT)) commonLevel = PermissionLevel.AUTOPILOT;
            if (actionNodes.every((n) => n.permissionLevel === PermissionLevel.COPILOT)) commonLevel = PermissionLevel.COPILOT;
            if (actionNodes.every((n) => n.permissionLevel === PermissionLevel.OFF)) commonLevel = PermissionLevel.OFF;

            actionsList.querySelectorAll<HTMLInputElement>(`input[name="category-${category}"]`).forEach((btn) => {
                const shouldBeChecked = typeof commonLevel !== 'undefined' ? parseInt(btn.value) === commonLevel : false;
                if (shouldBeChecked !== btn.checked) btn.checked = shouldBeChecked;
            });

            for (const actionNode of actionNodes) {
                const container = actionsList.querySelector<HTMLDivElement>(`#action-${actionNode.id}`)!;
                const label = container.querySelector('.action-label')!;

                if (actionNode.modifiedExternally)
                    label.classList.add('modified-externally');
                else
                    label.classList.remove('modified-externally');

                if (!actionNode.isRegistered)
                    label.classList.add('unregistered-action');
                else
                    label.classList.remove('unregistered-action');

                container.querySelectorAll<HTMLInputElement>('input').forEach((btn) => {
                    const shouldBeChecked = parseInt(btn.value) === actionNode.permissionLevel;
                    if (shouldBeChecked !== btn.checked) btn.checked = shouldBeChecked;
                });
            }
        }
    }

    function changeContext(newContext: SettingsContext) {
        state.context = newContext;
        vscode.setState(state);
        updateContextSwitcher();
        vscode.postMessage({
            type: 'changeContext',
            newContext: newContext,
        } satisfies ActionsViewMessage);
    }

    function updateContextSwitcher() {
        const switcherContainer = document.querySelector<HTMLParagraphElement>('.context-switcher')!;
        switcherContainer.textContent = '';
        const linkElement = document.createElement('a');
        const spanElement = document.createElement('span');
        const userElement = state.context === 'user' ? spanElement : linkElement;
        const workspaceElement = state.context === 'workspace' ? spanElement : linkElement;

        userElement.textContent = 'User';
        workspaceElement.textContent = 'Workspace';
        spanElement.className = 'current-context';
        linkElement.className = 'not-current-context';

        if (state.context === 'user') {
            linkElement.title = 'Switch to Workspace Settings';
            linkElement.onclick = () => changeContext('workspace');
        } else {
            linkElement.title = 'Switch to User Settings';
            linkElement.onclick = () => changeContext('user');
        }

        switcherContainer.appendChild(userElement);
        switcherContainer.appendChild(document.createTextNode(' | '));
        switcherContainer.appendChild(workspaceElement);
    }
}());
