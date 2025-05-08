import * as vscode from 'vscode';

import { NEURO } from './constants';
import { escapeRegExp, getFence, getPositionContext, isPathNeuroSafe, logOutput, NeuroPositionContext, substituteMatch } from './utils';
import { ActionData, ActionResult, actionResultAccept, actionResultEnumFailure, actionResultFailure, actionResultIncorrectType, actionResultMissingParameter, actionResultNoPermission, actionResultRetry } from './neuro_client_helper';
import { PERMISSIONS, hasPermissions } from './config';

const ACTION_RESULT_NO_ACCESS = actionResultFailure('You do not have permission to access this file.');
const ACTION_RESULT_NO_ACTIVE_DOCUMENT = actionResultFailure('No active document to edit.');

const MATCH_OPTIONS: string[] = [ 'firstInFile', 'lastInFile', 'firstAfterCursor', 'lastBeforeCursor', 'allInFile' ] as const;

export const editingFileHandlers: { [key: string]: (actionData: ActionData) => ActionResult } = {
    'place_cursor': handlePlaceCursor,
    'get_cursor': handleGetCursor,
    'insert_text': handleInsertText,
    'replace_text': handleReplaceText,
    'delete_text': handleDeleteText,
    'find_text': handleFindText,
    'undo': handleUndo,
};

export function registerEditingActions() {
    if(hasPermissions(PERMISSIONS.editActiveDocument)) {
        NEURO.client?.registerActions([
            {
                name: 'place_cursor',
                description: 'Place the cursor in the current file. Absolute line and column numbers are one-based.',
                schema: {
                    type: 'object',
                    properties: {
                        line: { type: 'integer' },
                        column: { type: 'integer' },
                        type: { type: 'string', enum: ['relative', 'absolute'] },
                    },
                    required: ['line', 'column', 'type'],
                },
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
                },
            },
            {
                name: 'replace_text',
                description: 'Replace text in the active document. If you set "useRegex" to true, you can use a Regex in the "find" parameter and a subtitution pattern in the "replaceWith" parameter.',
                schema: {
                    type: 'object',
                    properties: {
                        find: { type: 'string' },
                        replaceWith: { type: 'string' },
                        useRegex: { type: 'boolean' },
                        match: { type: 'string', enum: MATCH_OPTIONS },
                    },
                    required: ['find', 'replaceWith', 'match'],
                },
            },
            {
                name: 'delete_text',
                description: 'Delete text in the active document. If you set "useRegex" to true, you can use a Regex in the "find" parameter.',
                schema: {
                    type: 'object',
                    properties: {
                        find: { type: 'string' },
                        useRegex: { type: 'boolean' },
                        match: { type: 'string', enum: MATCH_OPTIONS },
                    },
                    required: ['find', 'match'],
                },
            },
            {
                name: 'find_text',
                description: 'Find text in the active document. If you set "useRegex" to true, you can use a Regex in the "find" parameter.',
                schema: {
                    type: 'object',
                    properties: {
                        find: { type: 'string' },
                        useRegex: { type: 'boolean' },
                        match: { type: 'string', enum: MATCH_OPTIONS },
                    },
                    required: ['find', 'match'],
                },
            },
            {
                name: 'undo',
                description: 'Undo the last action in the active document. If this doesn\'t work, tell Vedal to focus VS Code.',
            },
        ]);
    }
}

