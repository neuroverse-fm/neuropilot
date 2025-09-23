import * as vscode from 'vscode';
import { NeuroClient } from 'neuro-game-sdk';
import globToRegExp from 'glob-to-regexp';
import { fileTypeFromBuffer } from 'file-type';

import { NEURO } from '@/constants';
import { ACCESS, CONFIG, CursorPositionContextStyle, getPermissionLevel, PERMISSIONS } from '@/config';

import { ActionValidationResult, ActionData, actionValidationAccept, actionValidationFailure } from '@/neuro_client_helper';
import assert from 'node:assert';
import { patienceDiff } from './patience_diff';

export const REGEXP_ALWAYS = /^/;
export const REGEXP_NEVER = /^\b$/;

export function logOutput(tag: string, message: string) {
    if (!NEURO.outputChannel) {
        console.error('Output channel not initialized');
        return;
    }
    const ms = Date.now() % 1000;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + ms.toString().padStart(3, '0');
    const prefix = `${time} [${tag}] `;
    for (const line of message.split('\n')) {
        NEURO.outputChannel.appendLine(prefix + line);
    }
}

export function createClient() {
    logOutput('INFO', 'Creating Neuro API client');
    if (NEURO.client)
        NEURO.client.disconnect();

    NEURO.connected = false;
    NEURO.waiting = false;
    NEURO.cancelled = false;
    NEURO.waitingForCookie = false;

    // TODO: Check if this is a memory leak
    NEURO.client = new NeuroClient(NEURO.url, NEURO.gameName, () => {
        assert(NEURO.client instanceof NeuroClient);

        logOutput('INFO', 'Connected to Neuro API');
        NEURO.connected = true;

        vscode.window.showInformationMessage('Successfully connected to Neuro API.');

        NEURO.client.sendContext(
            vscode.workspace.getConfiguration('neuropilot').get('initialContext', 'Something went wrong, blame whoever made this extension.'),
        );

        NEURO.client.onClose = () => {
            NEURO.connected = false;
            logOutput('INFO', 'Disconnected from Neuro API');
            vscode.window.showWarningMessage('Disconnected from Neuro API.');
        };

        NEURO.client.onError = (error) => {
            logOutput('ERROR', `Neuro client error: ${error}`);
            vscode.window.showErrorMessage(`Neuro client error: ${error}`);
        };

        for (const handler of clientConnectedHandlers) {
            handler();
        }
    });

    NEURO.client.onError = () => {
        logOutput('ERROR', 'Could not connect to Neuro API');
        vscode.window.showErrorMessage('Could not connect to Neuro API.');
    };
}

const clientConnectedHandlers: (() => void)[] = [];

export function onClientConnected(handler: () => void) {
    clientConnectedHandlers.push(handler);
}

export function simpleFileName(fileName: string): string {
    const rootFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath.replace(/\\/, '/');
    const result = fileName.replace(/\\/g, '/');
    if (rootFolder && result.startsWith(rootFolder))
        return result.substring(rootFolder.length);
    else
        return result.substring(result.lastIndexOf('/') + 1);
}

/**
 * Filters the contents of a file to remove Windows-style line endings.
 * @param contents The contents of the file to filter.
 * @returns The filtered contents of the file.
 */
export function filterFileContents(contents: string): string {
    return contents.replace(/\r\n/g, '\n');
}

export interface NeuroPositionContext {
    /** The context before the cursor, or the entire context if the cursor is not defined. */
    contextBefore: string;
    /** The context after the range, or an empty string if the cursor is not defined. */
    contextAfter: string;
    /** The zero-based line where {@link contextBefore} starts. */
    startLine: number;
    /** The zero-based line where {@link contextAfter} ends. */
    endLine: number;
    /** The number of total lines in the file. */
    totalLines: number;
    /** `true` if the cursor is defined and inside the context, `false` otherwise. */
    cursorDefined: boolean;
}

