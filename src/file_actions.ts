import * as vscode from 'vscode';

import { NEURO } from './constants';
import { combineGlobLines, filterFileContents, getFence, getWorkspacePath, isPathNeuroSafe, logOutput, normalizePath } from './utils';
import { ActionData, ActionResult, actionResultAccept, actionResultFailure, actionResultMissingParameter, actionResultNoAccess, actionResultNoPermission } from './neuro_client_helper';
import { CONFIG, PERMISSIONS, getPermissionLevel } from './config';

export const fileActionHandlers: Record<string, (actionData: ActionData) => ActionResult> = {
    'get_files': handleGetFiles,
    'open_file': handleOpenFile,
    'create_file': handleCreateFile,
    'create_folder': handleCreateFolder,
    'rename_file_or_folder': handleRenameFileOrFolder,
    'delete_file_or_folder': handleDeleteFileOrFolder,
};

export function registerFileActions() {
    if(getPermissionLevel(PERMISSIONS.openFiles)) {
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
                },
            },
        ]);
    }

    if(getPermissionLevel(PERMISSIONS.create)) {
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
                },
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
                },
            },
        ]);
    }

    if(getPermissionLevel(PERMISSIONS.rename)) {
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
                },
            },
        ]);
    }

    if(getPermissionLevel(PERMISSIONS.delete)) {
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
                },
            },
        ]);
    }
}

