import * as vscode from 'vscode';
import * as path from 'path';
import { NeuroClient } from "neuro-game-sdk";
var globToRegExp = require('glob-to-regexp');

import { ChildProcessWithoutNullStreams } from 'child_process';

import { NEURO } from './constants';
import { Range } from 'vscode';

export const REGEXP_ALWAYS = /^/;
export const REGEXP_NEVER = /^\b$/;

export function assert(obj: unknown): asserts obj {
    if(!obj) throw new Error('Assertion failed');
}

export function logOutput(tag: string, message: string) {
    if(!NEURO.outputChannel) {
        console.error('Output channel not initialized');
        return;
    }
    const ms = Date.now() % 1000;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'}) + '.' + ms.toString().padStart(3, '0');
    const prefix = `${time} [${tag}] `;
    for(const line of message.split('\n')) {
        NEURO.outputChannel.appendLine(prefix + line);
    }
}

export function createClient() {
    logOutput('INFO', 'Creating Neuro API client');
    if(NEURO.client)
        NEURO.client.disconnect();

    NEURO.connected = false;
    NEURO.waiting = false;
    NEURO.cancelled = false;
    NEURO.waitingForCookie = false;

    // TODO: Check if this is a memory leak
    NEURO.client = new NeuroClient(NEURO.url, NEURO.gameName, () => {
        assert(NEURO.client instanceof NeuroClient);

        logOutput('INFO', 'Connected to Neuro API');
        NEURO.connected = true;

        vscode.window.showInformationMessage('Successfully connected to Neuro API.');

        NEURO.client.sendContext(
            vscode.workspace.getConfiguration('neuropilot').get('initialContext', 'Something went wrong, blame whoever made this extension.'),
        );

        NEURO.client.onClose = () => {
            NEURO.connected = false;
            logOutput('INFO', 'Disconnected from Neuro API');
            vscode.window.showInformationMessage('Disconnected from Neuro API.');
        };

        NEURO.client.onError = (error) => {
            logOutput('ERROR', `Neuro client error: ${error}`);
            vscode.window.showErrorMessage(`Neuro client error: ${error}`);
        };

        for(const handler of clientConnectedHandlers) {
            handler();
        }
    });

    NEURO.client.onError = () => {
        logOutput('ERROR', 'Could not connect to Neuro API');
        vscode.window.showErrorMessage('Could not connect to Neuro API.');
    };
}

const clientConnectedHandlers: (() => void)[] = [];

export function onClientConnected(handler: () => void) {
    clientConnectedHandlers.push(handler);
}

export function simpleFileName(fileName: string): string {
    const rootFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath.replace(/\\/, '/');
    let result = fileName.replace(/\\/g, '/');
    if(rootFolder && result.startsWith(rootFolder))
        return result.substring(rootFolder.length);
    else
        return result.substring(result.lastIndexOf('/') + 1);
}

export function filterFileContents(contents: string): string {
    return contents.replace(/\r\n/g, '\n');
}

interface NeuroPositionContext {
    contextBefore: string;
    contextAfter: string;
}

export function getPositionContext(document: vscode.TextDocument, position: vscode.Position): NeuroPositionContext {
    const beforeContextLength = vscode.workspace.getConfiguration('neuropilot').get('beforeContext', 10);
    const afterContextLength = vscode.workspace.getConfiguration('neuropilot').get('afterContext', 10);
    
    const contextStart = Math.max(0, position.line - beforeContextLength);
    const contextBefore = filterFileContents(document.getText(new Range(new vscode.Position(contextStart, 0), position)));
    const contextEnd = Math.min(document.lineCount - 1, position.line + afterContextLength);
    const contextAfter = document.getText(new Range(position, new vscode.Position(contextEnd, document.lineAt(contextEnd).text.length))).replace(/\r\n/g, '\n');

    return {
        contextBefore: filterFileContents(contextBefore),
        contextAfter: filterFileContents(contextAfter)
    };
}

export function formatActionID(name: string): string {
    // Action IDs must be snake_case
    return name
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .toLowerCase();
}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
}

/**
 * Gets the path to the first workspace folder.
 * The path is normalized to use forward slashes.
 * @returns The path to the workspace folder, or undefined if the workspace is not open.
 */
export function getWorkspacePath(): string | undefined {
    const path = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    return path ? normalizePath(path) : undefined;
}

export function combineGlobLines(lines: string): string {
    const result = lines.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(',');
    return `{${result}}`;
}

export function combineGlobLinesToRegExp(lines: string): RegExp {
    const result = lines.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => globToRegExp(line, { extended: true, globstar: true }).source)
        .join('|');
    return new RegExp(result);
}

/**
 * Check if a path is safe for Neuro to access.
 * Neuro may not access paths outside the workspace, or files and folders starting with a dot.
 * This is a security measure to prevent Neuro from modifying her own permissions or adding arbitrary tasks.
 * @param path The path to check.
 * @param checkPatterns Whether to check against include and exclude patterns.
 * @returns True if Neuro may safely access the path.
 */
