import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NEURO } from './constants';
import { normalizePath, getWorkspacePath, logOutput, isPathNeuroSafe } from './utils';
import { PERMISSIONS, hasPermissions, CONFIG } from './config';
import { ActionData, ActionResult, actionResultAccept, actionResultFailure, actionResultMissingParameter, actionResultNoPermission, actionResultNoAccess } from './neuro_client_helper';

export const lintActionHandlers: Record<string, (actionData: ActionData) => ActionResult> = {
    'get_file_lint_problems': handleGetFileLintProblems,
    'get_folder_lint_problems': handleGetFolderLintProblems,
    'get_workspace_lint_problems': handleGetWorkspaceLintProblems,
};

export function registerLintActions() {
    if (hasPermissions(PERMISSIONS.accessLintingAnalysis)) {
        NEURO.client?.registerActions([
            {
                name: 'get_file_lint_problems',
                description: 'Gets linting diagnostics for a file.',
                schema: {
                    type: 'object',
                    properties: {
                        file: { type: 'string' },
                    },
                    required: ['file'],
                },
            },
            {
                name: 'get_folder_lint_problems',
                description: 'Gets linting diagnostics for a folder.',
                schema: {
                    type: 'object',
                    properties: {
                        folder: { type: 'string' },
                    },
                    required: ['folder'],
                },
            },
            {
                name: 'get_workspace_lint_problems',
                description: 'Gets linting diagnostics for the current workspace.',
            },
        ]);
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
export function handleGetFileLintProblems(actionData: ActionData): ActionResult {
    if (!hasPermissions(PERMISSIONS.accessLintingAnalysis)) {
        return actionResultNoPermission(PERMISSIONS.accessLintingAnalysis);
    }
    const relativePath = actionData?.params.file;
    if (!relativePath) {
        return actionResultMissingParameter('file');
    }
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        logOutput('ERROR', 'Workspace folder not found.');
        return actionResultFailure('Unable to get workspace path.');
    }

    try {
        const absolutePath = path.join(workspacePath, relativePath);
        const normalizedPath = normalizePath(absolutePath);
        if (!isPathNeuroSafe(normalizedPath)) {
            return actionResultNoAccess(normalizedPath);
        }
        if (!fs.existsSync(normalizedPath)) {
            return actionResultFailure(`File '${relativePath}' does not exist.`);
        }

        const rawDiagnostics = vscode.languages.getDiagnostics(vscode.Uri.file(normalizedPath));
        if (rawDiagnostics.length === 0) {
            return actionResultAccept(`No linting problems found for file ${relativePath}.`);
        }
        const formattedDiagnostics = getFormattedDiagnosticsForFile(relativePath, rawDiagnostics); // use relativePath
        return actionResultAccept(`Linting problems for file ${relativePath}:${formattedDiagnostics}`);
    } catch (error) {
        logOutput('ERROR', `Getting diagnostics for ${relativePath} failed: ${error}`);
        return actionResultFailure(`Failed to get linting diagnostics for '${relativePath}'.`);
    }
}

// Handle diagnostics for a folder
export function handleGetFolderLintProblems(actionData: ActionData): ActionResult {
    if (!hasPermissions(PERMISSIONS.accessLintingAnalysis)) {
        return actionResultNoPermission(PERMISSIONS.accessLintingAnalysis);
    }
    const relativeFolder = actionData?.params.folder;
    if (!relativeFolder) {
        return actionResultMissingParameter('folder');
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        logOutput('ERROR', 'Workspace folder not found.');
        return actionResultFailure('Unable to get workspace path.');
    }

    try {
        const absoluteFolderPath = path.join(workspacePath, relativeFolder);
        const normalizedFolderPath = normalizePath(absoluteFolderPath);
        if (!isPathNeuroSafe(normalizedFolderPath)) {
            return actionResultNoAccess(normalizedFolderPath);
        }
        if (!fs.existsSync(normalizedFolderPath)) {
            return actionResultFailure(`Folder '${relativeFolder}' does not exist.`);
        }

        const diagnostics = vscode.languages.getDiagnostics();
        const folderDiagnostics = diagnostics.filter(([uri, diags]) => {
            return normalizePath(uri.fsPath).startsWith(normalizedFolderPath) && isPathNeuroSafe(uri.fsPath) && diags.length > 0;
        });

        if (folderDiagnostics.length === 0) {
            return actionResultAccept('No linting problems found.');
        }

        const formattedDiagnostics = folderDiagnostics.map(([uri, diags]) => {
            const relative = path.relative(workspacePath, uri.fsPath);
            return getFormattedDiagnosticsForFile(relative, diags);
        }).join('\n');

        return actionResultAccept(`Linting problems for folder ${relativeFolder}: ${formattedDiagnostics}`);
    } catch (error) {
        logOutput('ERROR', `Getting diagnostics for folder ${relativeFolder} failed: ${error}`);
        return actionResultFailure(`Failed to get linting diagnostics for folder '${relativeFolder}`);
    }
}

// Handle diagnostics for the entire workspace
export function handleGetWorkspaceLintProblems(_actionData: ActionData): ActionResult {
    if (!hasPermissions(PERMISSIONS.accessLintingAnalysis)) {
        return actionResultNoPermission(PERMISSIONS.accessLintingAnalysis);
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        logOutput('ERROR', 'Workspace folder not found.');
        return actionResultFailure('Unable to get workspace path.');
    }

    try {
        const diagnostics = vscode.languages.getDiagnostics();
        const safeDiagnostics = diagnostics.filter(([uri, diags]) => isPathNeuroSafe(uri.fsPath) && diags.length > 0);

        if (safeDiagnostics.length === 0) {
            return actionResultAccept('No linting problems found.');
        }

        const formattedDiagnostics = safeDiagnostics.map(([uri, diags]) => {
            const relative = path.relative(workspacePath, uri.fsPath);
            return getFormattedDiagnosticsForFile(relative, diags);
        }).join('\n\n');

        return actionResultAccept(`Linting problems for the current workspace: ${formattedDiagnostics}`);
    } catch (error) {
        logOutput('ERROR', `Failed to get diagnostics for workspace. Error: ${error}`);
        return actionResultFailure("Couldn't get diagnostics for the workspace.");
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
            const relative = path.relative(workspacePath, filePath);
            return getFormattedDiagnosticsForFile(relative, diags);
        })
        .join('\n\n');

    NEURO.client?.sendContext(`New linting problems:\n${output}`, false);
}
