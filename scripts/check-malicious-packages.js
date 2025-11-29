/**
 * This script scans a Node.js project for known malicious package versions
 *
 * It checks both:
 *   - pnpm-lock.yaml (used by pnpm for dependency resolution)
 *   - node_modules (installed packages)
 *
 * If any compromised versions are found, it prints a warning to the console.
 * This helps developers quickly assess whether their project may be affected
 * and take action to update or remove vulnerable dependencies.
 *
 * Cross-platform compatible: works on Windows, macOS, and Linux.
 *
 * Usage:
 *   1. Run `npm install jsonschema yaml` to install dependencies.
 *   2. Execute with `node check-malicious-packages.js [config-file]` from your project root.
 *      If no config file is provided, it will look for *.cmp.json files in the scripts directory.
 */
//@ts-check

const fs = require('fs');
const path = require('path');
const { Validator } = require('jsonschema');
const yaml = require('yaml');

/**
 * Load and validate a compromise configuration file
 * @param {string} configPath - Path to the JSON configuration file
 * @returns {{name: string, description?: string, date?: string, packages: {[key: string]: string[]}}}
 */
function loadCompromiseConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, 'utf8');
  let config;
  try {
    config = JSON.parse(configContent);
  } catch (err) {
    if (err instanceof Error) {
      console.error(`❌ Failed to parse JSON from ${configPath}: ${err.message}`);
    } else {
      console.error(`❌ Failed to parse JSON from ${configPath}:`, String(err));
    }
    process.exit(1);
  }

  // Load and validate against schema
  const schemaPath = path.join(__dirname, 'cmp.schema.json');
  if (!fs.existsSync(schemaPath)) {
    console.warn('⚠️  Schema file not found, skipping validation');
  } else {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const validator = new Validator();
    const result = validator.validate(config, schema);

    if (!result.valid) {
      console.error(`❌ Configuration file ${configPath} does not match schema:`);
      result.errors.forEach((error) => {
        console.error(`  - ${error.stack}`);
      });
      process.exit(1);
    }
  }

  return config;
}

/**
 * Find all .cmp.json files in the scripts directory
 * @returns {string[]} Array of file paths
 */
function findCompromiseConfigs() {
  const scriptsDir = __dirname;
  const files = fs.readdirSync(scriptsDir);
  return files
    .filter((file) => file.endsWith('.cmp.json'))
    .map((file) => path.join(scriptsDir, file));
}

/**
 * Merge multiple compromise configurations into a single packages object
 * @param {string[]} configPaths - Array of paths to configuration files
 * @returns {{[packageName: string]: string[]}}
 */
function mergeCompromiseConfigs(configPaths) {
  /** @type {{[packageName: string]: string[]}} */
  const merged = {};

  for (const configPath of configPaths) {
    const config = loadCompromiseConfig(configPath);
    console.log(`📋 Loaded compromise: ${config.name}${config.date ? ` (${config.date})` : ''}`);

    for (const [pkgName, versions] of Object.entries(config.packages)) {
      if (!merged[pkgName]) {
        merged[pkgName] = [];
      }
      // Add versions, avoiding duplicates
      for (const version of versions) {
        if (!merged[pkgName].includes(version)) {
          merged[pkgName].push(version);
        }
      }
    }
  }

  return merged;
}

/**
 * Check pnpm-lock.yaml for malicious packages by parsing the YAML structure
 * @param {string} lockPath - Path to pnpm-lock.yaml
 * @param {{[packageName: string]: string[]}} maliciousPackages - Map of package names to malicious versions
 * @returns {boolean} True if any malicious packages were found
 */
