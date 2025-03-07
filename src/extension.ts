import * as vscode from 'vscode';
import { Range } from 'vscode';
import { NeuroClient } from 'neuro-game-sdk';

export function activate(_context: vscode.ExtensionContext) {
    console.log('inline-completions demo started');
    vscode.commands.registerCommand('demo-ext.command1', async (...args) => {
        vscode.window.showInformationMessage('command1: ' + JSON.stringify(args));
    });

    let serverUrl = vscode.workspace.getConfiguration('neuropilot').get('websocketUrl', 'http://localhost:8000');
    let gameName = vscode.workspace.getConfiguration('neuropilot').get('gameName', 'Visual Studio Code');
    let neuroClient: NeuroClient;
    let neuroClientConnected = false;
    let waitingForResponse = false;
    let lastSuggestions: string[] = [];

    function createClient() {
        console.log('Creating new client');
        if(neuroClient)
            neuroClient.disconnect();
        neuroClientConnected = false;
        // TODO: Check if this is a memory leak
        neuroClient = new NeuroClient(serverUrl, gameName, () => {
            console.log('Connected to Neuro API');
            neuroClientConnected = true;

            neuroClient.onAction(actionData => {
                if(actionData.name === 'complete_code') {
                    const suggestions = actionData.params?.suggestions;
                    if(!waitingForResponse) { // Request was cancelled
                        neuroClient.sendActionResult(actionData.id, true, 'Request was cancelled');
                        return;
                    }
                    else if(suggestions === undefined) {
                        neuroClient.sendActionResult(actionData.id, false, 'Missing required parameter "suggestions"');
                        return;
                    }
                    neuroClient.unregisterActions(['complete_code']);
                    neuroClient.sendActionResult(actionData.id, true);
                    waitingForResponse = false;
                    lastSuggestions = suggestions;
                    console.log('Received suggestions:', suggestions);
                }
            });
        });
    }

    function requestCompletion(beforeContext: string, afterContext: string, maxCount: number) {
        if(!neuroClientConnected) {
            console.log('Not connected to Neuro API');
            return;
        }
        if(waitingForResponse) {
            console.error('Already waiting for response');
            return;
        }

        waitingForResponse = true;
        
        neuroClient.registerActions([
            {
                name: 'complete_code',
                description: `Suggest code to write (at most ${maxCount} suggestions)`,
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
                beforeContext: beforeContext,
                afterContext: afterContext,
            }),
            false,
        )
    }

    function cancelRequest() {
        waitingForResponse = false;
        neuroClient.unregisterActions(['complete_code']);
    }

    createClient();

    const provider: vscode.InlineCompletionItemProvider = {
        async provideInlineCompletionItems(document, position, context, token) {
            const result: vscode.InlineCompletionList = {
                items: [],
                commands: [],
            };

            const enabled = vscode.workspace.getConfiguration('neuropilot').get('enabled', true)
            if(!enabled) {
                return result;
            }

            const triggerAuto = vscode.workspace.getConfiguration('neuropilot').get<string>('completionTrigger', 'invokeOnly') === 'automatic';
            if(!triggerAuto && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
                return result;
            }

            // Check if game or URL changed
            const newServerUrl = vscode.workspace.getConfiguration('neuropilot').get('neuropilot.websocketUrl', 'ws://localhost:8000');
            const newGameName = vscode.workspace.getConfiguration('neuropilot').get('gameName', 'Visual Studio Code');
            if(serverUrl !== newServerUrl || gameName !== newGameName) {
                console.log('Game or URL changed, creating new client');
                serverUrl = newServerUrl;
                gameName = newGameName;
                createClient();
            }

            // Get context
            const beforeContextLength = vscode.workspace.getConfiguration('neuropilot').get('beforeContext', 10);
            const afterContextLength = vscode.workspace.getConfiguration('neuropilot').get('afterContext', 10);
            const maxCount = vscode.workspace.getConfiguration('neuropilot').get('maxCompletions', 3);

            const contextStart = Math.max(0, position.line - beforeContextLength);
            const contextBefore = document.getText(new Range(document.positionAt(contextStart), position));
            const contextEnd = Math.min(document.lineCount, position.line + afterContextLength);
            const contextAfter = document.getText(new Range(position, document.positionAt(contextEnd)));

            requestCompletion(contextBefore, contextAfter, maxCount);
            
            token.onCancellationRequested(() => {
                console.log('Cancelled request');
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

        handleDidShowCompletionItem(_completionItem: vscode.InlineCompletionItem): void {
            // console.log('handleDidShowCompletionItem');
        },

        /**
         * Is called when an inline completion item was accepted partially.
         * @param acceptedLength The length of the substring of the inline completion that was accepted already.
         */
        handleDidPartiallyAcceptCompletionItem(
            _completionItem: vscode.InlineCompletionItem,
            _info: vscode.PartialAcceptInfo | number
        ): void {
            // console.log('handleDidPartiallyAcceptCompletionItem');
        },
    };
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider);
}
