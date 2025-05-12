/**
 * rce stands for Requested Command Execution
 * (or Request for Command Execution if you don't mind the omitted 'f')
 * definitely didn't choose the acronym for its resemblance to a software vulnerability
 */

import * as vscode from 'vscode';
import { ActionData, ActionResult, actionResultNoPermission, actionResultAccept } from './neuro_client_helper';
import { PERMISSIONS } from './config';

/**
 * A prompt parameter can either be a string or a function that converts ActionData into a prompt string.
 */
export type PromptGenerator = string | ((actionData: ActionData) => string);

/**
 * Wraps an action handler with a confirmation prompt.
 * When the user confirms (via a modal dialog), this function immediately returns a success result (e.g. "Requested to run command.")
 * and then runs the original handler asynchronously.
 *
 * @param handler The action handler to wrap.
 * @param prompt A custom prompt message or generator function (optional).
 * @param earlyMessage The message to immediately return as a success result.
 * @returns A new handler that first asks for confirmation, then returns early before running the handler.
 */
export function wrapWithConfirmation(
    handler: (actionData: ActionData) => ActionResult,
    prompt?: PromptGenerator,
    earlyMessage: string = "Requested to run command."
): (actionData: ActionData) => Promise<ActionResult> {
    return async (actionData: ActionData): Promise<ActionResult> => {
        const message: string = typeof prompt === 'function'
            ? prompt(actionData)
            : prompt ?? `Neuro requested to run the action "${actionData.name}". Do you want to proceed?`;
        const confirmation = await vscode.window.showWarningMessage(message, { modal: true }, "Allow");
        if (confirmation !== "Allow") {
            return actionResultNoPermission(PERMISSIONS.terminalAccess);
        }
        // Execute the original handler asynchronously.
        setTimeout(() => {
            handler(actionData);
        }, 0);
        // Immediately return a success result with the early message.
        return actionResultAccept(earlyMessage);
    };
}
