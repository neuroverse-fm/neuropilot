import * as vscode from 'vscode';
import { NEURO } from '@/constants';

class PreviewFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
    private _em = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._em.event;

    // internal state that provideFileDecoration will read
    // Maps URI string to optional prompt string
    private marked = new Map<string, string | undefined>();

    provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
        if (this.marked.has(uri.toString())) {
            const promptString = this.marked.get(uri.toString());
            const dec = new vscode.FileDecoration('💜', `(Preview) ${NEURO.currentController} wants to ${promptString ?? 'uhhhh, do something with this file?'}`, new vscode.ThemeColor('neuropilot.preview'));
            dec.propagate = true;
            return dec;
        }
        return undefined;
    }

    // PUBLIC API: mark multiple files/folders at once
    public mark(uris: vscode.Uri[], promptString?: string) {
        for (const uri of uris) {
            this.marked.set(uri.toString(), promptString);
        }
        this._em.fire(uris);
    }

    // PUBLIC API: unmark a file
    public unmark(uris: vscode.Uri[]) {
        for (const uri of uris) {
            this.marked.delete(uri.toString());
        }
        this._em.fire(uris);
    }

    // PUBLIC API: clear all marked files
    public clearAll() {
        this.marked.clear();
        this._em.fire(undefined);
    }

    // PUBLIC API: refresh arbitrary URIs (or all if undefined)
    public refresh(uris?: vscode.Uri | vscode.Uri[]) {
        this._em.fire(uris);
    }

    dispose() {
        this._em.dispose();
    }
}

export const filePreviewProvider = new PreviewFileDecorationProvider();
