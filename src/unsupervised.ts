import * as vscode from 'vscode';

import { NEURO } from "./constants";
import { combineGlobLines, formatActionID, getPositionContext, getWorkspacePath, isPathNeuroSafe, logOutput, normalizePath } from './utils';

const NEURO_ACTION_NAMES = [
    'get_files',
    'open_file',
    'place_cursor',
    'get_cursor',
    'insert_text',
    'replace_text',
    'delete_text',
    'place_cursor_at_text',
    'create_file',
    'create_folder',
    'rename_file_or_folder',
    'delete_file_or_folder',
    'terminate_task',
]

/**
 * Register unsupervised actions with the Neuro API.
 * Will only register actions that the user has given permission to use.
 */
export function registerUnsupervisedActions() {
    // Unregister all actions first
    NEURO.client?.unregisterActions([
        ...NEURO_ACTION_NAMES,
        ...NEURO.tasks.map(task => task.id) // Just in case
    ]);

    if(vscode.workspace.getConfiguration('neuropilot').get('permission.openFiles', false)) {
        NEURO.client?.registerActions([
            {
                name: 'get_files',
                description: 'Get a list of files in the workspace',
            },
            {
                name: 'open_file',
                description: 'Open a file in the workspace',
                schema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                    },
                    required: ['path'],
                }
            },
        ]);
    }
    if(vscode.workspace.getConfiguration('neuropilot').get('permission.editActiveDocument', false)) {
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
    if(vscode.workspace.getConfiguration('neuropilot').get('permission.create', false)) {
        NEURO.client?.registerActions([
            {
                name: 'create_file',
                description: 'Create a new file at the specified path. The path should include the name of the new file.',
                schema: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string' },
                    },
                    required: ['filePath'],
                }
            },
            {
                name: 'create_folder',
                description: 'Create a new folder at the specified path. The path should include the name of the new folder.',
                schema: {
                    type: 'object',
                    properties: {
                        folderPath: { type: 'string' },
                    },
                    required: ['folderPath'],
                }
            },
        ]);
    }
    if(vscode.workspace.getConfiguration('neuropilot').get('permission.rename', false)) {
        NEURO.client?.registerActions([
            {
                name: 'rename_file_or_folder',
                description: 'Rename a file or folder. Specify the full relative path for both the old and new names.',
                schema: {
                    type: 'object',
                    properties: {
                        oldPath: { type: 'string' },
                        newPath: { type: 'string' },
                    },
                    required: ['oldPath', 'newPath'],
                }
            },
        ]);
    }
    if(vscode.workspace.getConfiguration('neuropilot').get('permission.delete', false)) {
        NEURO.client?.registerActions([
            {
                name: 'delete_file_or_folder',
                description: 'Delete a file or folder. If you want to delete a folder, set the "recursive" parameter to true.',
                schema: {
                    type: 'object',
                    properties: {
                        pathToDelete: { type: 'string' },
                        recursive: { type: 'boolean' },
                    },
                    required: ['pathToDelete'],
                }
            },
        ]);
    }
    if(vscode.workspace.getConfiguration('neuropilot').get('permission.runTasks', false)) {
        NEURO.client?.registerActions([
            {
                name: 'terminate_task',
                description: 'Terminate the currently running task',
            },
        ]);
        // Tasks are registered asynchronously in reloadTasks()
    }
}

/**
 * Register unsupervised handlers for Neuro API actions.
 * The handlers will only handle actions that the user has given permission to use.
 */
export function registerUnsupervisedHandlers() {
    NEURO.client?.onAction((actionData) => {
        if(NEURO_ACTION_NAMES.includes(actionData.name)) {
            NEURO.actionHandled = true;
        }

        switch(actionData.name) {
            case 'get_files':
                handleGetFiles(actionData);
                break;
            case 'open_file':
                handleOpenFile(actionData);
                break;
            case 'place_cursor':
                handlePlaceCursor(actionData);
                break;
            case 'get_cursor':
                handleGetCursor(actionData);
                break;
            case 'insert_text':
                handleInsertText(actionData);
                break;
            case 'replace_text':
                handleReplaceText(actionData);
                break;
            case 'delete_text':
                handleDeleteText(actionData);
                break;
            case 'place_cursor_at_text':
                handlePlaceCursorAtText(actionData);
                break;
            case 'create_file':
                handleCreateFile(actionData);
                break;
            case 'create_folder':
                handleCreateFolder(actionData);
                break;
            case 'rename_file_or_folder':
                handleRenameFileOrFolder(actionData);
                break;
            case 'delete_file_or_folder':
                handleDeleteFileOrFolder(actionData);
                break;
            case 'terminate_task':
                handleTerminateTask(actionData);
                break;
            default:
                if(NEURO.tasks.some(task => task.id === actionData.name)) {
                    NEURO.actionHandled = true;
                    handleRunTask(actionData);
                }
                break;
        }
    });
}

