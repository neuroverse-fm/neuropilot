import { NEURO } from '@/constants';
import { addFileActions } from '@/file_actions';
import { addEditingActions } from '@/editing';
import { ActionData } from 'neuro-game-sdk';
import { addLintActions } from '@/lint_problems';
import { RCEActionHandler } from '@/rce';
import { addChangelogActions } from '@/changelog';
import { addRequestCookieAction } from '../../functions/cookies';
import { addChatAction } from '@/chat';
import { addCompleteCodeAction } from '@/completions';

export function addCommonUnsupervisedActions() {
    addFileActions();
    addEditingActions();
    addLintActions();
    addChangelogActions();
    addRequestCookieAction();
    addChatAction();
    addCompleteCodeAction();
}

/**
 * Register unsupervised handlers for Neuro API actions.
 * The handlers will only handle actions that the user has given permission to use.
 */
export function registerUnsupervisedHandlers() {
    NEURO.client?.onAction(async (actionData: ActionData) => await RCEActionHandler(actionData));
}