export function isPathNeuroSafe(path: string, checkPatterns: boolean = true): boolean {
    const rootFolder = getWorkspacePath();
    const normalizedPath = normalizePath(path);
    const includePattern = vscode.workspace.getConfiguration('neuropilot').get('includePattern', '**/*');
    const excludePattern = vscode.workspace.getConfiguration('neuropilot').get<string>('excludePattern');
    const includeRegExp: RegExp = checkPatterns ? combineGlobLinesToRegExp(includePattern) : REGEXP_ALWAYS;
    const excludeRegExp: RegExp = (checkPatterns && excludePattern) ? combineGlobLinesToRegExp(excludePattern) : REGEXP_NEVER;

    if (hasPermissions(PERMISSIONS.dotFileAccess)) {
        return rootFolder !== undefined
            && normalizedPath !== rootFolder            // Prevent access to the workspace folder itself
            && normalizedPath.startsWith(rootFolder)    // Prevent access to paths outside the workspace
            && !normalizedPath.includes('..')           // Prevent access to parent folders
            && !normalizedPath.includes('~')            // Prevent access to home directory
            && !normalizedPath.includes('$')            // Prevent access to environment variables
            && includeRegExp.test(normalizedPath)       // Check against include pattern
            && !excludeRegExp.test(normalizedPath);     // Check against exclude pattern
    }

    return rootFolder !== undefined
        && normalizedPath !== rootFolder            // Prevent access to the workspace folder itself
        && normalizedPath.startsWith(rootFolder)    // Prevent access to paths outside the workspace
        && !normalizedPath.includes('/.')           // Prevent access to special files and folders (e.g. .vscode)
        && !normalizedPath.includes('..')           // Prevent access to parent folders
        && !normalizedPath.includes('~')            // Prevent access to home directory
        && !normalizedPath.includes('$')            // Prevent access to environment variables
        && includeRegExp.test(normalizedPath)       // Check against include pattern
        && !excludeRegExp.test(normalizedPath);     // Check against exclude pattern
}

// Helper function to normalize repository paths
export function getNormalizedRepoPathForGit(repoPath: string): string {
  // Remove trailing backslashes
  let normalized = repoPath.replace(/\\+$/, '');
  // Normalize the path to remove redundant separators etc.
  normalized = path.normalize(normalized);
  // Convert backslashes to forward slashes if needed by your Git library
  normalized = normalized.replace(/\\/g, '/');
  return normalized;
}

/**
 * Checks whether the specified permission is enabled.
 * @param permissions The permissions to query.
 * @returns `true` if all the permission are enabled, otherwise `false`.
 */
export function hasPermissions(...permissions: Permission[]): boolean {
    return permissions.every(permission => vscode.workspace.getConfiguration('neuropilot').get('permission.' + permission.id, false));
}

/**
 * Gets the value of the specified permission.
 * @param config The config entry to get.
 * @returns The config value, `undefined` if the config doesn't exist, or `null` if there is no value.
 */

export function checkConfig(config: string) {
    if (!CONFIGS.includes(config)) {
        return undefined
    }

    return vscode.workspace.getConfiguration('neuropilot').get(config) || null
}

/*
 * Extended interface for terminal sessions.
 * We now explicitly store the event emitter along with the pseudoterminal.
 */
export interface TerminalSession {
    terminal: vscode.Terminal;
    pty: vscode.Pseudoterminal;
    emitter: vscode.EventEmitter<string>;
    outputStdout?: string;
    outputStderr?: string;
    processStarted: boolean;
    shellProcess?: ChildProcessWithoutNullStreams;
    shellType: string;
}

export const delayAsync = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface Permission {
    /** The ID of the permission in package.json, without the `neuropilot.permission.` prefix. */
    id: string;
    /** The infinitive of the permission to construct sentences (should fit the scheme "permission to {something}"). */
    infinitive: string;
}

/** Collection of strings for use in {@link actionResultNoPermission}. */
export const PERMISSIONS: Record<string, Permission> = {
    openFiles:          { id: 'openFiles',                infinitive: 'open files' },
    editActiveDocument: { id: 'editActiveDocument',       infinitive: 'edit documents' },
    create:             { id: 'create',                   infinitive: 'create files or folders' },
    rename:             { id: 'rename',                   infinitive: 'rename files or folders' },
    delete:             { id: 'delete',                   infinitive: 'delete files or folders' },
    runTasks:           { id: 'runTasks',                 infinitive: 'run or terminate tasks' },
    requestCookies:     { id: 'requestCookies',           infinitive: 'request cookies' },
    gitOperations:      { id: 'gitOperations',            infinitive: 'use Git' },
    gitTags:            { id: 'gitTags',                  infinitive: 'tag commits' },
    gitRemotes:         { id: 'gitRemotes',               infinitive: 'interact with Git remotes' },
    editRemoteData:     { id: 'editRemoteData',           infinitive: 'edit remote data' },
    gitConfigs:         { id: 'gitConfigs',               infinitive: 'edit the Git configuration' },
    terminalAccess:     { id: 'terminalAccess',           infinitive: 'access the terminal' },
};

export const CONFIGS: string[] = [
    "websocketUrl",
    "gameName",
    "beforeContext",
    "afterContext",
    "maxCompletions",
    "completionTrigger",
    "initialContext",
    "timeout",
    "includePattern",
    "excludePattern",
    "terminals",
    "showTimeOnTerminalStart",
    "terminalContextDelay"
];