export function reloadTasks() {
    NEURO.client?.unregisterActions(NEURO.tasks.map((task) => task.id));

    NEURO.tasks = [];

    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.runTasks', false)) {
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        for(const task of tasks) {
            // Only allow tasks whose details start with '[Neuro]'
            if(task.detail?.toLowerCase().startsWith('[neuro]')) {
                const detail = task.detail?.substring(7).trim();
                logOutput('INFO', `Adding Neuro task: ${task.name}`);
                NEURO.tasks.push({
                    id: formatActionID(task.name),
                    description: detail.length > 0 ? detail : task.name,
                    task: task,
                });
            }
            else {
                logOutput('INFO', `Ignoring task: ${task.name}`);
            }
        }

        if(!vscode.workspace.getConfiguration('neuropilot').get('permission.runTasks', false)) {
            return;
        }

        NEURO.client?.registerActions(NEURO.tasks.map((task) => {
            return {
                name: task.id,
                description: task.description,
            }
        }));
    });
}

export function taskEndedHandler(event: vscode.TaskEndEvent) {
    if(NEURO.connected && NEURO.client !== null && NEURO.currentTaskExecution !== null) {
        if(event.execution === NEURO.currentTaskExecution) {
            logOutput('INFO', 'Neuro task finished');
            NEURO.currentTaskExecution = null;
            vscode.commands.executeCommand('workbench.action.terminal.copyLastCommandOutput')
                .then(
                    _ => vscode.env.clipboard.readText()
                ).then(
                    text => NEURO.client?.sendContext(`Task finished! Output:\n\n\`\`\`${text}\n\`\`\``)
                );
        }
    }
}

function handleGetFiles(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.openFiles', false)) {
        logOutput('WARNING', 'Neuro attempted to get files, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have file open permissions.');
        return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if(workspaceFolder === undefined) {
        NEURO.client?.sendActionResult(actionData.id, true, 'No workspace open to get files from');
        return;
    }
    NEURO.client?.sendActionResult(actionData.id, true);

    const includePattern = combineGlobLines(vscode.workspace.getConfiguration('neuropilot').get('includePattern', '**'));
    const excludePattern = combineGlobLines(vscode.workspace.getConfiguration('neuropilot').get('excludePattern', ''));
    vscode.workspace.findFiles(includePattern, excludePattern).then(
        (uris) => {
            const paths = uris
                .filter(uri => isPathNeuroSafe(uri.fsPath, false))
                .map(uri => vscode.workspace.asRelativePath(uri))
                .sort((a, b) => {
                    const aParts = a.split('/');
                    const bParts = b.split('/');

                    for(let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
                        if(aParts[i] !== bParts[i]) {
                            if(aParts.length === i + 1) return -1;
                            if(bParts.length === i + 1) return 1;
                            return aParts[i].localeCompare(bParts[i]);
                        }
                    }
                    return aParts.length - bParts.length;
                });
            logOutput('INFO', `Sending list of files in workspace to Neuro`);
            NEURO.client?.sendContext(`Files in workspace:\n\n${paths.join('\n')}`);
        }
    )
}

function handleOpenFile(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.openFiles', false)) {
        logOutput('WARNING', 'Neuro attempted to open a file, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have file open permissions.');
        return;
    }

    const relativePath = actionData.params?.path;
    if(relativePath === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "fileName"');
        return;
    }

    const uri = vscode.Uri.file(getWorkspacePath() + '/' + normalizePath(relativePath));
    if(!isPathNeuroSafe(uri.fsPath)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to access this file');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);

    vscode.workspace.openTextDocument(uri).then(
        (document) => {
            vscode.window.showTextDocument(document);
            logOutput('INFO', `Opened file ${relativePath}`);
            NEURO.client?.sendContext(`Opened file ${relativePath}\n\nContent:\n\n\`\`\`${document.languageId}\n${document.getText()}\n\`\`\``);
        },
        (_) => {
            logOutput('ERROR', `Failed to open file ${relativePath}`);
            NEURO.client?.sendContext(`Failed to open file ${relativePath}`);
        }
    );
}

