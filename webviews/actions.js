/* eslint-disable @stylistic/no-extra-parens */ // Does not work with JSDoc inline type casting
/// <reference types="vscode-webview" />
//@ts-check

/**
 * @import { WebviewApi } from 'vscode-webview';
 * @import { ActionNode, ActionsViewState, ActionsViewMessage, ActionsViewProviderMessage } from '../src/views/actions';
 */

(function () {
    //#region Types

    /**
     * @readonly
     * @enum {number}
     */
    const PermissionLevel = {
        /** @readonly */
        OFF: 0,
        /** @readonly */
        COPILOT: 1,
        /** @readonly */
        AUTOPILOT: 2,
    };

    //#endregion

    /** @type {WebviewApi<ActionsViewState>} */
    // eslint-disable-next-line no-undef
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState();
    const state = oldState || { actions: [] };
    if (!oldState) {
        vscode.setState(state);
    }
    vscode.postMessage({ type: 'requestInitialization' });

    updateActionsList(state.actions);

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        /** @type {ActionsViewProviderMessage} */
        const message = event.data;
        switch (message.type) {
            case 'refreshActions': {
                state.actions = message.actions;
                vscode.setState(state);
                updateActionsList(state.actions);
                vscode.postMessage({ type: 'error', message: 'test' });
                break;
            }
        }
    });

    /**
     * @param {ActionNode[]} actionNodes
     */
    function updateActionsList(actionNodes) {
        const actionsList = /** @type {HTMLUListElement} */ (document.querySelector('.actions-list'));
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

        /**
         * @param {ActionNode} actionNode
         * @param {PermissionLevel} permissionLevel
         * @returns {HTMLInputElement}
         */
        function createPermissionCheckbox(actionNode, permissionLevel) {
            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.className = 'permission-toggle';
            toggle.checked = actionNode.permissionLevel === permissionLevel;

            toggle.addEventListener('change', () => {
                /** @type {ActionsViewMessage} */
                const message = {
                    type: 'viewToggledPermission',
                    actionId: actionNode.id,
                    newPermissionLevel: permissionLevel,
                };
                vscode.postMessage(message);
            });

            return toggle;
        }
    }
}());
