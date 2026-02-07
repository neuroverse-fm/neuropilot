/**
 * rce stands for Requested Command Execution
 * (or Request for Command Execution if you don't mind the omitted 'f')
 */

import * as vscode from 'vscode';
import { ActionData } from 'neuro-game-sdk';
import { RCEAction, stripToAction } from '@/utils/neuro_client';
import { NEURO } from '@/constants';
import { logOutput, notifyOnCaughtException } from '@/utils/misc';
import { ACTIONS, CONFIG, CONNECTION, getAllPermissions, getPermissionLevel, PermissionLevel, stringToPermissionLevel } from '@/config';
import { validate } from 'jsonschema';
import type { RCECancelEvent } from '@events/utils';
import { fireOnActionStart, updateActionStatus } from '@events/actions';
import { RCEContext, RCERequestState } from './context/rce';

export const CATEGORY_MISC = 'Miscellaneous';

const ACTIONS_ARRAY: RCEAction[] = [];
const REGISTERED_ACTIONS: Set<string> = /* @__PURE__ */ new Set<string>();

/**
 * A prompt parameter can either be a string or a function that converts an RCEContext into a prompt string.
 */
export type PromptGenerator = string | ((context: RCEContext) => string);

let activeRequestContext: RCEContext | null = null;

function getActiveRequestContext(): RCEContext | null {
    return activeRequestContext;
}

function setActiveRequestContext(context: RCEContext | null): void {
    activeRequestContext = context;
}

export interface ExtendedActionInfo {
    action: RCEAction;
    isRegistered: boolean;
    effectivePermissionLevel: PermissionLevel;
    isConfigured: boolean;
    configuredWorkspacePermission?: PermissionLevel;
    configuredGlobalPermission?: PermissionLevel;
}

export const cancelRequestAction: RCEAction = {
    name: 'cancel_request',
    description: 'Cancel the current request.',
    category: null,
    handler: handleCancelRequest,
    promptGenerator: () => '', // No prompt needed for this action
    defaultPermission: PermissionLevel.AUTOPILOT,
};

/**
 * Handles cancellation requests from Neuro.
 */
export function handleCancelRequest(context: RCEContext): string | undefined {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        context.updateStatus('failure', 'No active request.');
        return 'No active request to cancel.';
    }
    const data = activeContext.data;
    clearRceRequest(activeContext);
    activeContext.done(false);
    updateActionStatus(data, 'cancelled', 'Cancelled on Neuro\'s request');
    context.updateStatus('success', `Cancelled action "${data.name}"`);
    return 'Request cancelled.';
}

/**
 * RCE's emergency shutdown component
 * Automatically clears the RCE dialog and tell Neuro her requests was cancelled.
 * Only runs if there is an RCE callback in NEURO.
 */
export function emergencyDenyRequests(): void {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        return;
    }
    const data = activeContext.data;
    updateActionStatus(data, 'cancelled', 'Emergency shutdown activated');
    clearRceRequest(activeContext);
    activeContext.done(false);
    logOutput('INFO', `Cancelled ${activeContext.action.name} due to emergency shutdown.`);
    NEURO.client?.sendContext('Your last request was denied.');
    vscode.window.showInformationMessage(`The last request from ${NEURO.currentController} has been denied automatically.`);
}

export function clearRceRequest(context: RCEContext | null = getActiveRequestContext()): void {
    if (!context?.request) return;
    context.request.resolve();
    context.request = undefined;
    if (getActiveRequestContext() === context) {
        setActiveRequestContext(null);
        NEURO.client?.unregisterActions([cancelRequestAction.name]);
        NEURO.statusBarItem!.tooltip = 'No active request';
        NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.foreground');
        NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
    }
}

/**
 * Creates a new RCE request and attaches it to NEURO.
 * @param prompt The prompt to be displayed in the notification.
 * @param callback The callback function to be executed when the request is accepted.
 * @param actionData The action data associated with this request.
 * @param cancelEvents Optional array of disposables for cancellation events.
 * @param preview Optional preview effects function.
 */
