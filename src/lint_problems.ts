import * as vscode from 'vscode';
import { NEURO } from './constants';
import { normalizePath, getWorkspacePath, logOutput, isPathNeuroSafe, assert } from './utils';
import { PERMISSIONS, getPermissionLevel, CONFIG } from './config';
import { ActionData, actionValidationAccept, actionValidationFailure, ActionValidationResult, ActionWithHandler, stripToActions } from './neuro_client_helper';

function validatePath(path: string, directoryType: string): ActionValidationResult {
    if (!isPathNeuroSafe(getWorkspacePath() + '/' + normalizePath(path).replace(/^\/|\/$/g, ''))) {
        return actionValidationFailure(`You are not allowed to access this ${directoryType}.`);
    }

    const existence = await getPathExistence(absolutePath);
    if (existence === false) {
        return actionValidationFailure(`${directoryType} "${path}" does not exist.`);
    }

    return actionValidationAccept();
};

function validateDirectoryAccess(actionData: ActionData): ActionValidationResult {
    const workspacePath = vscode.workspace.workspaceFolders?.[0];
    if (!workspacePath) {
        return actionValidationFailure('Unable to get current workspace.');
    }

    if (actionData.params?.file) {
        const relativePath = actionData.params.file;
        const normalizedPath = normalizePath(vscode.Uri.joinPath(workspacePath.uri, relativePath).fsPath);
        const check = validatePath(normalizedPath, 'file');
        if (!check.success) return check;
    }
    if (actionData.params?.folder) {
        const relativePath = actionData.params.folder;
        const normalizedPath = normalizePath(vscode.Uri.joinPath(workspacePath.uri, relativePath).fsPath);
        const check = validatePath(normalizedPath, 'folder');
        if (!check.success) return check;
    }

    return actionValidationAccept();
}

export const lintActions = {
    get_file_lint_problems: {
        name: 'get_file_lint_problems',
        description: 'Gets linting diagnostics for a file.',
        schema: {
            type: 'object',
            properties: {
                file: { type: 'string' },
            },
            required: ['file'],
        },
        permissions: [PERMISSIONS.accessLintingAnalysis],
        handler: handleGetFileLintProblems,
        validator: [validateDirectoryAccess],
        promptGenerator: (actionData: ActionData) => `get linting diagnostics for "${actionData.params.file}".`,
    },
    get_folder_lint_problems: {
        name: 'get_folder_lint_problems',
        description: 'Gets linting diagnostics for a folder.',
        schema: {
            type: 'object',
            properties: {
                folder: { type: 'string' },
            },
            required: ['folder'],
        },
        permissions: [PERMISSIONS.accessLintingAnalysis],
        handler: handleGetFolderLintProblems,
        validator: [validateDirectoryAccess],
        promptGenerator: (actionData: ActionData) => `get linting diagnostics for "${actionData.params.folder}".`,
    },
    get_workspace_lint_problems: {
        name: 'get_workspace_lint_problems',
        description: 'Gets linting diagnostics for the current workspace.',
        permissions: [PERMISSIONS.accessLintingAnalysis],
        handler: handleGetWorkspaceLintProblems,
        validator: [() => {
            const workspace = getWorkspacePath();
            if (!workspace) {
                return actionValidationFailure('Unable to get current workspace.');
            }
            validatePath(workspace, 'workspace');
            return actionValidationAccept();
        }],
        promptGenerator: () => 'get linting diagnostics for the current workspace.',
    },
} satisfies Record<string, ActionWithHandler>;

export function registerLintActions() {
    if (getPermissionLevel(PERMISSIONS.accessLintingAnalysis)) {
        NEURO.client?.registerActions(stripToActions([
            lintActions.get_file_lint_problems,
            lintActions.get_folder_lint_problems,
            lintActions.get_workspace_lint_problems,
        ]));
    }
}

// Helper: Formats raw diagnostics (from the API) into readable lines.
interface RawLintProblem {
    severity: string;
    message: string;
    range: [{ line: number; character: number }, { line: number; character: number }];
    source?: string;
    code?: string;
}

function formatLintProblems(problems: RawLintProblem[], filePath: string): string[] {
    return problems.map(p => {
        const severity = p.severity;
        const msg = p.message;
        const codeVal = p.code || '';
        const start = p.range[0] || { line: 0, character: 0 };
        const line = start.line + 1;
        const col = start.character + 1;
        return `- [${filePath}] ${severity}: ${msg}${codeVal ? ` (${codeVal})` : ''} [Ln ${line}, Col ${col}]`;
    });
}

/**
 * Helper that accepts a file path and the raw diagnostics (from the API)
 * and returns a formatted string similar to the Visual Studio Code UI.
 */
