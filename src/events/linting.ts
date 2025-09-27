import * as vscode from 'vscode';
import { RCECancelEvent } from './utils';
import { getWorkspaceUri } from '@/utils';

/**
 * Wrapper event to check if a specific file no longer has any linting issues.
 * This creates the EventEmitter and returns the event, and will auto-fire if the specified file is affected.
 * 
 * @param file An absolute path to the file.
 */
export function targetedFileLintingResolvedEvent(file: string): RCECancelEvent {
    const workspaceUri = getWorkspaceUri()!;
    const fileUri = workspaceUri.with({ path: workspaceUri.path + '/' + file });

    let previousDiagnostics = vscode.languages.getDiagnostics(fileUri);

    return new RCECancelEvent({
        reason: `the file ${file} no longer has linting issues.`,
        events: [
            [vscode.languages.onDidChangeDiagnostics, (event) => {
                if ((event as vscode.DiagnosticChangeEvent).uris.some(uri => uri.fsPath === fileUri.fsPath)) {
                    const currentDiagnostics = vscode.languages.getDiagnostics(fileUri);

                    // Check if we had issues before but now have none
                    if (previousDiagnostics.length > 0 && currentDiagnostics.length === 0) {
                        return true;
                    }

                    previousDiagnostics = currentDiagnostics;
                }
                return false;
            }],
        ],
    });
}

/**
 * Wrapper event to check if a specific folder no longer has any linting issues.
 * This creates the EventEmitter and returns the event, and will auto-fire if any file in the folder is affected.
 * 
 * @param folder An absolute path to the folder.
 */
export function targetedFolderLintingResolvedEvent(folder: string): RCECancelEvent {
    const workspaceUri = getWorkspaceUri()!;
    const folderUri = workspaceUri.with({ path: workspaceUri.path + '/' + folder });

    // Track diagnostics for files in this folder
    const previousDiagnosticsMap = new Map<string, vscode.Diagnostic[]>();

    // Initialize with current diagnostics
    const allDiagnostics = vscode.languages.getDiagnostics();
    for (const [uri, diagnostics] of allDiagnostics) {
        if (uri.fsPath.startsWith(folderUri.fsPath)) {
            previousDiagnosticsMap.set(uri.fsPath, diagnostics);
        }
    }

    return new RCECancelEvent({
        reason: `the folder ${folder} no longer has any linting issues.`,
        events: [
            [vscode.languages.onDidChangeDiagnostics, (event) => {
                let folderNowClean = false;

                for (const uri of (event as vscode.DiagnosticChangeEvent).uris) {
                    if (uri.fsPath.startsWith(folderUri.fsPath)) {
                        const currentDiagnostics = vscode.languages.getDiagnostics(uri);
                        const previousDiagnostics = previousDiagnosticsMap.get(uri.fsPath) || [];

                        // Update our tracking
                        if (currentDiagnostics.length === 0) {
                            previousDiagnosticsMap.delete(uri.fsPath);
                        } else {
                            previousDiagnosticsMap.set(uri.fsPath, currentDiagnostics);
                        }

                        // Check if file was cleaned
                        if (previousDiagnostics.length > 0 && currentDiagnostics.length === 0) {
                            folderNowClean = true;
                        }
                    }
                }

                // Check if entire folder is now clean
                if (folderNowClean && previousDiagnosticsMap.size === 0) {
                    return true;
                }

                return false;
            }],
        ],
    });
}

/**
 * Wrapper event to check if the current workspace no longer has any linting issues.
 * This creates the EventEmitter and returns the event, and will auto-fire if the workspace becomes clean.
 */
export function workspaceLintingResolvedEvent(): RCECancelEvent {
    let hadDiagnostics = vscode.languages.getDiagnostics().length > 0;

    return new RCECancelEvent({
        reason: 'the workspace no longer has any linting issues.',
        events: [
            [vscode.languages.onDidChangeDiagnostics, () => {
                const currentDiagnostics = vscode.languages.getDiagnostics();
                const hasDiagnostics = currentDiagnostics.length > 0;

                // Fire if we had diagnostics before but now have none
                if (hadDiagnostics && !hasDiagnostics) {
                    return true;
                }

                hadDiagnostics = hasDiagnostics;
                return false;
            }],
        ],
    });
}
