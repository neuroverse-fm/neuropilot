/**
 * Helper functions and types for interacting with the Neuro Game SDK.
 */

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
 * @returns A successful action result with the specified message.
 */
export function actionResultFailure(message?: string): ActionResult {
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
    return {
        success: false,
        message: `Action failed: ${message}`,
    };
}

/**
 * Create an action result that tells Neuro that a required parameter is missing.
 * @param parameterName The name of the missing parameter.
 * @returns An failed action result with a message pointing out the missing parameter.
 */
export function actionResultMissingParameter(parameterName: string) {
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
export function actionResultNoPermission(permission: string) {
    return {
        success: true,
        message: `Action failed: You do not have permission to ${permission}.`
    };
}

/** Collection of strings for use in {@link actionResultNoPermission}. */
export const PERMISSION_STRINGS = {
    openFiles:          'open files',
    editActiveDocument: 'edit the current document',
    create:             'create files or folders',
    rename:             'rename files or folders',
    delete:             'delete files or folders',
    runTasks:           'run tasks',
    requestCookies:     'request cookies',
    gitOperations:      'use Git',
    gitTags:            'tag commits',
    gitRemotes:         'interact with Git remotes',
    editRemoteData:     'edit remote data',
    gitConfigs:         'edit the Git configuration',
};
