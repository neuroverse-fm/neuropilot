import type { JSONSchema7Object } from 'json-schema';
import type { ActionValidationResult, RCEAction } from '@/utils/neuro_client';
import type { ActionData } from 'neuro-game-sdk';
import { Disposable, Progress } from 'vscode';
import { ActionStatus, updateActionStatus } from '../events/actions';
import { getAction } from '../rce';

export type RCEStorage = Record<string | number | symbol, unknown>;

export interface RCELifecycleMetadata {
    events?: Disposable[];
    preview?: { dispose: () => unknown };
    validatorResults?: {
        sync: ActionValidationResult[];
    };
    copilotPrompt?: string;
}

export type SimplifiedStatusUpdateHandler = (status: ActionStatus, message: string) => void;

export interface RCERequestState {
    prompt: string;
    notificationVisible: boolean;
    attachNotification: (progress: Progress<{ message?: string; increment?: number }>) => Promise<void>;
    resolve: () => void;
    resolved: boolean;
    interval?: NodeJS.Timeout | null;
    timeout?: NodeJS.Timeout | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RCEContext<T extends JSONSchema7Object | undefined = any, K = any> extends Disposable {
    name: string;
    success: boolean | null;
    createdAt: string = new Date().toLocaleTimeString();

    data: ActionData<T>;
    action: RCEAction<K>;

    /** Lifecycle-specific data */
    readonly lifecycle: RCELifecycleMetadata = {};
    /** Request-specific data (copilot mode only) */
    request?: RCERequestState;
    public storage?: RCEStorage;
    private _updateStatus: SimplifiedStatusUpdateHandler = (status: ActionStatus, message: string) => updateActionStatus(this.data, status, message);
    readonly updateStatus: SimplifiedStatusUpdateHandler = (status: ActionStatus, message: string) => this._updateStatus(status, message);

    constructor(data: ActionData<T>) {
        super(() => {
            for (const k in this.lifecycle) {
                this.lifecycle[k as keyof typeof this.lifecycle] = undefined;
            };
            this.request?.resolve();
            this.request = undefined;
            this.storage = undefined;
            this.data = {} as never;
            this.action = {} as never;
            this.lifecycle.preview?.dispose();
            for (const d of this.lifecycle.events ?? []) {
                d.dispose();
            }
            this._updateStatus = (_status, _message) => undefined;
        });
        this.data = data;
        this.action = getAction(data.name)!;
        this.name = data.name;
        this.success = null;
    }

    done(success: boolean): void {
        this.success = success;
        this.dispose();
    };

    getLifecycle(item?: keyof RCELifecycleMetadata) {
        if (item) return this.lifecycle[item];
        else return this.lifecycle;
    };
}
