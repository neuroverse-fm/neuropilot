/**
 * Helper functions and types for interacting with the Neuro Game SDK.
 */

import { logOutput } from "./utils";

/** Data used by an action handler. */
export interface ActionData {
    id: string;
    name: string;
    params?: any;
}

/** The result of attempting to execute an action client-side. */
export interface ActionResult {
    /** If `false`, Neuro should retry the action if it was forced. */
    success: boolean;
    /**
     * The message to send Neuro.
     * If success is `true`, this is optional, otherwise it should be an error message.
     */
    message?: string;
}

/**
 * Create a successful action result.
 * This should be used if all parameters have been parsed correctly.
 * @param message An optional message to send to Neuro.
 * @returns A successful action result.
 */
export function actionResultAccept(message?: string): ActionResult {
    return {
        success: true,
        message: message,
    };
}

/**
 * Create an action result with the specified message.
 * This should be used if the action failed, but should not be retried, e.g.
 * if the source of the error is out of Neuro's control or to prevent a retry
 * loop in case the action is not applicable in the current state.
 * @param message The message to send to Neuro.
 * This should explain, if possible, why the action failed.
 * If omitted, will just send "Action failed.".
 * @param {string} [tag="WARNING"] The tag to use for the log output.
 * @returns A successful action result with the specified message.
 */
export function actionResultFailure(message?: string, tag: string = "WARNING"): ActionResult {
    logOutput(tag, 'Action failed: ' + message);
    return {
        success: true,
        message: message !== undefined ? `Action failed: ${message}` : 'Action failed.',
    };
}

/**
 * Create an action result that tells Neuro to retry the forced action.
 * @param message The message to send to Neuro.
 * This should contain the information required to fix the mistake.
 * @returns A failed action result with the specified message.
 */
export function actionResultRetry(message: string): ActionResult {
    logOutput('WARNING', 'Action failed: ' + message + '\nRequesting retry.');
    return {
        success: false,
        message: 'Action failed: ' + message,
    };
}

/**
 * Create an action result that tells Neuro that a required parameter is missing.
 * @param parameterName The name of the missing parameter.
 * @returns An failed action result with a message pointing out the missing parameter.
 */
export function actionResultMissingParameter(parameterName: string): ActionResult {
    logOutput('WARNING', `Action failed: Missing required parameter "${parameterName}"`);
    return {
        success: false,
        message: `Action failed: Missing required parameter "${parameterName}"`,
    };
}

/**
 * Create an action result that tells Neuro that she doesn't have the required permission.
 * @param permission The permission.
 * Use a string from {@link PERMISSION_STRINGS} if possible,
 * otherwise it should fit in the sentence "You do not have permission to {permission}.".
 * @returns A successful action result with a message pointing out the missing permission.
 */
export function actionResultNoPermission(permission: string): ActionResult {
    logOutput('WARNING', `Action failed: Neuro attempted to ${permission}, but permission is disabled.`);
    return {
        success: true,
        message: `Action failed: You do not have permission to ${permission}.`
    };
}

/**
 * Create an action result that tells Neuro that she doesn't have permission to access a path.
 * @param path The path that was attempted to be accessed.
 * @returns A successful action result with a message pointing out the missing permission.
 */
export function actionResultNoAccess(path: string): ActionResult {
    logOutput('WARNING', `Action failed: Neuro attempted to access "${path}", but permission is disabled.`);
    return {
        success: true,
        message: `Action failed: You do not have permission to access this location.`
    };
}

export function actionResultEnumFailure(parameterName: string, validValues: any[], value: any): ActionResult {
    logOutput('WARNING', `Action failed: "${parameterName}" must be one of ${JSON.stringify(validValues)}, but got ${JSON.stringify(value)}.`);
    return {
        success: false,
        message: `Action failed: "${parameterName}" must be one of ${JSON.stringify(validValues)}, but got ${JSON.stringify(value)}.`,
    }
}

/** Collection of strings for use in {@link actionResultNoPermission}. */
export const PERMISSION_STRINGS = {
    openFiles:          'open files',
    editActiveDocument: 'edit the current document',
    create:             'create files or folders',
    rename:             'rename files or folders',
    delete:             'delete files or folders',
    runTasks:           'run or terminate tasks',
    requestCookies:     'request cookies',
    gitOperations:      'use Git',
    gitTags:            'tag commits',
    gitRemotes:         'interact with Git remotes',
    editRemoteData:     'edit remote data',
    gitConfigs:         'edit the Git configuration',
    terminalAccess:     'access the terminal',
};