interface NeuroPositionContextOptions {
    /** The position of the cursor in the document. */
    cursorPosition?: vscode.Position;
    /** The start of the range around which to get the context. Defaults to the start of the document if not provided. */
    position?: vscode.Position;
    /** The end of the range around which to get the context. If not provided, defaults to {@link position}, or the end of the document if {@link position} is not provided. */
    position2?: vscode.Position;
}

/**
 * Gets the context around a specified range in a document.
 * If no range is specified, gets the entire document.
 * Do not use the result of this for position calculations, as the file is filtered to remove Windows-style line endings.
 * @param document The document to get the context from.
 * @param options The options for getting the context. If passed a {@link vscode.Position}, it is used as `cursorPosition`, `position` and `position2`.
 * @returns The context around the specified range. The amount of lines before and after the range is configurable in the settings.
 */
export function getPositionContext(document: vscode.TextDocument, options: NeuroPositionContextOptions | vscode.Position): NeuroPositionContext {
    const beforeContextLength = CONFIG.beforeContext;
    const afterContextLength = CONFIG.afterContext;

    if (options instanceof vscode.Position) {
        options = { cursorPosition: options, position: options, position2: options };
    }

    if (options.position2 === undefined) {
        options.position2 = options.position;
    }
    if (options.position === undefined || options.position2 === undefined) { // Second check is redundant but the compiler wants it
        options.position = new vscode.Position(0, 0);
        options.position2 = new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length);
    }
    if (options.position2.isBefore(options.position)) {
        // Swap the positions if position2 is before position
        const temp = options.position;
        options.position = options.position2;
        options.position2 = temp;
    }

    const startLine = Math.max(0, options.position.line - beforeContextLength);
    const endLine = Math.min(document.lineCount - 1, options.position2.line + afterContextLength);

    // If the cursor is defined and inside the range, split the context into before and after the cursor
    if (options.cursorPosition && options.cursorPosition.line >= options.position.line && options.cursorPosition.line <= options.position2.line) {
        const contextBefore = document.getText(new vscode.Range(new vscode.Position(startLine, 0), options.cursorPosition));
        const contextAfter = document.getText(new vscode.Range(options.cursorPosition, new vscode.Position(endLine, document.lineAt(endLine).text.length)));
        return {
            contextBefore: filterFileContents(contextBefore),
            contextAfter: filterFileContents(contextAfter),
            startLine: startLine,
            endLine: endLine,
            totalLines: document.lineCount,
            cursorDefined: true,
        };
    }

    // If the cursor is not defined or not inside the range, return the entire context in contextBefore
    const contextBefore = document.getText(new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, document.lineAt(endLine).text.length)));
    return {
        contextBefore: filterFileContents(contextBefore),
        contextAfter: '',
        startLine: startLine,
        endLine: endLine,
        totalLines: document.lineCount,
        cursorDefined: false,
    };
}

export function formatActionID(name: string): string {
    // Action IDs must be snake_case
    return name
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .toLowerCase();
}

export function normalizePath(path: string): string {
    let result = path.replace(/\\/g, '/');
    if (/^[A-Z]:/.test(result)) {
        result = result.charAt(0).toLowerCase() + result.slice(1);
    }
    return result;
}

/**
 * Gets the path to the first workspace folder.
 * The path is normalized to use forward slashes.
 * @returns The path to the workspace folder, or undefined if the workspace is not open.
 */
export function getWorkspacePath(): string | undefined {
    const path = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    return path ? normalizePath(path) : undefined;
}

export function getWorkspaceUri(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0].uri;
}

export function combineGlobLines(lines: string[]): string {
    const result = lines
        .map(line => normalizePath(line.trim()))
        .filter(line => line.length > 0)
        .flatMap(line => line.includes('/') ? line : [`**/${line}`, `**/${line}/**`]) // If the line does not contain a slash, match it in any folder
        .join(',');
    return `{${result}}`;
}

export function combineGlobLinesToRegExp(lines: string[]): RegExp {
    const result = lines
        .map(line => normalizePath(line.trim()))
        .filter(line => line.length > 0)
        .flatMap(line => line.includes('/') ? line : [`**/${line}`, `**/${line}/**`]) // If the line does not contain a slash, match it in any folder
        .map(line => globToRegExp(line, { extended: true, globstar: true }).source)
        .join('|');
    return new RegExp(result);
}

