import * as vscode from 'vscode';

import { getFence, logOutput, simpleFileName } from '@/utils';
import { NEURO } from '@/constants';
import { CONNECTION, PermissionLevel, getPermissionLevel } from '@/config';
import { addActions } from './rce';
import { ActionData, RCEAction } from './neuro_client_helper';

export function sendCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        logOutput('ERROR', 'No active text editor');
        vscode.window.showErrorMessage('No active text editor.');
        return;
    }
    const document = editor.document;
    const fileName = simpleFileName(document.fileName);
    const language = document.languageId;
    const text = document.getText();

    if (!NEURO.connected) {
        logOutput('ERROR', 'Attempted to send current file while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    logOutput('INFO', 'Sending current file to Neuro API');
    const fence = getFence(text);
    NEURO.client?.sendContext(`${CONNECTION.userName} sent you the contents of the file ${fileName}.\n\nContent:\n\n${fence}${language}\n${text}\n${fence}`);
}

const REQUEST_COOKIE_ACTION: RCEAction = {
    name: 'request_cookie',
    description: `Ask ${CONNECTION.userName} for a cookie. You can request a specific flavor, but it's up to ${CONNECTION.userName} to decide.`,
    category: 'Miscellaneous',
    schema: {
        type: 'object',
        properties: {
            flavor: { type: 'string' },
        },
        additionalProperties: false,
    },
    handler: handleRequestCookie,
    promptGenerator: (actionData) => `have a${actionData.params?.flavor ? ' ' + actionData.params.flavor : ''} cookie.`,
    defaultPermission: PermissionLevel.COPILOT,
};

export function addRequestCookieAction() {
    addActions([REQUEST_COOKIE_ACTION]);
}

function handleRequestCookie(actionData: ActionData) {
    const permission = getPermissionLevel(actionData.name);

    switch (permission) {
        case PermissionLevel.COPILOT:
            giveCookie(true, actionData.params?.flavor);
            return `Waiting on ${CONNECTION.userName} to decide on the flavor.`;
        case PermissionLevel.AUTOPILOT:
            // Removed this because flavor is supposed to be optional
            // if (!actionData.params?.flavor) {
            //     NEURO.client?.sendActionResult(actionData.id, false, 'You need to specify a flavor!');
            //     break;
            // }
            logOutput('INFO', `Neuro grabbed a ${actionData.params?.flavor} cookie.`);
            return `You grabbed a ${actionData.params?.flavor} cookie!`;
    }
    // Removed the try-catch because this shoud be handled by the RCE system now
    // catch (erm) {
    //     const actionName = actionData.name;
    //     notifyOnCaughtException(actionName, erm);
    //     NEURO.client?.sendActionResult(actionData.id, true, `An error occured while executing the action "${actionName}". You may retry if you like, but it may be better to ask Vedal to check what's up.`);
    //     return;
    // }
}

export function giveCookie(isRequested = false, defaultFlavor = 'Chocolate Chip') {
    if (!NEURO.connected) {
        logOutput('ERROR', 'Attempted to give cookie while disconnected');
        vscode.window.showErrorMessage('Not connected to Neuro API.');
        return;
    }

    vscode.window.showInputBox({
        prompt: 'What flavor?',
        placeHolder: 'Chocolate Chip',
        value: defaultFlavor,
        title: `Give ${NEURO.currentController} a cookie`,
    }).then((flavor) => {
        if (!flavor) {
            logOutput('INFO', 'No flavor given, canceling cookie');
            if (isRequested)
                NEURO.client?.sendContext(`${CONNECTION.userName} couldn't decide on a flavor for your cookie.`);
            return;
        }
        logOutput('INFO', 'Giving cookie to Neuro');
        NEURO.client?.sendContext(`${CONNECTION.userName} gave you a ${flavor} cookie!`);
    });
}
