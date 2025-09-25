import * as vscode from 'vscode';
import { fireEvent } from './utils';
import { CancelEvent } from '../neuro_client_helper';

/**
 * Wrapper event to check if a specific file no longer has any linting issues.
 * This creates the EventEmitter and returns the event, and will auto-fire if the specified file is affected.
 * 
 * @param file An absolute path to the file.
 */
export function targetedFileLintingResolvedEvent(file: string): CancelEvent {
    const fileUri = vscode.Uri.file(file);
    const eventEmitter = new vscode.EventEmitter<void>();
    const disposableArray: vscode.Disposable[] = [];

    let previousDiagnostics = vscode.languages.getDiagnostics(fileUri);

    disposableArray.push(
        vscode.languages.onDidChangeDiagnostics((event) => {
            if (event.uris.some(uri => uri.fsPath === fileUri.fsPath)) {
                const currentDiagnostics = vscode.languages.getDiagnostics(fileUri);

                // Check if we had issues before but now have none
                if (previousDiagnostics.length > 0 && currentDiagnostics.length === 0) {
                    fireEvent(eventEmitter, disposableArray);
                }

                previousDiagnostics = currentDiagnostics;
            }
        }),
    );

    return {
        event: eventEmitter.event,
        extraDisposables: new vscode.Disposable(() => fireEvent(eventEmitter, disposableArray)),
        reason: `the file ${file} no longer has any linting issues.`,
    };
}

/**
 * Wrapper event to check if a specific folder no longer has any linting issues.
 * This creates the EventEmitter and returns the event, and will auto-fire if any file in the folder is affected.
 * 
 * @param folder An absolute path to the folder.
 */
export function targetedFolderLintingResolvedEvent(folder: string): CancelEvent {
    const folderUri = vscode.Uri.file(folder);
    const eventEmitter = new vscode.EventEmitter<void>();
    const disposableArray: vscode.Disposable[] = [];

    // Track diagnostics for files in this folder
    const previousDiagnosticsMap = new Map<string, vscode.Diagnostic[]>();

    // Initialize with current diagnostics
    const allDiagnostics = vscode.languages.getDiagnostics();
    for (const [uri, diagnostics] of allDiagnostics) {
        if (uri.fsPath.startsWith(folderUri.fsPath)) {
            previousDiagnosticsMap.set(uri.fsPath, diagnostics);
        }
    }

    disposableArray.push(
        vscode.languages.onDidChangeDiagnostics((event) => {
            let folderNowClean = false;

            for (const uri of event.uris) {
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
                fireEvent(eventEmitter, disposableArray);
            }
        }),
    );

    return {
        event: eventEmitter.event,
        extraDisposables: new vscode.Disposable(() => fireEvent(eventEmitter, disposableArray)),
        reason: `the folder ${folder} no longer has any linting issues.`,
    };
}

/**
 * Wrapper event to check if the current workspace no longer has any linting issues.
 * This creates the EventEmitter and returns the event, and will auto-fire if the workspace becomes clean.
 */
export function workspaceLintingResolvedEvent(): CancelEvent {
    const eventEmitter = new vscode.EventEmitter<void>();
    const disposableArray: vscode.Disposable[] = [];

    let hadDiagnostics = vscode.languages.getDiagnostics().length > 0;

    disposableArray.push(
        vscode.languages.onDidChangeDiagnostics(() => {
            const currentDiagnostics = vscode.languages.getDiagnostics();
            const hasDiagnostics = currentDiagnostics.length > 0;

            // Fire if we had diagnostics before but now have none
            if (hadDiagnostics && !hasDiagnostics) {
                fireEvent(eventEmitter, disposableArray);
            }

            hadDiagnostics = hasDiagnostics;
        }),
    );

    return {
        event: eventEmitter.event,
        extraDisposables: new vscode.Disposable(() => fireEvent(eventEmitter, disposableArray)),
        reason: 'the workspace no longer has any linting issues.',
    };
}
