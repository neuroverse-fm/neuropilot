/**
 * Helper functions and types for interacting with the Neuro Game SDK.
 */

import { Action, ActionForcePriorityEnum } from 'neuro-game-sdk';
import { Permission, PermissionLevel } from '@/config';
import { logOutput, OutputTag, turtleSafari } from '@/utils/misc';
import { PromptGenerator } from '@/rce';
import { RCECancelEvent } from '@events/utils';
import type { RCEContext } from '@ctx/rce';

import type { NeuroClient } from 'neuro-game-sdk';
import type { reregisterAllActions, registerAction, unregisterAction } from '@/rce';
import type { JSONSchema7, JSONSchema7Object } from 'json-schema';
import type { StandardJSONSchemaV1 } from '@standard-schema/spec';

//#region Action force utils

/**
 * The parameters for forcing actions.
 * @see {@link NeuroClient['forceActions']} for most field documentation.
 */
export interface ActionForceParams {
    state?: string;
    query: string;
    ephemeral_context?: boolean;
    actionNames: string[];
    priority?: ActionForcePriorityEnum;
    /**
     * If specified, execute all actions with the specified permission level instead of the current one.
     * If an object is provided, the keys are action names and the values are the permission levels to use for those actions.
     * If an action is not included in the object, it will not have its permission overridden.
     * 
     * Note that at the moment, action forces will not be retried if the permission is {@link PermissionLevel.COPILOT}
     * or if the chosen action's handler is async.
     */
    overridePermissions?: PermissionLevel.COPILOT | PermissionLevel.AUTOPILOT | Record<string, PermissionLevel.AUTOPILOT | PermissionLevel.COPILOT>;
}

//#endregion

//#region Action metadata & helpers

/**
 * Extracts the input type from a Standard Schema and casts it to be compatible with RCEAction.
 * This is necessary because Standard Schema's InferInput returns a type that may not structurally match JSONSchema7Object.
 */
type InferDataFromSchema<TSchema extends StandardJSONSchemaV1 | JSONSchema7 | undefined> =
    TSchema extends StandardJSONSchemaV1 ? StandardJSONSchemaV1.InferInput<TSchema> : TSchema extends JSONSchema7 ? JSONSchema7Object : undefined;

/**
 * A Standard Schema-compatible action that automatically infers input types from the schema.
 *
 * @template TSchema The Standard Schema type (e.g., Zod schema, Valibot schema, etc.)
 * @template K The extra context storage type
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const mySchema = z.object({
 *     filePath: z.string(),
 *     content: z.string(),
 * });
 *
 * const myAction: StandardRCEAction<typeof mySchema> = {
 *     name: 'my_action',
 *     schema: mySchema,
 *     handler: (ctx) => {
 *         // ctx.data.params is automatically typed as { filePath: string; content: string }
 *         const { filePath, content } = ctx.data.params;
 *         return actionHandlerSuccess();
 *     },
 *     // ...
 * };
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface StandardRCEAction<TSchema extends StandardJSONSchemaV1 | undefined = StandardJSONSchemaV1, K = any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extends Omit<RCEAction<TSchema, InferDataFromSchema<TSchema> & Record<string, any>, K>, 'schema'> {
    /**
     * A Standard Schema-compliant schema (Zod, Valibot, ArkType, etc.).
     * The input type will be automatically inferred for use in handlers, validators, and prompt generators.
     *
     * To comply with the Neuro API, the top-level schema must be an object schema.
     */
    schema?: TSchema;
}