export function createRceRequest(
    prompt: string,
    context: RCEContext,
): void {
    setActiveRequestContext(context);
    const request: RCERequestState = {
        prompt,
        notificationVisible: false,
        resolved: false,
        resolve: () => { },
        attachNotification: async () => { },
    };
    context.request = request;

    const promise = new Promise<void>((resolve) => {
        // we can't add any buttons to progress, so we have to add the accept link
        const message = `${request.prompt} [Accept](command:neuropilot.acceptRceRequest)`;

        // this is null initially but will be assigned when a notification gets spawned
        let progress: vscode.Progress<{ message?: string; increment?: number }> | null = null;

        const progressStep = 100; // step progress bar every 100ms, looks completely smooth

        const timeoutDuration = CONFIG.requestExpiryTimeout;
        const hasTimeout = timeoutDuration && timeoutDuration > 0;
        // if there's no timeout we "don't pass" the increment, this makes the progress bar infinite
        const increment = hasTimeout ? progressStep / timeoutDuration * 100 : undefined;

        // keep track of the incremented value to correctly report progress when the notification gets attached
        let incremented = increment;

        let interval: NodeJS.Timeout | null = null;
        let timeout: NodeJS.Timeout | null = null;
        if (hasTimeout) {
            // if there's a timeout, we need to report progress
            interval = setInterval(() => {
                progress?.report({ message, increment });
                if (incremented)
                    incremented += increment!;
            }, progressStep);

            // actually handle the timeout
            timeout = setTimeout(() => {
                clearRceRequest(context);
                NEURO.client?.sendContext('Request expired.');
                context.updateStatus('timeout', `Timed out waiting for approval from ${CONNECTION.userName}`);
                context.done(false);
            }, timeoutDuration);
        }
        request.interval = interval;
        request.timeout = timeout;

        // this will be called on request resolution
        request.resolve = () => {
            if (request.resolved) return;
            request.resolved = true;
            if (interval)
                clearInterval(interval);
            if (timeout)
                clearTimeout(timeout);

            resolve();
        };

        request.attachNotification = async (p) => {
            // set internal progress to the one from the notification
            progress = p;
            // we need to set the prompt and report time passed if there's a timeout
            progress.report({ message, increment: incremented });

            // return this exact promise we're in so the notification closes on request resolution
            return promise;
        };
    });
}

/**
 * Reveals the RCE notification for the current request if it is not already visible.
 */
export function revealRceNotification(): void {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request)
        return;

    // don't show the notification if it's already open
    if (activeContext.request.notificationVisible)
        return;

    activeContext.request.notificationVisible = true;
    if (activeContext.action.preview) {
        activeContext.lifecycle.preview = activeContext.action.preview(activeContext);
    }

    // weirdly enough, a "notification" isn't actually a thing in vscode.
    // it's either a message, or in this case, progress report that takes shape of a notification
    // this is a workaround to show a notification that can be dismissed programmatically
    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
        },
        (progress, cancellationToken) => {
            // handle manual cancellation
            cancellationToken.onCancellationRequested(() => {
                denyRceRequest();
            });

            return activeContext.request!.attachNotification(progress);
        },
    );
}

/**
 * Accepts the current RCE request and executes the callback function.
 * If there is no request to accept, an error message is shown to the user.
 */
export function acceptRceRequest(): void {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        vscode.window.showErrorMessage(`No active request from ${NEURO.currentController} to accept.`);
        return;
    }

    NEURO.client?.sendContext(`${CONNECTION.userName} has accepted your request.`);

    const actionData = activeContext.data;
    updateActionStatus(actionData, 'pending', 'Executing...');

    try {
        const result = activeContext.action.handler(activeContext);
        if (result) NEURO.client?.sendContext(result);
    } catch (erm: unknown) {
        const actionName = actionData.name;
        notifyOnCaughtException(actionName, erm);
        NEURO.client?.sendActionResult(actionData.id, true, `An error occurred while executing the action "${actionName}". You can retry if you like, but it may be better to ask ${CONNECTION.userName} to check what's up.`);

        // Track execution failure
        updateActionStatus(actionData, 'failure', 'Uncaught exception while executing action');
    }

    clearRceRequest(activeContext);
    activeContext.done(true);
}

/**
 * Denies the current RCE request and clears the request object.
 * If there is no request to deny, an error message is shown to the user.
 */
export function denyRceRequest(): void {
    const activeContext = getActiveRequestContext();
    if (!activeContext?.request) {
        vscode.window.showErrorMessage(`No active request from ${NEURO.currentController} to deny.`);
        return;
    }

    NEURO.client?.sendContext(`${CONNECTION.userName} has denied your request.`);

    // Track denial
    updateActionStatus(
        activeContext.data,
        'denied',
        `Denied by ${CONNECTION.userName}`,
    );

    clearRceRequest(activeContext);
    activeContext.done(false);
}

