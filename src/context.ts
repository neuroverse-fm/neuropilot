import * as vscode from 'vscode';
import { NeuroClient } from 'neuro-game-sdk';

import { assert, logOutput } from "./utils";
import { NEURO } from './constants';

export function sendCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if(!editor) {
        logOutput('ERROR', 'No active text editor');
        vscode.window.showErrorMessage('No active text editor.');
        return;
    }
    const document = editor.document;
    let fileName = document.fileName.replace(/\\/g, '/');
    const language = document.languageId;
    const text = document.getText();

    if(!NEURO.connected) {
        logOutput('ERROR', 'Attempted to send current file while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }
    assert(NEURO.client instanceof NeuroClient);

    const rootFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath.replace(/\\/, '/');
    if(rootFolder && fileName.startsWith(rootFolder))
        fileName = fileName.substring(rootFolder.length);
    else
        fileName = fileName.substring(fileName.lastIndexOf('/') + 1);

    logOutput('INFO', 'Sending current file to Neuro API');
    NEURO.client.sendContext(`Current file: ${fileName}\nLanguage: ${language}\nContent:\n\`\`\`\n${text}\n\`\`\``);
}
