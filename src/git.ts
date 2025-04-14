import * as vscode from 'vscode';
import * as path from 'path';
import { NEURO } from './constants';
import { GitExtension, Change, ForcePushMode, CommitOptions, Commit, Repository } from './types/git';
import { StatusStrings, RefTypeStrings } from './types/git_status';
import { getNormalizedRepoPathForGit, logOutput, simpleFileName } from './utils';
import { ActionData, ActionResult, actionResultAccept, actionResultFailure, actionResultMissingParameter, actionResultNoPermission, actionResultRetry, PERMISSION_STRINGS } from './neuro_client_helper';

/* All actions located in here requires neuropilot.permission.gitOperations to be enabled. */

const ACTION_RESULT_NO_GIT = actionResultFailure('Git extension not available.');
const ACTION_RESULT_NO_REPO = actionResultFailure('You are not in a repository.');

// Get the Git extension
const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
const git = gitExtension.getAPI(1);

export const gitActionHandlers: { [key: string]: (actionData: ActionData) => ActionResult } = {
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
    'merge_to_current_branch': handleGitMerge,
    'abort_merge': handleAbortMerge,
    'git_log': handleGitLog,
    'git_blame': handleGitBlame,
    'tag_head': handleTagHEAD,
    'delete_tag': handleDeleteTag
};

// Get the current Git repository
let repo: Repository | undefined = git.repositories[0];
// Handle git repo checks in each handler
// eg.
// if (!git)
//     return actionResultFailure(NO_GIT_STRING);

// Register all git commands
export function registerGitActions() {
    NEURO.client?.unregisterActions(Object.keys(gitActionHandlers));

    if (vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false)) {
        NEURO.client?.registerActions([
            {
                name: 'init_git_repo',
                description: 'Initialize a new Git repository in the current workspace folder',
                schema: {}
            }
        ]);

        const root = vscode.workspace.workspaceFolders?.[0].uri;
        if (!root) return;

        git.openRepository(root).then((r) => {
            if (r === null) {
                repo = undefined;
                return;
            }

            repo = r;

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
                                options: {
                                    type: 'array',
                                    items: { type: 'string', enum: ["signoff", "verbose", "amend"] },
                                }
                            },
                            required: ['message']
                        }
                    },
                    {
                        name: 'merge_to_current_branch',
                        description: 'Merge another branch into the current branch.',
                        schema: {
                            type: 'object',
                            properties: {
                                ref_to_merge: { type: 'string' }
                            },
                            required: ['ref_to_merge']
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
                    },
                    {
                        name: 'git_log',
                        description: 'Get the commit history of the current branch',
                        schema: {}
                    },
                    {
                        name: 'git_blame',
                        description: 'Get commit attributions for each line in a file.',
                        schema: {
                            type: "object",
                            properties: {
                                filePath: { type: 'string' }
                            },
                            required: ["filePath"]
                        }
                    }
                ]);

                if (vscode.workspace.getConfiguration('neuropilot').get('permission.gitTags', false)) {
                    NEURO.client?.registerActions([
                        {
                            name: 'tag_head',
                            description: "Tag the current commit using Git.",
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    upstream: { type: 'string' }
                                },
                                required: ["name", "upstream"]
                            }
                        },
                        {
                            name: 'delete_tag',
                            description: "Delete a tag from Git.",
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' }
                                },
                                required: ["name"]
                            }
                        }
                    ]);
                }

                if (vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfigs', false)) {
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

                if (vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false)) {
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

                    if (vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false)) {
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
        });
    }
}

/**
 * Actions with the Git repo
 * Requires neuropilot.permission.gitConfig to be enabled.
 */

export function handleNewGitRepo(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfig', false)))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);


    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0)
        return actionResultFailure('No workspace folder is open.');

    const folderPath = workspaceFolders[0].uri.fsPath;

    git.init(vscode.Uri.file(folderPath)).then(() => {
        repo = git.repositories[0]; // Update the repo reference to the new repository, just in case
        registerGitActions(); // Re-register commands
        NEURO.client?.sendContext(`Initialized a new Git repository in the workspace folder. You should now be able to use git commands.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to initialize Git repository`);
        logOutput('ERROR', `Failed to initialize Git repository: ${err}`);
    });

    return actionResultAccept();
}

