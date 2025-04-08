import * as vscode from 'vscode';
import * as path from 'path';
import { NEURO } from './constants';
import { GitExtension, Change } from './types/git';
import { StatusStrings, RefTypeStrings } from './types/git_status';
import { getNormalizedRepoPathForGit, logOutput, simpleFileName } from './utils';

/* All actions located in here requires neuropilot.permission.gitOperations to be enabled. */

// Get the Git extension
const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
const git = gitExtension.getAPI(1);

/**
 * Update state of `repo` based on git repository
 */
export const gitActionHandlers: { [key: string]: (actionData: any) => void } = {
    'init_git_repo': handleNewGitRepo,
    'new_git_branch': handleNewGitBranch,
    'add_file_to_git': handleGitAdd,
    'remove_file_from_git': handleGitRemove,
    'make_git_commit': handleGitCommit,
    'set_git_config': handleSetGitConfig,
    'get_git_config': handleGetGitConfig,
    'add_git_remote': handleAddGitRemote,
    'rename_git_remote': handleRenameGitRemote,
    'remove_git_remote': handleRemoveGitRemote,
    'fetch_git_commits': handleFetchGitCommits,
    'pull_git_commits': handlePullGitCommits,
    'push_git_commits': handlePushGitCommits,
    'delete_git_branch': handleDeleteGitBranch,
    'switch_git_branch': handleSwitchGitBranch,
    'git_status': handleGitStatus,
    'diff_files': handleGitDiff,
};

// Get the current Git repository
let repo = git.repositories[0];
// Handle git repo checks in each handler
// eg. 
// if (!repo) {
//  NEURO.client?.sendActionResult(actionData.id, true, 'No Git repository found.');
//  return;
// }

// Register all git commands
export function registerGitCommands() {
    NEURO.client?.unregisterActions(Object.keys(gitActionHandlers));

    if(vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.registerActions([
            {
                name: 'init_git_repo',
                description: 'Initialize a new Git repository in the current workspace folder',
                schema: {}
            }
        ]);

        if (repo) {
            NEURO.client?.registerActions([
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
                    name: 'remove_file_from_git',
                    description: 'Remove a file from the staging area',
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
                            force: { type: 'boolean' },
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
                },
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
                    name: 'diff_files',
                    description: 'Get the differences between two versions of a file in the Git repository',
                    schema: {
                        type: 'object',
                        properties: {
                            ref1: { type: 'string' },
                            ref2: { type: 'string' },
                            filePath: { type: 'string' },
                            diffType: { type: 'string', enum: ['diffWithHEAD', 'diffWith', 'diffIndexWithHEAD', 'diffIndexWith', 'diffBetween', 'fullDiff'] },
                        }
                    }
                }
            ]);

            if(vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfigs', false)) {
                NEURO.client?.registerActions([
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
                            }
                        }
                    }
                ]);

                if(vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false)) {
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
                            name: 'rename_git_remote',
                            description: 'Rename a remote in the Git repository',
                            schema: {
                                type: 'object',
                                properties: {
                                    oldRemoteName: { type: 'string' },
                                    newRemoteName: { type: 'string' },
                                },
                                required: ['oldRemoteName', 'newRemoteName'],
                            }
                        }
                    ]);
                }
            }
        }
    }
}

/**
 * Actions with the Git repo
 * Requires neuropilot.permission.gitConfig to be enabled.
 */

export function handleNewGitRepo(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfig', false))) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        NEURO.client?.sendActionResult(actionData.id, false, 'No workspace folder is open.');
        return;
    }

    const folderPath = workspaceFolders[0].uri.fsPath;

    NEURO.client?.sendActionResult(actionData.id, true)
    
    git.init(vscode.Uri.file(folderPath)).then(() => {
        repo = git.repositories[0]; // Update the repo reference to the new repository, just in case
        registerGitCommands(); // Re-register commands
        NEURO.client?.sendContext(`Initialized a new Git repository in the workspace folder. You should now be able to use git commands.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to initialize Git repository`);
        logOutput('ERROR', `Failed to initialize Git repository: ${err}`);
    });
}

export function handleGetGitConfig(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfig', false))) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const configKey: string = actionData.params?.key;

    NEURO.client?.sendActionResult(actionData.id, true);

    if (!configKey) {
        repo.getConfigs().then((configs: any) => {
            NEURO.client?.sendContext(`Git config: ${JSON.stringify(configs)}`);
            return;
        });
    }
    else {
        repo.getConfig(configKey).then((configValue: any) => {
            NEURO.client?.sendContext(`Git config key "${configKey}": ${configValue}`);
        }, (err: string) => {
            NEURO.client?.sendContext(`Failed to get Git config key "${configKey}"`);
            logOutput('ERROR', `Failed to get Git config key "${configKey}": ${err}`);
        });
    }
}

