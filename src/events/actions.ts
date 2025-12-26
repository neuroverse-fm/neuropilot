import { Disposable, EventEmitter } from 'vscode';

export interface ActionsEventData {
    action: string;
    success: boolean;
    message?: string;
}

const actionsEventEmitter = new EventEmitter<ActionsEventData>();
export const onDidAttemptAction = actionsEventEmitter.event;
export const actionsEventEmitterDisposable = Disposable.from(actionsEventEmitter);

export function fireOnActionAttempt(data: ActionsEventData) {
    actionsEventEmitter.fire(data);
}
