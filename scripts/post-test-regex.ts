import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads a JavaScript file, finds `function run()` declarations,
 * and prepends `export ` to them.
 * @param filePath Absolute or relative path to the JS file.
 */
function exportRunFunction(filePath: string) {
    const absPath = path.resolve(filePath);
    let content = fs.readFileSync(absPath, 'utf8');

    // Regex to match 'function run(' at the start of a line, possibly with leading whitespace
    const regex = /^(\s*)function\s+run\s*\(/gm;

    // Replace with 'export function run(' preserving indentation
    content = content.replace(regex, '$1export function run(');

    fs.writeFileSync(absPath, content, 'utf8');
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: tsx ./scripts/post-test-regex.ts <path-to-js-file>');
        process.exit(1);
    }
    try {
        exportRunFunction(args[0]);
        console.log(`Updated: ${args[0]}`);
    } catch (erm) {
        console.error(`Error: ${erm}`);
        process.exit(2);
    }
}
