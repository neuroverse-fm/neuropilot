import * as assert from 'assert';
import * as vscode from 'vscode';
import { anything, capture, instance, mock, reset, verify } from 'ts-mockito';
import { NEURO } from '@/constants';
import { ActionData } from '@/neuro_client_helper';
import {
    handlePlaceCursor,
    handleGetCursor,
    handleGetContent,
    handleInsertText,
    handleInsertLines,
    handleReplaceText,
    handleDeleteText,
    handleFindText,
    handleUndo,
    handleSave,
    handleRewriteAll,
    handleRewriteLines,
    handleDeleteLines,
    handleHighlightLines,
} from '@/editing';
import { createTestFile, checkNoErrorWithTimeout } from '../../test_utils';

import { NeuroClient } from 'neuro-game-sdk';

suite('Integration: Editing actions', () => {
    let originalClient: NeuroClient | null = null;
    let mockedClient: NeuroClient;
    let docUri: vscode.Uri;

    suiteSetup(async () => {
        // Mock client for sendContext assertions
        originalClient = NEURO.client;
        mockedClient = mock(NeuroClient);
        NEURO.client = instance(mockedClient);

        // Create and open a test document
        const content = ['Alpha', 'Bravo', 'Charlie', 'Delta'].join('\n');
        docUri = await createTestFile('editing_actions.txt', content);
        const document = await vscode.workspace.openTextDocument(docUri);
        await vscode.window.showTextDocument(document, { preview: false });

        // Initialize decoration types and output channel expected by editing handlers
        NEURO.cursorDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.diffAddedDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.diffRemovedDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.diffModifiedDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.highlightDecorationType = vscode.window.createTextEditorDecorationType({});
        NEURO.outputChannel = vscode.window.createOutputChannel('Neuropilot Test');
    });

    suiteTeardown(() => {
        // Restore client
        NEURO.client = originalClient;
        originalClient = null;
    });

    teardown(() => {
        // Reset verifications between tests
        reset(mockedClient);
    });

    test('place_cursor (absolute)', () => {
        const actionData: ActionData = { id: 't', name: 'place_cursor', params: { line: 2, column: 1, type: 'absolute' } };
        const result = handlePlaceCursor(actionData);
        assert.ok(result && result.includes('Cursor placed at (2:1)'));
    });

    test('get_cursor returns current position and context', () => {
        const result = handleGetCursor({ id: 't', name: 'get_cursor' } as ActionData);
        assert.ok(result && result.includes('Cursor is at (2:1)'));
    });

    test('get_content returns full file content context', () => {
        const result = handleGetContent();
        assert.ok(result && result.includes('Contents of the file'));
        assert.ok(result.includes('Alpha'));
        assert.ok(result.includes('Delta'));
    });

    test('insert_text inserts at absolute position and sends context', async () => {
        const actionData: ActionData = { id: 't', name: 'insert_text', params: { text: 'X', position: { line: 2, column: 2, type: 'absolute' } } };
        handleInsertText(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const [ctx] = capture(mockedClient.sendContext).last();
        assert.ok(typeof ctx === 'string' && ctx.includes('Inserted text'));
    });

    test('insert_lines appends lines and sends context', async () => {
        const actionData: ActionData = { id: 't', name: 'insert_lines', params: { text: 'Echo\nFoxtrot', insertUnder: 4 } };
        handleInsertLines(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('Echo'));
        assert.ok(text.includes('Foxtrot'));
    });

    test('replace_text single match replaces and sends context', async () => {
        const actionData: ActionData = { id: 't', name: 'replace_text', params: { find: 'Alpha', replaceWith: 'A', match: 'firstInFile', useRegex: false } };
        handleReplaceText(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.startsWith('A\n'));
    });

    test('delete_text single match deletes and sends context', async () => {
        const actionData: ActionData = { id: 't', name: 'delete_text', params: { find: 'Delta', match: 'firstInFile', useRegex: false } };
        handleDeleteText(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('Delta'));
    });

    test('find_text single match returns description string', () => {
        // Search for text we inserted earlier to avoid dependency on initial content
        const actionData: ActionData = { id: 't', name: 'find_text', params: { find: 'Echo', match: 'firstInFile', useRegex: false, highlight: false } };
        const result = handleFindText(actionData);
        assert.ok(result && result.includes('Found match'));
    });

    test('undo sends context after reverting last change', async () => {
        // Make a trivial change directly
        await vscode.workspace.openTextDocument(docUri);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(docUri, new vscode.Position(0, 0), 'Z');
        await vscode.workspace.applyEdit(edit);

        handleUndo({ id: 't', name: 'undo' } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
    });

    test('save sends context', async () => {
        await vscode.workspace.openTextDocument(docUri);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(docUri, new vscode.Position(0, 0), 'Y');
        await vscode.workspace.applyEdit(edit);

        handleSave({ id: 't', name: 'save' } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything(), anything())).once(); }, 5000, 100);
    });

    test('rewrite_all replaces all content and sends context', async () => {
        const newContent = ['One', 'Two', 'Three'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
    });

    test('rewrite_all handles empty content', async () => {
        const newContent = '';
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
    });

    test('rewrite_all handles large content', async () => {
        const newContent = Array.from({ length: 500 }, (_, i) => `L ${i + 1}`).join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, newContent);
        assert.strictEqual(text.split('\n').length, 500);
    });

    test('rewrite_lines replaces a range and sends context; delete_lines removes a range and sends context', async () => {
        // Prepare content
        const resetContent = ['L1', 'L2', 'L3', 'L4', 'L5'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: resetContent } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);

        // Rewrite lines 2-3
        handleRewriteLines({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'X\nY' } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        let text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('L1'));
        assert.ok(text.includes('X'));
        assert.ok(text.includes('Y'));

        reset(mockedClient);
        // Delete line 4
        handleDeleteLines({ id: 't', name: 'delete_lines', params: { startLine: 4, endLine: 4 } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('L4'));
    });

    test('highlight_lines returns description string', () => {
        const result = handleHighlightLines({ id: 't', name: 'highlight_lines', params: { startLine: 1, endLine: 2 } } as ActionData);
        assert.strictEqual(result, 'Highlighted lines 1-2.');
    });
});