export function handleGetGitConfig(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfig', false)))
        return actionResultNoPermission(PERMISSION_STRINGS.gitConfigs);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const configKey: string = actionData.params?.key;

    if (!configKey) {
        repo.getConfigs().then((configs: { key: string; value: string; }[]) => {
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

    return actionResultAccept();
}

export function handleSetGitConfig(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitConfig', false)))
        return actionResultNoPermission(PERMISSION_STRINGS.gitConfigs);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const configKey: string = actionData.params?.key;
    const configValue: string = actionData.params?.value;

    if (!configKey)
        return actionResultMissingParameter('key');
    if (!configValue)
        return actionResultMissingParameter('value');

    repo.setConfig(configKey, configValue).then(() => {
        NEURO.client?.sendContext(`Set Git config key "${configKey}" to: ${configValue}`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to set Git config key "${configKey}"`);
        logOutput('ERROR', `Failed to set Git config key "${configKey}": ${err}`);
    });

    return actionResultAccept();
}

/**
 * Actions with Git branches
 */

export function handleNewGitBranch(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const branchName: string = actionData.params?.branchName;
    if (!branchName)
        return actionResultMissingParameter('branchName');

    repo.createBranch(branchName, true).then(() => {
        NEURO.client?.sendContext(`Created and switched to new branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to create branch ${branchName}`);
        logOutput('ERROR', `Failed to create branch: ${err}`);
    });

    return actionResultAccept();
}

export function handleSwitchGitBranch(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const branchName: string = actionData.params?.branchName;
    if (!branchName)
        return actionResultMissingParameter('branchName');

    repo.checkout(branchName).then(() => {
        NEURO.client?.sendContext(`Switched to branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to switch to branch ${branchName}`);
        logOutput('ERROR', `Failed to switch branch: ${err}`);
    });

    return actionResultAccept();
}

export function handleDeleteGitBranch(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const branchName: string = actionData.params?.branchName;
    const forceDelete: boolean = actionData.params?.forceDelete || false;
    if (!branchName)
        return actionResultMissingParameter('branchName');

    repo.deleteBranch(branchName, forceDelete).then(() => {
        NEURO.client?.sendContext(`Deleted branch ${branchName}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to delete branch "${branchName}".${forceDelete === false ? "\nEnsure the branch is merged before deleting, or force delete it to discard changes." : ""}`);
        logOutput('ERROR', `Failed to delete branch: ${err}`);
    });

    return actionResultAccept();
}

/**
 * Actions with the Git index
 */

export function handleGitStatus(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


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
        if (!repo) return;
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
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to get Git repository status`);
        logOutput('ERROR', `Failed to get Git status: ${err}`);
    });

    return actionResultAccept();
}

export function handleGitAdd(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


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
        NEURO.client?.sendContext(`Added ${stageFiles} to staging area.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Adding files to staging area failed`);
        logOutput("ERROR", `Failed to git add: ${err}`)
    });

    return actionResultAccept();
}

export function handleGitRemove(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


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
        NEURO.client?.sendContext(`Removed ${revertFiles} from the index.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Reverting files failed`);
        logOutput("ERROR", `Git revert failed: ${err}`)
    });

    return actionResultAccept();
}

