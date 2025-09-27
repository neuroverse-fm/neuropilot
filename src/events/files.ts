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
import { RCECancelEvent } from './utils';
import { CONFIG } from '../config';

/**
 * Wrapper event to check if a specific file is created.
 * This creates the EventEmitter and returns the event, and will auto-fire if the specified file is affected.
 * 
 * @param file An absolute path to the file.
 */
export function targetedFileCreatedEvent(file: string) {
    return new RCECancelEvent({
        reason: `the file ${file} was created by Vedal.`,
        logReason: (_data) => `${CONFIG.currentlyAsNeuroAPI} created the file ${file}.`,
        events: [
            [vscode.workspace.onDidCreateFiles, (data) => {
                const workspaceUri = getWorkspaceUri();
                const fileUri = workspaceUri?.with({ path: workspaceUri.path + '/' + file });
                return (data as vscode.FileCreateEvent).files.some(f => f.fsPath === fileUri?.fsPath);
            }],
        ],
    });
}

/**
 * Wrapper event to check if a specific file is deleted.
 * This creates the EventEmitter and returns the event, and will auto-fire if the specified file is affected.
 * 
 * @param file An absolute path to the file.
 */
export function targetedFileDeletedEvent(file: string) {
    return new RCECancelEvent({
        reason: `the file ${file} was created.`,
        logReason: (_data) => `${CONFIG.currentlyAsNeuroAPI} deleted the file ${file}.`,
        events: [
            [vscode.workspace.onDidDeleteFiles, (data) => (data as vscode.FileDeleteEvent).files.some(f => f.fsPath === vscode.Uri.file(file).fsPath)],
        ],
    });
}
