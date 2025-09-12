import Mocha from 'mocha';
import 'mocha';

// Extension unit tests
import './extension.test';
import '../file_actions.test';
import '../utils.test';
// Common integration tests that are environment-agnostic
import '../common/editing_actions.test';

// Testing the meta stuff
import '../test_utils.test';
import '../../unit-test/rewrite_all.simple.test';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd', // or 'bdd' if you prefer that syntax
        color: true,
    });

    return new Promise((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (erm) {
            reject(erm);
        }
    });
}