/**
 * ActionHandler to use with constants for records of actions and their corresponding handlers.
 * 
 * You may optionally type the interface if you are sure the action will take a specific form.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RCEAction<S extends StandardJSONSchemaV1 | JSONSchema7 | undefined = JSONSchema7, T extends unknown | undefined = InferDataFromSchema<S>, E = any> extends Action {
    /** 
     * A human-friendly name for the action. If not provided, the action's name converted to Title Case will be used. 
     * @example Edit File
     * @example edit_file -> Edit File // if displayName isn't set
     */
    displayName?: string;
    /**
     * An object that defines an array of functions to validate the action's "environment".
     * Validators run before requests/executions to ensure environment/input validity.
     */
    validators?: RCEValidators<T>
    /**
     * Cancellation events attached to the action that will be automatically set up.
     * Each cancellation event will be setup in parallel to each other.
     * If one cancellation event fires, the request is cancelled and all listeners will be disposed as soon as possible.
     * 
     * Following VS Code's pattern, Disposables will not be awaited if async.
     * Returns from calling the `dispose()` function will not be used anywhere.
     */
    cancelEvents?: ((context: RCEContext<T>) => RCECancelEvent<E> | null)[];
    /**
     * A function that is used to preview the action's effects.
     * This function will be called while awaiting user approval, if the action is set to Copilot permission.
     * 
     * The action must return a Disposable-like object. The disposable will not be awaited if async.
     * If your preview function does not require a dispose function to be called, return a no-op Disposable-like.
     * @example return { dispose: () => undefined } // for no-ops
     */
    preview?: (context: RCEContext<T>) => { dispose: () => unknown };
    /** 
     * The function to handle the action.
     * This function must be synchronous.
     * 
     * An action result can be sent as either a synchronous result or asynchronous result, it will automatically be handled by RCE.
     * (see {@link RCEHandlerReturns})
     */
    handler: RCEHandler<T>;
    /** 
     * The function to generate a prompt for the action request (Copilot Mode). 
     * The prompt should fit the phrasing scheme "Neuro wants to [prompt]".
     * 
     * Only set this to `null` if the action is never intended to be used in Copilot mode.
     * 
     * It is this way due to a potential new addition in Neuro API "v2". (not officially proposed)
     * More info (comment): https://github.com/VedalAI/neuro-game-sdk/discussions/58#discussioncomment-12938623
     */
    promptGenerator: PromptGenerator<T, E> | null;
    /** Default permission for actions when no permission is configured in user or workspace settings. Defaults to {@link PermissionLevel.OFF}. */
    defaultPermission?: PermissionLevel;
    /**
     * The category of the request.
     * You can use null if the action is never added to the registry.
     */
    category: string | null;
    /**
     * Whether to automatically register the action with Neuro if all conditions are met.
     * Defaults to true.
     * 
     * If `false`, the RCE system will never automatically register the action, and only automatically unregister if the user disables permission.
     * You need to call {@link registerAction} or {@link unregisterAction} manually.
     * 
     * If `true`, the action will be automatically registered and unregistered based on the {@link RCEAction.registerCondition registerCondition} and current permission settings.
     * However, the conditions are not watched, so if the conditions change, the action may not be immediately registered or unregistered.
     * Call {@link reregisterAllActions} to update the registration.
     * 
     * Note that certain events also call {@link reregisterAllActions}.
     */
    autoRegister?: boolean;
    /**
     * Whether the action should be hidden in the action permissions view.
     * Usually meant for actions that are exclusively used in action forces.
     */
    hidden?: boolean;
    /**
     * A condition that must be true for the action to be registered.
     * If not provided, the action is always registered.
     * Should not be used if {@link RCEAction.autoRegister autoRegister} is `false`.
     * **This function must never throw.**
     */
    registerCondition?: () => boolean;
    /** 
     * Setup handlers that will be invoked to help setup the {@link RCEContext.storage} object.
     * These functions should not throw.
     * 
     * These functions will be parallelised, so the same key should not be accessed from multiple functions.
     */
    contextSetupHook?: ((context: RCEContext<T>) => Thenable<void>)[];
}

// apparently this JSDoc is really hard when trying to link to RCEAction.validators.async
interface RCEValidators<T extends unknown | undefined> {
    /** 
     * Synchronous validators that will block execution of the rest of the thread.
     * As this delays the action result to Neuro, any thenables must resolve quickly so as to be effectively synchronous speed-wise.
     * 
     * Tip: If you supply validators that ensure certain items are not nullable, you may be able to assert that they are a non-nullable value for:
     * 
     * - {@link RCEValidators.async asynchronous validators},
     * - {@link RCEAction.promptGenerator generating the Copilot-mode prompt},
     * - {@link RCEAction.preview preview effects}, and/or
     * - {@link RCEAction.handler handling the action}.
     */
    sync?: ((context: RCEContext<T>) => ActionValidationResult)[],
    /**
     * Asynchronous validators that will be ran in parallel to each other.
     * These will be executed after an action result, so it's perfect for long-running validators.
     * 
     * Async validators will time out (and consequently fail) after 1 second (1000ms). It is planned that this value will be adjustable in the future.
     */
    async?: ((context: RCEContext<T>) => Thenable<ActionValidationResult>)[];
}

type RCEHandler<T extends unknown | undefined> = (context: RCEContext<T>) => RCEHandlerReturns;
/**
 * The possible values that an RCE handler can return.
 */
export type RCEHandlerReturns = ActionHandlerResult | Thenable<ActionHandlerResult>;