export function handleGitCommit(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const message = `Neuro commit: ${actionData.params?.message}`;
    const commitOptions: string[] | undefined = actionData.params?.options;
    let ExtraCommitOptions: CommitOptions | undefined = {};

    if (!actionData.params?.message)
        return actionResultMissingParameter('message');
    if (!commitOptions) {
        ExtraCommitOptions = undefined;
    }
    else {
        let invalidCommitOptionCheck: boolean | undefined;
        let invalidCommitOptions: string[] = []
        commitOptions.map((option) => {
            if (!ExtraCommitOptions) return;
            switch(option) {
                case "amend":
                    ExtraCommitOptions.amend = true;
                    break;
                case "signoff":
                    ExtraCommitOptions.signoff = true;
                    break;
                case "verbose":
                    ExtraCommitOptions.verbose = true;
                    break;
                default:
                    invalidCommitOptionCheck = true;
                    break;
            }
        })
        if (invalidCommitOptionCheck === true)
            return actionResultRetry(`Invalid commit options: ${invalidCommitOptions.join(", ")}`);
    }

    repo.inputBox.value = message;
    repo.commit(message, ExtraCommitOptions).then(() => {
        NEURO.client?.sendContext(`Committed with message: "${message}"\nCommit options used: ${commitOptions ? commitOptions : "None"}`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to record commit`);
        logOutput("ERROR", `Failed to commit: ${err}`)
    });

    return actionResultAccept();
}

export function handleGitMerge(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;

    const refToMerge = actionData.params?.ref_to_merge

    if (!refToMerge)
        return actionResultMissingParameter('ref_to_merge');

    repo.merge(refToMerge).then(() => {
        NEURO.client?.sendContext(`Cleanly merged ${refToMerge} into the current branch.`)
    }, (err: string) => {
        if (repo?.state.mergeChanges.some(() => true)) {
            NEURO.client?.registerActions([
                {
                    name: 'abort_merge',
                    description: 'Aborts the current merge operation.',
                    schema: {}
                },
            ])
        }
        NEURO.client?.sendContext(`Couldn't merge ${refToMerge}: ${err}`)
        logOutput("ERROR", `Encountered an error when merging ${refToMerge}: ${err}`)
    });

    return actionResultAccept();
}

export function handleAbortMerge(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    repo.mergeAbort().then(() => {
        NEURO.client?.unregisterActions(["abort_merge"])
        NEURO.client?.sendContext("Merge aborted.")
    }, (err: string) => {
        NEURO.client?.sendContext("Couldn't abort merging!")
        logOutput("ERROR", `Failed to abort merge: ${err}`)
    })

    return actionResultAccept();
}

export function handleGitDiff(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;

    const ref1: string = actionData.params?.ref1;
    const ref2: string = actionData.params?.ref2;
    const filePath: string = actionData.params?.filePath || ".";
    const diffType: string = actionData.params?.diffType || 'diffWithHEAD'; // Default to diffWithHEAD

    if (!['diffWithHEAD', 'diffWith', 'diffIndexWithHEAD', 'diffIndexWith', 'diffBetween', 'fullDiff'].includes(diffType))
        return actionResultRetry(`Invalid diffType "${diffType}".`);

    // Get the normalized workspace root path
    const diffThisFile = getNormalizedRepoPathForGit(filePath)

    switch (diffType) {
        case 'diffWithHEAD':
            repo.diffWithHEAD(diffThisFile)
               .then((diff: string) => {
                    NEURO.client?.sendContext(`Diff with HEAD for ${filePath || 'workspace root'}:\n${diff}`);
                })
                .catch((err: string) => {
                    NEURO.client?.sendContext(`Failed to get diff with HEAD for ${filePath || 'workspace root'}.`);
                    logOutput("ERROR", `Failed to get diff with HEAD for ${filePath || 'workspace root'}: ${err}`);
                });
            break;

        case 'diffWith':
            if (ref1) {
                repo.diffWith(ref1, diffThisFile)
                    .then((diff: string) => {
                        NEURO.client?.sendContext(`Diff with ref "${ref1}" for ${filePath || 'workspace root'}:\n${diff}`);
                    })
                    .catch((err: string) => {
                        NEURO.client?.sendContext(`Failed to get diff with ref "${ref1}" for ${filePath || 'workspace root'}.`);
                        logOutput("ERROR", `Failed to get diff with ref "${ref1}" for ${filePath || 'workspace root'}: ${err}`);
                    });
            } else {
                NEURO.client?.sendContext('Ref1 is required for diffWith.');
            }
            break;

        case 'diffIndexWithHEAD':
                repo.diffIndexWithHEAD(diffThisFile)
                    .then((diff: string) => {
                        NEURO.client?.sendContext(`Diff index with HEAD for ${filePath || 'workspace root'}:\n${diff}`);
                    })
                    .catch((err: string) => {
                        NEURO.client?.sendContext(`Failed to get diff index with HEAD for ${filePath || 'workspace root'}.`);
                        logOutput("ERROR", `Failed to get diff index with HEAD for ${filePath || 'workspace root'}: ${err}`);
                    });
            break;

        case 'diffIndexWith':
            if (ref1) {
                repo.diffIndexWith(ref1, diffThisFile)
                    .then((diff: string) => {
                        NEURO.client?.sendContext(`Diff index with ref "${ref1}" for ${filePath || 'workspace root'}:\n${diff}`);
                    })
                    .catch((err: string) => {
                        NEURO.client?.sendContext(`Failed to get diff index with ref "${ref1}" for ${filePath || 'workspace root'}.`);
                        logOutput("ERROR", `Failed to get diff index with ref "${ref1}" for ${filePath || 'workspace root'}: ${err}`);
                    });
            } else {
                NEURO.client?.sendContext('Ref1 is required for diffIndexWith.');
            }
            break;

        case 'diffBetween':
            if (ref1 && ref2) {
                repo.diffBetween(ref1, ref2, diffThisFile)
                    .then((diff: string) => {
                        NEURO.client?.sendContext(`Diff between refs "${ref1}" and "${ref2}" for ${filePath || 'workspace root'}:\n${diff}`);
                    })
                    .catch((err: string) => {
                        NEURO.client?.sendContext(`Failed to get diff between refs "${ref1}" and "${ref2}" for ${filePath || 'workspace root'}.`);
                        logOutput("ERROR", `Failed to get diff between refs "${ref1}" and "${ref2}" for ${filePath || 'workspace root'}: ${err}`);
                    });
            } else {
                NEURO.client?.sendContext('Both ref1 and ref2 are required for diffBetween.');
            }
            break;

        case 'fullDiff':
            repo.diffWithHEAD(diffThisFile)
                .then((diff: string) => {
                    NEURO.client?.sendContext(`Full diff for workspace root:\n${diff}`);
                })
                .catch((err: string) => {
                    NEURO.client?.sendContext(`Failed to get full diff for workspace root.`);
                    logOutput("ERROR", `Failed to get full diff for workspace root: ${err}`);
                });
            break;

        default:
            NEURO.client?.sendContext(`Invalid diffType "${diffType}".`);
    }

    return actionResultAccept();
}

export function handleGitLog(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    repo.log().then((commits: Commit[]) => {
        NEURO.client?.sendContext(`Commit log: ${JSON.stringify(commits)}`)
    }, (err: string) => {
        NEURO.client?.sendContext("Failed to get git log.")
        logOutput("ERROR", `Failed to get git log: ${err}`)
    })

    return actionResultAccept();
}

export function handleGitBlame(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitOperations);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


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

    repo.blame(absolutePath).then((blame: string) => {
        NEURO.client?.sendContext(`Blame attribution: ${blame}`)
    }, (err: string) => {
        NEURO.client?.sendContext("Failed to get blame attribution.")
        logOutput("ERROR", `Error getting blame attribs: ${err}`)
    })

    return actionResultAccept();
}

