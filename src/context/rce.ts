import type { JSONSchema7Object } from 'json-schema';
import type { ActionValidationResult, RCEAction } from '@/neuro_client_helper';
import type { ActionData } from 'neuro-game-sdk';
import { RCECancelEvent } from '../events/utils';
import { Disposable } from 'vscode';
import assert from 'assert';
import { ActionStatus } from '../events/actions';

export interface RCEStorage {
    readonly validatorResults?: readonly ActionValidationResult[];
    readonly copilotPrompt?: string;
    [additionalProperties: string | number | symbol]: unknown;
}

export interface RCELifecycleMetadata<E> {
    readonly validatorResults?: readonly ActionValidationResult[];
    readonly copilotPrompt?: string;
    readonly events?: RCECancelEvent<E>[];
}

export type SimplifiedStatusUpdateHandler = (status: ActionStatus, message: string) => void;

export class RCEContext<T extends JSONSchema7Object | undefined, K, E> extends Disposable {
    name: string;
    success: boolean | null;
    executedAt: string = new Date().toLocaleTimeString();

    data: Omit<ActionData<T>, 'name'>;
    action: Omit<RCEAction<K>, 'name' & 'description'>;

    /** Lifecycle-specific data */
    private lifecycle: RCELifecycleMetadata<E> = {};
    public storage?: RCEStorage;
    readonly updateStatus: SimplifiedStatusUpdateHandler;

    constructor(data: ActionData<T>, action: RCEAction<K>, updateStatusFunction: SimplifiedStatusUpdateHandler) {
        assert(action.name === data.name, 'The action name and name of action in the data should be the same!');
        data.name = undefined as never;
        action.name = undefined as never;
        action.description = undefined as never;
        super(() => {
            this.lifecycle = {};
            this.storage = undefined;
            this.data = {} as never;
            this.action = {} as never;
        });
        this.data = data;
        this.action = action;
        this.name = action.name;
        this.success = null;
        this.updateStatus = updateStatusFunction;
    }

    done(success: boolean): void {
        this.success = success;
        this.dispose();
    };

    getLifecycle(item?: keyof RCELifecycleMetadata<E>) {
        if (item) return this.lifecycle[item];
        else return this.lifecycle;
    };
}
