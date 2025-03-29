import * as vscode from 'vscode';

import { NEURO } from './constants';
import { logOutput, createClient, onClientConnected } from './utils';
import { completionsProvider, registerCompletionResultHandler } from './completions';
import { giveCookie, registerRequestCookieAction, registerRequestCookieHandler, sendCurrentFile } from './context';
import { registerChatParticipant, registerChatResponseHandler } from './chat';
import { registerUnsupervisedActions, registerUnsupervisedHandlers, reloadTasks, taskEndedHandler } from './unsupervised';

export function activate(context: vscode.ExtensionContext) {
    NEURO.url = vscode.workspace.getConfiguration('neuropilot').get('websocketUrl', 'http://localhost:8000');
    NEURO.gameName = vscode.workspace.getConfiguration('neuropilot').get('gameName', 'Visual Studio Code');
    NEURO.connected = false;
    NEURO.waiting = false;
    NEURO.cancelled = false;
    NEURO.outputChannel = vscode.window.createOutputChannel('NeuroPilot');

    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, completionsProvider);

    vscode.commands.registerCommand('neuropilot.reconnect', async (..._args) => {
        logOutput('INFO', 'Attempting to reconnect to Neuro API');
        createClient();
    });
    vscode.commands.registerCommand('neuropilot.sendCurrentFile', sendCurrentFile);
    vscode.commands.registerCommand('neuropilot.giveCookie', giveCookie);
    vscode.commands.registerCommand('neuropilot.reloadPermissions', reloadPermissions);

    registerChatParticipant(context);

    onClientConnected(registerPreActionHandler);
    onClientConnected(registerCompletionResultHandler);
    onClientConnected(registerChatResponseHandler);
    onClientConnected(registerRequestCookieAction);
    onClientConnected(registerRequestCookieHandler);
    onClientConnected(reloadTasks);
    onClientConnected(registerUnsupervisedActions);
    onClientConnected(registerUnsupervisedHandlers);
    onClientConnected(registerPostActionHandler);

    vscode.tasks.onDidEndTask(taskEndedHandler);

    createClient();
}

function reloadPermissions() {
    reloadTasks();
    registerRequestCookieAction();
    registerUnsupervisedActions();
}

function registerPreActionHandler() {
    NEURO.client?.onAction((_actionData) => {
        NEURO.actionHandled = false;
    });
}

function registerPostActionHandler() {
    NEURO.client?.onAction((actionData) => {
        if(NEURO.actionHandled) return;
        
        NEURO.client?.sendActionResult(actionData.id, true, 'Unknown action');
    });
}
