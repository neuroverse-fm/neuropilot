import * as vscode from 'vscode';

import { assert, logOutput, simpleFileName } from "./utils";
import { NEURO } from './constants';

export function sendCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if(!editor) {
        logOutput('ERROR', 'No active text editor');
        vscode.window.showErrorMessage('No active text editor.');
        return;
    }
    const document = editor.document;
    const fileName = simpleFileName(document.fileName);
    const language = document.languageId;
    const text = document.getText();

    if(!NEURO.connected) {
        logOutput('ERROR', 'Attempted to send current file while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    logOutput('INFO', 'Sending current file to Neuro API');
    NEURO.client?.sendContext(`Current file: ${fileName}\n\nContent:\n\n\`\`\`${language}\n${text}\n\`\`\``);
}
