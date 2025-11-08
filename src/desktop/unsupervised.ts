import { NEURO } from '@/constants';
import { addTaskActions, taskHandlers } from '@/tasks';
import { fileActions, addFileActions } from '@/file_actions';
import { gitActions, addGitActions } from '@/git';
import { editingActions, addEditingActions } from '@/editing';
import { ActionData, RCEAction } from '@/neuro_client_helper';
import { addTerminalActions, terminalAccessHandlers } from '@/pseudoterminal';
import { lintActions, addLintActions } from '@/lint_problems';
import { cancelRequestAction, RCEActionHandler } from '@/rce';
import { changelogActions, addChangelogActions } from '@/changelog';

/**
 * Register unsupervised actions with the Neuro API.
 * Will only register actions that the user has given permission to use.
 */

const neuroActions: Record<string, RCEAction> = {
    'cancel_request': cancelRequestAction,
    ...gitActions,
    ...fileActions,
    ...taskHandlers,
    ...editingActions,
    ...terminalAccessHandlers,
    ...lintActions,
    ...changelogActions,
};

const actionKeys: string[] = Object.keys(neuroActions);

export function addUnsupervisedActions() {
    // Unregister all actions first to properly refresh everything
    NEURO.client?.unregisterActions(actionKeys);

    addFileActions();
    addGitActions();
    addTaskActions();
    addEditingActions();
    addTerminalActions();
    addLintActions();
    addChangelogActions();
}

/**
 * Register unsupervised handlers for Neuro API actions.
 * The handlers will only handle actions that the user has given permission to use.
 */
export function registerUnsupervisedHandlers() {
    NEURO.client?.onAction(async (actionData: ActionData) => await RCEActionHandler(actionData, neuroActions, true));
}
