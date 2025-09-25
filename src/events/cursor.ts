import * as vscode from 'vscode';

/** Cursor moved event - fires when Neuro's cursor is moved for any reason
 * Null typing is used if the cursor is not on the page.
 * Undefined is used when the text editor does not exist.
 */
const _onDidMoveCursor = new vscode.EventEmitter<vscode.Position | null | undefined>();

/** 
 * Disposable for the EventEmitter.
 * Used to push the Disposable into the extension context.
 */
export const moveCursorEmitterDiposable = new vscode.Disposable(_onDidMoveCursor.dispose);

/**
 * Subscribe to this event to be notified when Neuro's cursor position moved.
 */
export const onDidMoveCursor: vscode.Event<vscode.Position | null | undefined> = _onDidMoveCursor.event;

/**
 * Event fire function.
 */
export function fireMovedCursorEvent(position: vscode.Position | null | undefined) {
    _onDidMoveCursor.fire(position);
}
