import * as vscode from 'vscode';
import { Action } from 'neuro-game-sdk';
import { NEURO } from './constants';

/** Permission level enums */
export const enum PermissionLevel {
    OFF = 0,
    COPILOT = 1,
    AUTOPILOT = 2,
}

/**
 * Gets the value of the config
 * @param key The config key to get
 * @returns The value of the config, or `undefined` if it doesn't exist
 */
export function get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>(key);
}

export function checkAccess<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>('access.' + key);
}

export function isActionEnabled(action: string | Action): boolean {
    if (typeof action === 'string')
        return !CONFIG.disabledActions.includes(action);
    return !CONFIG.disabledActions.includes(action.name);
}

/**
 * Checks the configured permission level for each provided permission and returns 
 * the lowest (most restrictive) level.
 *
 * @param permissions The permission(s) to query.
 * @returns The lowest permission level in the list of permissions.
 * If no permissions are specified, this function assumes Copilot
 */
export function getPermissionLevel(...permissions: Permission[]): PermissionLevel {
    if (NEURO.killSwitch) {
        return PermissionLevel.OFF;
    }
    if (permissions.length === 0) {
        return PermissionLevel.COPILOT;
    }
    return permissions
        .map(permission => {
            let setting = vscode.workspace.getConfiguration('neuropilot')
                .get<string>('permission.' + permission.id, 'off');
            setting = setting.toLowerCase();
            switch (setting) {
                case 'autopilot':
                    return PermissionLevel.AUTOPILOT;
                case 'copilot':
                    return PermissionLevel.COPILOT;
                default:
                    return PermissionLevel.OFF;
            }
        })
        .reduce((lowest, level) => level < lowest ? level : lowest, PermissionLevel.AUTOPILOT);
}

export interface Permission {
    /** The ID of the permission in package.json, without the `neuropilot.permission.` prefix. */
    id: string;
    /** The infinitive of the permission to construct sentences (should fit the scheme "permission to {something}"). */
    infinitive: string;
}

/** Collection of strings for use in {@link actionResultNoPermission}. */
class Permissions {
    get openFiles() { return { id: 'openFiles', infinitive: 'open files' }; }
    get editActiveDocument() { return { id: 'editActiveDocument', infinitive: 'edit documents' }; }
    get create() { return { id: 'create', infinitive: 'create files or folders' }; }
    get rename() { return { id: 'rename', infinitive: 'rename files or folders' }; }
    get delete() { return { id: 'delete', infinitive: 'delete files or folders' }; }
    get runTasks() { return { id: 'runTasks', infinitive: 'run or terminate tasks' }; }
    get requestCookies() { return { id: 'requestCookies', infinitive: 'request cookies' }; }
    get gitOperations() { return { id: 'gitOperations', infinitive: 'use Git' }; }
    get gitTags() { return { id: 'gitTags', infinitive: 'tag commits' }; }
    get gitRemotes() { return { id: 'gitRemotes', infinitive: 'interact with Git remotes' }; }
    get editRemoteData() { return { id: 'editRemoteData', infinitive: 'edit remote data' }; }
    get gitConfigs() { return { id: 'gitConfigs', infinitive: 'edit the Git configuration' }; }
    get terminalAccess() { return { id: 'terminalAccess', infinitive: 'access the terminal' }; }
    get accessLintingAnalysis() { return { id: 'accessLintingAnalysis', infinitive: 'view linting problems' }; }
}

export const PERMISSIONS = new Permissions();

class Config {
    get websocketUrl(): string { return get('websocketUrl')!; }
    get gameName(): string { return get('gameName')!; }
    get beforeContext(): number { return get('beforeContext')!; }
    get afterContext(): number { return get('afterContext')!; }
    get maxCompletions(): number { return get('maxCompletions')!; }
    get completionTrigger(): string { return get('completionTrigger')!; }
    get initialContext(): string { return get('initialContext')!; }
    get timeout(): number { return get('timeout')!; }
    get showTimeOnTerminalStart(): boolean { return get('showTimeOnTerminalStart')!; }
    get terminalContextDelay(): number { return get('terminalContextDelay')!; }
    get allowRunningAllTasks(): boolean { return get('allowRunningAllTasks')!; }
    get sendNewLintingProblemsOn(): string { return get('sendNewLintingProblemsOn')!; }
    get sendSaveNotifications(): boolean { return get('sendSaveNotifications')!; }
    get requestExpiryTimeout(): number { return get('requestExpiryTimeout')!; }
    get hideCopilotRequests(): boolean { return get('hideCopilotRequests')!; }
    get cursorFollowsNeuro(): boolean { return get('cursorFollowsNeuro')!; }
    get currentlyAsNeuroAPI(): string { return get('currentlyAsNeuroAPI')!; }
    get docsURL(): string { return get('docsURL')!; }
    get defaultOpenDocsWindow(): string { return get('defaultOpenDocsWindow')!; }
    get disabledActions(): string[] { return get('disabledActions')!; }
    get sendContentsOnFileChange(): boolean { return get('sendContentsOnFileChange')!; }
    get cursorPositionContextStyle(): string { return get('cursorPositionContextStyle')!; }
    get lineNumberContextFormat(): string { return get('lineNumberContextFormat')!; }
    get enableCancelEvents(): boolean { return get('enableCancelEvents')!; }

    get terminals(): { name: string; path: string; args?: string[]; }[] { return get('terminals')!; }
}

export const CONFIG = new Config();

class Access {
    get includePattern(): string[] { return checkAccess<string[]>('includePattern')!; }
    get excludePattern(): string[] { return checkAccess<string[]>('excludePattern')!; }
    get dotFiles(): boolean { return checkAccess<boolean>('dotFiles')!; }
    get externalFiles(): boolean { return checkAccess<boolean>('externalFiles')!; }
    get environmentVariables(): boolean { return checkAccess<boolean>('environmentVariables')!; }
}

export const ACCESS = new Access();
