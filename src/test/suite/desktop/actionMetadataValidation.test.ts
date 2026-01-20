import { validate } from 'jsonschema';
import type { JSONSchema7 } from 'json-schema';
import assert from 'node:assert';
import { terminalActions } from '~/src/pseudoterminal';
import { taskActions } from '~/src/tasks';

suite('Validate action schemas', async () => {
    const metaschema = await (await fetch('https://json-schema.org/draft-07/schema#')).json() as JSONSchema7;

    test('Pseudoterminal Actions', () => {
        const actions = Object.keys(terminalActions) as (keyof typeof terminalActions)[];
        for (const a of actions) {
            assert.strictEqual(a, terminalActions[a].name);
            if ('schema' in terminalActions[a] && terminalActions[a].schema) {
                assert.ok(validate(terminalActions[a].schema, metaschema).valid);
            }
            if ('schemaFallback' in terminalActions[a] && terminalActions[a].schemaFallback) {
                assert.ok(validate(terminalActions[a].schemaFallback, metaschema).valid);
            }
            if ('schemaFallback' in terminalActions[a] && !('schema' in terminalActions[a])) {
                throw new assert.AssertionError({ message: `Action "${a}" has a fallback schema but no main schema!` });
            }
        }
    });

    test('Terminate Task Action', () => {
        const actions = Object.keys(taskActions) as (keyof typeof taskActions)[];
        for (const a of actions) {
            assert.strictEqual(a, taskActions[a].name);
        }
    });
});
