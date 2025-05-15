/**
 * rce stands for Requested Command Execution
 * (or Request for Command Execution if you don't mind the omitted 'f')
 */

import * as vscode from 'vscode';
import { ActionData, ActionWithHandler } from './neuro_client_helper';
import { NEURO } from './constants';

/**
 * A prompt parameter can either be a string or a function that converts ActionData into a prompt string.
 */
export type PromptGenerator = string | ((actionData: ActionData) => string);

export const cancelRequestAction: ActionWithHandler = {
    name: 'cancel_request',
    description: 'Cancel the current request.',
    permissions: [],
    handler: handleCancelRequest,
    promptGenerator: () => '', // No prompt needed for this action
};

/**
 * Handles cancellation requests from Neuro.
 */
export function handleCancelRequest(_actionData: ActionData): string | undefined {
    if (!NEURO.rceCallback) {
        return 'No active request to cancel.';
    }
    clearRceDialog();
    return 'Request cancelled.';
}

export function clearRceDialog(): void { // Function to clear out RCE dialogs
    NEURO.rceCallback = null;
    NEURO.client?.unregisterActions(['cancel_request']);
    NEURO.statusBarItem!.tooltip = 'No active request';
    NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.foreground');
    NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
}

export function openRceDialog(): void {
    if(!NEURO.rceCallback)
        return;

    const callback = NEURO.rceCallback;
    const message = typeof NEURO.statusBarItem!.tooltip === 'string'
        ? NEURO.statusBarItem!.tooltip
        : NEURO.statusBarItem!.tooltip!.value;
    vscode.window.showInformationMessage(message, 'Accept', 'Deny').then(
        (value) => {
            if(NEURO.rceCallback !== callback) // Multiple messages may be opened, ensure that callback is only called once
                return;
            clearRceDialog();
            if(value === 'Accept') {
                NEURO.client?.sendContext('Your request was accepted.');
                const result = callback();
                if(result)
                    NEURO.client?.sendContext(result);
            } else {
                NEURO.client?.sendContext('Your request was denied.');
            }
        },
    );
}

// /**
//  * Wraps an action handler with a confirmation prompt and permission check.
//  * 
//  * This wrapper uses the effective permission level calculated by hasPermissions:
//  *   - OFF: immediately returns a no-permission result.
//  *   - AUTOPILOT: immediately queues the handler and returns an early success result.
//  *   - COPILOT: shows a confirmation prompt; if the user confirms, the handler is queued and a success result is returned,
//  *     otherwise a cancellation message is returned.
//  *
//  * @param handler The action handler to wrap.
//  * @param prompt A custom prompt message or generator function (optional).
//  * @param earlyMessage The message to immediately return as a success result.
//  * @param requiredPermissions One or more permissions required for the action.
//  * @returns A new handler enforcing the permission and confirmation logic.
//  */
// export function wrapWithConfirmation(
//     handler: (actionData: ActionData) => ActionResult,
//     prompt?: PromptGenerator,
//     earlyMessage = 'Requested to run command.',
//     ...requiredPermissions: Permission[]
// ): (actionData: ActionData) => Promise<ActionResult> {
//     return async (actionData: ActionData): Promise<ActionResult> => {
//         // Compute the effective permission level from the required permissions.
//         const effectiveMode: PermissionLevel = getPermissionLevel(...requiredPermissions);

//         if (effectiveMode === PermissionLevel.OFF) {
//             // Disallow the command.
//             return actionResultNoPermission(requiredPermissions.length > 0
//                 ? requiredPermissions[0]
//                 : { id: 'general', infinitive: 'perform this action' });
//         }

//         if (effectiveMode === PermissionLevel.AUTOPILOT) {
//             // Immediately queue the handler asynchronously.
//             setTimeout(() => {
//                 handler(actionData);
//             }, 0);
//             return actionResultAccept(earlyMessage);
//         } else { // COPILOT mode
//             const message: string = typeof prompt === 'function'
//                 ? prompt(actionData)
//                 : prompt ?? `Neuro requested to run the action "${actionData.name}". Do you want to proceed?`;
//             const confirmation = await vscode.window.showInformationMessage(message, { modal: true }, 'Confirm', 'Deny');
//             NEURO.rceActive = false;
//             NEURO.client?.unregisterActions(['cancel_request']);
//             if (confirmation !== 'Confirm') {
//                 return actionResultAccept('Command denied by user.');
//             }
//             setTimeout(() => {
//                 handler(actionData);
//             }, 0);
//             return actionResultAccept(earlyMessage);
//         }
//     };
// }
