import * as vscode from 'vscode';

import { NEURO } from "./constants";
import { getPositionContext, hasPermissions, isPathNeuroSafe, logOutput } from './utils';
import { ActionData, ActionResult, actionResultAccept, actionResultFailure, actionResultMissingParameter, actionResultNoPermission, actionResultRetry, PERMISSION_STRINGS } from './neuro_client_helper';

const ACTION_RESULT_NO_ACCESS = actionResultFailure('You do not have permission to access this file.');
const ACTION_RESULT_NO_ACTIVE_DOCUMENT = actionResultFailure('No active document to edit.');

export const editingFileHandlers: { [key: string]: (actionData: ActionData) => ActionResult } = {
    'place_cursor': handlePlaceCursor,
    'get_cursor': handleGetCursor,
    'insert_text': handleInsertText,
    'replace_text': handleReplaceText,
    'delete_text': handleDeleteText,
    'place_cursor_at_text': handlePlaceCursorAtText,
}

export function registerEditingActions() {
    if(hasPermissions('editActiveDocument')) {
        NEURO.client?.registerActions([
            {
                name: 'place_cursor',
                description: 'Place the cursor in the current file. Line and character are zero-based.',
                schema: {
                    type: 'object',
                    properties: {
                        line: { type: 'integer' },
                        character: { type: 'integer' },
                    },
                    required: ['line', 'character'],
                }
            },
            {
                name: 'get_cursor',
                description: 'Get the current cursor position and the text surrounding it',
            },
            {
                name: 'insert_text',
                description: 'Insert code at the current cursor position',
                schema: {
                    type: 'object',
                    properties: {
                        text: { type: 'string' },
                    },
                    required: ['text'],
                }
            },
            {
                name: 'replace_text',
                description: 'Replace the first occurrence of the specified code',
                schema: {
                    type: 'object',
                    properties: {
                        oldText: { type: 'string' },
                        newText: { type: 'string' },
                    },
                    required: ['oldText', 'newText'],
                }
            },
            {
                name: 'delete_text',
                description: 'Delete the first occurrence of the specified code',
                schema: {
                    type: 'object',
                    properties: {
                        textToDelete: { type: 'string' },
                    },
                    required: ['textToDelete'],
                }
            },
            {
                name: 'place_cursor_at_text',
                description: 'Place the cursor before or after the first occurrence of the specified text',
                schema: {
                    type: 'object',
                    properties: {
                        text: { type: 'string' },
                        position: { type: 'string', enum: ['before', 'after'] },
                    },
                    required: ['text', 'position'],
                }
            },
        ]);
    }
}

export function handlePlaceCursor(actionData: ActionData): ActionResult {
    if(!hasPermissions('editActiveDocument')) {
        logOutput('WARNING', 'Neuro attempted to place the cursor, but permission is disabled');
        return actionResultNoPermission(PERMISSION_STRINGS.editActiveDocument);
    }

    const line = actionData.params?.line;
    const character = actionData.params?.character;

    if(line === undefined)
        return actionResultMissingParameter('line');
    if(character === undefined)
        return actionResultMissingParameter('character');

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;
    if(line >= document.lineCount)
        return actionResultRetry(`Line is out of bounds, the last line of the document is ${document.lineCount - 1}.`);
    if(character >= document.lineAt(line).text.length)
        return actionResultRetry(`Character is out of bounds, the last character of line ${line} is ${document.lineAt(line).text.length - 1}.`);

    vscode.window.activeTextEditor!.selection = new vscode.Selection(line, character, line, character);
    const cursorContext = getPositionContext(document, new vscode.Position(line, character));
    logOutput('INFO', `Placed cursor at line ${line}, character ${character}`);

    return actionResultAccept(`Cursor placed at line ${line}, character ${character}\n\nContext before:\n\n\`\`\`\n${cursorContext.contextBefore}\n\`\`\`\n\nContext after:\n\n\`\`\`\n${cursorContext.contextAfter}\n\`\`\``);
}

export function handleGetCursor(actionData: ActionData): ActionResult {
    if(!hasPermissions('editActiveDocument')) {
        logOutput('WARNING', 'Neuro attempted to get the cursor position, but permission is disabled');
        return actionResultNoPermission(PERMISSION_STRINGS.editActiveDocument);
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const cursorContext = getPositionContext(document, vscode.window.activeTextEditor!.selection.active);
    const line = vscode.window.activeTextEditor!.selection.active.line;
    const character = vscode.window.activeTextEditor!.selection.active.character;
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    logOutput('INFO', `Sending cursor position to Neuro`);

    return actionResultAccept(`In file ${relativePath}\n\nCursor is at line ${line}, character ${character}\n\nContext before:\n\n\`\`\`\n${cursorContext.contextBefore}\n\`\`\`\n\nContext after:\n\n\`\`\`\n${cursorContext.contextAfter}\n\`\`\``);
}

export function handleInsertText(actionData: ActionData): ActionResult {
    if(!hasPermissions('editActiveDocument')) {
        logOutput('WARNING', 'Neuro attempted to insert text, but permission is disabled');
        return actionResultNoPermission(PERMISSION_STRINGS.editActiveDocument);
    }

    const text = actionData.params?.text;
    if(text === undefined)
        return actionResultMissingParameter('text');

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, vscode.window.activeTextEditor!.selection.active, text);

    vscode.workspace.applyEdit(edit).then(success => {
        if(success) {
            logOutput('INFO', `Inserting text into document`);
        }
        else {
            logOutput('ERROR', 'Failed to apply text insertion edit');
            NEURO.client?.sendContext('Failed to insert text');
        }
    });

    return actionResultAccept();
}

