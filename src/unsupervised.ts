import * as vscode from 'vscode';

import { NEURO } from "./constants";
import { formatActionID, getPositionContext, logOutput } from './utils';

/**
 * Register unsupervised actions with the Neuro API.
 * Will only register actions that the user has given permission to use.
 */
export function registerUnsupervisedActions() {
    // Unregister all actions first
    NEURO.client?.unregisterActions([
        'get_files',
        'change_file',
        'find_in_workspace',
        'place_cursor',
        'get_cursor',
        'insert_text',
        'replace_text',
        'delete_text',
        'place_cursor_at_text',
        'change_file',
        'create_file',
        'create_folder',
        'rename_file',
        'rename_folder',
        'delete_file',
        'delete_folder',
        'terminate_task',
        ...NEURO.tasks.map(task => task.id) // Just in case
    ])

    /*
    if(vscode.workspace.getConfiguration('neuropilot').get('permissionToChangeFile', false)) {
        NEURO.client?.registerActions([
            {
                name: 'get_files',
                description: 'Get a list of files in the workspace',
            },
            {
                name: 'change_file',
                description: 'Change the current file',
            },
            {
                name: 'find_in_workspace',
                description: 'Search all files in the workspace for a specific string',
            }
        ]);
    }
    */
    if(vscode.workspace.getConfiguration('neuropilot').get('permissionToEditFile', false)) {
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
    /*
    if(vscode.workspace.getConfiguration('neuropilot').get('permissionToChangeFile', false)) {
        NEURO.client?.registerActions([
            {
                name: 'change_file',
                description: 'Open a file in the workspace',
            },
        ]);
    }
    if(vscode.workspace.getConfiguration('neuropilot').get('permissionToCreate', false)) {
        NEURO.client?.registerActions([
            {
                name: 'create_file',
                description: 'Create a new file',
            },
            {
                name: 'create_folder',
                description: 'Create a new folder',
            },
        ]);
    }
    if(vscode.workspace.getConfiguration('neuropilot').get('permissionToRename', false)) {
        NEURO.client?.registerActions([
            {
                name: 'rename_file',
                description: 'Rename a file',
            },
            {
                name: 'rename_folder',
                description: 'Rename a folder',
            },
        ]);
    }
    if(vscode.workspace.getConfiguration('neuropilot').get('permissionToDelete', false)) {
        NEURO.client?.registerActions([
            {
                name: 'delete_file',
                description: 'Delete a file',
            },
            {
                name: 'delete_folder',
                description: 'Delete a folder',
            },
        ]);
    }
    */
    if(vscode.workspace.getConfiguration('neuropilot').get('permissionToRunTasks', false)) {
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
        /*
        if(actionData.name === 'get_files') {
            
        }
        else if(actionData.name === 'change_file') {
            
        }
        else if(actionData.name === 'find_in_workspace') {
            
        }
        else*/ if(actionData.name === 'place_cursor') {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToEditFile', false)) {
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
        else if(actionData.name === 'get_cursor') {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToEditFile', false)) {
                logOutput('WARNING', 'Neuro attempted to get the cursor position, but permission is disabled');
                NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
                return;
            }

            const document = vscode.window.activeTextEditor?.document;
            if(document === undefined) {
                NEURO.client?.sendActionResult(actionData.id, true, 'No active document to get the cursor position from');
                return;
            }
            
            const cursorContext = getPositionContext(document, vscode.window.activeTextEditor!.selection.active);
            const line = vscode.window.activeTextEditor!.selection.active.line;
            const character = vscode.window.activeTextEditor!.selection.active.character;
            logOutput('INFO', `Sending cursor position to Neuro`);
            NEURO.client?.sendActionResult(actionData.id, true, `Cursor is at line ${line}, character ${character}\n\nContext before:\n\n\`\`\`\n${cursorContext.contextBefore}\n\`\`\`\n\nContext after:\n\n\`\`\`\n${cursorContext.contextAfter}\n\`\`\``);
        }
        else if(actionData.name === 'insert_text') {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToEditFile', false)) {
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

            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, vscode.window.activeTextEditor!.selection.active, text);
            vscode.workspace.applyEdit(edit).then(success => {
                if(success) {
                    logOutput('INFO', `Inserting text into document`);
                    NEURO.client?.sendActionResult(actionData.id, true);
                }
                else {
                    logOutput('ERROR', 'Failed to apply text insertion edit');
                    NEURO.client?.sendActionResult(actionData.id, true, 'Failed to insert text');
                }
            });
        }
        else if(actionData.name === 'replace_text') {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToEditFile', false)) {
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

            const oldStart = document.getText().indexOf(oldText);
            if(oldStart === -1) {
                NEURO.client?.sendActionResult(actionData.id, false, 'Old text not found in document');
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(document.positionAt(oldStart), document.positionAt(oldStart + oldText.length)), newText);
            vscode.workspace.applyEdit(edit).then(success => {
                if(success) {
                    logOutput('INFO', `Replacing text in document`);
                    NEURO.client?.sendActionResult(actionData.id, true);
                }
                else {
                    logOutput('ERROR', 'Failed to apply text replacement edit');
                    NEURO.client?.sendActionResult(actionData.id, true, 'Failed to replace text');
                }
            });
        }
        else if(actionData.name === 'delete_text') {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToEditFile', false)) {
                logOutput('WARNING', 'Neuro attempted to delete text, but permission is disabled');
                NEURO.client?.sendActionResult(actionData.id, true, 'You do not have edit permissions.');
                return;
            }

            const document = vscode.window.activeTextEditor?.document;
            if(document === undefined) {
                NEURO.client?.sendActionResult(actionData.id, true, 'No active document to delete text from');
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

            const edit = new vscode.WorkspaceEdit();
            edit.delete(document.uri, new vscode.Range(document.positionAt(textStart), document.positionAt(textStart + textToDelete.length)));
            vscode.workspace.applyEdit(edit).then(success => {
                if(success) {
                    logOutput('INFO', `Deleting text from document`);
                    NEURO.client?.sendActionResult(actionData.id, true);
                }
                else {
                    logOutput('ERROR', 'Failed to apply text deletion edit');
                    NEURO.client?.sendActionResult(actionData.id, true, 'Failed to delete text');
                }
            });
        }
        else if(actionData.name === 'place_cursor_at_text') {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToEditFile', false)) {
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
        /*else if(actionData.name === 'change_file') {

        }
        else if(actionData.name === 'create_file') {

        }
        else if(actionData.name === 'rename_file') {

        }
        else if(actionData.name === 'delete_file') {

        }*/
        else if(actionData.name === 'terminate_task') {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToRunTasks', false)) {
                logOutput('WARNING', 'Neuro attempted to terminate a task, but permission is disabled');
                NEURO.client?.sendActionResult(actionData.id, true, 'You do not have task permissions.');
                return;
            }

            if(NEURO.currentTaskExecution === null) {
                logOutput('INFO', 'No task currently running');
                NEURO.client?.sendActionResult(actionData.id, true, 'No task to terminate');
                return;
            }

            NEURO.currentTaskExecution?.terminate();
            logOutput('INFO', 'Terminated current task');
            NEURO.client?.sendActionResult(actionData.id, true, 'Terminated current task');
        }
        else if(NEURO.tasks.some(task => task.id === actionData.name)) {
            if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToRunTasks', false)) {
                logOutput('WARNING', 'Neuro attempted to terminate a task, but permission is disabled');
                NEURO.client?.sendActionResult(actionData.id, true, 'You do not have task permissions.');
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
                logOutput('ERROR', JSON.stringify(erm));
                NEURO.client?.sendActionResult(actionData.id, false, `Failed to execute task ${task.id}`);
                return;
            }
        }
    });
}