/**
 * Strips an action to the form expected by the API.
 * @param action The action to strip to its basic form.
 * @returns The action stripped to its basic form, without the handler and permissions.
 */
export function stripToAction(action: RCEAction): Action {
    return {
        name: action.name,
        description: turtleSafari(action.description),
        schema: action.schema,
    };
}

/**
 * Helper function to define a Standard Schema action with automatic type inference.
 * The schema type is inferred from the provided schema, eliminating the need for manual type annotations.
 *
 * @template TSchema The Standard Schema type (automatically inferred from the schema property)
 * @template K The extra context storage type
 * @param action The action definition
 * @returns The same action with proper typing
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const mySchema = z.object({
 *     filePath: z.string(),
 *     content: z.string(),
 * });
 *
 * export const myAction = defineStandardAction({
 *     name: 'my_action',
 *     schema: mySchema,  // Type is inferred from here
 *     handler: (ctx) => {
 *         // ctx.data.params is automatically typed as { filePath: string; content: string }
 *         const { filePath, content } = ctx.data.params;
 *         return actionHandlerSuccess();
 *     },
 *     promptGenerator: null,
 *     category: 'Files',
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineStandardAction<TSchema extends StandardJSONSchemaV1, K = any>(
    action: StandardRCEAction<TSchema, K>,
): StandardRCEAction<TSchema, K> {
    return action;
}

//#endregion

//#region Action validation helpers

/** The result of attempting to execute an action client-side. */
export interface ActionValidationResult {
    /**
     * If `false`, the action handler is not executed.
     * Warning: This is *not* the success parameter of the action result.
     */
    success: boolean;
    /**
     * The message to send Neuro.
     * If success is `true`, this is optional, otherwise it should be an error message.
     */
    message?: string;
    /** If `true`, Neuro should retry the action if it was forced. */
    retry?: boolean;
    /** The reason to show on action panel. */
    historyNote?: string;
}

/**
 * Create a successful action result.
 * This should be used if all parameters have been parsed correctly.
 * @param message An optional message to send to Neuro.
 * @returns A successful action result.
 */