/**
 * Adds multiple actions to the RCE system.
 * @param actions The actions to add.
 * @param register Whether to register the actions with Neuro immediately if the permissions allow.
 */
export function addActions(actions: RCEAction[], register = true): void {
    const actionsToAdd = actions.filter(a => !ACTIONS_ARRAY.some(existing => existing.name === a.name));
    const actionsNotToAdd = actions.filter(a => !actionsToAdd.includes(a));
    if (actionsNotToAdd.length > 0) {
        logOutput('WARN', `Tried to add actions that are already registered: ${actionsNotToAdd.map(a => a.name).join(', ')}`);
    }
    ACTIONS_ARRAY.push(...actionsToAdd);
    if (register && NEURO.connected) {
        const actionNames = actionsToAdd.map(a => a.name);
        const actionsToRegister = actionNames
            .map(name => ACTIONS_ARRAY.find(a => a.name === name)!)
            .filter((action) => getPermissionLevel(action.name) && action.registerCondition?.() !== false)
            .map(stripToAction);
        actionsToRegister.forEach(a => REGISTERED_ACTIONS.add(a.name));
        if (actionsToRegister.length > 0)
            NEURO.client?.registerActions(actionsToRegister);
    }
    NEURO.viewProviders.actions?.refreshActions();
}

/**
 * Removes multiple actions from the registry.
 * @param actionNames The names of the actions to remove.
 */
export function removeActions(actionNames: string[]): void {
    for (const actionName of actionNames) {
        const actionIndex = ACTIONS_ARRAY.findIndex(a => a.name === actionName);
        if (actionIndex !== -1) {
            ACTIONS_ARRAY.splice(actionIndex, 1);
        }
    }
    if (NEURO.connected) {
        NEURO.client?.unregisterActions(actionNames);
        actionNames.forEach(a => REGISTERED_ACTIONS.delete(a));
    }
    NEURO.viewProviders.actions?.refreshActions();
}

/**
 * Registers an action with Neuro.
 * The action to register must already be added to the registry via {@link addAction} or {@link addActions}.
 * Will only register the action if it is not already registered.
 * @param actionName The name of the action to register.
 */
export function registerAction(actionName: string): void {
    const action = ACTIONS_ARRAY.find(a => a.name === actionName);
    if (action && NEURO.connected && !REGISTERED_ACTIONS.has(action.name)) {
        NEURO.client!.registerActions([stripToAction(action)]);
        REGISTERED_ACTIONS.add(action.name);
        NEURO.viewProviders.actions?.refreshActions();
    }
}

/**
 * Unregisters an action from Neuro.
 * @param actionName The name of the action to unregister.
 */
export function unregisterAction(actionName: string): void {
    NEURO.client?.unregisterActions([actionName]);
    REGISTERED_ACTIONS.delete(actionName);
    NEURO.viewProviders.actions?.refreshActions();
}

export function unregisterAllActions(): void {
    const actionNames = Array.from(REGISTERED_ACTIONS);
    NEURO.client?.unregisterActions(actionNames);
    REGISTERED_ACTIONS.clear();
    NEURO.viewProviders.actions?.refreshActions();
}

/**
 * Reregisters all actions with the Neuro API.
 * @param conservative Only reregister as necessary.
 */
export function reregisterAllActions(conservative: boolean): void {
    // Can't reregister if no client is connected
    if (!NEURO.connected) return;

    const permissions = getAllPermissions();
    const actionsToUnregister = conservative
        ? ACTIONS_ARRAY
            .filter(a => REGISTERED_ACTIONS.has(a.name) && !shouldBeRegistered(a))
            .map(a => a.name)
        : ACTIONS_ARRAY.map(a => a.name);

    // Unregister actions
    if (actionsToUnregister.length > 0)
        NEURO.client?.unregisterActions(actionsToUnregister);
    actionsToUnregister.forEach(a => REGISTERED_ACTIONS.delete(a));

    // Determine which actions to register
    const actionsToRegister = ACTIONS_ARRAY
        // Skip actions that are already registered
        .filter(a => !REGISTERED_ACTIONS.has(a.name))
        .filter(shouldBeRegistered)
        .map(stripToAction);

    actionsToRegister.forEach(a => REGISTERED_ACTIONS.add(a.name));

    // Register the actions with Neuro
    if (actionsToRegister.length > 0)
        NEURO.client?.registerActions(actionsToRegister);

    NEURO.viewProviders.actions?.refreshActions();
    return;

    function shouldBeRegistered(action: RCEAction): boolean {
        // Non-auto-registered actions should stay unregistered
        if (action.autoRegister === false && !REGISTERED_ACTIONS.has(action.name))
            return false;
        // Check the register condition
        if (action.registerCondition && !action.registerCondition())
            return false;
        // Check permissions
        const effectivePermission = permissions[action.name] ?? action.defaultPermission ?? PermissionLevel.OFF;
        return effectivePermission !== PermissionLevel.OFF;
    }
}