function handlePlaceCursor(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.editActiveDocument', false)) {
        logOutput('WARNING', 'Neuro attempted to place the cursor, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
        return;
    }

    const line = actionData.params?.line;
    const character = actionData.params?.character;

    if(line === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "line"');
        return;
    }
    if(character === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "character"');
        return;
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined) {
        NEURO.client?.sendActionResult(actionData.id, true, 'No active document to place the cursor in');
        return;
    }
    if(!isPathNeuroSafe(document.fileName)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to access this file');
        return;
    }
    if(line >= document.lineCount) {
        NEURO.client?.sendActionResult(actionData.id, false, `Line is out of bounds, the last line of the document is ${document.lineCount - 1}`);
        return;
    }
    if(character >= document.lineAt(line).text.length) {
        NEURO.client?.sendActionResult(actionData.id, false, `Character is out of bounds, the last character of the line is ${document.lineAt(line).text.length - 1}`);
        return;
    }

    vscode.window.activeTextEditor!.selection = new vscode.Selection(line, character, line, character);
    const cursorContext = getPositionContext(document, new vscode.Position(line, character));
    logOutput('INFO', `Placed cursor at line ${line}, character ${character}`);
    NEURO.client?.sendActionResult(actionData.id, true, `Cursor placed at line ${line}, character ${character}\n\nContext before:\n\n\`\`\`\n${cursorContext.contextBefore}\n\`\`\`\n\nContext after:\n\n\`\`\`\n${cursorContext.contextAfter}\n\`\`\``);
}

function handleGetCursor(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.editActiveDocument', false)) {
        logOutput('WARNING', 'Neuro attempted to get the cursor position, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
        return;
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined) {
        NEURO.client?.sendActionResult(actionData.id, true, 'No active document to get the cursor position from');
        return;
    }
    if(!isPathNeuroSafe(document.fileName)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to access this file');
        return;
    }
    
    const cursorContext = getPositionContext(document, vscode.window.activeTextEditor!.selection.active);
    const line = vscode.window.activeTextEditor!.selection.active.line;
    const character = vscode.window.activeTextEditor!.selection.active.character;
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    logOutput('INFO', `Sending cursor position to Neuro`);
    NEURO.client?.sendActionResult(actionData.id, true, `In file ${relativePath}\n\nCursor is at line ${line}, character ${character}\n\nContext before:\n\n\`\`\`\n${cursorContext.contextBefore}\n\`\`\`\n\nContext after:\n\n\`\`\`\n${cursorContext.contextAfter}\n\`\`\``);
}

function handleInsertText(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.editActiveDocument', false)) {
        logOutput('WARNING', 'Neuro attempted to insert text, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
        return;
    }

    const text = actionData.params?.text;
    if(text === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "text"');
        return;
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined) {
        NEURO.client?.sendActionResult(actionData.id, true, 'No active document to insert text into');
        return;
    }
    if(!isPathNeuroSafe(document.fileName)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to access this file');
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, vscode.window.activeTextEditor!.selection.active, text);

    NEURO.client?.sendActionResult(actionData.id, true);
    vscode.workspace.applyEdit(edit).then(success => {
        if(success) {
            logOutput('INFO', `Inserting text into document`);
        }
        else {
            logOutput('ERROR', 'Failed to apply text insertion edit');
            NEURO.client?.sendContext('Failed to insert text');
        }
    });
}

function handleReplaceText(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.editActiveDocument', false)) {
        logOutput('WARNING', 'Neuro attempted to replace text, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
        return;
    }

    const oldText = actionData.params?.oldText;
    const newText = actionData.params?.newText;
    if(oldText === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "oldText"');
        return;
    }
    if(newText === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "newText"');
        return;
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined) {
        NEURO.client?.sendActionResult(actionData.id, true, 'No active document to replace text in');
        return;
    }
    if(!isPathNeuroSafe(document.fileName)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to access this file');
        return;
    }

    const oldStart = document.getText().indexOf(oldText);
    if(oldStart === -1) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Old text not found in document');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);

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
}

