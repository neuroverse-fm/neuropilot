/**
 * Sorts properties in a JSON object alphabetically.
 * Special characters (like @) are prioritized over alphabetic characters.
 * 
 * Usage: node sort-json-properties.js <input-file> [output-file]
 * If no output file is specified, overwrites the input file.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively sorts object properties alphabetically
 * @param {any} obj - The object to sort
 * @returns {any} - The sorted object
 */
function sortObjectProperties(obj) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        return obj;
    }

    const sorted = {};
    const keys = Object.keys(obj).sort((a, b) => {
        // Use localeCompare for proper alphabetical sorting
        // Special characters naturally sort before letters
        return a.localeCompare(b, 'en', { sensitivity: 'base' });
    });

    for (const key of keys) {
        sorted[key] = sortObjectProperties(obj[key]);
    }

    return sorted;
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Error: Please provide an input file path');
    console.log('Usage: node ./scripts/sort-json-properties.js <input-file> [output-file]');
    process.exit(1);
}

const inputFile = path.resolve(args[0]);
const outputFile = args[1] ? path.resolve(args[1]) : inputFile;

try {
    // Read and parse JSON
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    const jsonData = JSON.parse(fileContent);

    // Sort properties
    const sortedData = sortObjectProperties(jsonData);

    // Write back to file with proper formatting
    fs.writeFileSync(outputFile, JSON.stringify(sortedData, null, 4) + '\n', 'utf8');

    console.log(`✓ Sorted JSON written to: ${outputFile}`);
} catch (erm) {
    console.error('Error:', erm.message);
    process.exit(1);
}