export function reloadTasks() {
    NEURO.client?.unregisterActions(NEURO.tasks.map((task) => task.id));

    NEURO.tasks = [];

    if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToRunTasks', false)) {
        return;
    }

    vscode.tasks.fetchTasks().then((tasks) => {
        for(const task of tasks) {
            // Only allow tasks whose details start with '[Neuro]'
            if(task.detail?.toLowerCase().startsWith('[neuro]')) {
                const detail = task.detail?.substring(7).trim();
                logOutput('INFO', `Found task: ${task.name}`);
                NEURO.tasks.push({
                    id: formatActionID(task.name),
                    description: detail.length > 0 ? detail : task.name,
                    task: task,
                });
            }
            else {
                logOutput('INFO', `Ignoring task: ${task.name}`);
                logOutput('DEBUG', `Task scope: ${task.scope}`);
            }
        }

        if(!vscode.workspace.getConfiguration('neuropilot').get('permissionToRunTasks', false)) {
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
            logOutput('INFO', 'Task finished');
            NEURO.client.sendContext('Task finished');
            NEURO.currentTaskExecution = null;
            vscode.commands.executeCommand('workbench.action.terminal.copyLastCommandOutput')
                .then(
                    ok => vscode.env.clipboard.readText()
                ).then(
                    text => NEURO.client?.sendContext(text)
                );
        }
    }
}