function handleDeleteText(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.editActiveDocument', false)) {
        logOutput('WARNING', 'Neuro attempted to delete text, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
        return;
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined) {
        NEURO.client?.sendActionResult(actionData.id, true, 'No active document to delete text from');
        return;
    }
    if(!isPathNeuroSafe(document.fileName)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to access this file');
        return;
    }

    const textToDelete = actionData.params?.textToDelete;
    if(textToDelete === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "textToDelete"');
        return;
    }

    const textStart = document.getText().indexOf(textToDelete);
    if(textStart === -1) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Text to delete not found in document');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);

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
}

function handlePlaceCursorAtText(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.editActiveDocument', false)) {
        logOutput('WARNING', 'Neuro attempted to place the cursor at text, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
        return;
    }

    const text = actionData.params?.text;
    const position = actionData.params?.position;
    if(text === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "text"');
        return;
    }
    if(position === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "position"');
        return;
    }
    if(position !== 'before' && position !== 'after') {
        NEURO.client?.sendActionResult(actionData.id, false, 'Invalid value for parameter "position" (must be one of ["before", "after"])');
        return;
    }

    const document = vscode.window.activeTextEditor?.document;
    if(document === undefined) {
        NEURO.client?.sendActionResult(actionData.id, true, 'No active document to place the cursor in');
        return;
    }
    if(!isPathNeuroSafe(document.fileName)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to access this file');
        return;
    }

    const textStart = document.getText().indexOf(text);
    if(textStart === -1) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Text not found in document');
        return;
    }

    let pos = position === 'before' ? textStart : textStart + text.length;
    const line = document.positionAt(pos).line;
    const character = document.positionAt(pos).character;

    vscode.window.activeTextEditor!.selection = new vscode.Selection(line, character, line, character);
    const cursorContext = getPositionContext(document, new vscode.Position(line, character));
    logOutput('INFO', `Placed cursor at text ${position} the first occurrence`);
    NEURO.client?.sendActionResult(actionData.id, true, `Cursor placed at text ${position} the first occurrence (line ${line}, character ${character})\n\nContext before:\n\n\`\`\`\n${cursorContext.contextBefore}\n\`\`\`\n\nContext after:\n\n\`\`\`\n${cursorContext.contextAfter}\n\`\`\``);
}

function handleCreateFile(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.create', false)) {
        logOutput('WARNING', 'Neuro attempted to create a file, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have file creation permissions.');
        return;
    }

    const relativePathParam = actionData.params?.filePath;
    if(relativePathParam === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "filePath"');
        return;
    }

    const relativePath = normalizePath(relativePathParam).replace(/^\//, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if(!isPathNeuroSafe(absolutePath)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to create a file at this location');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);

    checkAndOpenFileAsync(absolutePath, relativePath);
    return;

    // Function to avoid pyramid of doom
    async function checkAndOpenFileAsync(absolutePath: string, relativePath: string) {
        const fileUri = vscode.Uri.file(absolutePath);

        // Check if the file already exists
        try {
            await vscode.workspace.fs.stat(fileUri);
            // If no error is thrown, the file already exists
            NEURO.client?.sendContext(`Could not create file: File ${relativePath} already exists`);
            return;
        } catch { } // File does not exist, continue

        // Create the file
        try {
            await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(0));
        } catch {
            logOutput('ERROR', `Failed to create file ${relativePath}`);
            NEURO.client?.sendContext(`Failed to create file ${relativePath}`);
            return;
        }

        logOutput('INFO', `Created file ${relativePath}`);
        NEURO.client?.sendContext(`Created file ${relativePath}`);

        // Open the file if Neuro has permission to do so
        if(!vscode.workspace.getConfiguration('neuropilot').get('permission.openFiles', false))
            return;

        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(document);
            const cursor = editor.selection.active;
            NEURO.client?.sendContext(`Opened file ${relativePath}\n\nContent:\n\n\`\`\`${document.languageId}\n${document.getText()}\n\`\`\`\n\nCursor at (${cursor.line}:${cursor.character})`);
        } catch {
            logOutput('ERROR', `Failed to open file ${relativePath}`);
            NEURO.client?.sendContext(`Failed to open file ${relativePath}`);
        }
    }
    // vscode.workspace.fs.stat(vscode.Uri.file(getWorkspacePath() + '/' + normalizePath(filePath))).then(
    //     (_) => {
    //         NEURO.client?.sendContext(`Could not create file: File ${filePath} already exists`);
    //     },
    //     (_erm) => {
    //         vscode.workspace.fs.writeFile(vscode.Uri.file(normalizedPath), new Uint8Array(0)).then(
    //             (_) => {
    //                 logOutput('INFO', `Created file ${filePath}`);
    //                 NEURO.client?.sendContext(`Created file ${filePath}`);

    //                 if(vscode.workspace.getConfiguration('neuropilot').get('permission.openFiles', false)) {
    //                     vscode.workspace.openTextDocument(vscode.Uri.file(getWorkspacePath() + '/' + normalizePath(filePath))).then(
    //                         (document) => {
    //                             vscode.window.showTextDocument(document).then((_) => {
    //                                 logOutput('INFO', `Opened file ${filePath}`);
    //                                 const cursor = vscode.window.activeTextEditor!.selection
    //                                 NEURO.client?.sendContext(`Opened file ${filePath}\n\nContent:\n\n\`\`\`${document.languageId}\n${document.getText()}\n\`\`\``);
    //                             })
    //                         }
    //                     );
    //                 }
    //             },
    //             (_erm) => {
    //                 logOutput('ERROR', `Failed to create file ${filePath}`);
    //                 NEURO.client?.sendContext(`Failed to create file ${filePath}`);
    //             }
    //         );
    //     }
    // );
}

