import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { logOutput, simpleFileName, getPositionContext } from '@/utils/misc';
import { CONFIG, PermissionLevel } from '@/config';
import { JSONSchema7 } from 'json-schema';
import { actionHandlerFailure, actionHandlerSuccess, actionValidationAccept, actionValidationFailure, RCEAction, RCEHandlerReturns } from '@/utils/neuro_client';
import { RCEContext } from '@context/rce';
import { addActions, canForceActions, registerAction, tryForceActions, unregisterAction } from '@/rce';
import { ActionForcePriorityEnum } from 'neuro-game-sdk';

let lastSuggestions: string[] = [];

// TODO: Figure out how to do this with maxCount
// export const completionAction = (maxCount: number) => ({
export const completeCodeAction: RCEAction = {
    name: 'complete_code',
    // description: maxCount == 1
    //     ? 'Suggest code to write.' +
    //     ' You may make one suggestion.' +
    //     ' Your suggestion can be a single line or a multi-line code snippet.'

    //     : 'Suggest code to write.' +
    //     ` You may make up to ${maxCount} suggestions, but only one will be used.` +
    //     ' Your suggestions can be single lines or multi-line code snippets.',
    description: 'Suggest code to write.' +
        ' Only one suggestion you provide will be chosen.' +
        ' Your suggestions can be single lines or multi-line code snippets.',
    schema: {
        type: 'object',
        properties: {
            suggestions: {
                type: 'array',
                items: { type: 'string' },
                // maxItems: maxCount,
                maxItems: 3,
            },
        },
        required: ['suggestions'],
        additionalProperties: false,
    } satisfies JSONSchema7,
    category: 'Completions',
    handler: handleCompleteCode,
    validators: {
        sync: [
            () => NEURO.currentActionForce // This is done before the action force is cleared
                ? actionValidationAccept()
                : actionValidationFailure('Not currently waiting for code suggestions'),
            () => NEURO.cancelled
                ? actionValidationFailure('Request was cancelled')
                : actionValidationAccept(),
        ],
    },
    promptGenerator: 'suggest code.',
    defaultPermission: PermissionLevel.OFF, // Used with overridePermissions in forceActions
    autoRegister: false,
    hidden: true,
} as const;

function handleCompleteCode(context: RCEContext): RCEHandlerReturns {
    if (NEURO.cancelled)
        return actionHandlerFailure('Request was cancelled');
    if (!NEURO.currentActionForce)
        return actionHandlerFailure('Not currently waiting for suggestions');

    lastSuggestions = context.data.params.suggestions;
    logOutput('INFO', 'Received suggestions:\n' + JSON.stringify(lastSuggestions));
    return actionHandlerSuccess();
}

export function addCompleteCodeAction() {
    addActions([completeCodeAction], false);
}

// TODO: Figure out maxCount properly
export function requestCompletion(beforeContext: string, afterContext: string, fileName: string, language: string, maxCount: number) {
    // If completions are disabled, notify and return early.
    if (CONFIG.completionTrigger === 'off') {
        if (!NEURO.warnOnCompletionsOff) {
            return;
        }
        vscode.window.showInformationMessage('Inline completions with NeuroPilot are disabled.', 'Don\'t show again this session')
            .then(selection => {
                if (selection === 'Don\'t show again this session') {
                    NEURO.warnOnCompletionsOff = false;
                }
            });
        return;
    }

    // Obviously we need Neuro to be connected
    if (!NEURO.connected) {
        logOutput('ERROR', 'Attempted to request completion while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    // You can't request a completion while already waiting
    if (!canForceActions()) {
        logOutput('WARNING', 'Attempted to request completion while waiting for response');
        return;
    }

    logOutput('INFO', `Requesting completion for ${fileName}`);

    registerAction(completeCodeAction.name);
    const status = tryForceActions({
        query: 'Write code that fits between afterContext and beforeContext',
        actionNames: [completeCodeAction.name],
        state: JSON.stringify({
            file: fileName,
            language: language,
            beforeContext: beforeContext,
            afterContext: afterContext,
            maxCompletions: maxCount,
        }),
        ephemeral_context: false,
        priority: ActionForcePriorityEnum.HIGH, // Completions should be fast, but are not critical
        overridePermissions: PermissionLevel.AUTOPILOT,
    });
    if (!status) {
        logOutput('ERROR', 'Failed to force completion action');
        vscode.window.showErrorMessage('Failed to request completion from Neuro.');
        return;
    }
    NEURO.cancelled = false;
}

export function cancelCompletionRequest() {
    NEURO.cancelled = true;
    unregisterAction(completeCodeAction.name);
}

export const completionsProvider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, context, token) {
        const result: vscode.InlineCompletionList = {
            items: [],
        };

        const triggerAuto = CONFIG.completionTrigger === 'automatic';
        if (!triggerAuto && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
            return result;
        }

        // Get context
        const cursorContext = getPositionContext(document, position);
        const fileName = simpleFileName(document.fileName);
        const maxCount = CONFIG.maxCompletions || 3;

        requestCompletion(cursorContext.contextBefore, cursorContext.contextAfter, fileName, document.languageId, maxCount);

        token.onCancellationRequested(() => {
            logOutput('INFO', 'Cancelled request');
            cancelCompletionRequest();
        });

        const timeoutMs = CONFIG.timeout ?? 10000;
        const timeout = new Promise<void>((_, reject) => setTimeout(() => reject('Request timed out'), timeoutMs));
        const completion = new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (!NEURO.currentActionForce) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });

        try {
            await Promise.race([timeout, completion]);
        } catch (erm) {
            if (typeof erm === 'string') {
                logOutput('ERROR', erm);
                NEURO.cancelled = true;
                vscode.window.showErrorMessage(erm);
            }
            else {
                throw erm;
            }
        }

        for (const suggestion of lastSuggestions) {
            result.items.push({
                insertText: suggestion.trim(),
            });
        }

        return result;
    },
};