export function handlePlaceCursor(actionData: ActionData): ActionResult {
    if(!hasPermissions(PERMISSIONS.editActiveDocument))
        return actionResultNoPermission(PERMISSIONS.editActiveDocument);

    // One-based line and column (depending on config)
    let line = actionData.params?.line;
    let column = actionData.params?.column;

    if(line === undefined)
        return actionResultMissingParameter('line');
    if(column === undefined)
        return actionResultMissingParameter('column');

    if(typeof line !== 'number')
        return actionResultIncorrectType('line', 'number', typeof line);
    if(typeof column !== 'number')
        return actionResultIncorrectType('column', 'number', typeof column);

    const type = actionData.params?.type;
    if(type === undefined)
        return actionResultMissingParameter('type');
    if(type !== 'relative' && type !== 'absolute')
        return actionResultEnumFailure('type', ['relative', 'absolute'], type);

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    let basedLine: number, basedColumn: number;

    if(type === 'relative') {
        line += vscode.window.activeTextEditor!.selection.active.line;
        column += vscode.window.activeTextEditor!.selection.active.character;

        basedLine = line + 1;
        basedColumn = column + 1;
    }
    else {
        basedLine = line;
        basedColumn = column;

        line -= 1;
        column -= 1;
    }

    if(line >= document.lineCount || line < 0)
        return actionResultRetry(`Line is out of bounds, the last line of the document is ${document.lineCount}.`);
    if(column > document.lineAt(line).text.length || column < 0)
        return actionResultRetry(`Column is out of bounds, the last column of line ${basedLine} is ${document.lineAt(line).text.length + 1}.`);

    vscode.window.activeTextEditor!.selection = new vscode.Selection(line, column, line, column);
    const cursorContext = getPositionContext(document, new vscode.Position(line, column));
    logOutput('INFO', `Placed cursor at (${basedLine}:${basedColumn}).`);

    return actionResultAccept(`Cursor placed at (${basedLine}:${basedColumn})\n\n${formatContext(cursorContext)}`);
}

export function handleGetCursor(actionData: ActionData): ActionResult {
    if(!hasPermissions(PERMISSIONS.editActiveDocument))
        return actionResultNoPermission(PERMISSIONS.editActiveDocument);

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const cursorContext = getPositionContext(document, vscode.window.activeTextEditor!.selection.active);
    const line = vscode.window.activeTextEditor!.selection.active.line;
    const character = vscode.window.activeTextEditor!.selection.active.character;
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    logOutput('INFO', 'Sending cursor position to Neuro');

    return actionResultAccept(`In file ${relativePath}\n\nCursor is at (${line + 1}:${character + 1})\n\n${formatContext(cursorContext)}`);
}

export function handleInsertText(actionData: ActionData): ActionResult {
    if(!hasPermissions(PERMISSIONS.editActiveDocument))
        return actionResultNoPermission(PERMISSIONS.editActiveDocument);

    const text = actionData.params?.text;
    if(text === undefined)
        return actionResultMissingParameter('text');

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const insertStart = vscode.window.activeTextEditor!.selection.active;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, vscode.window.activeTextEditor!.selection.active, text);

    vscode.workspace.applyEdit(edit).then(success => {
        if(success) {
            logOutput('INFO', 'Inserting text into document');
            const document = vscode.window.activeTextEditor!.document;
            const insertEnd = vscode.window.activeTextEditor!.selection.active;
            const cursorContext = getPositionContext(document, insertStart, insertEnd);
            NEURO.client?.sendContext(`Inserted text into document\n\n${formatContext(cursorContext)}`);
        }
        else {
            logOutput('ERROR', 'Failed to apply text insertion edit');
            NEURO.client?.sendContext('Failed to insert text');
        }
    });

    return actionResultAccept();
}

