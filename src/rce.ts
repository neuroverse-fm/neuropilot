/**
 * rce stands for Requested Command Execution
 * (or Request for Command Execution if you don't mind the omitted 'f')
 * definitely didn't choose the acronym for its resemblance to a software vulnerability
 */

import * as vscode from 'vscode';
import { ActionData, ActionResult, actionResultAccept, actionResultNoPermission } from './neuro_client_helper';
import { Permission, PermissionLevel, hasPermissions } from './config';
import { NEURO } from './constants';

/**
 * A prompt parameter can either be a string or a function that converts ActionData into a prompt string.
 */
export type PromptGenerator = string | ((actionData: ActionData) => string);

/**
 * Handles cancellation requests from Neuro.
 */
export function handleCancelRequest(_actionData: ActionData): ActionResult {
    if (!NEURO.requesting) {
        return actionResultAccept('No active request to cancel.');
    }
    NEURO.requesting = false;
    NEURO.client?.unregisterActions(['cancel_request']);
    vscode.window.showInformationMessage('Request cancelled by user.');
    return actionResultAccept('Request cancelled.');
}

/**
 * Wraps an action handler with a confirmation prompt and permission check.
 * 
 * This wrapper uses the effective permission level calculated by hasPermissions:
 *   - OFF: immediately returns a no-permission result.
 *   - AUTOPILOT: immediately queues the handler and returns an early success result.
 *   - COPILOT: shows a confirmation prompt; if the user confirms, the handler is queued and a success result is returned,
 *     otherwise a cancellation message is returned.
 *
 * @param handler The action handler to wrap.
 * @param prompt A custom prompt message or generator function (optional).
 * @param earlyMessage The message to immediately return as a success result.
 * @param requiredPermissions One or more permissions required for the action.
 * @returns A new handler enforcing the permission and confirmation logic.
 */
export function wrapWithConfirmation(
    handler: (actionData: ActionData) => ActionResult,
    prompt?: PromptGenerator,
    earlyMessage = 'Requested to run command.',
    ...requiredPermissions: Permission[]
): (actionData: ActionData) => Promise<ActionResult> {
    return async (actionData: ActionData): Promise<ActionResult> => {
        // Compute the effective permission level from the required permissions.
        const effectiveMode: PermissionLevel = hasPermissions(...requiredPermissions);

        if (effectiveMode === PermissionLevel.OFF) {
            // Disallow the command.
            return actionResultNoPermission(requiredPermissions.length > 0
                ? requiredPermissions[0]
                : { id: 'general', infinitive: 'perform this action' });
        }

        if (effectiveMode === PermissionLevel.AUTOPILOT) {
            // Immediately queue the handler asynchronously.
            setTimeout(() => {
                handler(actionData);
            }, 0);
            return actionResultAccept(earlyMessage);
        } else { // COPILOT mode
            const message: string = typeof prompt === 'function'
                ? prompt(actionData)
                : prompt ?? `Neuro requested to run the action "${actionData.name}". Do you want to proceed?`;
            const confirmation = await vscode.window.showInformationMessage(message, { modal: true }, 'Confirm', 'Deny');
            NEURO.requesting = false;
            NEURO.client?.unregisterActions(['cancel_request']);
            if (confirmation !== 'Confirm') {
                return actionResultAccept('Command denied by user.');
            }
            setTimeout(() => {
                handler(actionData);
            }, 0);
            return actionResultAccept(earlyMessage);
        }
    };
}
