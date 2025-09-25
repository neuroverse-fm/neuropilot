import * as vscode from 'vscode';
import { createClient, isPathNeuroSafe, setVirtualCursor } from '@/utils';
import { NEURO } from '@/constants';
import {
    initializeCommonState,
    setupCommonProviders,
    registerCommonCommands,
    setupCommonEventHandlers,
    setupClientConnectedHandlers,
    createStatusBarItem,
    deactivate as commonDeactivate,
    getCursorDecorationRenderOptions,
    getDiffRemovedDecorationRenderOptions,
    getDiffModifiedDecorationRenderOptions,
    getDiffAddedDecorationRenderOptions,
    reloadPermissions,
    getHighlightDecorationRenderOptions,
} from '@shared/extension';
import { registerUnsupervisedActions, registerUnsupervisedHandlers } from './unsupervised';
import { registerSendSelectionToNeuro } from '@/file_actions';

export function activate(context: vscode.ExtensionContext) {
    // Initialize common state
    initializeCommonState(context);

    vscode.commands.registerCommand('neuropilot.reloadPermissions', reloadWebPermissions);

    // Setup providers
    NEURO.context!.subscriptions.push(...setupCommonProviders());

    // Register commands
    NEURO.context!.subscriptions.push(...registerCommonCommands());

    // Setup event handlers
    NEURO.context!.subscriptions.push(...setupCommonEventHandlers());

    // Setup client connected handlers
    setupClientConnectedHandlers(registerUnsupervisedActions, registerUnsupervisedHandlers);

    // Create status bar item
    createStatusBarItem();

    // The "Send selection to Neuro" feature requires both a command and a code action provider.
    // To keep related logic together and allow easy registration in both desktop and web, it is encapsulated
    // in registerSendSelectionToNeuro instead of being registered inline like most single commands.
    registerSendSelectionToNeuro(context);

    // We don't obtain extension state here automatically

    // Create client
    createClient();

    // Create cursor decoration (web-specific)
    NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType(getCursorDecorationRenderOptions());
    NEURO.diffAddedDecorationType = vscode.window.createTextEditorDecorationType(getDiffAddedDecorationRenderOptions());
    NEURO.diffRemovedDecorationType = vscode.window.createTextEditorDecorationType(getDiffRemovedDecorationRenderOptions());
    NEURO.diffModifiedDecorationType = vscode.window.createTextEditorDecorationType(getDiffModifiedDecorationRenderOptions());
    NEURO.highlightDecorationType = vscode.window.createTextEditorDecorationType(getHighlightDecorationRenderOptions());

    // Set initial virtual cursor
    if (vscode.window.activeTextEditor && isPathNeuroSafe(vscode.window.activeTextEditor.document.fileName)) {
        setVirtualCursor(vscode.window.activeTextEditor.selection.active);
    }
}

export function deactivate() {
    commonDeactivate();
}

function reloadWebPermissions() {
    reloadPermissions(registerUnsupervisedActions);
}
