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

    test('place_cursor (relative) moves from current position and can be restored', () => {
        // Move relative by +1 line, +1 column from (2:1) -> (3:2)
        const moved = handlePlaceCursor({ id: 't', name: 'place_cursor', params: { line: 1, column: 1, type: 'relative' } });
        assert.ok(moved && moved.includes('Cursor placed at (3:2)'));
        // Restore to (2:1) to avoid affecting later tests
        const restored = handlePlaceCursor({ id: 't', name: 'place_cursor', params: { line: 2, column: 1, type: 'absolute' } });
        assert.ok(restored && restored.includes('Cursor placed at (2:1)'));
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

    test('insert_text defaults to current cursor when no position provided', async () => {
        // Ensure known cursor position
        handlePlaceCursor({ id: 't', name: 'place_cursor', params: { line: 2, column: 1, type: 'absolute' } });
        reset(mockedClient);
        handleInsertText({ id: 't', name: 'insert_text', params: { text: 'Q' } });
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        // Line 2 should now start with 'Q'
        const line2 = text.split('\n')[1] ?? '';
        assert.ok(line2.startsWith('Q'));
    });

    test('insert_text supports relative position', async () => {
        // Place at start of file, then insert relative
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: ['Aaa', 'Bbb', 'Ccc'].join('\n') } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);
        handlePlaceCursor({ id: 't', name: 'place_cursor', params: { line: 1, column: 1, type: 'absolute' } });
        const ad: ActionData = { id: 't', name: 'insert_text', params: { text: '-', position: { line: 1, column: 2, type: 'relative' } } };
        handleInsertText(ad);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        // Should have inserted after moving to line 2, column 3 (0-based 1,2)
        assert.ok(text.includes('Bb-b'));
    });

    test('insert_lines appends lines and sends context', async () => {
        const actionData: ActionData = { id: 't', name: 'insert_lines', params: { text: 'Echo\nFoxtrot', insertUnder: 4 } };
        handleInsertLines(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('Echo'));
        assert.ok(text.includes('Foxtrot'));
    });

    test('insert_lines inserts beyond EOF by padding newlines', async () => {
        // Reset to small file
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: ['A', 'B'].join('\n') } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);
        handleInsertLines({ id: 't', name: 'insert_lines', params: { text: 'C', insertUnder: 6 } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const doc = await vscode.workspace.openTextDocument(docUri);
        const lines = doc.getText().split('\n');
        assert.ok(lines.length >= 6);
        assert.strictEqual(lines[lines.length - 1], 'C');
    });

    test('replace_text single match replaces and sends context', async function () {
        this.timeout(7000);
        // Reset content to include 'Alpha'
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: ['Alpha', 'Bravo', 'Charlie', 'Delta'].join('\n') } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        reset(mockedClient);
        const actionData: ActionData = { id: 't', name: 'replace_text', params: { find: 'Alpha', replaceWith: 'A', match: 'firstInFile', useRegex: false } };
        handleReplaceText(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.startsWith('A\n'));
    });

    test('replace_text supports regex substitution and allInFile', async () => {
        const content = ['foo1', 'foo2', 'bar3'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        reset(mockedClient);
        const actionData: ActionData = { id: 't', name: 'replace_text', params: { find: '(foo)(\\d)', replaceWith: '$1X', match: 'allInFile', useRegex: true } };
        handleReplaceText(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, ['fooX', 'fooX', 'bar3'].join('\n'));
    });

    test('replace_text respects lineRange', async () => {
        const content = ['a', 'a', 'a'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);
        handleReplaceText({ id: 't', name: 'replace_text', params: { find: 'a', replaceWith: 'b', match: 'allInFile', useRegex: false, lineRange: { startLine: 2, endLine: 3 } } });
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.strictEqual(text, ['a', 'b', 'b'].join('\n'));
    });

    test('delete_text single match deletes and sends context', async function () {
        this.timeout(7000);
        // Reset content to include 'Delta'
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: ['Alpha', 'Bravo', 'Charlie', 'Delta'].join('\n') } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        reset(mockedClient);
        const actionData: ActionData = { id: 't', name: 'delete_text', params: { find: 'Delta', match: 'firstInFile', useRegex: false } };
        handleDeleteText(actionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('Delta'));
    });

    test('delete_text deletes multiple matches and can use lineRange', async function () {
        this.timeout(7000);
        // Multiple delete
        const content = 'x 1 x 2 x';
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        reset(mockedClient);
        handleDeleteText({ id: 't', name: 'delete_text', params: { find: 'x', match: 'allInFile', useRegex: false } });
        // Poll document until content reflects deletions
        await checkNoErrorWithTimeout(async () => {
            const t = (await vscode.workspace.openTextDocument(docUri)).getText();
            assert.ok(!t.includes('x'));
        }, 5000, 100);
        let text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('x'));

        // Range-limited delete
        const content2 = ['p', 'q', 'p', 'q'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: content2 } } as ActionData);
        await checkNoErrorWithTimeout(async () => {
            const t = vscode.window.activeTextEditor?.document.getText() ?? '';
            assert.strictEqual(t, content2);
        }, 5000, 100);
        reset(mockedClient);
        handleDeleteText({ id: 't', name: 'delete_text', params: { find: 'p', match: 'allInFile', useRegex: false, lineRange: { startLine: 2, endLine: 3 } } });
        const expected = ['p', 'q', '', 'q'].join('\n');
        await checkNoErrorWithTimeout(async () => {
            const t = vscode.window.activeTextEditor?.document.getText() ?? '';
            assert.strictEqual(t, expected);
        }, 5000, 100);
        text = vscode.window.activeTextEditor?.document.getText() ?? '';
        const lines = text.split('\n');
        // First line 'p' should remain
        assert.strictEqual(lines[0], 'p');
        // Lines 2-3 should not contain 'p'
        assert.ok(!(lines[1] + lines[2]).includes('p'));
        // Total count of 'p' should be exactly 1
        const pCount = (text.match(/p/g) ?? []).length;
        assert.strictEqual(pCount, 1);
    });

    test('find_text single match returns description string', async () => {
        const content = ['Echo', 'Zulu'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content } } as ActionData);
        // Ensure rewrite_all applied before running find
        await checkNoErrorWithTimeout(async () => {
            const t = (await vscode.workspace.openTextDocument(docUri)).getText();
            assert.strictEqual(t, content);
        }, 5000, 100);
        const actionData: ActionData = { id: 't', name: 'find_text', params: { find: 'Echo', match: 'firstInFile', useRegex: false, highlight: false } };
        const result = handleFindText(actionData);
        assert.ok(typeof result === 'string' && result.startsWith('Found'));
    });

    test('find_text multiple matches with highlight returns count and lines', async () => {
        const content = ['z', 'z', 'z'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content } } as ActionData);
        await checkNoErrorWithTimeout(async () => {
            const t = (await vscode.workspace.openTextDocument(docUri)).getText();
            assert.strictEqual(t, content);
        }, 5000, 100);
        const result = handleFindText({ id: 't', name: 'find_text', params: { find: 'z', match: 'allInFile', useRegex: false, highlight: true } });
        assert.ok(typeof result === 'string' && result.startsWith('Found'));
    });

    test('undo sends context after reverting last change', async () => {
        // Capture current content as baseline
        const preText = (await vscode.workspace.openTextDocument(docUri)).getText();
        const edit = new vscode.WorkspaceEdit();
        edit.insert(docUri, new vscode.Position(0, 0), 'Z');
        await vscode.workspace.applyEdit(edit);

        handleUndo({ id: 't', name: 'undo' } as ActionData);
        // Poll until content equals baseline
        await checkNoErrorWithTimeout(async () => {
            const t = (await vscode.workspace.openTextDocument(docUri)).getText();
            assert.strictEqual(t, preText);
        }, 5000, 100);
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

    test('rewrite_all moves cursor to start of file', async () => {
        const newContent = ['X1', 'X2'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: newContent } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const cursorInfo = handleGetCursor({ id: 't', name: 'get_cursor' } as ActionData) as string;
        assert.ok(cursorInfo.includes('Cursor is at (1:1)'));
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
        const resetContent = ['L1', 'L2', 'L3', 'L4', 'L5'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: resetContent } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);

        handleRewriteLines({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'X\nY' } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        let text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(text.includes('L1'));
        assert.ok(text.includes('X'));
        assert.ok(text.includes('Y'));

        reset(mockedClient);
        handleDeleteLines({ id: 't', name: 'delete_lines', params: { startLine: 4, endLine: 4 } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        text = (await vscode.workspace.openTextDocument(docUri)).getText();
        assert.ok(!text.includes('L4'));
    });

    test('rewrite_lines cursor position depends on trailing newline', async () => {
        const base = ['L1', 'L2', 'L3'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: base } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);
        // With trailing newline: logicalLines = 1, cursor ends on line 2
        handleRewriteLines({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'X\n' } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        let info = handleGetCursor({ id: 't', name: 'get_cursor' } as ActionData) as string;
        assert.ok(info.includes('Cursor is at (2:'));

        // Without trailing newline: logicalLines = 2, cursor ends on line 3
        reset(mockedClient);
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: base } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);
        handleRewriteLines({ id: 't', name: 'rewrite_lines', params: { startLine: 2, endLine: 3, content: 'Y\nZ' } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        info = handleGetCursor({ id: 't', name: 'get_cursor' } as ActionData) as string;
        assert.ok(info.includes('Cursor is at (3:'));
    });

    test('delete_lines from first line moves cursor to start of file', async () => {
        const content = ['A', 'B', 'C'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        reset(mockedClient);
        handleDeleteLines({ id: 't', name: 'delete_lines', params: { startLine: 1, endLine: 2 } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 3000, 100);
        const info = handleGetCursor({ id: 't', name: 'get_cursor' } as ActionData) as string;
        assert.ok(info.includes('Cursor is at (1:1)'));
    });

    test('highlight_lines returns description string', async function () {
        this.timeout(7000);
        // Ensure at least two lines exist for the highlight range
        const resetContent = ['H1', 'H2'].join('\n');
        handleRewriteAll({ id: 't', name: 'rewrite_all', params: { content: resetContent } } as ActionData);
        await checkNoErrorWithTimeout(() => { verify(mockedClient.sendContext(anything())).once(); }, 5000, 100);
        const result = handleHighlightLines({ id: 't', name: 'highlight_lines', params: { startLine: 1, endLine: 2 } } as ActionData);
        assert.strictEqual(result, 'Highlighted lines 1-2.');
    });
});


