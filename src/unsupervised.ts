import * as vscode from 'vscode';

import { NEURO } from "./constants";
import { logOutput } from './utils';
import {
handleGitStatus,
handleGitAdd,
handleGitRevert,
handleGitCommit,
handleNewGitBranch,
handleDeleteGitBranch,
handleSwitchGitBranch,
handleNewGitRepo,
handleSetGitConfig,
handleGetGitConfig,
handleAddGitRemote,
handleRenameGitRemote,
handleRemoveGitRemote,
handleFetchGitCommits,
handlePullGitCommits,
handlePushGitCommits,
} from './git';

import { handleTerminateTask, handleRunTask } from './tasks';
import { handleCreateFile, handleCreateFolder, handleDeleteFileOrFolder, handleRenameFileOrFolder, handleGetFiles, handleOpenFile } from './file_actions';
import { handleGetCursor, handleDeleteText, handleInsertText, handlePlaceCursor, handlePlaceCursorAtText, handleReplaceText } from './editing';

/**
 * Register unsupervised actions with the Neuro API.
 * Will only register actions that the user has given permission to use.
 */
export function registerUnsupervisedActions() {
    // Unregister all actions first
    NEURO.client?.unregisterActions([
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
        'init_git_repo',
        'new_git_branch',
        'add_file_to_git',
        'make_git_commit',
        'set_git_config',
        'get_git_config',
        'add_git_remote',
        'rename_git_remote',
        'remove_git_remote',
        'fetch_git_commits',
        'pull_git_commits',
        'push_git_commits',
        'delete_git_branch',
        'switch_git_branch',
        'git_status',
        ...NEURO.tasks.map(task => task.id) // Just in case
    ]);

    if(vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.registerActions([
            {
                name: 'new_git_branch',
                description: 'Create a new branch in the current Git repository',
                schema: {
                    type: 'object',
                    properties: {
                        branchName: { type: 'string' },
                    },
                    required: ['branchName'],
                }
            },
            {
                name: 'add_file_to_git',
                description: 'Add a file to the staging area',
                schema: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string' },
                    },
                    required: ['filePath']
                }
            },
            {
                name: 'make_git_commit',
                description: 'Commit staged changes with a message',
                schema: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                    },
                    required: ['message']
                }
            },
            {
                name: 'git_status',
                description: 'Get the current status of the Git repository',
                schema: {}
            },
            {
                name: 'git_remove',
                description: 'Remove a file from the Git index',
                schema: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string' },
                    },
                    required: ['filePath']
                }
            },
            {
                name: 'git_revert',
                description: 'Revert changes to a file in the Git repository',
                schema: {
                    type: 'object',
                    properties: {
                        filePath: { type: 'string' },
                    },
                    required: ['filePath']
                }
            },
            {
                name: 'delete_git_branch',
                description: 'Delete a branch in the current Git repository',
                schema: {
                    type: 'object',
                    properties: {
                        branchName: { type: 'string' },
                    },
                    required: ['branchName']
                }
            },
            {
                name: 'switch_git_branch',
                description: 'Switch to a different branch in the current Git repository',
                schema: {
                    type: 'object',
                    properties: {
                        branchName: { type: 'string' },
                    },
                    required: ['branchName']
                }
            }
        ]);

        if(vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfigs', false)) {
            NEURO.client?.registerActions([
                {
                    name: 'init_git_repo',
                    description: 'Initialize a new Git repository in the current workspace folder',
                    schema: {}
                },
                {
                    name: 'set_git_config',
                    description: 'Set a Git configuration value',
                    schema: {
                        type: 'object',
                        properties: {
                            key: { type: 'string' },
                            value: { type: 'string' },
                        },
                        required: ['key', 'value'],
                    }
                },
                {
                    name: 'get_git_config',
                    description: 'Get a Git configuration value',
                    schema: {
                        type: 'object',
                        properties: {
                            key: { type: 'string' },
                        },
                        required: ['key'],
                    }
                },
            ]);
        }

        if(vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false)) {
            NEURO.client?.registerActions([
                {
                    name: 'add_git_remote',
                    description: 'Add a new remote to the Git repository',
                    schema: {
                        type: 'object',
                        properties: {
                            remoteName: { type: 'string' },
                            remoteURL: { type: 'string' },
                        },
                        required: ['remoteName', 'remoteURL'],
                    }
                },
                {
                    name: 'remove_git_remote',
                    description: 'Remove a remote from the Git repository',
                    schema: {
                        type: 'object',
                        properties: {
                            remoteName: { type: 'string' },
                        },
                        required: ['remoteName'],
                    }
                },
                {
                    name: 'get_git_remotes',
                    description: 'Get a list of remotes in the Git repository',
                    schema: {}
                },
                {
                    name: 'pull_git_commits',
                    description: 'Pull commits from the remote repository',
                    schema: {}
                },
                {
                    name: 'push_git_commits',
                    description: 'Push commits to the remote repository',
                    schema: {
                        type: 'object',
                        properties: {
                            remoteName: { type: 'string' },
                            branchName: { type: 'string' },
                            forcePush: { type: 'boolean' },
                        },
                        required: ['remoteName', 'branchName']
                    }
                }
            ]);
        }
    }

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
            case 'init_git_repo':
                handleNewGitRepo(actionData);
                break;
            case 'new_git_branch':
                handleNewGitBranch(actionData);
                break;
            case 'add_file_to_git':
                handleGitAdd(actionData);
                break;
            case 'make_git_commit':
                handleGitCommit(actionData);
                break;
            case 'set_git_config':
                handleSetGitConfig(actionData);
                break;
            case 'get_git_config':
                handleGetGitConfig(actionData);
                break;
            case 'add_git_remote':
                handleAddGitRemote(actionData);
                break;
            case 'rename_git_remote':
                handleRenameGitRemote(actionData);
                break;
            case 'remove_git_remote':
                handleRemoveGitRemote(actionData);
                break;
            case 'fetch_git_commits':
                handleFetchGitCommits(actionData);
                break;
            case 'pull_git_commits':
                handlePullGitCommits(actionData);
                break;
            case 'push_git_commits':
                handlePushGitCommits(actionData);
                break;
            case 'delete_git_branch':
                handleDeleteGitBranch(actionData);
                break;
            case 'switch_git_branch':
                handleSwitchGitBranch(actionData);
                break;
            case 'git_status':
                handleGitStatus(actionData);
                break;
            default:
                if(NEURO.tasks.some(task => task.id === actionData.name))
                    handleRunTask(actionData);
                else
                    logOutput('ERROR', `Unknown action: ${actionData.name}`);
                break;
        }
    });
}
