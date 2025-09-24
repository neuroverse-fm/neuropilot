import * as vscode from 'vscode';
import { Action } from 'neuro-game-sdk';
import { NEURO } from './constants';
import { logOutput } from './utils';

interface DeprecatedSetting {
    old: string;
    new: string | ((target?: vscode.ConfigurationTarget) => Promise<void>);
}

/** Array of deprecated settings */
const DEPRECATED_SETTINGS: DeprecatedSetting[] = [
    {
        old: 'websocketUrl',
        new: 'connection.websocketUrl',
    },
    {
        old: 'gameName',
        new: 'connection.gameName',
    },
    {
        old: 'initialContext',
        new: 'connection.initialContext',
    },
    {
        old: 'includePattern',
        async new(target?: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            const config = getConfig<string>(DEPRECATED_SETTINGS[3].old)!;
            const newConfig = config.split('\n');
            await cfg.update('access.includePattern', newConfig, target);
        },
    },
    {
        old: 'excludePattern',
        async new(target?: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            const config = getConfig<string>(DEPRECATED_SETTINGS[4].old)!;
            const newConfig = config.split('\n');
            await cfg.update('access.excludePattern', newConfig, target);
        },
    },
    {
        old: 'allowUnsafePaths',
        async new(target?: vscode.ConfigurationTarget) {
            const cfg = vscode.workspace.getConfiguration('neuropilot');
            await cfg.update('access.dotFiles', true, target);
            await cfg.update('access.externalFiles', true, target);
            await cfg.update('access.environmentVariables', true, target);
        },
    },
];

/** Function to check deprecated messages */
export async function checkDeprecatedSettings() {
    if (NEURO.context?.globalState.get('no-migration')) return;
    const cfg = vscode.workspace.getConfiguration('neuropilot');
    const deprecatedSettings: Record<string, { value: unknown; target: vscode.ConfigurationTarget }> = {};

    for (const setting of DEPRECATED_SETTINGS) {
        const inspection = cfg.inspect(setting.old);
        let target: vscode.ConfigurationTarget | undefined;
        let value: unknown;

        // Determine the configuration target and value based on priority
        if (inspection?.workspaceFolderValue !== undefined) {
            target = vscode.ConfigurationTarget.WorkspaceFolder;
            value = inspection.workspaceFolderValue;
        } else if (inspection?.workspaceValue !== undefined) {
            target = vscode.ConfigurationTarget.Workspace;
            value = inspection.workspaceValue;
        } else if (inspection?.globalValue !== undefined) {
            target = vscode.ConfigurationTarget.Global;
            value = inspection.globalValue;
        }

        if (target !== undefined && value !== undefined) {
            deprecatedSettings[setting.old] = { value, target };
        }
    }

    const keys = Object.keys(deprecatedSettings);
    if (keys.length > 0) {
        const notif = await vscode.window.showInformationMessage(
            `You have ${keys.length} deprecated configurations. Would you like to migrate them?`,
            'Yes', 'No', 'Don\'t show again',
        );

        if (notif) {
            switch (notif) {
                case 'Yes':
                    for (const key of keys) {
                        const updateObject = DEPRECATED_SETTINGS.find(o => o.old === key);
                        const settingInfo = deprecatedSettings[key];

                        if (updateObject && updateObject.old && settingInfo) {
                            if (typeof updateObject.new === 'string') {
                                // Update with the same configuration target
                                await cfg.update(updateObject.new, settingInfo.value, settingInfo.target);
                                // Remove the old setting
                                await cfg.update(updateObject.old, undefined, settingInfo.target);
                            } else {
                                // For custom migration functions, pass the target info
                                await updateObject.new(settingInfo.target);
                                // Remove the old setting from the detected target
                                await cfg.update(updateObject.old, undefined, settingInfo.target);
                            }
                        }
                    }
                    break;
                case 'No':
                    break;
                case 'Don\'t show again':
                    if (NEURO.context) {
                        NEURO.context.globalState.update('no-migration', true);
                    } else {
                        logOutput('ERROR', 'Couldn\'t save no-migration preference to memento because of a missing extension context.');
                    }
                    break;
            }
        }
    }
}

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
export function getConfig<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>(key);
}

export function getAccess<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>('access.' + key);
}

export function getConnection<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('neuropilot').get<T>('connection.' + key);
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
    get beforeContext(): number { return getConfig('beforeContext')!; }
    get afterContext(): number { return getConfig('afterContext')!; }
    get maxCompletions(): number { return getConfig('maxCompletions')!; }
    get completionTrigger(): string { return getConfig('completionTrigger')!; }
    get timeout(): number { return getConfig('timeout')!; }
    get showTimeOnTerminalStart(): boolean { return getConfig('showTimeOnTerminalStart')!; }
    get terminalContextDelay(): number { return getConfig('terminalContextDelay')!; }
    get allowRunningAllTasks(): boolean { return getConfig('allowRunningAllTasks')!; }
    get sendNewLintingProblemsOn(): string { return getConfig('sendNewLintingProblemsOn')!; }
    get sendSaveNotifications(): boolean { return getConfig('sendSaveNotifications')!; }
    get requestExpiryTimeout(): number { return getConfig('requestExpiryTimeout')!; }
    get hideCopilotRequests(): boolean { return getConfig('hideCopilotRequests')!; }
    get cursorFollowsNeuro(): boolean { return getConfig('cursorFollowsNeuro')!; }
    get currentlyAsNeuroAPI(): string { return getConfig('currentlyAsNeuroAPI')!; }
    get docsURL(): string { return getConfig('docsURL')!; }
    get defaultOpenDocsWindow(): string { return getConfig('defaultOpenDocsWindow')!; }
    get disabledActions(): string[] { return getConfig('disabledActions')!; }
    get sendContentsOnFileChange(): boolean { return getConfig('sendContentsOnFileChange')!; }
    get cursorPositionContextStyle(): string { return getConfig('cursorPositionContextStyle')!; }
    get lineNumberContextFormat(): string { return getConfig('lineNumberContextFormat')!; }

    get terminals(): { name: string; path: string; args?: string[]; }[] { return getConfig('terminals')!; }
}

export const CONFIG = new Config();

class Access {
    get includePattern(): string[] { return getAccess<string[]>('includePattern')!; }
    get excludePattern(): string[] { return getAccess<string[]>('excludePattern')!; }
    get dotFiles(): boolean { return getAccess<boolean>('dotFiles')!; }
    get externalFiles(): boolean { return getAccess<boolean>('externalFiles')!; }
    get environmentVariables(): boolean { return getAccess<boolean>('environmentVariables')!; }
}

export const ACCESS = new Access();

class Connection {
    get websocketUrl(): string { return getConnection<string>('websocketUrl')!; }
    get gameName(): string { return getConnection<string>('gameName')!; }
    get initialContext(): string { return getConnection<string>('initialContext')!; }
    get autoConnect(): boolean { return getConnection<boolean>('autoConnect')!; }
    get retryInterval(): number { return getConnection<number>('retryInterval')!; }
    get retryAmount(): number { return getConnection<number>('retryAmount')!; }
}

export const CONNECTION = new Connection();
