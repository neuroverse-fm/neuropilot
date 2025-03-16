import * as vscode from 'vscode';
import { Range } from 'vscode';
import { NeuroClient } from 'neuro-game-sdk';

import { NEURO } from './constants';
import { assert, logOutput, createClient, onClientCreated as onClientConnected } from './utils';
import { completionsProvider, handleCompletionResponse } from './completions';
import { sendCurrentFile } from './context';

export function activate(_context: vscode.ExtensionContext) {
    NEURO.url = vscode.workspace.getConfiguration('neuropilot').get('websocketUrl', 'http://localhost:8000');
    NEURO.gameName = vscode.workspace.getConfiguration('neuropilot').get('gameName', 'Visual Studio Code');
    NEURO.connected = false;
    NEURO.waiting = false;
    NEURO.cancelled = false;
    NEURO.outputChannel = vscode.window.createOutputChannel('NeuroPilot');
    
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, completionsProvider);
    
    vscode.commands.registerCommand('neuropilot.reconnect', async (...args) => {
        logOutput('INFO', 'Attempting to reconnect to Neuro API');
        createClient();
    });

    vscode.commands.registerCommand('neuropilot.sendCurrentFile', sendCurrentFile);

    // Create client on startup
    createClient();
    onClientConnected(handleCompletionResponse);
}
