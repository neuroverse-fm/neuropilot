import * as vscode from 'vscode';
import { reloadTasks, taskEndedHandler } from './tasks';
import { emergencyTerminalShutdown, saveContextForTerminal } from './pseudoterminal';
import { createClient, isPathNeuroSafe, setVirtualCursor } from './utils';
import { NEURO } from './constants';
import {
    initializeCommonState,
    setupCommonProviders,
    registerCommonCommands,
    setupCommonEventHandlers,
    setupClientConnectedHandlers,
    createStatusBarItem,
    deactivate as commonDeactivate,
    registerDocsLink,
    getDecorationRenderOptions,
    obtainExtensionState,
} from './shared/extension-common';
import { registerChatParticipant } from './chat';

export { registerDocsLink };

export function activate(context: vscode.ExtensionContext) {
    // Initialize common state
    initializeCommonState();

    // Setup providers
    context.subscriptions.push(...setupCommonProviders());

    // Register commands
    context.subscriptions.push(...registerCommonCommands());

    // Setup event handlers
    context.subscriptions.push(...setupCommonEventHandlers());

    // Desktop-specific handlers
    context.subscriptions.push(vscode.tasks.onDidEndTask(taskEndedHandler));

    // Chat participant (desktop-specific setup)
    registerChatParticipant(context);
    saveContextForTerminal(context);

    // Setup client connected handlers
    setupClientConnectedHandlers(reloadTasks); // reloadTasks added to set it up at the same time

    // Create status bar item
    createStatusBarItem(context);

    // Extension state
    obtainExtensionState();

    // Create client
    createClient();

    // Create cursor decoration (desktop-specific)
    NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType(getDecorationRenderOptions(context));

    // Set initial virtual cursor
    if (vscode.window.activeTextEditor && isPathNeuroSafe(vscode.window.activeTextEditor.document.fileName)) {
        setVirtualCursor(vscode.window.activeTextEditor.selection.active);
    }
}

export function deactivate() {
    emergencyTerminalShutdown();
    commonDeactivate();
}