export function handleSetGitConfig(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfig', false))) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const configKey: string = actionData.params?.key;
    const configValue: string = actionData.params?.value;

    if (!configKey) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "key"');
        return;
    }
    if (!configValue) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "value"');
        return;
    }
    else {
        NEURO.client?.sendActionResult(actionData.id, true);
        repo.setConfig(configKey, configValue).then(() => {
            NEURO.client?.sendContext(`Set Git config key "${configKey}" to: ${configValue}`);
        }, (err: string) => {
            NEURO.client?.sendContext(`Failed to set Git config key "${configKey}"`);
            logOutput('ERROR', `Failed to set Git config key "${configKey}": ${err}`);
        });
    }
}

/**
 * Actions with Git branches
 */

export function handleNewGitBranch(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const branchName: string = actionData.params?.branchName;
    if (!branchName) {
        NEURO.client?.sendActionResult(actionData.id, false, 'No branch name provided.');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);
    repo.createBranch(branchName, true).then(() => {
        NEURO.client?.sendContext(`Created and switched to new branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to create branch ${branchName}`);
        logOutput('ERROR', `Failed to create branch: ${err}`);
    });
}

export function handleSwitchGitBranch(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const branchName: string = actionData.params?.branchName;
    if (!branchName) {
        NEURO.client?.sendActionResult(actionData.id, false, 'No branch name provided.');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);
    repo.checkout(branchName).then(() => {
        NEURO.client?.sendContext(`Switched to branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to switch to branch ${branchName}`);
        logOutput('ERROR', `Failed to switch branch: ${err}`);
    });
}

export function handleDeleteGitBranch(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const branchName: string = actionData.params?.branchName;
    const forceDelete: boolean = actionData.params?.forceDelete || false;
    if (!branchName) {
        NEURO.client?.sendActionResult(actionData.id, false, 'No branch name provided.');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true);
    repo.deleteBranch(branchName, forceDelete).then(() => {
        NEURO.client?.sendContext(`Deleted branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to delete branch${forceDelete === false ? "\nEnsure the branch is merged before deleting, or force delete it to discard changes." : ""}`);
        logOutput('ERROR', `Failed to delete branch: ${err}`);
    });
}

/**
 * Actions with the Git index
 */

export function handleGitStatus(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    
    NEURO.client?.sendActionResult(actionData.id, true)
    repo.status().then(() => {
        function translateChange(change: Change) {
            const isRename = change.renameUri !== undefined;
            return {
                fileName: !isRename ? simpleFileName(change.uri.fsPath) : undefined,
                originalFileName: isRename ? simpleFileName(change.originalUri.fsPath) : undefined,
                renamedFileName: isRename ? simpleFileName(change.renameUri.fsPath) : undefined,
                status: StatusStrings[change.status],
            };
        }
        // Can't stringify the repo state directly (because of getters I assume)
        const state = {
            indexChanges: repo.state.indexChanges.map((change: Change) => translateChange(change)),
            workingTreeChanges: repo.state.workingTreeChanges.map((change: Change) => translateChange(change)),
            mergeChanges: repo.state.mergeChanges.map((change: Change) => translateChange(change)),
            HEAD: {
                name: repo.state.HEAD?.name,
                type: repo.state.HEAD !== undefined ? RefTypeStrings[repo.state.HEAD?.type] : undefined,
                ahead: repo.state.HEAD?.ahead,
                behind: repo.state.HEAD?.behind,
                commit: repo.state.HEAD?.commit,
                remote: repo.state.HEAD?.remote,
                upstream: repo.state.HEAD?.upstream,
            },
        };
        NEURO.client?.sendContext(`Git status: ${JSON.stringify(state)}`);
    }
    , (err: string) => {
        NEURO.client?.sendContext(`Failed to get Git repository status`);
        logOutput('ERROR', `Failed to get Git status: ${err}`);
    });
    };

export function handleGitAdd(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const filePath: string = actionData.params?.filePath;

    NEURO.client?.sendActionResult(actionData.id, true)

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
        NEURO.client?.sendContext(`Added ${stageFiles} to staging area.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Adding files to staging area failed`);
        logOutput("ERROR", `Failed to git add: ${err}`)
    });
}