export function getFormattedDiagnosticsForFile(filePath: string, diagnostics: vscode.Diagnostic[]): string {
    // Convert raw diagnostics into our RawLintProblem format.
    const problems: RawLintProblem[] = diagnostics.map(diag => ({
        severity: typeof diag.severity === 'string'
            ? diag.severity
            : vscode.DiagnosticSeverity[diag.severity],
        message: diag.message,
        range: [
            { line: diag.range.start.line, character: diag.range.start.character },
            { line: diag.range.end.line, character: diag.range.end.character },
        ],
        source: diag.source,
        code: diag.code !== undefined
            ? typeof diag.code === 'object'
                ? diag.code.value.toString()
                : diag.code.toString()
            : undefined,
    }));
    const formattedLines = formatLintProblems(problems, filePath);
    return '\n' + formattedLines.join('\n');
}


// Handle diagnostics for a single file
export function handleGetFileLintProblems(actionData: ActionData): string | undefined {
    const relativePath = actionData.params.file;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace opened');
    }
    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    const fullPath = fileUri.fsPath;

    checkAndGetFileLintErrors(fullPath);
    return undefined;

    async function checkAndGetFileLintErrors(absolutePath: string): Promise<void> {
        const uri = vscode.Uri.file(absolutePath);
        try {
        // Ensure that the file exists.
            await vscode.workspace.fs.stat(uri);
        } catch {
            NEURO.client?.sendContext(`Could not retrieve lint errors: File "${relativePath}" does not exist.`);
            return;
        }

        // Retrieve diagnostics for the file.
        const diagnostics = vscode.languages.getDiagnostics(uri);
        if (diagnostics.length === 0) {
            NEURO.client?.sendContext(`No linting problems found for file ${relativePath}.`);
            return;
        }

        const formattedDiagnostics = getFormattedDiagnosticsForFile(relativePath, diagnostics);
        NEURO.client?.sendContext(`Linting problems for file ${relativePath}:${formattedDiagnostics}`);
        return;
    }
}

export function handleGetFolderLintProblems(actionData: ActionData): string | undefined {
    const relativeFolder = actionData.params.folder;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace opened');
    }
    const folderUri = vscode.Uri.joinPath(workspaceFolder.uri, relativeFolder);
    const fullFolderPath = folderUri.fsPath;

    checkAndGetFolderLintErrors(fullFolderPath);
    return undefined;

    async function checkAndGetFolderLintErrors(folderAbsolutePath: string): Promise<void> {
        const uri = vscode.Uri.file(folderAbsolutePath);
        try {
            // Ensure that the folder exists.
            await vscode.workspace.fs.stat(uri);
        } catch {
            NEURO.client?.sendContext(`Could not retrieve lint errors: Folder "${relativeFolder}" does not exist.`);
            return;
        }

        // Retrieve diagnostics for all files in the workspace.
        const diagnostics = vscode.languages.getDiagnostics();

        // Normalize the absolute folder path.
        const normalizedFolderPath = normalizePath(folderAbsolutePath);

        // Filter diagnostics to those that belong to files in this folder.
        const folderDiagnostics = diagnostics.filter(([diagUri, diags]) => {
            return normalizePath(diagUri.fsPath).startsWith(normalizedFolderPath) &&
                   isPathNeuroSafe(diagUri.fsPath) && diags.length > 0;
        });

        if (folderDiagnostics.length === 0) {
            NEURO.client?.sendContext(`No linting problems found for folder "${relativeFolder}".`);
            return;
        }

        // Format diagnostics from all files within the folder.
        const formattedDiagnostics = folderDiagnostics.map(([diagUri, diags]) => {
            // Get a file path relative to the workspace for ease of reading.
            const fileRelative = vscode.workspace.asRelativePath(workspaceFolder!.uri.fsPath + diagUri.fsPath);
            return getFormattedDiagnosticsForFile(fileRelative, diags);
        }).join('\n');

        NEURO.client?.sendContext(`Linting problems for folder "${relativeFolder}":\n${formattedDiagnostics}`);
        return;
    }
}

// Handle diagnostics for the entire workspace
export function handleGetWorkspaceLintProblems(_actionData: ActionData): string | undefined {
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        NEURO.client?.sendContext('No workspace opened.');
        return;
    }

    checkAndGetWorkspaceLintErrors(workspacePath);
    return undefined;

    async function checkAndGetWorkspaceLintErrors(workspacePath: string): Promise<void> {
        try {
            const diagnostics = vscode.languages.getDiagnostics();
            // Filter for diagnostics on safe files with errors.
            const safeDiagnostics = diagnostics.filter(
                ([uri, diags]) => isPathNeuroSafe(uri.fsPath) && diags.length > 0,
            );

            if (safeDiagnostics.length === 0) {
                NEURO.client?.sendContext('No linting problems found for the current workspace.');
                return;
            }

            const formattedDiagnostics = safeDiagnostics.map(([uri, diags]) => {
                const relative = vscode.workspace.asRelativePath(workspacePath + uri.fsPath);
                return getFormattedDiagnosticsForFile(relative, diags);
            }).join('\n\n');

            NEURO.client?.sendContext(`Linting problems for the current workspace:\n${formattedDiagnostics}`);
            return;
        } catch (erm) {
            logOutput('ERROR', `Failed to get diagnostics for workspace: ${erm}`);
            NEURO.client?.sendContext("Couldn't get diagnostics for the workspace.");
            return;
        }
    }
}

