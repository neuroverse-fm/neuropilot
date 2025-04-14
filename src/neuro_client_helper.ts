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
 * Create an action result that tells Neuro to retry the forced action.
 * @param message The message to send to Neuro.
 * This should contain the information required to fix the mistake.
 * @returns A failed action result with the specified message.
 */
export function actionResultRetry(message: string): ActionResult {
    return {
        success: false,
        message: message,
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
        message: `Missing required parameter "${parameterName}"`,
    };
}