export function handleReplaceText(actionData: ActionData): ActionResult {
    if(!hasPermissions(PERMISSIONS.editActiveDocument))
        return actionResultNoPermission(PERMISSIONS.editActiveDocument);

    const find: string = actionData.params?.find;
    const replaceWith: string = actionData.params?.replaceWith;
    if(find === undefined)
        return actionResultMissingParameter('find');
    if(replaceWith === undefined)
        return actionResultMissingParameter('replaceWith');

    const match: string = actionData.params?.match;
    if(match === undefined)
        return actionResultMissingParameter('match');
    if(!MATCH_OPTIONS.includes(match))
        return actionResultEnumFailure('match', MATCH_OPTIONS, match);

    const useRegex = actionData.params?.useRegex ?? false;

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const regex = new RegExp(useRegex ? find : escapeRegExp(find), 'g');
    const cursorOffset = document.offsetAt(vscode.window.activeTextEditor!.selection.active);

    const matches = findAndFilter(regex, document.getText(), cursorOffset, match);
    if(matches.length === 0)
        return actionResultFailure('No matches found for the given parameters.');

    const edit = new vscode.WorkspaceEdit();
    for(const m of matches) {
        try {
            const replacement = useRegex ? substituteMatch(m, replaceWith) : replaceWith;
            edit.replace(document.uri, new vscode.Range(document.positionAt(m.index), document.positionAt(m.index + m[0].length)), replacement);
        } catch(erm) {
            logOutput('ERROR', `Error while substituting match: ${erm}`);
            return actionResultFailure(erm instanceof Error ? erm.message : 'Unknown error while substituting match');
        }
    }
    vscode.workspace.applyEdit(edit).then(success => {
        if(success) {
            logOutput('INFO', 'Replacing text in document');
            if(matches.length === 1) {
                // Single match
                const document = vscode.window.activeTextEditor!.document;
                const startPosition = document.positionAt(matches[0].index);
                const endPosition = document.positionAt(matches[0].index + substituteMatch(matches[0], replaceWith).length);
                vscode.window.activeTextEditor!.selection = new vscode.Selection(endPosition, endPosition);
                const cursorContext = getPositionContext(document, startPosition, endPosition);
                NEURO.client?.sendContext(`Replaced text in document\n\n${formatContext(cursorContext)}`);
            }
            else {
                // Multiple matches
                const document = vscode.window.activeTextEditor!.document;
                const fence = getFence(document.getText());
                NEURO.client?.sendContext(`Deleted ${matches.length} occurrences from the document\n\nUpdated content:\n\n${fence}\n${document.getText()}\n${fence}`);
            }
        }
        else {
            logOutput('ERROR', 'Failed to apply text replacement edit');
            NEURO.client?.sendContext('Failed to replace text');
        }
    });

    return actionResultAccept();
}

export function handleDeleteText(actionData: ActionData): ActionResult {
    if(!hasPermissions(PERMISSIONS.editActiveDocument))
        return actionResultNoPermission(PERMISSIONS.editActiveDocument);

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const find = actionData.params?.find;
    if(find === undefined)
        return actionResultMissingParameter('find');

    const match: string = actionData.params?.match;
    if(match === undefined)
        return actionResultMissingParameter('match');
    if(!MATCH_OPTIONS.includes(match))
        return actionResultEnumFailure('match', MATCH_OPTIONS, match);

    const useRegex = actionData.params?.useRegex ?? false;

    const regex = new RegExp(useRegex ? find : escapeRegExp(find), 'g');
    const cursorOffset = document.offsetAt(vscode.window.activeTextEditor!.selection.active);

    const matches = findAndFilter(regex, document.getText(), cursorOffset, match);
    if(matches.length === 0)
        return actionResultFailure('No matches found for the given parameters.');

    const edit = new vscode.WorkspaceEdit();
    for(const m of matches) {
        edit.delete(document.uri, new vscode.Range(document.positionAt(m.index), document.positionAt(m.index + m[0].length)));
    }
    vscode.workspace.applyEdit(edit).then(success => {
        if(success) {
            logOutput('INFO', 'Deleting text from document');
            if(matches.length === 1) {
                // Single match
                const document = vscode.window.activeTextEditor!.document;
                vscode.window.activeTextEditor!.selection = new vscode.Selection(document.positionAt(matches[0].index), document.positionAt(matches[0].index));
                const cursorContext = getPositionContext(document, document.positionAt(matches[0].index));
                NEURO.client?.sendContext(`Deleted text from document\n\n${formatContext(cursorContext)}`);
            }
            else {
                // Multiple matches
                const document = vscode.window.activeTextEditor!.document;
                const fence = getFence(document.getText());
                NEURO.client?.sendContext(`Deleted ${matches.length} occurrences from the document\n\nUpdated content:\n\n${fence}\n${document.getText()}\n${fence}`);
            }
        }
        else {
            logOutput('ERROR', 'Failed to apply text deletion edit');
            NEURO.client?.sendContext('Failed to delete text');
        }
    });

    return actionResultAccept();
}

