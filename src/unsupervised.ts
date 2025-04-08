import { NEURO } from "./constants";

import { handleRunTask, registerTaskHandlers, taskHandlers } from './tasks';
import { fileActionHandlers, registerFileActions } from './file_actions';
import { gitActionHandlers, registerGitCommands } from './git';
import { editingFileHandlers, registerEditingActions } from './editing';

/**
 * Register unsupervised actions with the Neuro API.
 * Will only register actions that the user has given permission to use.
 */

const neuroActionHandlers: { [key: string]: (actionData: any) => void } = {
    ...gitActionHandlers,
    ...fileActionHandlers,
    ...taskHandlers,
    ...editingFileHandlers
};

const actionKeys: string[] = Object.keys(neuroActionHandlers);

export function registerUnsupervisedActions() {
    // Unregister all actions first to properly refresh everything
    NEURO.client?.unregisterActions(actionKeys);

    registerFileActions();
    registerGitCommands();
    registerTaskHandlers();
    registerEditingActions();
}

/**
 * Register unsupervised handlers for Neuro API actions.
 * The handlers will only handle actions that the user has given permission to use.
 */
export function registerUnsupervisedHandlers() {
    NEURO.client?.onAction((actionData) => {
        if(actionKeys.includes(actionData.name)) {
            NEURO.actionHandled = true;
            neuroActionHandlers[actionData.name](actionData)
        }
        else if(NEURO.tasks.find(task => task.id === actionData.name)) {
            NEURO.actionHandled = true;
            handleRunTask(actionData);
        }
    });
}