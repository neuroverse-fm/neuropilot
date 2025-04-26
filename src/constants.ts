import * as vscode from 'vscode';
import { NeuroClient } from "neuro-game-sdk";
import { TerminalSession } from './utils';

export interface NeuroTask {
    id: string;
    description: string;
    task: vscode.Task;
}

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
    /** Whether Neuro has asked for a cookie. */
    waitingForCookie: boolean;
    tasks: NeuroTask[];
    currentTaskExecution: vscode.TaskExecution | null;
    /** Whether the current action has been handled. */
    actionHandled: boolean;
    terminalEnabled: boolean;
    terminalRegistry: Map<string, TerminalSession>;
}


export const NEURO: Neuro = {
    initialized: false,
    client: null,
    url: "ws://localhost:8000",
    gameName: "Visual Studio Code",
    connected: false,
    waiting: false,
    cancelled: false,
    outputChannel: null,
    waitingForCookie: false,
    tasks: [],
    currentTaskExecution: null,
    actionHandled: false,
    terminalEnabled: false,
    terminalRegistry: new Map()
};