/**
 * Check if an absolute path is safe for Neuro to access.
 * Neuro may not access paths outside the workspace, or files and folders starting with a dot.
 * This is a security measure to prevent Neuro from modifying her own permissions or adding arbitrary tasks.
 * @param path The absolute path to check.
 * @param checkPatterns Whether to check against include and exclude patterns.
 * @returns True if Neuro may safely access the path.
 */
export function isPathNeuroSafe(path: string, checkPatterns = true): boolean {
    const workspacePath = getWorkspacePath();
    const rootFolder = workspacePath ? normalizePath(workspacePath) : undefined;
    const normalizedPath = normalizePath(path);
    const includePattern = ACCESS.includePattern || ['**/*'];
    const excludePattern = ACCESS.excludePattern;
    const includeRegExp: RegExp = checkPatterns ? combineGlobLinesToRegExp(includePattern) : REGEXP_ALWAYS;
    const excludeRegExp: RegExp = checkPatterns && excludePattern ? combineGlobLinesToRegExp(excludePattern) : REGEXP_NEVER;

    return rootFolder !== undefined
        // Prevent access to the workspace folder itself
        && (ACCESS.externalFiles || normalizedPath !== rootFolder)
        // Prevent access to paths outside the workspace
        && (ACCESS.externalFiles || normalizedPath.startsWith(rootFolder))
        // Prevent access to special files and folders (e.g. .vscode) (excluding '..' because that is handled below) (also excluding ./ because that is just the current folder)
        && (ACCESS.dotFiles || !normalizedPath.match(/\/\.(?!\.?(\/|$))/))
        // Prevent access to parent folders
        && (ACCESS.externalFiles || !normalizedPath.match(/\/\.\.(\/|$)/))
        // Prevent access to home directory (probably doesn't work but just in case)
        && (ACCESS.externalFiles || !normalizedPath.includes('~'))
        // Prevent access to environment variables (probably doesn't work but just in case)
        && (ACCESS.environmentVariables || !normalizedPath.includes('$'))
        // Check against include pattern
        && includeRegExp.test(normalizedPath)
        // Check against exclude pattern
        && !excludeRegExp.test(normalizedPath);
}

