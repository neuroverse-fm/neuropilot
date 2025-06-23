import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Asserts that an object has the same properties as the expected object,
 * and that the values of those properties match.
 * Additional properties in the actual object are ignored.
 */
export function assertProperties(actual: unknown, expected: unknown, message?: string): void {
    try {
        assert.ok(typeof actual === 'object', 'Actual value must be an object.');
        assert.ok(actual !== null, 'Actual value must not be null.');
        assert.ok(typeof expected === 'object', 'Expected value must be an object.');
        assert.ok(expected !== null, 'Expected value must not be null.');
        for (const key in expected) {
            assert.ok(key in actual, `Expected property "${key}" to exist in the actual object.`);
            const expectedValue: unknown = expected[key as keyof typeof expected];
            const actualValue: unknown = actual[key as keyof typeof actual];
            assert.strictEqual(actualValue, expectedValue, `Expected property "${key}" to have value "${expectedValue}", but got "${actualValue}".`);
        }
    } catch (erm) {
        if (erm instanceof assert.AssertionError && message) {
            erm.message = `${message}\n\t--> ${erm.message}`;
        }
        throw erm;
    }
}

export async function createTestFile(name: string): Promise<vscode.Uri> {
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'test_files', name);
    await vscode.workspace.fs.writeFile(uri, new Uint8Array(0));
    return uri;
}

export async function createTestDirectory(name: string): Promise<vscode.Uri> {
    const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'test_files', name);
    await vscode.workspace.fs.createDirectory(uri);
    return uri;
}