export function handleGitRemove(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const filePath: string = actionData.params?.filePath;

    NEURO.client?.sendActionResult(actionData.id, true)

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
        NEURO.client?.sendContext(`Removed ${revertFiles} from the index.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Reverting files failed`);
        logOutput("ERROR", `Git revert failed: ${err}`)
    });
}

export function handleGitCommit(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const message = `Neuro commit: ${actionData.params?.message}`;

    if (!message) {
        NEURO.client?.sendActionResult(actionData.id, false, "No commit message provided.")
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true)

    repo.inputBox.value = message;
    repo.commit(message).then(() => {
        NEURO.client?.sendContext(`Committed with message: "${message}"`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to record commit`);
        logOutput("ERROR", `Failed to commit: ${err}`)
    });
}

export function handleGitDiff(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const ref1: string = actionData.params?.ref1;
    const ref2: string = actionData.params?.ref2;
    const filePath: string = actionData.params?.filePath;
    const diffType: string = actionData.params?.diffType || 'diffWithHEAD'; // Default to diffWithHEAD

    if (!['diffWithHEAD', 'diffWith', 'diffIndexWithHEAD', 'diffIndexWith', 'diffBetween', 'fullDiff'].includes(diffType)) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Invalid diffType.');
        return;
    } else {
        NEURO.client?.sendActionResult(actionData.id, true);
    }

    try {
        switch (diffType) {
            case 'diffWithHEAD':
                if (filePath) {
                    repo.diffWithHEAD(filePath).then((diff: string) => {
                        NEURO.client?.sendContext(`Diff with HEAD for file "${filePath}":\n${diff}`);
                    });
                } else {
                    repo.diffWithHEAD().then((changes: any) => {
                        NEURO.client?.sendContext(`Diff with HEAD:\n${JSON.stringify(changes)}`);
                    });
                }
                break;

            case 'diffWith':
                if (ref1 && filePath) {
                    repo.diffWith(ref1, filePath).then((diff: string) => {
                        NEURO.client?.sendContext(`Diff with ref "${ref1}" for file "${filePath}":\n${diff}`);
                    });
                } else if (ref1) {
                    repo.diffWith(ref1).then((changes: any) => {
                        NEURO.client?.sendContext(`Diff with ref "${ref1}":\n${JSON.stringify(changes)}`);
                    });
                } else {
                    NEURO.client?.sendContext('Ref1 is required for diffWith.');
                }
                break;

            case 'diffIndexWithHEAD':
                if (filePath) {
                    repo.diffIndexWithHEAD(filePath).then((diff: string) => {
                        NEURO.client?.sendContext(`Diff index with HEAD for file "${filePath}":\n${diff}`);
                    });
                } else {
                    repo.diffIndexWithHEAD().then((changes: any) => {
                        NEURO.client?.sendContext(`Diff index with HEAD:\n${JSON.stringify(changes)}`);
                    });
                }
                break;

            case 'diffIndexWith':
                if (ref1 && filePath) {
                    repo.diffIndexWith(ref1, filePath).then((diff: string) => {
                        NEURO.client?.sendContext(`Diff index with ref "${ref1}" for file "${filePath}":\n${diff}`);
                    });
                } else if (ref1) {
                    repo.diffIndexWith(ref1).then((changes: any) => {
                        NEURO.client?.sendContext(`Diff index with ref "${ref1}":\n${JSON.stringify(changes)}`);
                    });
                } else {
                    NEURO.client?.sendContext('Ref1 is required for diffIndexWith.');
                }
                break;

            case 'diffBetween':
                if (ref1 && ref2 && filePath) {
                    repo.diffBetween(ref1, ref2, filePath).then((diff: string) => {
                        NEURO.client?.sendContext(`Diff between refs "${ref1}" and "${ref2}" for file "${filePath}":\n${diff}`);
                    });
                } else if (ref1 && ref2) {
                    repo.diffBetween(ref1, ref2).then((changes: any) => {
                        NEURO.client?.sendContext(`Diff between refs "${ref1}" and "${ref2}":\n${JSON.stringify(changes)}`);
                    });
                } else {
                    NEURO.client?.sendContext('Both ref1 and ref2 are required for diffBetween.');
                }
                break;
            
            case 'fullDiff':
                repo.diff().then((diff: string) => {
                    NEURO.client?.sendContext(`Full diff:\n${diff}`);
                });
                break;
            
            default:
                NEURO.client?.sendContext(`Invalid diffType "${diffType}".`);
        }
    } catch (err) {
        NEURO.client?.sendContext("Failed to get diffs between files");
        logOutput("ERROR", `Failed to diff files: ${err}`);
    }
}

/**
 * Actions with Git remotes
 * Requires neuropilot.permission.gitRemotes to be enabled.
 */

export function handleFetchGitCommits(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && !vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes')) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const remoteName: string = actionData.params?.remoteName;
    const branchName: string = actionData.params?.branchName;

    NEURO.client?.sendActionResult(actionData.id, true)

    repo.fetch(remoteName, branchName).then(() => {
        NEURO.client?.sendContext(`Fetched commits from remote "${remoteName}"${branchName ? `, branch "${branchName}"` : ""}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to fetch commits from remote "${remoteName}"`);
        logOutput("ERROR", `Failed to fetch commits: ${err}`)
    });
}

export function handlePullGitCommits(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && !vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes')) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    

    NEURO.client?.sendActionResult(actionData.id, true)

    repo.pull().then(() => {
        NEURO.client?.sendContext(`Pulled commits from remote.`);
    }
    , (err: string) => {
        NEURO.client?.sendContext(`Failed to pull commits from remote`);
        logOutput("ERROR", `Failed to pull commits: ${err}`)
    });
}

export function handlePushGitCommits(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && !vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes')) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const remoteName: string = actionData.params?.remoteName;
    const branchName: string = actionData.params?.branchName;
    const forcePush: boolean = actionData.params?.forcePush || false;

    NEURO.client?.sendActionResult(actionData.id, true)

    repo.push(remoteName, branchName, forcePush).then(() => {
        NEURO.client?.sendContext(`Pushed commits${remoteName ? ` to remote "${remoteName}"` : ""}${branchName ? `, branch "${branchName}"` : ""}.${forcePush === true ? " (forced push)" : ""}`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to push commits to remote "${remoteName}"`);
        logOutput("ERROR", `Failed to push commits: ${err}`)
    });
}