export const delayAsync = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function escapeRegExp(string: string): string {
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Returns the string that would be inserted by the {@link String.replace} method.
 * @param match The match object returned by a regular expression.
 * @param replacement The replacement string, which can contain substitutions.
 * Supports JavaScript-style and .NET-style substitutions.
 * The substitutions `` $` ``, `$'` and `$_` are not supported.
 * @returns The substituted string.
 * @throws Error if the substitution is invalid or if the capture group does not exist.
 */
export function substituteMatch(match: RegExpExecArray, replacement: string): string {
    const rx = /\$<.+?>|\${.+?}|\$\d+|\$./g;
    const substitutions = Array.from(replacement.matchAll(rx));
    const literals = replacement.split(rx);
    let result = '';
    for (let i = 0; i < substitutions.length; i++) {
        // Append literal
        result += literals[i];
        // Append substitution
        if (substitutions[i][0] === '$&') {
            // Full match
            result += match[0];
        }
        else if (substitutions[i][0] === '$`' || substitutions[i][0] === '$\'' || substitutions[i][0] === '$_') {
            // Text before or after the match
            throw new Error('Substitution with text outside the match is not supported.');
        }
        else if (substitutions[i][0] === '$+') {
            // Last capture group
            if (match.length === 0)
                throw new Error('No capture groups in the match');
            result += match[match.length - 1];
        }
        else if (substitutions[i][0] === '$$') {
            // Escaped dollar sign
            result += '$';
        }
        else if (substitutions[i][0].startsWith('$<') || substitutions[i][0].startsWith('${')) {
            const name = substitutions[i][0].slice(2, -1);
            if (/^\d+$/.test(name)) {
                // Numbered group
                const index = parseInt(name);
                if (index >= match.length)
                    throw new Error(`Capture group ${index} does not exist in the match`);
                result += match[index];
            }
            else {
                // Named group
                const content = match.groups?.[name];
                if (content === undefined)
                    throw new Error(`Capture group "${name}" does not exist in the match`);
                result += content;
            }
        }
        else if (/^\$\d+$/.test(substitutions[i][0])) {
            // Numbered group
            const index = parseInt(substitutions[i][0].slice(1));
            if (index >= match.length)
                throw new Error(`Capture group ${index} does not exist in the match`);
            result += match[index];
        }
        else {
            // No substitution, just append the string
            result += substitutions[i][0];
        }
    }
    // Append remaining literal
    result += literals[literals.length - 1];
    return result;
}

/**
 * Searches for the longest fence (at least 3 backticks in a row) in the given text.
 * @param text The text to search for fences in.
 * @returns The length of the longest fence found in the text, or 0 if no fences were found.
 */
export function getMaxFenceLength(text: string): number {
    return text.match(/`{3,}/g)?.reduce((a, b) => Math.max(a, b.length), 0) ?? 0;
}

/**
 * Gets the minimum fence required to enclose the given text.
 * @param text The text to search for fences in.
 * @returns The minimum fence required to enclose the text.
 */
export function getFence(text: string): string {
    const maxFenceLength = getMaxFenceLength(text);
    return '`'.repeat(maxFenceLength ? maxFenceLength + 1 : 3);
}

/**
 * Places the virtual cursor at the specified position in the current text editor.
 * @param position The position to place the virtual cursor.
 * If set to `null`, the cursor is removed.
 * If not provided, the cursor is placed at the last known position,
 * but if no last known position is available, the cursor is not placed and an error is logged.
 */
export function setVirtualCursor(position?: vscode.Position | null) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (position === null || !getPermissionLevel(PERMISSIONS.editActiveDocument) || !isPathNeuroSafe(editor.document.fileName)) {
        removeVirtualCursor();
        return;
    }

    let offset = position !== undefined
        ? editor.document.offsetAt(position)
        : NEURO.cursorOffsets.get(editor.document.uri);

    if (offset === null) {
        // Some setting changed that made the file Neuro-safe
        offset = editor.document.offsetAt(editor.selection.active);
    }

    if (offset === undefined) {
        logOutput('ERROR', 'No last known position available');
        return;
    }

    NEURO.cursorOffsets.set(editor.document.uri, offset);
    const cursorPosition = editor.document.positionAt(offset);

    editor.setDecorations(NEURO.cursorDecorationType!, [
        {
            range: new vscode.Range(cursorPosition, cursorPosition.translate(0, 1)),
            hoverMessage: NEURO.currentController!,
        },
    ] satisfies vscode.DecorationOptions[]);

    if (CONFIG.cursorFollowsNeuro) {
        editor.selection = new vscode.Selection(cursorPosition, cursorPosition);
        editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    return;

    function removeVirtualCursor() {
        NEURO.cursorOffsets.set(editor!.document.uri, null);
        editor!.setDecorations(NEURO.cursorDecorationType!, []);
    }
}

/**
 * Gets the position of the virtual cursor in the current text editor.
 * @returns The position of the virtual cursor in the current text editor,
 * or `null` if the text editor is not Neuro-safe,
 * or `undefined` if the text editor does not exist or has no virtual cursor.
 */
export function getVirtualCursor(): vscode.Position | null | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;
    const result = NEURO.cursorOffsets.get(editor.document.uri);
    if (result === undefined) {
        // Virtual cursor should always be set by onDidChangeActiveTextEditor
        logOutput('ERROR', 'No last known position available');
        return undefined;
    }
    else if (result === null) {
        return null;
    }
    else {
        return editor.document.positionAt(result);
    }
}

export const enum DiffRangeType {
    Added,
    Modified,
    Removed,
}

export interface DiffRange {
    range: vscode.Range;
    type: DiffRangeType;
    removedText?: string;
}

/**
 * Calculates the difference between the original and modified text. The ranges are based on the modified text.
 * @param document The text document to calculate the difference for, used to calculate positions from offsets.
 * @param startPosition The position where the diff starts, used to calculate positions from offsets.
 * @param original The original text.
 * @param modified The modified text.
 */
export function getDiffRanges(document: vscode.TextDocument, startPosition: vscode.Position, original: string, modified: string): DiffRange[] {
    const tokenRegExp = /\w+|\s+|./g;
    const originalTokens = original.match(tokenRegExp) ?? [];
    const modifiedTokens = modified.match(tokenRegExp) ?? [];

    const difference = patienceDiff(originalTokens, modifiedTokens);

    const result: DiffRange[] = [];
    let currentType: DiffRangeType | undefined = undefined;
    let currentStartOffset = document.offsetAt(startPosition);
    let currentLength = 0;
    let currentRemovedText = '';

    for (const token of difference.lines) {
        // If the token is unchanged (token exists in both original and modified)
        if (token.aIndex !== -1 && token.bIndex !== -1) {
            // If this is the end of a change
            if (currentType !== undefined) {
                result.push({
                    range: new vscode.Range(document.positionAt(currentStartOffset), document.positionAt(currentStartOffset + currentLength)),
                    type: currentType,
                    removedText: currentRemovedText,
                });
                currentStartOffset += currentLength;
                currentLength = 0;
                currentType = undefined;
                currentRemovedText = '';
            }
            currentStartOffset += token.line.length;
            continue;
        }

        // If the token was removed (token exists in original but not in modified)
        if (token.bIndex === -1) { // token.aIndex !== -1
            // Added + Removed = Modified
            if (currentType === DiffRangeType.Added)
                currentType = DiffRangeType.Modified;
            else if (currentType === undefined)
                currentType = DiffRangeType.Removed;

            currentRemovedText += token.line;
            continue;
        }

        // If the token was added (token exists in modified but not in original)
        if (token.aIndex === -1) { // token.bIndex !== -1
            // Removed + Added = Modified
            if (currentType === DiffRangeType.Removed)
                currentType = DiffRangeType.Modified;
            else if (currentType === undefined)
                currentType = DiffRangeType.Added;

            currentLength += token.line.length;
            continue;
        }
    }

    // Add last change if it exists
    if (currentType !== undefined) {
        result.push({
            range: new vscode.Range(document.positionAt(currentStartOffset), document.positionAt(currentStartOffset + currentLength)),
            type: currentType,
            removedText: currentRemovedText,
        });
    }

    return result;
}

export function showDiffRanges(editor: vscode.TextEditor, ...ranges: DiffRange[]) {
    const addedRanges = ranges.filter(r => r.type === DiffRangeType.Added);
    const modifiedRanges = ranges.filter(r => r.type === DiffRangeType.Modified);
    const removedRanges = ranges.filter(r => r.type === DiffRangeType.Removed);

    const languageId = editor.document.languageId;
    const user = CONFIG.currentlyAsNeuroAPI;

    editor.setDecorations(NEURO.diffAddedDecorationType!, addedRanges.map(range => ({
        range: range.range,
        hoverMessage: `**Added by ${user}**`,
    } satisfies vscode.DecorationOptions)));

    editor.setDecorations(NEURO.diffModifiedDecorationType!, modifiedRanges.map(range => {
        const fence = getFence(range.removedText!);
        return {
            range: range.range,
            hoverMessage: range.removedText ? `**Modified by ${user}, original:**\n\n${fence}${languageId}\n${range.removedText}\n${fence}` : undefined,
        } satisfies vscode.DecorationOptions;
    }));

    editor.setDecorations(NEURO.diffRemovedDecorationType!, removedRanges.map(range => {
        const fence = getFence(range.removedText!);
        return {
            range: range.range,
            hoverMessage: range.removedText ? `**Removed by ${user}, original:**\n\n${fence}${languageId}\n${range.removedText}\n${fence}` : undefined,
        } satisfies vscode.DecorationOptions;
    }));
}

export function clearDecorations(editor: vscode.TextEditor) {
    showDiffRanges(editor);
    editor.setDecorations(NEURO.highlightDecorationType!, []);
}

/**
 * Checks workspace trust settings and returns an ActionValidationResult accordingly.
 */
export function checkWorkspaceTrust(_actionData: ActionData): ActionValidationResult {
    if (vscode.workspace.isTrusted) {
        return actionValidationAccept();
    }
    return actionValidationFailure('You are in an untrusted workspace.');
}

/**
 * Gets a property from an object using a dot-separated path.
 * @param obj The object to get the property from.
 * @param path The dot-separated path to the property. Pass an empty string to get the root object itself.
 * @returns The value of the property, or undefined if it doesn't exist.
 */
export function getProperty(obj: unknown, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    if (path === '')
        return current;

    for (const key of keys) {
        if (typeof current === 'object' && current !== null && key in current) {
            current = (current as Record<string, unknown>)[key];
        } else {
            return undefined;
        }
    }

    return current;
}

/**
 * Checks if the extension is currently on a virtual file system.
 */
export function checkVirtualWorkspace(_actionData: ActionData): ActionValidationResult {
    if (vscode.workspace.workspaceFolders?.every(f => f.uri.scheme !== 'file')) {
        return actionValidationFailure('You cannot perform this action in a virtual workspace.');
    }
    return actionValidationAccept();
}

/**
 * Checks if the Uint8Array buffer is plaintext or binary.
 */
export async function isBinary(input: Uint8Array): Promise<boolean> {
    return await fileTypeFromBuffer(input) ? true : false;
}

/**
 * Formats the context for sending to Neuro.
 * Assumes the cursor is at the end of `contextBefore` + `contextBetween` and at the start of `contextAfter`.
 * @param context The context to format.
 * @param overrideCursorStyle If provided, overrides the cursor style setting for this context.
 * @returns The formatted context.
 */
export function formatContext(context: NeuroPositionContext, overrideCursorStyle: CursorPositionContextStyle | undefined = undefined): string {
    const fence = getFence(context.contextBefore + context.contextAfter);
    const rawContextBefore = context.contextBefore;
    const rawContextAfter = context.contextAfter;
    const lineNumberContextFormat = CONFIG.lineNumberContextFormat;
    const lineNumberNote = lineNumberContextFormat.includes('{n}') ? 'Note that line numbers are not part of the source code. ' : '';

    let n = 1;
    let contextArray = [];
    for (const line of rawContextBefore.split(/\r?\n/)) {
        contextArray.push(lineNumberContextFormat.replace('{n}', n.toString()) + line);
        n++;
    }
    const contextBefore = contextArray.join('\n');
    contextArray = [];

    let first = true;
    for (const line of rawContextAfter.split(/\r?\n/)) {
        if (first) {
            contextArray.push(line);
            first = false;
            continue;
        }
        contextArray.push(lineNumberContextFormat.replace('{n}', n.toString()) + line);
        n++;
    }
    const contextAfter = contextArray.join('\n');

    const cursorStyle = overrideCursorStyle ?? CONFIG.cursorPositionContextStyle;

    const cursor = getVirtualCursor()!;
    const cursorText = ['inline', 'both'].includes(cursorStyle) && context.cursorDefined
        ? '<<<|>>>'
        : '';
    const cursorNote =
        cursorStyle === 'inline' ? 'Your cursor\'s position is denoted by `<<<|>>>`. '
        : cursorStyle === 'lineAndColumn' ? `Your cursor is at ${cursor.line + 1}:${cursor.character + 1}. `
        : cursorStyle === 'both' ? `Your cursor is at ${cursor.line + 1}:${cursor.character + 1}, denoted by \`<<<|>>>\`. `
        : '';

    return `File context for lines ${context.startLine + 1}-${context.endLine + 1} of ${context.totalLines}. ${cursorNote}${lineNumberNote}Content:\n\n${fence}\n${contextBefore}${cursorText}${contextAfter}\n${fence}`;
}