/**
 * Actions with Git tags
 * Requires neuropilot.permission.gitTags to be enabled.
 */

export function handleTagHEAD(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) || !vscode.workspace.getConfiguration('neuropilot').get('permission.gitTags', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitTags);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const name: string = actionData.params?.name
    const upstream: string = actionData.params?.upstream

    if (!name)
        return actionResultMissingParameter('name');
    if (!upstream)
        return actionResultMissingParameter('upstream');

    repo.tag(name, upstream).then(() => {
        NEURO.client?.sendContext(`Tag ${name} created for ${upstream} upstream.`)
    }, (err: string) => {
        NEURO.client?.sendContext("There was an error during tagging.")
        logOutput("ERROR", `Error trying to tag: ${err}`)
    })

    return actionResultAccept();
}

export function handleDeleteTag(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) || !vscode.workspace.getConfiguration('neuropilot').get('permission.gitTags', false))
        return actionResultNoPermission(PERMISSION_STRINGS.gitTags);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const name: string = actionData.params?.name

    if (!name)
        return actionResultMissingParameter('name');

    repo.deleteTag(name).then(() => {
        NEURO.client?.sendContext(`Deleted tag ${name}`)
    }, (err: string) => {
        NEURO.client?.sendContext(`Couldn't delete tag "${name}"`)
        logOutput("ERROR", `Failed to delete tag ${name}: ${err}`)
    });

    return actionResultAccept();
}

/**
 * Actions with Git remotes
 * Requires neuropilot.permission.gitRemotes to be enabled.
 */