/**
 * Gets the list of registered actions.
 * Do not modify the actions in the returned array directly.
 * @returns The list of registered actions.
 */
export function getActions(): readonly RCEAction[] {
    return ACTIONS_ARRAY;
}

export function getAction(actionName: string): RCEAction | undefined {
    return ACTIONS_ARRAY.find(a => a.name === actionName);
}

export function getExtendedActionsInfo(): ExtendedActionInfo[] {
    const configuration = vscode.workspace.getConfiguration('neuropilot');
    const { workspaceValue, globalValue } = configuration.inspect<Record<string, string>>('actionPermissions') || {};
    return ACTIONS_ARRAY.map(action => {
        const configuredWorkspacePermission = workspaceValue?.[action.name] !== undefined ? stringToPermissionLevel(workspaceValue[action.name]) : undefined;
        const configuredGlobalPermission = globalValue?.[action.name] !== undefined ? stringToPermissionLevel(globalValue[action.name]) : undefined;
        return {
            action,
            isRegistered: REGISTERED_ACTIONS.has(action.name),
            effectivePermissionLevel: getPermissionLevel(action.name),
            configuredWorkspacePermission,
            configuredGlobalPermission,
            isConfigured: configuredWorkspacePermission !== undefined || configuredGlobalPermission !== undefined,
        } satisfies ExtendedActionInfo;
    });
}

/**
 * RCE action handler code for unsupervised requests.
 * Intended to be used with something like `NEURO.client?.onAction(async (actionData: ActionData) => await RCEActionHandler(actionData, actionList, true))
 * @param actionData The action data from Neuro.
 * @param actionList The list of actions currently registered.
 * @param checkTasks Whether or not to check for tasks.
 */
