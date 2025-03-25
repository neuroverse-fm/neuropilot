import * as vscode from 'vscode';
import { NEURO } from './constants';
import { GitExtension, Repository } from './types/git';

// Get the Git extension
const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
const git = gitExtension.getAPI(1);

export function handleGitInit(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.')
        return;
    }
}

export function handleNewGitBranch(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.')
        return;
    }
}

export function handleGitAdd(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const filePath = actionData.params?.filePath;
    const stageFiles = filePath ? filePath : "*"

    repo.add([vscode.Uri.file(stageFiles).fsPath]).then(() => {
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