export function handleFindText(actionData: ActionData): ActionResult {
    if(!hasPermissions(PERMISSIONS.editActiveDocument))
        return actionResultNoPermission(PERMISSIONS.editActiveDocument);

    const find = actionData.params?.find;
    if(find === undefined)
        return actionResultMissingParameter('find');

    const match = actionData.params?.match;
    if(match === undefined)
        return actionResultMissingParameter('match');
    if(!MATCH_OPTIONS.includes(match))
        return actionResultEnumFailure('match', MATCH_OPTIONS, match);

    const useRegex = actionData.params?.useRegex ?? false;
    const regex = new RegExp(useRegex ? find : escapeRegExp(find), 'g');

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    const cursorOffset = document.offsetAt(vscode.window.activeTextEditor!.selection.active);

    const matches = findAndFilter(regex, document.getText(), cursorOffset, match);
    if(matches.length === 0)
        return actionResultFailure('No matches found for the given parameters.');

    if(matches.length === 1) {
        // Single match
        const pos = matches[0].index;
        const line = document.positionAt(pos).line;
        const character = document.positionAt(pos).character;
        vscode.window.activeTextEditor!.selection = new vscode.Selection(line, character, line, character);
        const cursorContext = getPositionContext(document, new vscode.Position(line, character));
        logOutput('INFO', `Placed cursor at (${line + 1}:${character + 1})`);
        return actionResultAccept(`Found match and placed cursor at (${line + 1}:${character + 1})\n\n${formatContext(cursorContext)}`);
    }
    else {
        // Multiple matches
        const positions = matches.map(m => document.positionAt(m.index));
        const lines = positions.map(p => document.lineAt(p.line).text);
        // max(1, ...) because log10(0) is -Infinity
        const padding = Math.max(1, Math.log10(positions[positions.length - 1].line + 1) + 1); // Space for the line number
        logOutput('INFO', `Found ${positions.length} matches`);
        const text = lines.map((line, i) => `L. ${(positions[i].line + 1).toString().padStart(padding)}: ${line}`).join('\n');
        const fence = getFence(text);
        return actionResultAccept(`Found ${positions.length} matches: \n\n${fence}\n${text}\n${fence}`);
    }
}

export function handleUndo(actionData: ActionData): ActionResult {
    if(!hasPermissions(PERMISSIONS.editActiveDocument))
        return actionResultNoPermission(PERMISSIONS.editActiveDocument);

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined)
        return ACTION_RESULT_NO_ACTIVE_DOCUMENT;
    if(!isPathNeuroSafe(document.fileName))
        return ACTION_RESULT_NO_ACCESS;

    vscode.commands.executeCommand('undo').then(
        () => {
            logOutput('INFO', 'Undoing last action in document');
            const cursorContext = getPositionContext(document, vscode.window.activeTextEditor!.selection.active);
            NEURO.client?.sendContext(`Undid last action in document\n\n${formatContext(cursorContext)}`);
        },
        (erm) => {
            logOutput('ERROR', `Failed to undo last action: ${erm}`);
            NEURO.client?.sendContext('Failed to undo last action');
        },
    );

    return actionResultAccept();
}

/**
 * Find matches in the text and filter based on the match option.
 * @param regex The regular expression to search for.
 * @param text The text to search in.
 * @param cursorOffset The current cursor offset in the text.
 * @param match The match option from the {@link MATCH_OPTIONS} array.
 * @returns The matches found in the text based on the match option.
 */
function findAndFilter(regex: RegExp, text: string, cursorOffset: number, match: string): RegExpExecArray[] {
    const matches = text.matchAll(regex);
    let result: RegExpExecArray[] = [];

    switch(match) {
        case 'firstInFile':
            for(const m of matches)
                return [m];
            return [];

        case 'lastInFile':
            for(const m of matches)
                result = [m];
            return result;

        case 'firstAfterCursor':
            for(const m of matches)
                if(m.index >= cursorOffset)
                    return [m];
            return [];

        case 'lastBeforeCursor':
            for(const m of matches)
                if(m.index < cursorOffset)
                    result = [m];
                else break;
            return result;

        case 'allInFile':
            for(const m of matches)
                result.push(m);
            return result;

        default:
            throw new Error(`Invalid match option: ${match}`);
    }
}

function formatContext(context: NeuroPositionContext): string {
    const fence = getFence(context.contextBefore + context.contextBetween + context.contextAfter);
    return `Context (lines ${context.startLine + 1}-${context.endLine + 1}, cursor position denoted by \`<<<|>>>\`):\n\n${fence}\n${context.contextBefore}${context.contextBetween}<<<|>>>${context.contextAfter}\n${fence}`;
}