function checkPnpmLockYaml(lockPath, maliciousPackages) {
  let found = false;

  try {
    const lockContent = fs.readFileSync(lockPath, 'utf8');
    const lockData = yaml.parse(lockContent);

    // Check packages in the lockfile
    // pnpm-lock.yaml can have packages in different structures depending on version
    const packages = lockData.packages || lockData.dependencies || {};

    for (const [pkgKey, pkgInfo] of Object.entries(packages)) {
      // Package keys can be in formats like:
      // - "/@scope/package@1.0.0"
      // - "/package@1.0.0"
      // - "@scope/package@1.0.0"
      // - "package@1.0.0"
      const match = pkgKey.match(/^(?:\/)?(.+?)@(.+?)(?:\(|$)/);
      if (!match) {
        continue;
      }

      const [, pkgName, version] = match;
      const versions = maliciousPackages[pkgName];

      if (versions && versions.includes(version)) {
        console.log(`⚠️  Found in pnpm-lock.yaml: ${pkgName}@${version}`);
        found = true;
      }
    }

    // Also check importers section for workspace dependencies
    if (lockData.importers) {
      for (const [importerPath, importerData] of Object.entries(lockData.importers)) {
        const allDeps = {
          ...(importerData.dependencies || {}),
          ...(importerData.devDependencies || {}),
          ...(importerData.optionalDependencies || {}),
        };

        for (const [pkgName, depInfo] of Object.entries(allDeps)) {
          // Extract version from dependency info (can be a string or object)
          let version;
          if (typeof depInfo === 'string') {
            version = depInfo;
          } else if (depInfo && typeof depInfo === 'object' && 'version' in depInfo) {
            version = depInfo.version;
          }

          if (version) {
            // Remove any specifier characters
            const cleanVersion = version.replace(/^[~^>=<]/, '');
            const versions = maliciousPackages[pkgName];

            if (versions && versions.includes(cleanVersion)) {
              console.log(`⚠️  Found in pnpm-lock.yaml (${importerPath}): ${pkgName}@${cleanVersion}`);
              found = true;
            }
          }
        }
      }
    }
  } catch (erm) {
    if (erm instanceof Error) {
      console.error(`❌ Failed to parse pnpm-lock.yaml: ${erm.message}`);
    } else {
      console.error('❌ Failed to parse pnpm-lock.yaml:', String(erm));
    }
    process.exit(1);
  }

  return found;
}

// Main execution
let maliciousPackages;
const args = process.argv.slice(2);

if (args.length > 0) {
  // Use specified config file(s)
  const configPaths = args.map((arg) => path.resolve(arg));
  maliciousPackages = mergeCompromiseConfigs(configPaths);
} else {
  // Auto-discover config files in scripts directory
  const configPaths = findCompromiseConfigs();
  if (configPaths.length === 0) {
    console.error('❌ No compromise configuration files found (*.cmp.json)');
    console.log('Usage: node check-malicious-packages.js [config-file...]');
    process.exit(1);
  }
  console.log(`🔍 Found ${configPaths.length} compromise configuration(s)`);
  maliciousPackages = mergeCompromiseConfigs(configPaths);
}

const totalPackages = Object.keys(maliciousPackages).length;
const totalVersions = Object.values(maliciousPackages).reduce((sum, versions) => sum + versions.length, 0);
console.log(`🎯 Checking for ${totalVersions} compromised versions across ${totalPackages} packages\n`);

let found = false;

// Check pnpm-lock.yaml using YAML parser
const lockPath = path.join(process.cwd(), 'pnpm-lock.yaml');
if (fs.existsSync(lockPath)) {
  found = checkPnpmLockYaml(lockPath, maliciousPackages);
} else {
  console.log('📦 pnpm-lock.yaml not found.');
  // Check node_modules
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    for (const pkgName of Object.keys(maliciousPackages)) {
      const pkgJsonPath = path.join(nodeModulesPath, pkgName, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const versions = maliciousPackages[pkgName] || [];
        if (versions.includes(pkgData.version)) {
          console.log(`⚠️  Found in node_modules: ${pkgName}@${pkgData.version}`);
          found = true;
        }
      }
    }
  } else {
    console.log('📁 node_modules directory not found.');
  }
}

if (!found) {
  console.log('✅ No malicious packages detected.');
} else {
  console.log('\n❌ MALICIOUS PACKAGES DETECTED!');
  console.log('Please remove the compromised packages immediately.');
  // Abort install if run in a lifecycle script
  process.exit(1);
}
