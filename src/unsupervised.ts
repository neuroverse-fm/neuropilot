import { NEURO } from "./constants";

import { handleRunTask, registerTaskActions, taskHandlers } from './tasks';
import { fileActionHandlers, registerFileActions } from './file_actions';
import { gitActionHandlers, registerGitActions } from './git';
import { editingFileHandlers, registerEditingActions } from './editing';
import { ActionData, ActionResult } from "./neuro_client_helper";
import { registerTerminalActions, terminalAccessHandlers } from "./pseudoterminal";

/**
 * Register unsupervised actions with the Neuro API.
 * Will only register actions that the user has given permission to use.
 */

const neuroActionHandlers: { [key: string]: (actionData: ActionData) => ActionResult } = {
    ...gitActionHandlers,
    ...fileActionHandlers,
    ...taskHandlers,
    ...editingFileHandlers,
    ...terminalAccessHandlers
};

const actionKeys: string[] = Object.keys(neuroActionHandlers);

export function registerUnsupervisedActions() {
    // Unregister all actions first to properly refresh everything
    NEURO.client?.unregisterActions(actionKeys);

    registerFileActions();
    registerGitActions();
    registerTaskActions();
    registerEditingActions();
    registerTerminalActions();
}

/**
 * Register unsupervised handlers for Neuro API actions.
 * The handlers will only handle actions that the user has given permission to use.
 */
export function registerUnsupervisedHandlers() {
    NEURO.client?.onAction((actionData: ActionData) => {
        if(actionKeys.includes(actionData.name)) {
            NEURO.actionHandled = true;
            const result = neuroActionHandlers[actionData.name](actionData);
            NEURO.client?.sendActionResult(actionData.id, result.success, result.message);
        }
        else if(NEURO.tasks.find(task => task.id === actionData.name)) {
            NEURO.actionHandled = true;
            const result = handleRunTask(actionData);
            NEURO.client?.sendActionResult(actionData.id, result.success, result.message);
        }
    });
}