export function handleReplaceText(actionData: ActionData): ActionResult {
    if(!hasPermissions('editActiveDocument')) {
        logOutput('WARNING', 'Neuro attempted to replace text, but permission is disabled');
        return actionResultNoPermission(PERMISSION_STRINGS.editActiveDocument);
    }

    const oldText = actionData.params?.oldText;
    const newText = actionData.params?.newText;
    if(oldText === undefined)
        return actionResultMissingParameter('oldText');
    if(newText === undefined)
        return actionResultMissingParameter('newText');

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return actionResultFailure('No active document to replace text in.');
    if(!isPathNeuroSafe(document.fileName))
        return actionResultNoPermission('You do not have permission to access this file.');

    const oldStart = document.getText().indexOf(oldText);
    if(oldStart === -1)
        return actionResultFailure('Text to replace not found in document.');

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(oldStart), document.positionAt(oldStart + oldText.length)), newText);
    vscode.workspace.applyEdit(edit).then(success => {
        if(success) {
            logOutput('INFO', `Replacing text in document`);
            vscode.window.activeTextEditor!.selection = new vscode.Selection(document.positionAt(oldStart + newText.length), document.positionAt(oldStart + newText.length));
        }
        else {
            logOutput('ERROR', 'Failed to apply text replacement edit');
            NEURO.client?.sendContext('Failed to replace text');
        }
    });

    return actionResultAccept();
}

export function handleDeleteText(actionData: ActionData): ActionResult {
    if(!hasPermissions('editActiveDocument')) {
        logOutput('WARNING', 'Neuro attempted to delete text, but permission is disabled');
        return actionResultNoPermission(PERMISSION_STRINGS.editActiveDocument);
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const textToDelete = actionData.params?.textToDelete;
    if(textToDelete === undefined)
        return actionResultMissingParameter('textToDelete');

    const textStart = document.getText().indexOf(textToDelete);
    if(textStart === -1)
        return actionResultFailure('Text to delete not found in document.');

    const edit = new vscode.WorkspaceEdit();
    edit.delete(document.uri, new vscode.Range(document.positionAt(textStart), document.positionAt(textStart + textToDelete.length)));
    vscode.workspace.applyEdit(edit).then(success => {
        if(success) {
            logOutput('INFO', `Deleting text from document`);
            vscode.window.activeTextEditor!.selection = new vscode.Selection(document.positionAt(textStart), document.positionAt(textStart));
        }
        else {
            logOutput('ERROR', 'Failed to apply text deletion edit');
            NEURO.client?.sendContext('Failed to delete text');
        }
    });

    return actionResultAccept();
}

export function handlePlaceCursorAtText(actionData: ActionData): ActionResult {
    if(!hasPermissions('editActiveDocument')) {
        logOutput('WARNING', 'Neuro attempted to place the cursor at text, but permission is disabled');
        return actionResultNoPermission(PERMISSION_STRINGS.editActiveDocument);
    }

    const text = actionData.params?.text;
    const position = actionData.params?.position;
    if(text === undefined)
        return actionResultMissingParameter('text');
    if(position === undefined)
        return actionResultMissingParameter('position');
    if(position !== 'before' && position !== 'after') {
        return actionResultRetry('Invalid value for parameter "position" (must be one of ["before", "after"]).');
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const textStart = document.getText().indexOf(text);
    if(textStart === -1)
        return actionResultFailure('Text to place cursor at not found in document.');

    let pos = position === 'before' ? textStart : textStart + text.length;
    const line = document.positionAt(pos).line;
    const character = document.positionAt(pos).character;

    vscode.window.activeTextEditor!.selection = new vscode.Selection(line, character, line, character);
    const cursorContext = getPositionContext(document, new vscode.Position(line, character));
    logOutput('INFO', `Placed cursor at text ${position} the first occurrence`);
    
    return actionResultAccept(`Cursor placed at text ${position} the first occurrence (line ${line}, character ${character})\n\nContext before:\n\n\`\`\`\n${cursorContext.contextBefore}\n\`\`\`\n\nContext after:\n\n\`\`\`\n${cursorContext.contextAfter}\n\`\`\``);
}
