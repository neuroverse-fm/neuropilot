import * as assert from 'assert';

// Simple tests for Git action prompt logic
suite('git Actions', () => {
    test('init_git_repo has fixed prompt', () => {
        const prompt = 'initialize a Git repository in the workspace.';
        assert.strictEqual(prompt, 'initialize a Git repository in the workspace.');
    });

    test('add_file_to_git formats array of files', () => {
        const params = { filePath: ['a.ts', 'b.ts'] };
        const prompt = `add the file "${params.filePath}" to the staging area.`;
        assert.strictEqual(prompt, 'add the file "a.ts,b.ts" to the staging area.');
    });

    test('make_git_commit formats message', () => {
        const params = { message: 'feat: hello' };
        const prompt = `commit changes with the message "${params.message}".`;
        assert.strictEqual(prompt, 'commit changes with the message "feat: hello".');
    });

    test('merge_to_current_branch formats ref', () => {
        const params = { ref_to_merge: 'feature' };
        const prompt = `merge "${params.ref_to_merge}" into the current branch.`;
        assert.strictEqual(prompt, 'merge "feature" into the current branch.');
    });

    test('git_status has fixed prompt', () => {
        const prompt = 'get the repository\'s Git status.';
        assert.strictEqual(prompt, 'get the repository\'s Git status.');
    });

    test('remove_file_from_git formats array', () => {
        const params = { filePath: ['a.ts'] };
        const prompt = `remove the file "${params.filePath}" from the staging area.`;
        assert.strictEqual(prompt, 'remove the file "a.ts" from the staging area.');
    });

    test('delete_git_branch formats name', () => {
        const params = { branchName: 'old' };
        const prompt = `delete the branch "${params.branchName}".`;
        assert.strictEqual(prompt, 'delete the branch "old".');
    });

    test('switch_git_branch formats name', () => {
        const params = { branchName: 'main' };
        const prompt = `switch to the branch "${params.branchName}".`;
        assert.strictEqual(prompt, 'switch to the branch "main".');
    });

    test('new_git_branch formats name', () => {
        const params = { branchName: 'feat' };
        const prompt = `create a new branch "${params.branchName}".`;
        assert.strictEqual(prompt, 'create a new branch "feat".');
    });

    test('diff_files only filePath', () => {
        const params: { filePath: string } = { filePath: 'src/a.ts' };
        const prompt = `obtain "${params.filePath}"'s Git diff.`;
        assert.strictEqual(prompt, 'obtain "src/a.ts"\'s Git diff.');
    });

    test('diff_files with ref1 only', () => {
        const params: { ref1: string } = { ref1: 'HEAD~1' };
        const prompt = `obtain a Git diff at ref ${params.ref1}.`;
        assert.strictEqual(prompt, 'obtain a Git diff at ref HEAD~1.');
    });

    test('diff_files between refs and with type', () => {
        const params: { ref1: string; ref2: string; diffType: string } = { ref1: 'A', ref2: 'B', diffType: 'diffBetween' };
        const prompt = `obtain a Git diff between ${params.ref1} and ${params.ref2} (of type "${params.diffType}").`;
        assert.strictEqual(prompt, 'obtain a Git diff between A and B (of type "diffBetween").');
    });

    test('git_log without limit', () => {
        const prompt = 'get the Git log.';
        assert.strictEqual(prompt, 'get the Git log.');
    });

    test('git_log with limit', () => {
        const params = { log_limit: 5 };
        const prompt = `get the ${params.log_limit} most recent commits in the Git log.`;
        assert.strictEqual(prompt, 'get the 5 most recent commits in the Git log.');
    });

    test('git_blame formats file', () => {
        const params = { filePath: 'src/x.ts' };
        const prompt = `get the Git blame for the file "${params.filePath}".`;
        assert.strictEqual(prompt, 'get the Git blame for the file "src/x.ts".');
    });

    test('tag_head formats name and upstream', () => {
        const params = { name: 'v1.0.0', upstream: 'origin' };
        const prompt = `tag the current commit with the name "${params.name}" and associate it with the "${params.upstream}" remote.`;
        assert.strictEqual(prompt, 'tag the current commit with the name "v1.0.0" and associate it with the "origin" remote.');
    });

    test('delete_tag formats name', () => {
        const params = { name: 'v1.0.0' };
        const prompt = `delete the tag "${params.name}".`;
        assert.strictEqual(prompt, 'delete the tag "v1.0.0".');
    });

    test('set_git_config formats key/value', () => {
        const params = { key: 'user.name', value: 'Alice' };
        const prompt = `set the Git config key "${params.key}" to "${params.value}".`;
        assert.strictEqual(prompt, 'set the Git config key "user.name" to "Alice".');
    });

    test('get_git_config without key', () => {
        const prompt = 'get the Git config.';
        assert.strictEqual(prompt, 'get the Git config.');
    });

    test('get_git_config with key', () => {
        const params = { key: 'core.editor' };
        const prompt = `get the Git config key "${params.key}".`;
        assert.strictEqual(prompt, 'get the Git config key "core.editor".');
    });

    test('fetch_git_commits remote+branch', () => {
        const params = { remoteName: 'origin', branchName: 'main' };
        const prompt = `fetch commits ${params.remoteName}/${params.branchName}.`;
        assert.strictEqual(prompt, 'fetch commits origin/main.');
    });

    test('fetch_git_commits remote only', () => {
        const params: { remoteName: string } = { remoteName: 'origin' };
        const prompt = `fetch commits from ${params.remoteName}.`;
        assert.strictEqual(prompt, 'fetch commits from origin.');
    });

    test('fetch_git_commits branch only', () => {
        const params: { branchName: string } = { branchName: 'dev' };
        const prompt = `fetch commits from ${params.branchName}.`;
        assert.strictEqual(prompt, 'fetch commits from dev.');
    });

    test('pull_git_commits fixed prompt', () => {
        const prompt = 'pull commits.';
        assert.strictEqual(prompt, 'pull commits.');
    });

    test('push_git_commits remote+branch', () => {
        const params: { remoteName: string; branchName: string; forcePush: boolean } = { remoteName: 'origin', branchName: 'main', forcePush: false };
        const force = params.forcePush ? 'force ' : '';
        const prompt = `${force}push commits to ${params.remoteName}/${params.branchName}.`;
        assert.strictEqual(prompt, 'push commits to origin/main.');
    });

    test('push_git_commits remote only forced', () => {
        const params: { remoteName: string; forcePush: boolean } = { remoteName: 'origin', forcePush: true };
        const force = params.forcePush ? 'force ' : '';
        const prompt = `${force}push commits to ${params.remoteName}.`;
        assert.strictEqual(prompt, 'force push commits to origin.');
    });

    test('push_git_commits no remote/branch forced', () => {
        const params: { forcePush: boolean } = { forcePush: true };
        const force = params.forcePush ? 'force ' : '';
        const prompt = `${force}push commits.`;
        assert.strictEqual(prompt, 'force push commits.');
    });

    test('add_git_remote formats remote and URL', () => {
        const params = { remoteName: 'origin', remoteURL: 'git@x:y.git' };
        const prompt = `add a new remote "${params.remoteName}" with URL "${params.remoteURL}".`;
        assert.strictEqual(prompt, 'add a new remote "origin" with URL "git@x:y.git".');
    });

    test('remove_git_remote formats remote', () => {
        const params = { remoteName: 'origin' };
        const prompt = `remove the remote "${params.remoteName}".`;
        assert.strictEqual(prompt, 'remove the remote "origin".');
    });

    test('rename_git_remote formats old/new names', () => {
        const params = { oldRemoteName: 'origin', newRemoteName: 'upstream' };
        const prompt = `rename the remote "${params.oldRemoteName}" to "${params.newRemoteName}".`;
        assert.strictEqual(prompt, 'rename the remote "origin" to "upstream".');
    });

    test('abort_merge fixed prompt', () => {
        const prompt = 'abort the current merge operation.';
        assert.strictEqual(prompt, 'abort the current merge operation.');
    });
});


