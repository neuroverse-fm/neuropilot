import * as vscode from 'vscode';
import * as path from 'path';
import { NEURO } from './constants';
import { GitExtension } from './types/git';
import { getNormalizedRepoPathForGit } from './utils';

/* All actions located in here requires neuropilot.permission.gitOperations to be enabled. */

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

/**
 * Actions with the Git repo
 * Requires neuropilot.permission.gitConfig to be enabled.
 */

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

export function handleGetGitConfig(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const configKey: string = actionData.params?.configKey;

    if (!configKey) {
        repo.getConfigs().then((configs: any) => {
            NEURO.client?.sendActionResult(actionData.id, true, `Git config: ${JSON.stringify(configs)}`);
            return;
        });
    }
    else {
        repo.getConfig(configKey).then((configValue: any) => {
            NEURO.client?.sendActionResult(actionData.id, true, `Git config key "${configKey}": ${configValue}`);
        }, (err: string) => {
            NEURO.client?.sendActionResult(actionData.id, false, `Failed to get Git config key "${configKey}": ${err}`);
        });
    }
}

export function handleSetGitConfig(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const configKey: string = actionData.params?.configKey;
    const configValue: string = actionData.params?.configValue;

    if (!configKey || !configValue) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Config key or value missing.');
        return;
    }
    else {
        repo.setConfig(configKey, configValue).then(() => {
            NEURO.client?.sendActionResult(actionData.id, true, `Set Git config key "${configKey}" to: ${configValue}`);
        }, (err: string) => {
            NEURO.client?.sendActionResult(actionData.id, false, `Failed to set Git config key "${configKey}": ${err}`);
        });
    }
}

/**
 * Actions with Git branches
 */

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
        NEURO.client?.sendActionResult(actionData.id, true, `Created and switched to new branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to create branch: ${err}`);
    });
}

export function handleSwitchGitBranch(actionData: any) {
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

    repo.checkout(branchName).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Switched to branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to switch branch: ${err}`);
    });
}

export function handleDeleteGitBranch(actionData: any) {
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

    repo.deleteBranch(branchName).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Deleted branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to delete branch: ${err}`);
    });
}

/**
 * Actions with the Git index
 */

export function handleGitStatus(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    repo.status().then((status: any) => {
        NEURO.client?.sendActionResult(actionData.id, true, `Git status: ${JSON.stringify(status)}`);
    }
    , (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to get Git status: ${err}`);
    });
}

export function handleGitAdd(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const filePath: string = actionData.params?.filePath;

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

export function handleGitRevert(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const filePath: string = actionData.params?.filePath;

    // Normalize the file path if provided; otherwise, use wildcard.
    const revertFiles: string = filePath ? getNormalizedRepoPathForGit(filePath) : `*`;

    // Compute an absolute path. If the removeFiles is already absolute, use it.
    // Otherwise, join it with the repository's root path.
    let absolutePath: string;
    if (path.isAbsolute(revertFiles)) {
        absolutePath = revertFiles;
    } else {
        absolutePath = path.join(repo.rootUri.fsPath, revertFiles);
    }

    // Pass the absolute path to the Git remove command.
    repo.revert([absolutePath]).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Removed ${revertFiles} from the index.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Git remove failed: ${err}`);
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

export function handleGitDiff(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const ref1: string = actionData.params?.ref1;
    const ref2: string = actionData.params?.ref2;
    const filePath: string = actionData.params?.filePath;
    const diffType: string = actionData.params?.diffType || 'diffWithHEAD'; // Default to diffWithHEAD

    try {
        switch (diffType) {
            case 'diffWithHEAD':
                if (filePath) {
                    repo.diffWithHEAD(filePath).then((diff: string) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff with HEAD for file "${filePath}":\n${diff}`);
                    });
                } else {
                    repo.diffWithHEAD().then((changes: any) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff with HEAD:\n${JSON.stringify(changes)}`);
                    });
                }
                break;

            case 'diffWith':
                if (ref1 && filePath) {
                    repo.diffWith(ref1, filePath).then((diff: string) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff with ref "${ref1}" for file "${filePath}":\n${diff}`);
                    });
                } else if (ref1) {
                    repo.diffWith(ref1).then((changes: any) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff with ref "${ref1}":\n${JSON.stringify(changes)}`);
                    });
                } else {
                    NEURO.client?.sendActionResult(actionData.id, false, 'Ref1 is required for diffWith.');
                }
                break;

            case 'diffIndexWithHEAD':
                if (filePath) {
                    repo.diffIndexWithHEAD(filePath).then((diff: string) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff index with HEAD for file "${filePath}":\n${diff}`);
                    });
                } else {
                    repo.diffIndexWithHEAD().then((changes: any) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff index with HEAD:\n${JSON.stringify(changes)}`);
                    });
                }
                break;

            case 'diffIndexWith':
                if (ref1 && filePath) {
                    repo.diffIndexWith(ref1, filePath).then((diff: string) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff index with ref "${ref1}" for file "${filePath}":\n${diff}`);
                    });
                } else if (ref1) {
                    repo.diffIndexWith(ref1).then((changes: any) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff index with ref "${ref1}":\n${JSON.stringify(changes)}`);
                    });
                } else {
                    NEURO.client?.sendActionResult(actionData.id, false, 'Ref1 is required for diffIndexWith.');
                }
                break;

            case 'diffBetween':
                if (ref1 && ref2 && filePath) {
                    repo.diffBetween(ref1, ref2, filePath).then((diff: string) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff between refs "${ref1}" and "${ref2}" for file "${filePath}":\n${diff}`);
                    });
                } else if (ref1 && ref2) {
                    repo.diffBetween(ref1, ref2).then((changes: any) => {
                        NEURO.client?.sendActionResult(actionData.id, true, `Diff between refs "${ref1}" and "${ref2}":\n${JSON.stringify(changes)}`);
                    });
                } else {
                    NEURO.client?.sendActionResult(actionData.id, false, 'Both ref1 and ref2 are required for diffBetween.');
                }
                break;
            
            case 'fullDiff':
                repo.diff().then((diff: string) => {
                    NEURO.client?.sendActionResult(actionData.id, true, `Full diff:\n${diff}`);
                });
                break;
            
            default:
                NEURO.client?.sendActionResult(actionData.id, false, `Invalid diffType "${diffType}".`);
        }
    } catch (err) {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to perform git diff: ${err}`);
    }
}

