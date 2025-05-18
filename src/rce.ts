/**
 * rce stands for Requested Command Execution
 * (or Request for Command Execution if you don't mind the omitted 'f')
 */

import * as vscode from 'vscode';
import { ActionData, ActionWithHandler } from './neuro_client_helper';
import { NEURO } from './constants';
import { logOutput } from './utils';
import { CONFIG, PermissionLevel } from './config';

/**
 * A prompt parameter can either be a string or a function that converts ActionData into a prompt string.
 */
export type PromptGenerator = string | ((actionData: ActionData) => string);

/**
 * RCE request object
 */
export interface RceRequest {
    prompt: string;
    callback: () => string | undefined;

    attachNotification: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>;
    dismiss: () => void;
}

export const cancelRequestAction: ActionWithHandler = {
    name: 'cancel_request',
    description: 'Cancel the current request.',
    permissions: [],
    handler: handleCancelRequest,
    promptGenerator: () => '', // No prompt needed for this action
    defaultPermission: PermissionLevel.AUTOPILOT,
};

/**
 * Handles cancellation requests from Neuro.
 */
export function handleCancelRequest(_actionData: ActionData): string | undefined {
    if (!NEURO.rceRequest) {
        return 'No active request to cancel.';
    }
    clearRceDialog();
    return 'Request cancelled.';
}

/**
 * RCE's emergency shutdown component
 * Automatically clears the RCE dialog and tell Neuro her requests was cancelled.
 * Only runs if there is an RCE callback in NEURO.
 */
export function emergencyDenyRequests(): void {
    if (!NEURO.rceRequest) {
        return;
    }
    clearRceDialog();
    logOutput('INFO', `Cancelled ${NEURO.rceRequest.callback} due to emergency shutdown.`);
    NEURO.client?.sendContext('Your last request was denied.');
    vscode.window.showInformationMessage('The last request from Neuro has been denied automatically.');
}

export function clearRceDialog(): void { // Function to clear out RCE dialogs
    NEURO.rceRequest?.dismiss();
    NEURO.rceRequest = null;
    NEURO.client?.unregisterActions([cancelRequestAction.name]);
    NEURO.statusBarItem!.tooltip = 'No active request';
    NEURO.statusBarItem!.color = new vscode.ThemeColor('statusBarItem.foreground');
    NEURO.statusBarItem!.backgroundColor = new vscode.ThemeColor('statusBarItem.background');
}

export function createRceRequest(
    prompt: string,
    callback: () => string | undefined,
): void {
    NEURO.rceRequest = {
        prompt,
        callback,

        // these immediately get replaced synchronously, this is just so we don't have them be nullable in the type
        dismiss: () => {},
        attachNotification: async () => {},
    };

    const promise = new Promise<void>((resolve) => {
        // we can't add any buttons to progress, so we have to add the accept link
        const message = `${NEURO.rceRequest!.prompt} [Accept](command:neuropilot.confirmRceRequest)`;

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
                clearRceDialog();
                NEURO.client?.sendContext('Request expired.');
            }, timeoutDuration);
        }

        // this will be called on request resolution
        NEURO.rceRequest!.dismiss = () => {
            if (interval)
                clearInterval(interval);
            if (timeout)
                clearTimeout(timeout);

            resolve();
        };

        NEURO.rceRequest!.attachNotification = async (p) => {
            progress = p;
            if (incremented) {
                // if we have a timeout, we need to report progress
                progress.report({ message, increment: incremented });
            }
            // if we don't have a timeout, we don't need to report progress
            return promise;
        };
    });
}

export function openRceDialog(): void {
    if(!NEURO.rceRequest)
        return;

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
                declineRceRequest();
            });

            return NEURO.rceRequest!.attachNotification(progress);
        },
    );
}

export function confirmRceRequest(): void {
    if (!NEURO.rceRequest)
        return;

    NEURO.client?.sendContext('Vedal has accepted your request.');

    const result = NEURO.rceRequest.callback();
    if (result)
        NEURO.client?.sendContext(result);

    clearRceDialog();
}

export function declineRceRequest(): void {
    if (!NEURO.rceRequest)
        return;

    NEURO.client?.sendContext('Vedal has denied your request.');

    clearRceDialog();
}
