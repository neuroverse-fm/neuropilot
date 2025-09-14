import * as vscode from 'vscode';

export function fireEvent(emitter: vscode.EventEmitter<unknown>, disposables: vscode.Disposable[]) {
    emitter.fire(undefined);
    for (const dispose of disposables) {
        dispose.dispose();
    }
    emitter.dispose();
}
