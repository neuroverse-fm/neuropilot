import * as vscode from 'vscode';
import { ActionData } from '../neuro_client_helper';

export function fireEvent(emitter: vscode.EventEmitter<unknown>, disposables: vscode.Disposable[]) {
    emitter.fire(undefined);
    for (const dispose of disposables) {
        dispose.dispose();
    }
    emitter.dispose();
}

export interface RCECancelEventInitializer {
    /** The reason that will be used to send to Neuro-sama. */
    reason?: string | ((data: ActionData) => string);
    /** The reason that will be used to log the cancellation. */
    logReason?: string | ((data: ActionData) => string);
    /** Events that will trigger the cancellation. If the predicate is null, the event will always trigger the cancellation. */
    events?: [vscode.Event<unknown>, ((data: unknown) => boolean) | null][];
}

export class RCECancelEvent {
    /**
     * Private emitter constructed by the class constructor.
     */
    private readonly _emitter: vscode.EventEmitter<unknown>;

    /**
     * Publicly-exposed event.
     */
    public readonly event: vscode.Event<unknown>;

    /**
     * Event disposable using {@link vscode.Disposable VS Code's Disposable class}.
     */
    public readonly disposable: vscode.Disposable;

    /**
     * The reason that will be used to send to Neuro-sama.
     */
    public readonly reason?: string | ((actionData: ActionData) => string);

    /**
     * The reason that will be used to log the cancellation.
     */
    public readonly logReason?: string | ((actionData: ActionData) => string);

    /**
     * Fires the event.
     * @param data The data to provide in the fire.
     */
    public fire(data: unknown): void {
        this._emitter.fire(data);
        this.disposable.dispose();
    }

    /**
     * Creates an instance of RCECancelEvent.
     * @param init Initialization parameters.
     */
    constructor(init?: RCECancelEventInitializer) {
        this._emitter = new vscode.EventEmitter<never>();
        this.event = this._emitter.event;

        // Subscribe to all events
        const disposables: vscode.Disposable[] = [];
        for (const [event, predicate] of init?.events ?? []) {
            disposables.push(
                event((data) => {
                    if (predicate === null || predicate(data)) {
                        this.fire(data);
                    }
                }),
            );
        }

        // Clean up all disposables when this is disposed
        this.disposable = vscode.Disposable.from(...disposables, this._emitter);

        this.reason = init?.reason;
        this.logReason = init?.logReason;
    }
}
