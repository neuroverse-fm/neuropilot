import * as assert from 'assert';

/**
 * Asserts that an object has the same properties as the expected object,
 * and that the values of those properties match.
 * Additional properties in the actual object are ignored.
 */
export function assertProperties<T extends Record<string, unknown>>(actual: Record<string, unknown>, expected: T): void {
    for (const key in expected) {
        assert.ok(key in actual, `Expected property "${key}" to exist in the actual object.`);
        assert.strictEqual(actual[key], expected[key], `Expected property "${key}" to have value "${expected[key]}", but got "${actual[key]}".`);
    }
}