function handleCreateFolder(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.create', false)) {
        logOutput('WARNING', 'Neuro attempted to create a folder, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have folder creation permissions.');
        return;
    }

    const relativePathParam = actionData.params?.folderPath;
    if(relativePathParam === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "folderPath"');
        return;
    }

    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if(!isPathNeuroSafe(absolutePath)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to create a folder at this location');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);
    checkAndCreateFolderAsync(absolutePath, relativePath);
    return;

    // Function to avoid pyramid of doom
    async function checkAndCreateFolderAsync(absolutePath: string, relativePath: string) {
        const folderUri = vscode.Uri.file(absolutePath);

        // Check if the folder already exists
        try {
            await vscode.workspace.fs.stat(folderUri);
            // If no error is thrown, the folder already exists
            NEURO.client?.sendContext(`Could not create folder: Folder ${relativePath} already exists`);
            return;
        } catch { } // Folder does not exist, continue

        // Create the folder
        try {
            await vscode.workspace.fs.createDirectory(folderUri);
        } catch {
            logOutput('ERROR', `Failed to create folder ${relativePath}`);
            NEURO.client?.sendContext(`Failed to create folder ${relativePath}`);
            return;
        }

        logOutput('INFO', `Created folder ${relativePath}`);
        NEURO.client?.sendContext(`Created folder ${relativePath}`);
    }
}

function handleRenameFileOrFolder(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.rename', false)) {
        logOutput('WARNING', 'Neuro attempted to rename a file or folder, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have rename permissions.');
        return;
    }

    const oldRelativePathParam = actionData.params?.oldPath;
    const newRelativePathParam = actionData.params?.newPath;
    if(oldRelativePathParam === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "oldPath"');
        return;
    }
    if(newRelativePathParam === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "newPath"');
        return;
    }

    const oldRelativePath = normalizePath(oldRelativePathParam).replace(/^\/|\/$/g, '');
    const newRelativePath = normalizePath(newRelativePathParam).replace(/^\/|\/$/g, '');
    const oldAbsolutePath = getWorkspacePath() + '/' + oldRelativePath;
    const newAbsolutePath = getWorkspacePath() + '/' + newRelativePath;
    if(!isPathNeuroSafe(oldAbsolutePath)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to rename this element');
        return;
    }
    if(!isPathNeuroSafe(newAbsolutePath)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to rename the element to this name');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);

    checkAndRenameAsync(oldAbsolutePath, oldRelativePath, newAbsolutePath, newRelativePath);
    return;

    // Function to avoid pyramid of doom
    async function checkAndRenameAsync(oldAbsolutePath: string, oldRelativePath: string, newAbsolutePath: string, newRelativePath: string) {
        const oldUri = vscode.Uri.file(oldAbsolutePath);
        const newUri = vscode.Uri.file(newAbsolutePath);

        // Check if the new path already exists
        try {
            await vscode.workspace.fs.stat(newUri);
            // If no error is thrown, the new path already exists
            NEURO.client?.sendContext(`Could not rename: ${newRelativePath} already exists`);
            return;
        } catch { } // New path does not exist, continue

        // Rename the file/folder
        try {
            await vscode.workspace.fs.rename(oldUri, newUri);
        } catch {
            logOutput('ERROR', `Failed to rename ${oldRelativePath} to ${newRelativePath}`);
            NEURO.client?.sendContext(`Failed to rename ${oldRelativePath} to ${newRelativePath}`);
            return;
        }

        logOutput('INFO', `Renamed ${oldRelativePath} to ${newRelativePath}`);
        NEURO.client?.sendContext(`Renamed ${oldRelativePath} to ${newRelativePath}`);
    }
}