export function actionValidationAccept(message?: string, historyNote?: string): ActionValidationResult {
    return {
        success: true,
        retry: false,
        message,
        historyNote,
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
 * @param historyNote A note for the history panel. Will be changed to be required soon.
 * @returns A successful action result with the specified message.
 */
export function actionValidationFailure(message: string, historyNote?: string): ActionValidationResult {
    logOutput('WARNING', 'Action failed: ' + message);
    historyNote ??= message;
    return {
        success: false,
        retry: false,
        message: message !== undefined ? `Action failed: ${message}` : 'Action failed.',
        historyNote: `Validator failed: ${historyNote}`,
    };
}

/**
 * Create an action result that tells Neuro to retry the forced action.
 * @param message The message to send to Neuro.
 * This should contain the information required to fix the mistake.
 * @returns A failed action result with the specified message.
 */
export function actionValidationRetry(message: string, historyNote?: string): ActionValidationResult {
    logOutput('WARNING', 'Action failed: ' + message + '\nRequesting retry.');
    return {
        success: false,
        retry: true,
        message: 'Action failed: ' + message,
        historyNote,
    };
}

//#endregion

//#region Action handler helpers

export interface ActionHandlerResult {
    success: ActionHandlerSuccess;
    message?: string;
    historyNote?: string;
}

type ActionHandlerSuccess = 'success' | 'failure' | 'retry';

/**
 * Function to return an object that indicates handler success.
 * @param message The message that will be sent to Neuro
 * @param historyNote If supplied, an action status update with its status set to success will be fired with the note. Otherwise, assumes that you've already done that yourself.
 * @returns {ActionHandlerResult} An object with a successful handler result
 */
export function actionHandlerSuccess(message?: string, historyNote?: string): ActionHandlerResult {
    return {
        success: 'success',
        message,
        historyNote,
    };
}

/**
 * Function to return an object that indicates handler failure.
 * @param message The message that will be sent to Neuro
 * @param historyNote If supplied, an action status update with its status set to failure will be fired with the note. Otherwise, assumes that you've already done that yourself.
 * @returns {ActionHandlerResult} An object with a failed handler result
 */
export function actionHandlerFailure(message: string, historyNote?: string): ActionHandlerResult {
    logOutput('WARNING', 'Action failed: ' + message);
    historyNote ??= message;
    return {
        success: 'failure',
        message: message !== undefined ? `Action failed: ${message}` : 'Action failed.',
        historyNote: `Action handler failed: ${historyNote}`,
    };
}

/**
 * Function to return an object that indicates handler failure and to retry.
 * @param message The message that will be sent to Neuro
 * @param historyNote If supplied, an action status update with its status set to failure will be fired with the note. Otherwise, assumes that you've already done that yourself.
 * @returns {ActionHandlerResult} An object with a failed handler result
 */
export function actionHandlerRetry(message: string, historyNote?: string): ActionHandlerResult {
    logOutput('WARNING', 'Action failed: ' + message + '\nRequesting retry.');
    historyNote ??= message;
    return {
        success: 'retry',
        message: 'Action failed: ' + message + '\nPlease retry the action.',
        historyNote: `Action handler failed: ${historyNote}\nRequesting retry.`,
    };
}

//#endregion

//#region Old validation/handler result helpers

/**
 * Create an action result that tells Neuro that a required parameter is missing.
 * @param parameterName The name of the missing parameter.
 * @returns An failed action result with a message pointing out the missing parameter.
 * @deprecated Handled by the schema validator.
 */
export function actionResultMissingParameter(parameterName: string): ActionValidationResult {
    logOutput('WARNING', `Action failed: Missing required parameter "${parameterName}"`);
    return {
        success: false,
        message: `Action failed: Missing required parameter "${parameterName}"`,
    };
}

/**
 * @deprecated Handled by the schema validator.
 */
export function actionResultIncorrectType(parameterName: string, expectedType: string, actualType: string): ActionValidationResult {
    logOutput('WARNING', `Action failed: "${parameterName}" must be of type "${expectedType}", but got "${actualType}".`);
    return {
        success: false,
        message: `Action failed: "${parameterName}" must be of type "${expectedType}", but got "${actualType}".`,
    };
}

/**
 * Create an action result that tells Neuro that she doesn't have the required permission.
 * @param permission The permission Neuro doesn't have.
 * @returns A successful action result with a message pointing out the missing permission.
 * @deprecated Handled by the permissions checker component of RCE.
 */
export function actionValidationNoPermission(permission: Permission): ActionValidationResult {
    logOutput('WARNING', `Action failed: Neuro attempted to ${permission.infinitive}, but permission is disabled.`);
    return {
        success: true,
        message: `Action failed: You do not have permission to ${permission.infinitive}.`,
    };
}

/**
 * Create a context message that tells Neuro that she doesn't have permission to access a path.
 * Note that this does not send the context message.
 * @param path The path that was attempted to be accessed.
 * @returns A context message pointing out the missing permission.
 * @deprecated Should now be handled by validators.
 */
export function contextNoAccess(path: string): string {
    logOutput('WARNING', `Action failed: Neuro attempted to access "${path}", but permission is disabled.`);
    return 'Action failed: You do not have permission to access the requested location(s).';
}

/**
 * @deprecated Handled by the schema validator.
 */
export function actionResultEnumFailure<T>(parameterName: string, validValues: T[], value: T): ActionValidationResult {
    logOutput('WARNING', `Action failed: "${parameterName}" must be one of ${JSON.stringify(validValues)}, but got ${JSON.stringify(value)}.`);
    return {
        success: false,
        message: `Action failed: "${parameterName}" must be one of ${JSON.stringify(validValues)}, but got ${JSON.stringify(value)}.`,
    };
}

/**
 * Create a context message that tells Neuro that the action failed and logs this.
 * Also logs the message to the console.
 * Note that this does not send the context message.
 * @param message The message to format.
 * @param tag The tag to use for the log output.
 * This should explain, if possible, why the action failed.
 * If omitted, will just return "Action failed.".
 * @returns A context message with the specified message.
 * @deprecated Action handlers can now be async, and RCE will handle it properly.
 */
export function contextFailure(message?: string, tag: OutputTag = 'WARNING'): string {
    const result = message !== undefined ? `Action failed: ${message}` : 'Action failed.';
    logOutput(tag, result);
    return result;
}

//#endregion

/**
 * Checks if the schema is a Standard JSON Schema or regular JSON Schema.
 * @param schema The schema in question.
 * @returns A boolean for whether or not it is a Standard JSON Schema or normal JSON Schema.
 * @throws If the schema passed is a Standard Schema, but doesn't support Standard JSON Schema.
 */
export function isStandardJSONSchema<T extends JSONSchema7 | StandardJSONSchemaV1>(schema: T): boolean {
    if ('~standard' in schema) {
        if ('jsonSchema' in schema['~standard']) {
            return true;
        } else {
            throw new Error('Schema used is a Standard Schema, but does not support Standard JSON Schema!');
        }
    } else return false;
}
