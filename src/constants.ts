import * as vscode from 'vscode';
import { NeuroClient } from "neuro-game-sdk";

interface Neuro {
    initialized: boolean;
    client: NeuroClient | null;
    url: string;
    gameName: string;
    /** Whether the client successfully connected to the API. */
    connected: boolean;
    /**
     * Whether this extension is currently waiting on a response, agnostic of whether the last request was canceled.
     * This is used to prevent multiple `actions/force` requests from being sent at the same time.
     */
    waiting: boolean;
    /**
     * Whether the last request was canceled.
     * This is used to tell Neuro that the request was canceled.
     */
    cancelled: boolean;
    outputChannel: vscode.OutputChannel | null;
}

export const NEURO: Neuro = {
    initialized: false,
    client: null,
    url: "https://api.neuro-codex.com",
    gameName: "neuro-vscode",
    connected: false,
    waiting: false,
    cancelled: false,
    outputChannel: null,
};