function handleDeleteFileOrFolder(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.delete', false)) {
        logOutput('WARNING', 'Neuro attempted to delete a file or folder, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have delete permissions.');
        return;
    }

    const relativePathParam = actionData.params?.pathToDelete;
    const recursive = actionData.params?.recursive ?? false;
    if(relativePathParam === undefined) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "pathToDelete"');
        return;
    }

    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if(!isPathNeuroSafe(absolutePath)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to delete this element');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);

    checkAndDeleteAsync(absolutePath, relativePath, recursive);
    return;

    // Function to avoid pyramid of doom
    async function checkAndDeleteAsync(absolutePath: string, relativePath: string, recursive: boolean) {
        const uri = vscode.Uri.file(absolutePath);
        let stat: vscode.FileStat;

        // Check if the path exists
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch {
            NEURO.client?.sendContext(`Could not delete: ${relativePath} does not exist`);
            return;
        }

        // Check for correct recursive parameter
        if(stat.type === vscode.FileType.Directory && !recursive) {
            NEURO.client?.sendContext(`Could not delete: ${relativePath} is a directory cannot be deleted without the "recursive" parameter`);
            return;
        }

        // Delete the file/folder
        try {
            await vscode.workspace.fs.delete(uri, { recursive: recursive, useTrash: true });
        } catch {
            logOutput('ERROR', `Failed to delete ${relativePath}`);
            NEURO.client?.sendContext(`Failed to delete ${relativePath}`);
            return;
        }

        logOutput('INFO', `Deleted ${relativePath}`);
        NEURO.client?.sendContext(`Deleted ${relativePath}`);
    }
}

function handleTerminateTask(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.runTasks', false)) {
        logOutput('WARNING', 'Neuro attempted to terminate a task, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have task permissions.');
        return;
    }

    if(NEURO.currentTaskExecution === null) {
        logOutput('INFO', 'No task currently running');
        NEURO.client?.sendActionResult(actionData.id, true, 'No task to terminate');
        return;
    }

    const exe = NEURO.currentTaskExecution;
    NEURO.currentTaskExecution = null;
    exe.terminate();
    logOutput('INFO', 'Terminated current task');
    NEURO.client?.sendActionResult(actionData.id, true, 'Terminated current task');
}

function handleRunTask(actionData: any) {
    if(!vscode.workspace.getConfiguration('neuropilot').get('permission.runTasks', false)) {
        logOutput('WARNING', 'Neuro attempted to terminate a task, but permission is disabled');
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have task permissions.');
        return;
    }

    if(NEURO.currentTaskExecution !== null) {
        logOutput('INFO', 'A task is already running');
        NEURO.client?.sendActionResult(actionData.id, true, 'A task is already running');
        return;
    }

    const task = NEURO.tasks.find(task => task.id === actionData.name);
    if(task === undefined) {
        logOutput('ERROR', `Task ${actionData.name} not found`);
        NEURO.client?.sendActionResult(actionData.id, false, `Task ${actionData.name} not found`);
        return;
    }

    try {
        vscode.tasks.executeTask(task.task).then(value => {
            logOutput('INFO', `Executing task ${task.id}`);
            NEURO.currentTaskExecution = value;
        });
        NEURO.client?.sendActionResult(actionData.id, true, `Executing task ${task.id}`);
    } catch(erm) {
        logOutput('ERROR', `Failed to execute task ${task.id}`);
        logOutput('DEBUG', JSON.stringify(erm));
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to execute task ${task.id}`);
        return;
    }
}
