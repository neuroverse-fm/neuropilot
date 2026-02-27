import * as vscode from 'vscode';
import { NEURO } from '@/constants';
import { isPathNeuroSafe } from '@/utils/misc';

class PreviewFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
    private _em = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._em.event;

    // internal state that provideFileDecoration will read
    // Maps URI string to optional prompt string
    private marked = new Map<string, string | undefined>();
    private absolutelyAllFiles = false;
    private noChildren = false;

    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
        const symbol = NEURO.currentController === 'Neuro' ? '💜' : NEURO.currentController === 'Evil' ? '💔' : '🖥️';
        const uriString = uri.toString();

        // Check if the URI itself is marked (exact string match)
        if (this.marked.has(uriString)) {
            const promptString = this.marked.get(uriString);
            const dec = new vscode.FileDecoration(symbol, `(Preview) ${NEURO.currentController} wants to ${promptString ?? 'uhhhh, do something with this file?'}`, new vscode.ThemeColor('neuropilot.filePreviewEffectsColour'));
            dec.propagate = true; // Propagate to parent folders
            return dec;
        }

        // Normalize paths for comparison (remove trailing slashes)
        const uriPath = uri.path.replace(/\/+$/, '');

        // Check if any parent folder is marked (for child propagation) or if paths match
        if (!this.noChildren) {
            for (const [markedUriString, promptString] of this.marked.entries()) {
                const markedUri = vscode.Uri.parse(markedUriString);
                const markedPath = markedUri.path.replace(/\/+$/, '');

                // Check if paths are exactly equal (handles URI string differences like trailing slashes)
                if (uriPath === markedPath) {
                    const dec = new vscode.FileDecoration(symbol, `(Preview) ${NEURO.currentController} wants to ${promptString ?? 'uhhhh, do something with this file?'}`, new vscode.ThemeColor('neuropilot.filePreviewEffectsColour'));
                    dec.propagate = true; // Propagate to parent folders
                    return dec;
                }

                // Check if this URI is a child of the marked folder using path comparison
                if (uriPath.startsWith(markedPath + '/')) {
                // Skip if the child is not Neuro-safe (unless bypass is enabled)
                    if (!this.absolutelyAllFiles && !isPathNeuroSafe(uri.fsPath)) {
                        continue;
                    }

                    // Check if the marked URI is actually a directory
                    try {
                        const stat = await vscode.workspace.fs.stat(markedUri);
                        const isDirectory = (stat.type & vscode.FileType.Directory) === vscode.FileType.Directory;
                        if (isDirectory) {
                            const dec = new vscode.FileDecoration(symbol, `(Preview) ${NEURO.currentController} wants to ${promptString ?? 'uhhhh, do something with this folder?'}`, new vscode.ThemeColor('neuropilot.filePreviewEffectsColour'));
                            dec.propagate = false; // Don't propagate children up to unmarked parents
                            return dec;
                        }
                    } catch {
                    // If stat fails, it's not a directory
                        continue;
                    }
                }
            }
        }

        return undefined;
    }

    // TODO: return a Disposable to make it easy for preview functions (it's literally what this is designed for!)
    // PUBLIC API: mark multiple files/folders at once
    public mark(uris: vscode.Uri[], promptString?: string, absolutelyAllFiles = false, noChildren = false) {
        this.absolutelyAllFiles = absolutelyAllFiles;
        this.noChildren = noChildren;
        for (const uri of uris) {
            this.marked.set(uri.toString(), promptString);
        }
        // Fire undefined to refresh all decorations, ensuring children get checked
        this._em.fire(undefined);
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
        this.absolutelyAllFiles = false;
        this.noChildren = false;
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