/**
 * Function that computes the diagnostic diff (new diagnostics compared to the previous state)
 * for only the URIs provided in the event change and sends only the new diagnostic entries to Neuro.
 * It respects the extension setting in CONFIG.sendNewLintingProblemsOn, which can be:
 *   - "off": Do nothing.
 *   - "inCurrentFile": Only send diff if the active file changed.
 *   - "inWorkspace": Send diff for any change in the workspace.
 */
export function sendDiagnosticsDiff(e: vscode.DiagnosticChangeEvent): void {
    // Check the extension setting.
    const setting = CONFIG.sendNewLintingProblemsOn;
    if (setting === 'off') {
        return;
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        logOutput('ERROR', 'Workspace folder not found.');
        return;
    }

    // Convert the read-only array to a mutable one.
    let changedUris: vscode.Uri[] = Array.from(e.uris);
    if (setting === 'inCurrentFile') {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const activeFilePath = activeEditor.document.uri.fsPath;
        changedUris = Array.from(e.uris).filter(uri => uri.fsPath === activeFilePath);
        if (changedUris.length === 0) {
            return;
        }
    }

    const previousDiagnosticsMap = NEURO.previousDiagnosticsMap;
    const addedDiagnostics = new Map<string, vscode.Diagnostic[]>();

    // For each changed URI in the event...
    changedUris.forEach(uri => {
        if (!isPathNeuroSafe(uri.fsPath)) {
            return;
        }
        const currentDiags = vscode.languages.getDiagnostics(uri);
        const oldDiags = previousDiagnosticsMap.get(uri.fsPath) || [];
        const diff = currentDiags.filter(newDiag =>
            !oldDiags.some(oldDiag =>
                oldDiag.message === newDiag.message &&
                newDiag.range.isEqual(oldDiag.range) &&
                oldDiag.severity === newDiag.severity,
            ),
        );
        if (diff.length > 0) {
            addedDiagnostics.set(uri.fsPath, diff);
        }
        previousDiagnosticsMap.set(uri.fsPath, currentDiags);
    });

    if (addedDiagnostics.size === 0) {
        return;
    }

    const output = Array.from(addedDiagnostics.entries())
        .map(([filePath, diags]) => {
            const relative = vscode.workspace.asRelativePath(workspacePath + filePath);
            return getFormattedDiagnosticsForFile(relative, diags);
        })
        .join('\n\n');

    NEURO.client?.sendContext(`New linting problems:\n${output}`, false);
}

export async function fixWithNeuro(document?: vscode.TextDocument, diagnostics?: vscode.Diagnostic | vscode.Diagnostic[]): Promise<void> {
    if (document && diagnostics) {
        if (!Array.isArray(diagnostics))
            diagnostics = [diagnostics];
    } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        document = editor.document;
        diagnostics = vscode.languages.getDiagnostics(document.uri);
    }
    if (!diagnostics || diagnostics.length === 0) {
        vscode.window.showInformationMessage('No diagnostics found in the active file.');
        return;
    }

    vscode.commands.executeCommand('workbench.action.chat.open', {
        query: `@${NEURO.currentController !== 'Evil' && NEURO.currentController !== 'Neuro' ? 'neuroapi' : NEURO.currentController.toLowerCase()} /fix ${diagnostics.map(d => d.message).join('\n')}`,
    });
}

export async function explainWithNeuro(document?: vscode.TextDocument, diagnostics?: vscode.Diagnostic | vscode.Diagnostic[]): Promise<void> { // TODO: Typing
    if (document && diagnostics) {
        if (!Array.isArray(diagnostics))
            diagnostics = [diagnostics];
    } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        document = editor.document;
        diagnostics = vscode.languages.getDiagnostics(document.uri);
    }
    if (!diagnostics || diagnostics.length === 0) {
        vscode.window.showInformationMessage('No diagnostics found in the active file.');
        return;
    }

    vscode.commands.executeCommand('workbench.action.chat.open', {
        query: `@${NEURO.currentController !== 'Evil' && NEURO.currentController !== 'Neuro' ? 'neuroapi' : NEURO.currentController.toLowerCase()} /explain ${diagnostics.map(d => d.message).join('\n')}`,
    });
}

export class NeuroCodeActionsProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
    ];

    public provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];

        const fix = new vscode.CodeAction(
            `Ask ${NEURO.currentController} to fix`,
            vscode.CodeActionKind.QuickFix,
        );
        fix.command = {
            command: 'neuropilot.fixWithNeuro',
            title: `Ask ${NEURO.currentController} to fix`,
            arguments: [document, context.diagnostics],
        };
        fix.diagnostics = context.diagnostics.map(d => d);
        actions.push(fix);

        const explain = new vscode.CodeAction(
            `Ask ${NEURO.currentController} to explain`,
            vscode.CodeActionKind.QuickFix,
        );

        explain.command = {
            command: 'neuropilot.explainWithNeuro',
            title: `Ask ${NEURO.currentController} to explain`,
            arguments: [document, context.diagnostics],
        };

        explain.diagnostics = context.diagnostics.map(d => d);
        actions.push(explain);

        return actions;
    }
}
