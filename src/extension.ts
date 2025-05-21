import * as vscode from 'vscode';

import { NEURO } from './constants';
import { logOutput, createClient, onClientConnected } from './utils';
import { completionsProvider, registerCompletionResultHandler } from './completions';
import { giveCookie, registerRequestCookieAction, registerRequestCookieHandler, sendCurrentFile } from './context';
import { registerChatParticipant, registerChatResponseHandler } from './chat';
import { registerUnsupervisedActions, registerUnsupervisedHandlers } from './unsupervised';
import { reloadTasks, taskEndedHandler } from './tasks';
import { emergencyTerminalShutdown, saveContextForTerminal } from './pseudoterminal';
import { CONFIG } from './config';
import { sendDiagnosticsDiff } from './lint_problems';
import { fileSaveListener, toggleSaveAction } from './editing';
import { emergencyDenyRequests, acceptRceRequest, denyRceRequest, revealRceNotification } from './rce';
// Import the new diagnostic request function:
import { requestAIResponseForDiagnostic } from './lint_problems';

export function activate(context: vscode.ExtensionContext) {
    NEURO.url = CONFIG.websocketUrl;
    NEURO.gameName = CONFIG.gameName;
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
    vscode.commands.registerCommand('neuropilot.disableAllPermissions', disableAllPermissions);
    vscode.commands.registerCommand('neuropilot.acceptRceRequest', acceptRceRequest);
    vscode.commands.registerCommand('neuropilot.denyRceRequest', denyRceRequest);
    vscode.commands.registerCommand('neuropilot.revealRceNotification', revealRceNotification);

    // Create a dedicated output channel for Neuro chat history.
    const chatHistoryChannel = vscode.window.createOutputChannel("Neuro Chat History");

    // Helper to append messages to the chat history.
    function addToChatHistory(message: string) {
        const timestamp = new Date().toLocaleTimeString();
        chatHistoryChannel.appendLine(`[${timestamp}] ${message}`);
    }

    // NEW: Register commands for Ask Neuro to fix and explain diagnostics.
    vscode.commands.registerCommand('neuropilot.fixWithNeuro', async (...args: any[]) => {
        let document: vscode.TextDocument;
        let diagnostics: vscode.Diagnostic[];
        if (args && args.length >= 2) {
            document = args[0];
            diagnostics = args[1];
        } else {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active editor found.");
                return;
            }
            document = editor.document;
            diagnostics = vscode.languages.getDiagnostics(document.uri);
        }
        if (!diagnostics || diagnostics.length === 0) {
            vscode.window.showInformationMessage("No diagnostics found in the active file.");
            return;
        }
        // For simplicity, pick the first diagnostic.
        const diagnostic = diagnostics[0];
        const tokenSource = new vscode.CancellationTokenSource();
        const response = await requestAIResponseForDiagnostic(document, diagnostic, 'fix', tokenSource.token);

        // Append the response to the chat history.
        addToChatHistory("Fix: " + response);
        // Show an info message with an option to view the chat history.
        const choice = await vscode.window.showInformationMessage("Neuro suggests: " + response, "View Chat History");
        if (choice === "View Chat History") {
            chatHistoryChannel.show();
        }
    });

    vscode.commands.registerCommand('neuropilot.explainWithNeuro', async (...args: any[]) => {
        let document: vscode.TextDocument;
        let diagnostics: vscode.Diagnostic[];
        if (args && args.length >= 2) {
            document = args[0];
            diagnostics = args[1];
        } else {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active editor found.");
                return;
            }
            document = editor.document;
            diagnostics = vscode.languages.getDiagnostics(document.uri);
        }
        if (!diagnostics || diagnostics.length === 0) {
            vscode.window.showInformationMessage("No diagnostics found in the active file.");
            return;
        }
        // For simplicity, pick the first diagnostic.
        const diagnostic = diagnostics[0];
        const tokenSource = new vscode.CancellationTokenSource();
        const response = await requestAIResponseForDiagnostic(document, diagnostic, 'explain', tokenSource.token);

        // Append the response to the chat history.
        addToChatHistory("Explain: " + response);
        // Show an info message with an option to view the chat history.
        const choice = await vscode.window.showInformationMessage("Neuro explains: " + response, "View Chat History");
        if (choice === "View Chat History") {
            chatHistoryChannel.show();
        }
    });

    // Update the CodeActionProvider to pass the document and diagnostics.
    vscode.languages.registerCodeActionsProvider(
        { scheme: 'file' },
        new (class implements vscode.CodeActionProvider {
        public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    public provideCodeActions(
      document: vscode.TextDocument,
      range: vscode.Range,
      context: vscode.CodeActionContext,
      token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction[]> {
      const actions: vscode.CodeAction[] = [];

        // Only offer your “Ask Neuro” actions for *each* diagnostic under the cursor
            context.diagnostics.forEach(diagnostic => {
                // 1) “Ask Neuro to fix” for this specific diagnostic
                const fix = new vscode.CodeAction(
                    "Ask Neuro to fix",
                    vscode.CodeActionKind.QuickFix
                );

                fix.command = {
                    command: 'neuropilot.fixWithNeuro',
                    title: "Ask Neuro to fix",
                    arguments: [document, diagnostic]
                };
                
                // This is the crucial line that was missing:
                // tie this code action to the one diagnostic we're fixing.
                fix.diagnostics = [diagnostic];
                actions.push(fix);

                // 2) “Ask Neuro to explain” for that diagnostic
                const explain = new vscode.CodeAction(
                    "Ask Neuro to explain",
                    vscode.CodeActionKind.QuickFix
                );

                explain.command = {
                    command: 'neuropilot.explainWithNeuro',
                    title: "Ask Neuro to explain",
                    arguments: [document, diagnostic]
                };

                // Again, tie it to the same diagnostic
                explain.diagnostics = [diagnostic];
                actions.push(explain);
            });

            return actions;
            }
        })(),
        {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        }
    );


    registerChatParticipant(context);
    saveContextForTerminal(context);

    onClientConnected(registerPreActionHandler);
    onClientConnected(registerCompletionResultHandler);
    onClientConnected(registerChatResponseHandler);
    onClientConnected(registerRequestCookieAction);
    onClientConnected(registerRequestCookieHandler);
    onClientConnected(reloadTasks);
    onClientConnected(registerUnsupervisedActions);
    onClientConnected(registerUnsupervisedHandlers);
    onClientConnected(registerPostActionHandler);

    // Allows Neuro to be prompted to fix lint problems
    const selector: vscode.DocumentSelector = { scheme: 'file' };

    const provider =

    vscode.languages.onDidChangeDiagnostics(sendDiagnosticsDiff);

    vscode.tasks.onDidEndTask(taskEndedHandler);

    vscode.workspace.onDidSaveTextDocument(fileSaveListener);

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('files.autoSave')) {
            NEURO.client?.sendContext('The Auto-Save setting has been modified.');
            toggleSaveAction();
        }
    });

    createClient();

    NEURO.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(NEURO.statusBarItem);
    NEURO.statusBarItem.name = 'NeuroPilot';
    NEURO.statusBarItem.command = 'neuropilot.revealRceNotification';
    NEURO.statusBarItem.text = '$(neuropilot-heart)';
    NEURO.statusBarItem.tooltip = new vscode.MarkdownString('No active request');
    NEURO.statusBarItem.color = new vscode.ThemeColor('statusBarItem.foreground');
    NEURO.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.background');

    // sync the status bar item visibility with the setting
    if (CONFIG.hideCopilotRequests)
        NEURO.statusBarItem.show();

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('neuropilot.hideCopilotRequests')) {
            if (CONFIG.hideCopilotRequests) {
                NEURO.statusBarItem?.show();
            } else {
                NEURO.statusBarItem?.hide();
            }
        }
    });
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