export function handleCreateFile(actionData: ActionData): ActionResult {
    if(!getPermissionLevel(PERMISSIONS.create))
        return actionResultNoPermission(PERMISSIONS.create);

    const relativePathParam = actionData.params?.filePath;
    if(relativePathParam === undefined)
        return actionResultMissingParameter('filePath');

    const relativePath = normalizePath(relativePathParam).replace(/^\//, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if(!isPathNeuroSafe(absolutePath))
        return actionResultNoAccess(absolutePath);

    checkAndOpenFileAsync(absolutePath, relativePath);

    return actionResultAccept();

    // Function to avoid pyramid of doom
    async function checkAndOpenFileAsync(absolutePath: string, relativePath: string) {
        const fileUri = vscode.Uri.file(absolutePath);

        // Check if the file already exists
        try {
            await vscode.workspace.fs.stat(fileUri);
            // If no error is thrown, the file already exists
            NEURO.client?.sendContext(`Could not create file: File ${relativePath} already exists`);
            return;
        } catch { /* File does not exist, continue */ }

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
        if(!getPermissionLevel(PERMISSIONS.openFiles))
            return;

        try {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
            NEURO.client?.sendContext(`Opened new file ${relativePath}`);
        } catch {
            logOutput('ERROR', `Failed to open new file ${relativePath}`);
            NEURO.client?.sendContext(`Failed to open new file ${relativePath}`);
        }
    }
}

export function handleCreateFolder(actionData: ActionData): ActionResult {
    if(!getPermissionLevel(PERMISSIONS.create))
        return actionResultNoPermission(PERMISSIONS.create);

    const relativePathParam = actionData.params?.folderPath;
    if(relativePathParam === undefined)
        return actionResultMissingParameter('folderPath');

    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if(!isPathNeuroSafe(absolutePath))
        return actionResultNoAccess(absolutePath);

    checkAndCreateFolderAsync(absolutePath, relativePath);

    return actionResultAccept();

    // Function to avoid pyramid of doom
    async function checkAndCreateFolderAsync(absolutePath: string, relativePath: string) {
        const folderUri = vscode.Uri.file(absolutePath);

        // Check if the folder already exists
        try {
            await vscode.workspace.fs.stat(folderUri);
            // If no error is thrown, the folder already exists
            NEURO.client?.sendContext(`Could not create folder: Folder ${relativePath} already exists`);
            return;
        } catch { /* Folder does not exist, continue */ }

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

export function handleRenameFileOrFolder(actionData: ActionData): ActionResult {
    if(!getPermissionLevel(PERMISSIONS.rename))
        return actionResultNoPermission(PERMISSIONS.rename);

    const oldRelativePathParam = actionData.params?.oldPath;
    const newRelativePathParam = actionData.params?.newPath;
    if(oldRelativePathParam === undefined)
        return actionResultMissingParameter('oldPath');
    if(newRelativePathParam === undefined)
        return actionResultMissingParameter('newPath');

    const oldRelativePath = normalizePath(oldRelativePathParam).replace(/^\/|\/$/g, '');
    const newRelativePath = normalizePath(newRelativePathParam).replace(/^\/|\/$/g, '');
    const oldAbsolutePath = getWorkspacePath() + '/' + oldRelativePath;
    const newAbsolutePath = getWorkspacePath() + '/' + newRelativePath;
    if(!isPathNeuroSafe(oldAbsolutePath))
        return actionResultNoAccess(oldAbsolutePath);
    if(!isPathNeuroSafe(newAbsolutePath))
        return actionResultNoAccess(newAbsolutePath);

    checkAndRenameAsync(oldAbsolutePath, oldRelativePath, newAbsolutePath, newRelativePath);

    return actionResultAccept();

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
        } catch { /* New path does not exist, continue */ }

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

export function handleDeleteFileOrFolder(actionData: ActionData): ActionResult {
    if(!getPermissionLevel(PERMISSIONS.delete))
        return actionResultNoPermission(PERMISSIONS.delete);

    const relativePathParam = actionData.params?.pathToDelete;
    const recursive = actionData.params?.recursive ?? false;
    if(relativePathParam === undefined)
        return actionResultMissingParameter('pathToDelete');

    const relativePath = normalizePath(relativePathParam).replace(/^\/|\/$/g, '');
    const absolutePath = getWorkspacePath() + '/' + relativePath;
    if(!isPathNeuroSafe(absolutePath))
        return actionResultNoAccess(absolutePath);

    checkAndDeleteAsync(absolutePath, relativePath, recursive);

    return actionResultAccept();

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

export function handleGetFiles(_actionData: ActionData): ActionResult {
    if(!getPermissionLevel(PERMISSIONS.openFiles))
        return actionResultNoPermission(PERMISSIONS.openFiles);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if(workspaceFolder === undefined)
        return actionResultFailure('No open workspace to get files from.');

    const includePattern = combineGlobLines(CONFIG.includePattern || '**');
    const excludePattern = combineGlobLines(CONFIG.excludePattern || '');
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
            logOutput('INFO', 'Sending list of files in workspace to Neuro');
            NEURO.client?.sendContext(`Files in workspace:\n\n${paths.join('\n')}`);
        },
    );

    return actionResultAccept();
}

export function handleOpenFile(actionData: ActionData): ActionResult {
    if(!getPermissionLevel(PERMISSIONS.openFiles))
        return actionResultNoPermission(PERMISSIONS.openFiles);

    const relativePath = actionData.params?.path;
    if(relativePath === undefined)
        return actionResultMissingParameter('path');

    const uri = vscode.Uri.file(getWorkspacePath() + '/' + normalizePath(relativePath));
    if(!isPathNeuroSafe(uri.fsPath))
        return actionResultNoAccess(uri.fsPath);

    vscode.workspace.openTextDocument(uri).then(
        (document) => {
            vscode.window.showTextDocument(document);
            logOutput('INFO', `Opened file ${relativePath}`);
            const cursorOffset = document.offsetAt(vscode.window.activeTextEditor!.selection.active);
            let text = document.getText();
            text = text.slice(0, cursorOffset) + '<<<|>>>' + text.slice(cursorOffset);
            const fence = getFence(text);
            NEURO.client?.sendContext(`Opened file ${relativePath}\n\nContent (cursor position denoted by \`<<<|>>>\`):\n\n${fence}${document.languageId}\n${filterFileContents(text)}\n${fence}`);
        },
        (_erm) => {
            logOutput('ERROR', `Failed to open file ${relativePath}`);
            NEURO.client?.sendContext(`Failed to open file ${relativePath}`);
        },
    );

    return actionResultAccept();
}
