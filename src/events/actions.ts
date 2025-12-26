import { Disposable, EventEmitter } from 'vscode';

export interface ActionsEventData {
    action: string;
    success: string;
    message?: string;
}

const actionsEventEmitter = new EventEmitter<ActionsEventData>();
export const onDidExecuteAction = actionsEventEmitter.event;
export const actionsEventEmitterDisposable = Disposable.from(actionsEventEmitter);

export function fireOnActionExecute(data: ActionsEventData) {
    actionsEventEmitter.fire(data);
}