function disableAllPermissions() {
    const config = vscode.workspace.getConfiguration('neuropilot');
    const permissionKeys = config.get<Record<string, string>>('permission');
    // Disable each permission one-by-one
    const promises: Thenable<void>[] = [];
    if (permissionKeys) {
        for (const key of Object.keys(permissionKeys)) {
            promises.push(config.update(`permission.${key}`, 'off', vscode.ConfigurationTarget.Workspace));
        }
    }
    if (CONFIG.allowUnsafePaths === true) {
        promises.push(config.update('allowUnsafePaths', false, vscode.ConfigurationTarget.Workspace));
    }
    if (CONFIG.sendNewLintingProblemsOn !== 'off') {
        promises.push(config.update('sendNewLintingProblemsOn', 'off', vscode.ConfigurationTarget.Workspace));
    }
    Promise.all(promises).then(() => {
        const exe = NEURO.currentTaskExecution;
        if (exe) {
            exe.terminate();
            NEURO.currentTaskExecution = null;
        }
        emergencyTerminalShutdown();
        emergencyDenyRequests();
        // Send context and reload
        reloadPermissions();
        NEURO.client?.sendContext('Vedal has turned off all dangerous permissions.');
        vscode.window.showInformationMessage('All dangerous permissions have been turned off and actions have been re-registered. Terminal shells have also been killed, if any.');
    });
}
