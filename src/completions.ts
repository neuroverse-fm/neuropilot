import { NeuroClient } from 'neuro-game-sdk';
import * as vscode from 'vscode';
import { Range } from 'vscode';
import { NEURO } from './constants';
import { logOutput, assert, simpleFileName, filterFileContents } from './utils';

let lastSuggestions: string[] = [];

export function requestCompletion(beforeContext: string, afterContext: string, fileName: string, language: string, maxCount: number) {
    if(!NEURO.connected) {
        logOutput('ERROR', 'Attempted to request completion while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }
    if(NEURO.waiting) {
        logOutput('WARNING', 'Attempted to request completion while waiting for response');
        return;
    }

    logOutput('INFO', `Requesting completion for ${fileName}`);

    NEURO.waiting = true;
    NEURO.cancelled = false;

    assert(NEURO.client);
    
    NEURO.client.registerActions([
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
    ]);

    NEURO.client.forceActions(
        'Write code that fits between afterContext and beforeContext',
        ['complete_code'],
        JSON.stringify({
            file: fileName,
            language: language,
            beforeContext: beforeContext,
            afterContext: afterContext,
        }),
        false,
    );
}

export function cancelCompletionRequest() {
    NEURO.cancelled = true;
    NEURO.waiting = false;
    if(!NEURO.client) return;
    NEURO.client.unregisterActions(['complete_code']);
}

export function registerCompletionResultHandler() {
    NEURO.client?.onAction((actionData) => {
        assert(NEURO.client instanceof NeuroClient);

        if(actionData.name === 'complete_code') {
            const suggestions = actionData.params?.suggestions;

            if(suggestions === undefined) {
                NEURO.client.sendActionResult(actionData.id, false, 'Missing required parameter "suggestions"');
                return;
            }

            NEURO.client.unregisterActions(['complete_code']);
            
            if(NEURO.cancelled) {
                NEURO.client.sendActionResult(actionData.id, true, 'Request was cancelled');
                NEURO.waiting = false;
                return;
            }
            if(!NEURO.waiting) {
                NEURO.client.sendActionResult(actionData.id, true, 'Not currently waiting for suggestions');
                return;
            }
            
            NEURO.waiting = false;

            NEURO.client.sendActionResult(actionData.id, true);

            lastSuggestions = suggestions;
            logOutput('INFO', 'Received suggestions:\n' + JSON.stringify(suggestions));
        }
    });
};

export const completionsProvider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, context, token) {
        const result: vscode.InlineCompletionList = {
            items: [],
        };
        
        const triggerAuto = vscode.workspace.getConfiguration('neuropilot').get<string>('completionTrigger', 'invokeOnly') === 'automatic';
        if(!triggerAuto && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
            return result;
        }
        
        // Get context
        const beforeContextLength = vscode.workspace.getConfiguration('neuropilot').get('beforeContext', 10);
        const afterContextLength = vscode.workspace.getConfiguration('neuropilot').get('afterContext', 10);
        const maxCount = vscode.workspace.getConfiguration('neuropilot').get('maxCompletions', 3);
        
        const contextStart = Math.max(0, position.line - beforeContextLength);
        const contextBefore = filterFileContents(document.getText(new Range(new vscode.Position(contextStart, 0), position)));
        const contextEnd = Math.min(document.lineCount - 1, position.line + afterContextLength);
        const contextAfter = document.getText(new Range(position, new vscode.Position(contextEnd, document.lineAt(contextEnd).text.length))).replace(/\r\n/g, '\n');
        const fileName = simpleFileName(document.fileName);
        
        requestCompletion(contextBefore, contextAfter, fileName, document.languageId, maxCount);
        
        token.onCancellationRequested(() => {
            logOutput('INFO', 'Cancelled request');
            cancelCompletionRequest();
        });

        const timeoutMs = vscode.workspace.getConfiguration('neuropilot').get('timeout', 10000);
        const timeout = new Promise<void>((_, reject) => setTimeout(() => reject('Request timed out'), timeoutMs));
        const completion = new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if(!NEURO.waiting) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });

        try {
            await Promise.race([timeout, completion]);
        } catch(err) {
            if(typeof err === 'string') {
                logOutput('ERROR', err);
                NEURO.cancelled = true;
                vscode.window.showErrorMessage(err);
            }
            else {
                throw err;
            }
        }
        
        for(const suggestion of lastSuggestions) {
            result.items.push({
                insertText: suggestion,
            });
        }
        
        return result;
    },
};
