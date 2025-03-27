import * as vscode from 'vscode';
import * as path from 'path';
import { NEURO } from './constants';
import { GitExtension } from './types/git';
import { getNormalizedRepoPathForGit } from './utils';

// Get the Git extension
const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
const git = gitExtension.getAPI(1);

// Helper function to retrieve and activate the Git API
async function getGitAPI() {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found. Ensure that the Git extension is installed.');
        return null;
    }
    await gitExtension.activate();
    const git = gitExtension.exports.getAPI(1);
    if (!git) {
        vscode.window.showErrorMessage('Unable to access Git API. It might not be available in this version.');
        return null;
    }
    return git;
}

export async function activate(context: vscode.ExtensionContext) {
    const git = await getGitAPI();
    if (!git) {
        return;
    }
    
    console.log('Git API loaded successfully:', git);
    
    // Iterate over repositories, normalizing the path for each.
    for (const repo of git.repositories) {
        const rawPath = repo.rootUri.fsPath;
        const normalizedPath = getNormalizedRepoPathForGit(rawPath);
        console.log(`Repository raw path: ${rawPath}`);
        console.log(`Normalized repository path: ${normalizedPath}`);
    }
}

export function handleNewGitRepo(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        NEURO.client?.sendActionResult(actionData.id, false, 'No workspace folder is open.');
        return;
    }

    const folderPath = workspaceFolders[0].uri.fsPath;

    git.init(vscode.Uri.file(folderPath)).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Initialized a new Git repository in the workspace folder: ${folderPath}.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to initialize Git repository: ${err}`);
    });
}

export function handleNewGitBranch(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const branchName: string = actionData.params?.branchName;
    if (!branchName) {
        NEURO.client?.sendActionResult(actionData.id, false, 'No branch name provided.');
        return;
    }

    repo.createBranch(branchName, true).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Created and switched to new branch: ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to create branch: ${err}`);
    });
}

export function handleGitAdd(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const filePath: string = actionData.params?.filePath;
    console.log(`Original filePath: ${filePath}`);

    // Normalize the file path if provided; otherwise, use wildcard.
    const stageFiles: string = filePath ? getNormalizedRepoPathForGit(filePath) : `*`;

    // Compute an absolute path. If the stageFiles is already absolute, use it.
    // Otherwise, join it with the repository's root path.
    let absolutePath: string;
    if (path.isAbsolute(stageFiles)) {
        absolutePath = stageFiles;
    } else {
        absolutePath = path.join(repo.rootUri.fsPath, stageFiles);
    }

    // Pass the absolute path to the Git add command.
    repo.add([absolutePath]).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Added ${stageFiles} to staging area.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Git add failed: ${err}`);
    });
}

export function handleGitCommit(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const message = `Neuro: ${actionData.params?.message}` || 'Neuro commit via VS Code API';

    repo.inputBox.value = message;
    repo.commit(message).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Committed with message: "${message}"`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Commit failed: ${err}`);
    });
}

// Define other Git operations similarly...