/**
 * THESE ACTIONS ARE CONSIDERED DANGEROUS REMOTE OPERATIONS
 * Requires neuropilot.permission.editRemoteData to be enabled, IN ADDITION to neuropilot.permission.gitRemotes.
 */

export function handleAddGitRemote(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false)))) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const remoteName: string = actionData.params?.remoteName;
    const remoteUrl: string = actionData.params?.remoteURL;

    if (!remoteName) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "remoteName"');
        return;
    }
    if (!remoteUrl) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Missing required parameter "remoteURL"');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true)

    repo.addRemote(remoteName, remoteUrl).then(() => {
        NEURO.client?.sendContext(`Added remote "${remoteName}" with URL: ${remoteUrl}`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to add remote "${remoteName}"`);
        logOutput("ERROR", `Failed to add remote: ${err}`)
    });
}

export function handleRemoveGitRemote(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false)))) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const remoteName: string = actionData.params?.remoteName;

    if (!remoteName) {
        NEURO.client?.sendActionResult(actionData.id, false, 'Remote name missing.');
        return;
    }

    NEURO.client?.sendActionResult(actionData.id, true)

    repo.removeRemote(remoteName).then(() => {
        NEURO.client?.sendContext(`Removed remote "${remoteName}".`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to remove remote "${remoteName}"`);
        logOutput("ERROR", `Failed to remove remote: ${err}`)
    });
}

export function handleRenameGitRemote(actionData: any) {
    if (!git) {
        NEURO.client?.sendActionResult(actionData.id, true, 'Git extension not available.');
        return;
    }
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false)))) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You do not have permission to perform Git operations.');
        return;
    }
    if (!repo) {
        NEURO.client?.sendActionResult(actionData.id, true, 'You are not in a git repository.');
        return;
    }

    
    const oldRemoteName: string = actionData.params?.oldRemoteName;
    const newRemoteName: string = actionData.params?.newRemoteName;

    if (!oldRemoteName || !newRemoteName) {
        NEURO.client?.sendActionResult(actionData.id, false, "Both oldRemoteName and newRemoteName are required")
    }

    NEURO.client?.sendActionResult(actionData.id, true)
    
    repo.renameRemote(oldRemoteName, newRemoteName).then(() => {
        NEURO.client?.sendContext(`Renamed remote "${oldRemoteName}" to "${newRemoteName}".`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to rename remote "${oldRemoteName}" to "${newRemoteName}"`);
        logOutput("ERROR", `Failed to rename remote ${oldRemoteName}: ${err}`)
    });
}
