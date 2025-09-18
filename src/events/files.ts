/**
 * Plan for file events
 * 
 * This will cover for both file and editing actions.
 * 
 * Events list:
 * - onDidFileCreated<vscode.FileStat(?)> - When a new file was created.
 * - onDidFileDeleted<void> - When a file was deleted. Both this and onDidFileCreated will fire if a file was moved.
 */
import * as vscode from 'vscode';
import { fireEvent } from './utils';
import { CancelEventObject } from '../neuro_client_helper';

/**
 * Wrapper event to check if a specific file is affected.
 * This creates the EventEmitter and returns the event, and will auto-fire if the specified file is affected.
 * 
 * @param file An absolute path to the file.
 */
export function createTargetedFileEvent(file: string): CancelEventObject {
    const fileUri = vscode.Uri.file(file).fsPath;
    const eventEmitter = new vscode.EventEmitter<void>();
    const disposableArray: vscode.Disposable[] = [];
    disposableArray.push(
        /*vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document.uri.fsPath === fileUri) {
                fireEvent(eventEmitter, disposableArray);
            }
        }),*/
        vscode.workspace.onDidCreateFiles((event) => {
            if (event.files.some(f => f.fsPath === fileUri)) {
                fireEvent(eventEmitter, disposableArray);
            }
        }),
        vscode.workspace.onDidDeleteFiles((event) => {
            if (event.files.some(f => f.fsPath === fileUri)) {
                fireEvent(eventEmitter, disposableArray);
            }
        }),
    );
    return {
        event: eventEmitter.event,
        extraDisposables: new vscode.Disposable(() => fireEvent(eventEmitter, disposableArray)),
    };
}
