import { Disposable, EventEmitter } from 'vscode';
import { ActionData } from '@/neuro_client_helper';

export type ActionStatus = 'pending' | 'success' | 'failure' | 'denied' | 'exception' | 'timeout' | 'schema' | 'cancelled';

export interface ActionsEventData {
    action: string;
    status: ActionStatus;
    message?: string;
    executionId: string;
}

const actionsEventEmitter = new EventEmitter<ActionsEventData>();
export const onDidAttemptAction = actionsEventEmitter.event;
export const actionsEventEmitterDisposable = Disposable.from(actionsEventEmitter);

/**
 * Fires an action attempt event with pending status.
 * @param actionData The action data containing the action name and unique ID.
 * @param message Optional status message.
 */
export function fireOnActionStart(actionData: ActionData, message?: string): void {
    actionsEventEmitter.fire({
        action: actionData.name,
        status: 'pending',
        message,
        executionId: actionData.id,
    });
}

/**
 * Updates an existing action execution with a new status.
 * Can be used to update from pending to success/failure, or to update pending with new messages.
 * @param actionData The action data containing the action name and unique ID.
 * @param status The new status for the action.
 * @param message Optional status message.
 */
export function updateActionStatus(actionData: ActionData, status: ActionStatus, message?: string): void {
    actionsEventEmitter.fire({
        action: actionData.name,
        status,
        message,
        executionId: actionData.id,
    });
}

/**
 * Fires a completed action attempt event.
 * Use this for actions that complete immediately without needing a pending state.
 * @param actionData The action data containing the action name and unique ID.
 * @param success Whether the action succeeded.
 * @param message Optional status message.
 */
export function fireOnActionComplete(actionData: ActionData, success: boolean, message?: string): void {
    actionsEventEmitter.fire({
        action: actionData.name,
        status: success ? 'success' : 'failure',
        message,
        executionId: actionData.id,
    });
}
