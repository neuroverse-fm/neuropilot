import { validate } from 'jsonschema';
import type { JSONSchema7 } from 'json-schema';
import { fileActions } from '~/src/file_actions';
import assert from 'node:assert';
import { editingActions } from '~/src/editing';
import { changelogActions } from '~/src/changelog';
import { REQUEST_COOKIE_ACTION } from '~/src/context';
import { gitActions } from '~/src/git';
import { chatAction } from '~/src/chat';
import { completionAction } from '~/src/completions';

suite('Validate action schemas', async () => {
    const metaschema = (await fetch('https://json-schema.org/draft-07/schema#')).json() as JSONSchema7;

    test('File Actions', () => {
        const actions = Object.keys(fileActions) as (keyof typeof fileActions)[];
        for (const a of actions) {
            if (fileActions[a].schema) {
                assert.ok(validate(fileActions[a].schema, metaschema).valid);
            }
        }
    });

    test('Edit Actions', () => {
        const actions = Object.keys(editingActions) as (keyof typeof editingActions)[];
        for (const a of actions) {
            if ('schema' in editingActions[a] && editingActions[a].schema) {
                assert.ok(validate(editingActions[a].schema, metaschema).valid);
            }
            if ('schemaFallback' in editingActions[a] && editingActions[a].schemaFallback) {
                assert.ok(validate(editingActions[a].schemaFallback, metaschema).valid);
            }
            if ('schemaFallback' in editingActions[a] && !('schema' in editingActions[a])) {
                throw new assert.AssertionError({ message: `Action "${a}" has a fallback schema but no main schema!` });
            }
        }
    });

    test('Git Actions', () => {
        const actions = Object.keys(gitActions) as (keyof typeof gitActions)[];
        for (const a of actions) {
            assert.strictEqual(a, gitActions[a].name);
            if ('schema' in gitActions[a] && gitActions[a].schema) {
                assert.ok(validate(gitActions[a].schema, metaschema).valid);
            }
            if ('schemaFallback' in gitActions[a] && gitActions[a].schemaFallback) {
                assert.ok(validate(gitActions[a].schemaFallback, metaschema).valid);
            }
            if ('schemaFallback' in gitActions[a] && !('schema' in gitActions[a])) {
                throw new assert.AssertionError({ message: `Action "${a}" has a fallback schema but no main schema!` });
            }
        }
    });

    test('Copilot Chat integrations', () => {
        const actionsToTest = {
            chat: chatAction,
            complete_code: completionAction(0), // maxCount does not matter here
        };
        const actions = Object.keys(actionsToTest) as (keyof typeof actionsToTest)[];
        for (const a of actions) {
            assert.strictEqual(a, actionsToTest[a].name);
            assert.ok(validate(actionsToTest[a].schema, metaschema).valid);
        }
    });

    test('Misc Actions', () => {
        const actionsToTest = {
            ...changelogActions,
            request_cookie: REQUEST_COOKIE_ACTION,
        };
        const actions = Object.keys(actionsToTest) as (keyof typeof actionsToTest)[];
        for (const a of actions) {
            assert.strictEqual(a, actionsToTest[a].name);
            if (actionsToTest[a].schema) {
                assert.ok(validate(actionsToTest[a].schema, metaschema).valid);
            }
        }
    });
});
