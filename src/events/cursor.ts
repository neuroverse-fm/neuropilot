import * as vscode from 'vscode';

interface CursorProps {
    line: number;
    column: number;
};

export class CursorMoved implements vscode.Disposable {
    private readonly _onDidMoveCursor = new vscode.EventEmitter<CursorProps>();

    private _isDisposed = true;

    public dispose(): void {}
}
