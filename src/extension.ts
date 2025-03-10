import * as vscode from 'vscode';
import { Range } from 'vscode';
import { NeuroClient } from 'neuro-game-sdk';

export function activate(_context: vscode.ExtensionContext) {
    //#region Variables

    let serverUrl = vscode.workspace.getConfiguration('neuropilot').get('websocketUrl', 'http://localhost:8000');
    let gameName = vscode.workspace.getConfiguration('neuropilot').get('gameName', 'Visual Studio Code');
    let neuroClient: NeuroClient;
    /** Whether the client successfully connected to the API. */
    let neuroClientConnected = false;
    /**
     * Whether this extension is currently waiting on a response, agnostic of whether the last request was canceled.
     * This is used to prevent multiple `actions/force` requests from being sent at the same time.
     */
    let waitingForResponse = false;
    /**
     * Whether the last request was canceled.
     * This is used to tell Neuro that the request was canceled.
     */
    let requestCancelled = false;
    let lastSuggestions: string[] = [];

    const outputChannel = vscode.window.createOutputChannel('NeuroPilot');

    //#endregion

    //#region Functions

    function logOutput(tag: string, message: string) {
        let ms = Date.now() % 1000;
        let time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'}) + '.' + ms.toString().padStart(3, '0');
        const prefix = `${time} [${tag}] `;
        for(const line of message.split('\n')) {
            outputChannel.appendLine(prefix + line);
        }
    }

    function createClient() {
        logOutput('INFO', 'Creating Neuro API client');
        if(neuroClient)
            neuroClient.disconnect();
        neuroClientConnected = false;
        // TODO: Check if this is a memory leak
        neuroClient = new NeuroClient(serverUrl, gameName, () => {
            logOutput('INFO', 'Connected to Neuro API');
            neuroClientConnected = true;

            vscode.window.showInformationMessage('Successfully connected to Neuro API.');

            neuroClient.sendContext(
                vscode.workspace.getConfiguration('neuropilot').get('initialContext', 'Something went wrong, blame whoever made this extension.'),
            );

            neuroClient.onAction(actionData => {
                if(actionData.name === 'complete_code') {
                    const suggestions = actionData.params?.suggestions;

                    if(requestCancelled) {
                        neuroClient.sendActionResult(actionData.id, true, 'Request was cancelled');
                        neuroClient.unregisterActions(['complete_code']);
                        return;
                    }
                    if(!waitingForResponse) {
                        neuroClient.sendActionResult(actionData.id, true, 'Not currently waiting for suggestions');
                        neuroClient.unregisterActions(['complete_code']);
                        return;
                    }
                    if(suggestions === undefined) {
                        neuroClient.sendActionResult(actionData.id, false, 'Missing required parameter "suggestions"');
                        return;
                    }

                    neuroClient.unregisterActions(['complete_code']);
                    neuroClient.sendActionResult(actionData.id, true);
                    waitingForResponse = false;
                    lastSuggestions = suggestions;
                    logOutput('INFO', 'Received suggestions:\n' + JSON.stringify(suggestions));
                }
            });

            neuroClient.onClose = () => {
                neuroClientConnected = false;
                logOutput('INFO', 'Disconnected from Neuro API');
                vscode.window.showInformationMessage('Disconnected from Neuro API.');
            };

            neuroClient.onError = (error) => {
                logOutput('ERROR', `Neuro client error: ${error}`);
                vscode.window.showErrorMessage(`Neuro client error: ${error}`);
            };
        });

        neuroClient.onError = () => {
            logOutput('ERROR', 'Could not connect to Neuro API');
            vscode.window.showErrorMessage('Could not connect to Neuro API.');
        };
    }

    function requestCompletion(beforeContext: string, afterContext: string, fileName: string, language: string, maxCount: number) {
        if(!neuroClientConnected) {
            logOutput('ERROR', 'Attempted to request completion while disconnected');
            vscode.window.showErrorMessage('Not connected to Neuro API.');
            return;
        }
        if(waitingForResponse) {
            logOutput('WARNING', 'Attempted to request completion while waiting for response');
            return;
        }

        logOutput('INFO', `Requesting completion for ${fileName}`);

        waitingForResponse = true;
        requestCancelled = false;
        
        neuroClient.registerActions([
            {
                name: 'complete_code',
                description: maxCount == 1
                    ? `Suggest code to write.` +
                    ` You may make one suggestion.` +
                    ` Your suggestion can be a single line or a multi-line code snippet.`
                    
                    : `Suggest code to write.` +
                    ` You may make up to ${maxCount} suggestions, but only one will be used.` +
                    ` Your suggestions can be single lines or multi-line code snippets.`,
                schema: {
                    type: 'object',
                    properties: {
                        suggestions: {
                            type: 'array',
                            items: { type: 'string' },
                            maxItems: maxCount,
                        }
                    },
                    required: ['suggestions'],
                }
            }
        ])

        neuroClient.forceActions(
            'Write code that fits between afterContext and beforeContext',
            ['complete_code'],
            JSON.stringify({
                file: fileName,
                language: language,
                beforeContext: beforeContext,
                afterContext: afterContext,
            }),
            false,
        )
    }

    function cancelRequest() {
        requestCancelled = true;
        neuroClient.unregisterActions(['complete_code']);
    }

    //#endregion
    
    //#region Inline completions provider
    
    const provider: vscode.InlineCompletionItemProvider = {
        async provideInlineCompletionItems(document, position, context, token) {
            const result: vscode.InlineCompletionList = {
                items: [],
            };
            
            const triggerAuto = vscode.workspace.getConfiguration('neuropilot').get<string>('completionTrigger', 'invokeOnly') === 'automatic';
            if(!triggerAuto && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
                return result;
            }
            
            // Check if game or URL changed
            const newServerUrl = vscode.workspace.getConfiguration('neuropilot').get('neuropilot.websocketUrl', 'ws://localhost:8000');
            const newGameName = vscode.workspace.getConfiguration('neuropilot').get('gameName', 'Visual Studio Code');
            if(serverUrl !== newServerUrl || gameName !== newGameName) {
                logOutput('INFO', 'Game or URL changed, creating new client');
                serverUrl = newServerUrl;
                gameName = newGameName;
                createClient();
            }
            
            // Get context
            const beforeContextLength = vscode.workspace.getConfiguration('neuropilot').get('beforeContext', 10);
            const afterContextLength = vscode.workspace.getConfiguration('neuropilot').get('afterContext', 10);
            const maxCount = vscode.workspace.getConfiguration('neuropilot').get('maxCompletions', 3);
            
            const contextStart = Math.max(0, position.line - beforeContextLength);
            const contextBefore = document.getText(new Range(new vscode.Position(contextStart, 0), position)).replace(/\r\n/g, '\n');
            const contextEnd = Math.min(document.lineCount - 1, position.line + afterContextLength);
            const contextAfter = document.getText(new Range(position, new vscode.Position(contextEnd, document.lineAt(contextEnd).text.length))).replace(/\r\n/g, '\n');
            const rootFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath.replace(/\\/, '/');
            let fileName = document.fileName.replace(/\\/g, '/');
            if(rootFolder && fileName.startsWith(rootFolder))
                fileName = fileName.substring(rootFolder.length);
            else
                fileName = fileName.substring(fileName.lastIndexOf('/') + 1);
            
            requestCompletion(contextBefore, contextAfter, fileName, document.languageId, maxCount);
            
            token.onCancellationRequested(() => {
                logOutput('INFO', 'Cancelled request');
                cancelRequest();
            });
            while(waitingForResponse) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            for(const suggestion of lastSuggestions) {
                result.items.push({
                    insertText: suggestion,
                });
            }
            
            return result;
        },
    };
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider);
    
    //#endregion
    
    //#region Commands
    
    vscode.commands.registerCommand('neuropilot.reconnect', async (...args) => {
        logOutput('INFO', 'Attempting to reconnect to Neuro API');
        createClient();
    });

    vscode.commands.registerCommand('neuropilot.sendCurrentFile', async (...args) => {
        const editor = vscode.window.activeTextEditor;
        if(!editor) {
            logOutput('ERROR', 'No active text editor');
            vscode.window.showErrorMessage('No active text editor.');
            return;
        }
        const document = editor.document;
        let fileName = document.fileName.replace(/\\/g, '/');
        const language = document.languageId;
        const text = document.getText();

        const rootFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath.replace(/\\/, '/');
        if(rootFolder && fileName.startsWith(rootFolder))
            fileName = fileName.substring(rootFolder.length);
        else
            fileName = fileName.substring(fileName.lastIndexOf('/') + 1);

        logOutput('INFO', 'Sending current file to Neuro API');
        neuroClient.sendContext(`Current file: ${fileName}\nLanguage: ${language}\nContent:\n\`\`\`\n${text}\n\`\`\``);
    });
    
    //#endregion

    // Create client on startup
    createClient();
}