export function handleFetchGitCommits(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && !vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes'))
        return actionResultNoPermission(PERMISSION_STRINGS.gitRemotes);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const remoteName: string = actionData.params?.remoteName;
    const branchName: string = actionData.params?.branchName;

    repo.fetch(remoteName, branchName).then(() => {
        NEURO.client?.sendContext(`Fetched commits from remote "${remoteName}"${branchName ? `, branch "${branchName}"` : ""}.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to fetch commits from remote "${remoteName}"`);
        logOutput("ERROR", `Failed to fetch commits: ${err}`)
    });

    return actionResultAccept();
}

export function handlePullGitCommits(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && !vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes'))
        return actionResultNoPermission(PERMISSION_STRINGS.gitRemotes);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    repo.pull().then(() => {
        NEURO.client?.sendContext(`Pulled commits from remote.`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to pull commits from remote: ${err}`);
        logOutput("ERROR", `Failed to pull commits: ${err}`)
    });

    return actionResultAccept();
}

export function handlePushGitCommits(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && !vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes'))
        return actionResultNoPermission(PERMISSION_STRINGS.gitRemotes);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const remoteName: string = actionData.params?.remoteName;
    const branchName: string = actionData.params?.branchName;
    const forcePush: boolean = actionData.params?.forcePush || false;

    const forcePushMode: ForcePushMode | undefined = forcePush === true ? ForcePushMode.Force : undefined

    repo.push(remoteName, branchName, true, forcePushMode).then(() => {
        NEURO.client?.sendContext(`Pushed commits${remoteName ? ` to remote "${remoteName}"` : ""}${branchName ? `, branch "${branchName}"` : ""}.${forcePush === true ? " (forced push)" : ""}`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to push commits to remote "${remoteName}": ${err}`);
        logOutput("ERROR", `Failed to push commits: ${err}`)
    });

    return actionResultAccept();
}

/**
 * THESE ACTIONS ARE CONSIDERED DANGEROUS REMOTE OPERATIONS
 * Requires neuropilot.permission.editRemoteData to be enabled, IN ADDITION to neuropilot.permission.gitRemotes.
 */

export function handleAddGitRemote(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false))))
        return actionResultNoPermission(PERMISSION_STRINGS.editRemoteData);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const remoteName: string = actionData.params?.remoteName;
    const remoteUrl: string = actionData.params?.remoteURL;

    if (!remoteName)
        return actionResultMissingParameter('remoteName');
    if (!remoteUrl)
        return actionResultMissingParameter('remoteURL');

    repo.addRemote(remoteName, remoteUrl).then(() => {
        NEURO.client?.sendContext(`Added remote "${remoteName}" with URL: ${remoteUrl}`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to add remote "${remoteName}"`);
        logOutput("ERROR", `Failed to add remote: ${err}`)
    });

    return actionResultAccept();
}

export function handleRemoveGitRemote(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false))))
        return actionResultNoPermission(PERMISSION_STRINGS.editRemoteData);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const remoteName: string = actionData.params?.remoteName;

    if (!remoteName)
        return actionResultMissingParameter('remoteName');

    repo.removeRemote(remoteName).then(() => {
        NEURO.client?.sendContext(`Removed remote "${remoteName}".`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to remove remote "${remoteName}"`);
        logOutput("ERROR", `Failed to remove remote: ${err}`)
    });

    return actionResultAccept();
}

export function handleRenameGitRemote(actionData: ActionData): ActionResult {
    if (!git)
        return ACTION_RESULT_NO_GIT;
    if (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitOperations', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.gitRemotes', false) && (!vscode.workspace.getConfiguration('neuropilot').get('permission.editRemoteData', false))))
        return actionResultNoPermission(PERMISSION_STRINGS.editRemoteData);
    if (!repo)
        return ACTION_RESULT_NO_REPO;


    const oldRemoteName: string = actionData.params?.oldRemoteName;
    const newRemoteName: string = actionData.params?.newRemoteName;

    if (!oldRemoteName)
        return actionResultMissingParameter('oldRemoteName');
    if (!newRemoteName)
        return actionResultMissingParameter('newRemoteName');

    repo.renameRemote(oldRemoteName, newRemoteName).then(() => {
        NEURO.client?.sendContext(`Renamed remote "${oldRemoteName}" to "${newRemoteName}".`);
    }, (err: string) => {
        NEURO.client?.sendContext(`Failed to rename remote "${oldRemoteName}" to "${newRemoteName}"`);
        logOutput("ERROR", `Failed to rename remote ${oldRemoteName}: ${err}`)
    });

    return actionResultAccept();
}
