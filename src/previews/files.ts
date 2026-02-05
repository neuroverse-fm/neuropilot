import * as vscode from 'vscode';
import { NEURO } from '@/constants';

class PreviewFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
    private _em = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._em.event;
    private promptString?: string;

    // internal state that provideFileDecoration will read
    private marked = new Set<string>();

    provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
        if (this.marked.has(uri.toString())) {
            const dec = new vscode.FileDecoration('💜', `(Preview) ${NEURO.currentController} wants to ${this.promptString ?? 'uhhhh, do something with this file?'}`, new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
            dec.propagate = false;
            return dec;
        }
        return undefined;
    }

    // PUBLIC API: mark a file and refresh just that URI
    public mark(uri: vscode.Uri) {
        this.marked.add(uri.toString());
        this._em.fire(uri); // only refresh this URI
    }

    // PUBLIC API: unmark a file
    public unmark(uri: vscode.Uri) {
        this.marked.delete(uri.toString());
        this._em.fire(uri);
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
