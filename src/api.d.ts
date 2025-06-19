import { NeuroClient } from 'neuro-game-sdk';
import { ActionWithHandler } from './neuro_client_helper'

export interface NeuropilotAPI {
    /**
     * Gets the current instance of the {@link NeuroClient}.
     * @returns The current NeuroClient instance or `null` if not connected.
     */
    getClient(): NeuroClient | null;

    /**
     * Registers a callback to be called to register actions.
     * This callback should return all actions that Neuro should be able to use.
     * Actions are registered when connecting to the Neuro API or on reloading permissions.
     * The callback will also be called after it is registered (if connected to the API).
     * @param callback The callback to call when actions are registered.
     */
    onActionRegistration(callback: () => ActionWithHandler): void;
}
