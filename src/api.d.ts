import { NeuroClient } from 'neuro-game-sdk';
import { ActionWithHandler } from './neuro_client_helper';

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
     * Note: This only registers tells NeuroPilot which actions to register *right now*,
     * use {@link addAction} to let NeuroPilot handle the actions.
     * @param callback The callback to call when actions are registered.
     */
    onActionRegistration(callback: () => ActionWithHandler): void;

    /**
     * Adds an action to the extension.
     * This is required for action to be handled when Neuro executes it.
     * Note: This does not *register* the action, use {@link onActionRegistration} for that.
     * @param name The unique ID of the action. Should follow the [Neuro API specification for action names](https://github.com/VedalAI/neuro-game-sdk/blob/main/API/SPECIFICATION.md#parameters-1).
     * @param action The action to add.
     */
    addAction(name: string, action: ActionWithHandler): void;
}
