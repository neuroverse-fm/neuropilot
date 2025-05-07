import * as vscode from 'vscode';

/**
 * Gets the value of the config
 * @param key The config key to get
 * @returns The value of the config, or `undefined` if it doesn't exist
 */
export function get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>(key);
}

/**
 * Checks whether the specified permission is enabled.
 * @param permissions The permissions to query.
 * @returns `true` if all the permission are enabled, otherwise `false`.
 */
export function hasPermissions(...permissions: Permission[]): boolean {
    return permissions.every(permission => vscode.workspace.getConfiguration('neuropilot').get('permission.' + permission.id, false));
}

export interface Permission {
    /** The ID of the permission in package.json, without the `neuropilot.permission.` prefix. */
    id: string;
    /** The infinitive of the permission to construct sentences (should fit the scheme "permission to {something}"). */
    infinitive: string;
}

/** Collection of strings for use in {@link actionResultNoPermission}. */
class Permissions {
    get openFiles()             { return { id: 'openFiles',                infinitive: 'open files' } }
    get editActiveDocument()    { return { id: 'editActiveDocument',       infinitive: 'edit documents' } }
    get create()                { return { id: 'create',                   infinitive: 'create files or folders' } }
    get rename()                { return { id: 'rename',                   infinitive: 'rename files or folders' } }
    get delete()                { return { id: 'delete',                   infinitive: 'delete files or folders' } }
    get runTasks()              { return { id: 'runTasks',                 infinitive: 'run or terminate tasks' } }
    get requestCookies()        { return { id: 'requestCookies',           infinitive: 'request cookies' } }
    get gitOperations()         { return { id: 'gitOperations',            infinitive: 'use Git' } }
    get gitTags()               { return { id: 'gitTags',                  infinitive: 'tag commits' } }
    get gitRemotes()            { return { id: 'gitRemotes',               infinitive: 'interact with Git remotes' } }
    get editRemoteData()        { return { id: 'editRemoteData',           infinitive: 'edit remote data' } }
    get gitConfigs()            { return { id: 'gitConfigs',               infinitive: 'edit the Git configuration' } }
    get terminalAccess()        { return { id: 'terminalAccess',           infinitive: 'access the terminal' } }
    get accessLintingAnalysis() { return { id: 'accessLintingAnalysis',    infinitive: 'view linting problems' } }
}

export const PERMISSIONS = new Permissions();

class Config {
    get websocketUrl(): string              { return get('websocketUrl')!; }
    get gameName(): string                  { return get('gameName')!; }
    get beforeContext(): number             { return get('beforeContext')!; }
    get afterContext(): number              { return get('afterContext')!; }
    get maxCompletions(): number            { return get('maxCompletions')!; }
    get completionTrigger(): string         { return get('completionTrigger')!; }
    get initialContext(): string            { return get('initialContext')!; }
    get timeout(): number                   { return get('timeout')!; }
    get includePattern(): string            { return get('includePattern')!; }
    get excludePattern(): string            { return get('excludePattern')!; }
    get showTimeOnTerminalStart(): boolean  { return get('showTimeOnTerminalStart')!; }
    get terminalContextDelay(): number      { return get('terminalContextDelay')!; }
    get allowUnsafePaths(): boolean         { return get('allowUnsafePaths')!; }
    get allowRunningAllTasks(): boolean     { return get('allowRunningAllTasks')!; }

    get terminals(): Array<{ name: string; path: string; args?: string[]; }> { return get('terminals')!; }
}

export const CONFIG = new Config();
