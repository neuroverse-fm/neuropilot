import * as vscode from 'vscode';
import { NeuroClient } from "neuro-game-sdk";

import { NEURO } from './constants';
import { Range } from 'vscode';

export function assert(obj: unknown): asserts obj {
    if(!obj) throw new Error('Assertion failed');
}

export function logOutput(tag: string, message: string) {
    if(!NEURO.outputChannel) {
        console.error('Output channel not initialized');
        return;
    }
    const ms = Date.now() % 1000;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'}) + '.' + ms.toString().padStart(3, '0');
    const prefix = `${time} [${tag}] `;
    for(const line of message.split('\n')) {
        NEURO.outputChannel.appendLine(prefix + line);
    }
}

export function createClient() {
    logOutput('INFO', 'Creating Neuro API client');
    if(NEURO.client)
        NEURO.client.disconnect();

    NEURO.connected = false;
    NEURO.waiting = false;
    NEURO.cancelled = false;
    NEURO.waitingForCookie = false;

    // TODO: Check if this is a memory leak
    NEURO.client = new NeuroClient(NEURO.url, NEURO.gameName, () => {
        assert(NEURO.client instanceof NeuroClient);

        logOutput('INFO', 'Connected to Neuro API');
        NEURO.connected = true;

        vscode.window.showInformationMessage('Successfully connected to Neuro API.');

        NEURO.client.sendContext(
            vscode.workspace.getConfiguration('neuropilot').get('initialContext', 'Something went wrong, blame whoever made this extension.'),
        );

        NEURO.client.onClose = () => {
            NEURO.connected = false;
            logOutput('INFO', 'Disconnected from Neuro API');
            vscode.window.showInformationMessage('Disconnected from Neuro API.');
        };

        NEURO.client.onError = (error) => {
            logOutput('ERROR', `Neuro client error: ${error}`);
            vscode.window.showErrorMessage(`Neuro client error: ${error}`);
        };

        for(const handler of clientConnectedHandlers) {
            handler();
        }
    });

    NEURO.client.onError = () => {
        logOutput('ERROR', 'Could not connect to Neuro API');
        vscode.window.showErrorMessage('Could not connect to Neuro API.');
    };
}

const clientConnectedHandlers: (() => void)[] = [];

export function onClientConnected(handler: () => void) {
    clientConnectedHandlers.push(handler);
}

export function simpleFileName(fileName: string): string {
    const rootFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath.replace(/\\/, '/');
    let result = fileName.replace(/\\/g, '/');
    if(rootFolder && result.startsWith(rootFolder))
        return result.substring(rootFolder.length);
    else
        return result.substring(result.lastIndexOf('/') + 1);
}

export function filterFileContents(contents: string): string {
    return contents.replace(/\r\n/g, '\n');
}

interface NeuroPositionContext {
    contextBefore: string;
    contextAfter: string;
}

export function getPositionContext(document: vscode.TextDocument, position: vscode.Position): NeuroPositionContext {
    const beforeContextLength = vscode.workspace.getConfiguration('neuropilot').get('beforeContext', 10);
    const afterContextLength = vscode.workspace.getConfiguration('neuropilot').get('afterContext', 10);
    
    const contextStart = Math.max(0, position.line - beforeContextLength);
    const contextBefore = filterFileContents(document.getText(new Range(new vscode.Position(contextStart, 0), position)));
    const contextEnd = Math.min(document.lineCount - 1, position.line + afterContextLength);
    const contextAfter = document.getText(new Range(position, new vscode.Position(contextEnd, document.lineAt(contextEnd).text.length))).replace(/\r\n/g, '\n');

    return {
        contextBefore: filterFileContents(contextBefore),
        contextAfter: filterFileContents(contextAfter)
    };
}

export function formatActionID(name: string): string {
    // Action IDs must be snake_case
    return name
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .toLowerCase();
}

/**
 * Gets the path to the first workspace folder.
 * The path is normalized to use forward slashes.
 * @returns The path to the workspace folder, or undefined if the workspace is not open.
 */
export function getWorkspacePath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0].uri.fsPath.replace(/\\/g, '/');
}

/**
 * Check if a path is safe for Neuro to access.
 * Neuro may not access paths outside the workspace, or files and folders starting with a dot.
 * This is a security measure to prevent Neuro from modifying her own permissions or adding arbitrary tasks.
 * @param path The path to check.
 * @returns True if Neuro may safely access the path.
 */
export function isPathNeuroSafe(path: string): boolean {
    const rootFolder = getWorkspacePath();
    const normalizedPath = path.replace(/\\/g, '/');
    return rootFolder !== undefined
        && normalizedPath !== rootFolder            // Prevent access to the workspace folder itself
        && normalizedPath.startsWith(rootFolder)    // Prevent access to paths outside the workspace
        && !normalizedPath.includes('/.')           // Prevent access to special files and folders (e.g. .vscode)
        && !normalizedPath.includes('..')           // Prevent access to parent folders
        && !normalizedPath.includes('~')            // Prevent access to home directory
        && !normalizedPath.includes('$');           // Prevent access to environment variables
}
