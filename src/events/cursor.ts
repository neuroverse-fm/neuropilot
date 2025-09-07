import * as vscode from 'vscode';

// Cursor moved event - fires when Neuro's cursor is moved for any reason
// Null typing is used if the cursor is not on the page.
// Undefined is used when the text editor does not exist.
const _onDidMoveCursor = new vscode.EventEmitter<vscode.Position | null | undefined>();

export const onDidMoveCursor: vscode.Event<vscode.Position | null | undefined> = _onDidMoveCursor.event;

/**
 * Event fire function.
 */
export function fireMovedCursorEvent(position: vscode.Position | null | undefined) {
    _onDidMoveCursor.fire(position);
}
