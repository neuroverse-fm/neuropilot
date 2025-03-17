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