/**
 * Actions with Git remotes
 * Requires neuropilot.permission.gitRemotes to be enabled.
 */

export function handleAddGitRemote(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const remoteName: string = actionData.params?.remoteName;
    const remoteUrl: string = actionData.params?.remoteUrl;

    if (!remoteName || !remoteUrl) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Remote name or URL missing.');
        return;
    }

    repo.addRemote(remoteName, remoteUrl).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Added remote "${remoteName}" with URL: ${remoteUrl}`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to add remote "${remoteName}": ${err}`);
    });
}

export function handleRemoveGitRemote(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const remoteName: string = actionData.params?.remoteName;

    if (!remoteName) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Remote name missing.');
        return;
    }

    repo.removeRemote(remoteName).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Removed remote "${remoteName}".`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to remove remote "${remoteName}": ${err}`);
    });
}

export function handleRenameGitRemote(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const oldRemoteName: string = actionData.params?.oldRemoteName;
    const newRemoteName: string = actionData.params?.newRemoteName;
    
    repo.renameRemote(oldRemoteName, newRemoteName).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Renamed remote "${oldRemoteName}" to "${newRemoteName}".`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to rename remote "${oldRemoteName}" to "${newRemoteName}": ${err}`);
    });
}

export function handleFetchGitCommits(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const remoteName: string = actionData.params?.remoteName;
    const branchName: string = actionData.params?.branchName;

    repo.fetch(remoteName, branchName).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Fetched commits from remote "${remoteName}"${branchName && `, branch "${branchName}"`}.`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to fetch commits from remote "${remoteName}": ${err}`);
    });
}

export function handlePullGitCommits(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];

    repo.pull().then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Pulled commits from remote.`);
    }
    , (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to pull commits from remote: ${err}`);
    });
}

export function handlePushGitCommits(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Git extension not available.');
        return;
    }

    const repo = git.repositories[0];
    const remoteName: string = actionData.params?.remoteName;
    const branchName: string = actionData.params?.branchName;
    const forcePush: boolean = actionData.params?.forcePush || false;

    repo.push(remoteName, branchName, forcePush).then(() => {
        NEURO.client?.sendActionResult(actionData.id, true, `Pushed commits${remoteName && ` to remote "${remoteName}"`}${branchName && `, branch "${branchName}"`}.${forcePush === true && " (forced push)"}`);
    }, (err: string) => {
        NEURO.client?.sendActionResult(actionData.id, false, `Failed to push commits to remote "${remoteName}": ${err}`);
    });
}