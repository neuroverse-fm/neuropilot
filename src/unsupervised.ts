import * as vscode from 'vscode';

import { NEURO } from "./constants";

import { handleTerminateTask, handleRunTask } from './tasks';
import { handleCreateFile, handleCreateFolder, handleDeleteFileOrFolder, handleRenameFileOrFolder, handleGetFiles, handleOpenFile } from './file_actions';
import { handleGetCursor, handleDeleteText, handleInsertText, handlePlaceCursor, handlePlaceCursorAtText, handleReplaceText } from './editing';

/**
 * Register unsupervised actions with the Neuro API.
 * Will only register actions that the user has given permission to use.
 */

const neuroActionHandlers: { [key: string]: (actionData: any) => void } = {
    'get_files': handleGetFiles,
    'open_file': handleOpenFile,
    'place_cursor': handlePlaceCursor,
    'get_cursor': handleGetCursor,
    'insert_text': handleInsertText,
    'replace_text': handleReplaceText,
    'delete_text': handleDeleteText,
    'place_cursor_at_text': handlePlaceCursorAtText,
    'create_file': handleCreateFile,
    'create_folder': handleCreateFolder,
    'rename_file_or_folder': handleRenameFileOrFolder,
    'delete_file_or_folder': handleDeleteFileOrFolder,
    'run_task': handleRunTask, // This is a separate, unique handler, still need to find a new home for it
    'terminate_task': handleTerminateTask,
};

const actionKeys: string[] = Object.keys(neuroActionHandlers);

export function registerUnsupervisedActions() {
    // Unregister all actions first to properly refresh everything
    NEURO.client?.unregisterActions(actionKeys);

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
        if(actionKeys.includes(actionData.name)) {
            NEURO.actionHandled = true;
            neuroActionHandlers[actionData.name](actionData)
        }

        else if(NEURO.tasks.find(task => task.id === actionData.name)) {
            NEURO.actionHandled = true;
            handleRunTask(actionData);
        }
    });
}