export async function RCEActionHandler(actionData: ActionData) {
    try {
        if (REGISTERED_ACTIONS.has(actionData.name)) {
            NEURO.actionHandled = true;

            // Start tracking execution immediately
            fireOnActionStart(actionData, 'Validating action...');

            const context = new RCEContext(actionData);

            const effectivePermission = getPermissionLevel(context.action.name);
            if (context.action.ephemeralStorage) {
                context.storage = {};
            }
            if (effectivePermission === PermissionLevel.OFF) {
                NEURO.client?.sendActionResult(actionData.id, true, 'Action failed: You don\'t have permission to execute this action.');
                context.updateStatus('denied', 'Permission denied');
                context.done(false);
                return;
            }

            // Validate schema
            if (context.action.schema) {
                context.updateStatus('pending', 'Validating schema...');
                const schema = ACTIONS.experimentalSchemas ? context.action.schema ?? context.action.schemaFallback : context.action.schema;
                const schemaValidationResult = validate(actionData.params, schema, { required: true });
                if (!schemaValidationResult.valid) {
                    const messagesArray: string[] = [];
                    schemaValidationResult.errors.map((erm) => {
                        if (erm.stack.startsWith('instance.')) messagesArray.push(erm.stack.substring(9));
                        else messagesArray.push(erm.stack);
                    });
                    if (messagesArray.length === 0) messagesArray.push('Unknown schema validation error.');
                    const schemaFailures = `- ${messagesArray.join('\n- ')}`;
                    const message = 'Action failed, your inputs did not pass schema validation due to these problems:\n\n' + schemaFailures + '\n\nPlease pay attention to the schema and the above errors if you choose to retry.';
                    NEURO.client?.sendActionResult(actionData.id, false, message);
                    context.updateStatus('schema', `${messagesArray.length} schema validation rules failed`);
                    context.done(false);
                    return;
                }
            }

            // Validate custom
            if (context.action.validators) {
                if (context.action.validators.sync) {
                    context.updateStatus('pending', 'Running validators...');
                    for (const validate of context.action.validators.sync) {
                        const actionResult = await validate(context);
                        context.lifecycle.validatorResults?.sync.push(actionResult);
                        if (!actionResult.success) {
                            NEURO.client?.sendActionResult(actionData.id, !(actionResult.retry ?? false), actionResult.message);
                            context.done(false);
                            context.updateStatus(
                                'failure',
                                actionResult.historyNote ? `Validator failed: ${actionResult.historyNote}` : 'Validator failed' + actionResult.retry ? '\nRequesting retry' : '',
                            );
                            return;
                        }
                    }
                }
                if (context.action.validators.async) vscode.window.showInformationMessage(`Action "${actionData.name}" uses asynchronous validators, which have not been implemented yet.`); // implementation needs this to be moved to be *after* setup of cancel events (and action result obv).
            }

            if (ACTIONS.enableCancelEvents && context.action.cancelEvents) {
                context.lifecycle.events = [];
                const eventListener = (eventObject: RCECancelEvent, eventData: unknown) => {
                    let createdReason: string;
                    let createdLogReason: string;
                    const reason = eventObject.reason;
                    if (typeof reason === 'string') {
                        createdReason = reason.trim();
                    } else if (typeof reason === 'function') {
                        createdReason = reason(actionData, eventData).trim();
                    } else {
                        createdReason = 'a cancellation event was fired.';
                    };
                    const logReason = eventObject.logReason;
                    if (typeof logReason === 'string') {
                        createdLogReason = logReason.trim();
                    } else if (typeof logReason === 'function') {
                        createdLogReason = logReason(actionData, eventData).trim();
                    } else {
                        createdLogReason = createdReason;
                    }
                    logOutput('WARN', `${CONNECTION.nameOfAPI}'${CONNECTION.nameOfAPI.endsWith('s') ? '' : 's'} action ${context.action.name} was cancelled because ${createdLogReason}`);
                    NEURO.client?.sendContext(`Your request was cancelled because ${createdReason}`);
                    context.updateStatus('cancelled', `Cancelled because ${createdLogReason}`);
                    clearRceRequest(context);
                    context.done(false);
                };
                for (const eventObject of context.action.cancelEvents) {
                    const eventDetails = eventObject(context);
                    if (eventDetails) {
                        const subscription = eventDetails.event((eventData) => eventListener(eventDetails, eventData));
                        context.lifecycle.events.push(vscode.Disposable.from(subscription, eventDetails.disposable));
                    }
                }
            }

            if (effectivePermission === PermissionLevel.AUTOPILOT) {
                context.updateStatus('pending', 'Executing handler...');
                for (const d of context.lifecycle.events ?? []) d.dispose();
                const result = context.action.handler(context);
                NEURO.client?.sendActionResult(actionData.id, true, result ?? undefined);
                context.done(true);
            }
            else { // effectivePermission === PermissionLevel.COPILOT
                if (getActiveRequestContext()?.request) {
                    NEURO.client?.sendActionResult(actionData.id, true, 'Action failed: Already waiting for permission to run another action.');
                    context.done(false);
                    context.updateStatus('failure', 'Another action pending approval');
                    return;
                }

                context.updateStatus('pending', `Waiting for approval from ${CONNECTION.userName}`);

                const prompt = (NEURO.currentController
                    ? NEURO.currentController
                    : 'The Neuro API server') +
                    ' wants to ' +
                    (typeof context.action.promptGenerator === 'string' ? context.action.promptGenerator : context.action.promptGenerator(context)).trim();

                if (context.storage) context.lifecycle.copilotPrompt = prompt;

                createRceRequest(
                    prompt,
                    context,
                );

                NEURO.statusBarItem!.tooltip = new vscode.MarkdownString(prompt);
                NEURO.client?.registerActions([stripToAction(cancelRequestAction)]);
                NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.warningForeground');

                // Show the RCE dialog immediately if the config says so
                if (!ACTIONS.hideCopilotRequests)
                    revealRceNotification();

                // End of added code.
                NEURO.client?.sendActionResult(actionData.id, true, 'Requested permission to run action.');
            }
        } else if (actionData.name === 'cancel_request') {
            NEURO.actionHandled = true;
            fireOnActionStart(actionData, 'Executing...');
            const cancelContext = new RCEContext(actionData);
            cancelRequestAction.handler(cancelContext);
            cancelContext.done(true);
        }
    } catch (erm: unknown) {
        const actionName = actionData.name;
        notifyOnCaughtException(actionName, erm);
        NEURO.client?.sendActionResult(actionData.id, true, `An error occurred while executing the action "${actionName}". You can retry if you like, but it may be better to ask Vedal to check what's up.`);

        // Track execution error
        updateActionStatus(actionData, 'exception', 'Uncaught exception while executing action');
        return;
    }
}
