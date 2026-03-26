// tva
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// --- resolve paths ---
const pkgPath = resolve(root, 'node_modules/@duckduckgo/autoconsent/package.json');
const distPath = resolve(root, 'node_modules/@duckduckgo/autoconsent/dist/autoconsent.playwright.js');
const outPath  = resolve(root, 'src/vendor/autoconsent-script.js');
const consentPath = resolve(root, 'src/consent.js');

// --- guard: package installed ---
let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
} catch (err) {
  console.error('autoconsent not installed. Run `npm install` first.', err.message);
  process.exit(1);
}
const version = pkg.version;

// --- guard: expected dist file present ---
let scriptContent;
try {
  scriptContent = readFileSync(distPath, 'utf8');
} catch (err) {
  console.error('autoconsent dist layout changed -- expected dist/autoconsent.playwright.js', err.message);
  process.exit(1);
}

// --- write vendored wrapper ---
const serialized = JSON.stringify(scriptContent);
const output = [
  '// Auto-generated wrapper -- exports autoconsent script as a string',
  '// Do not edit; regenerate from autoconsent.playwright.js (NOT content.bundle.js)',
  `export default ${serialized};`,
  '',
].join('\n');

writeFileSync(outPath, output, 'utf8');
console.log(`vendored autoconsent ${version} -> src/vendor/autoconsent-script.js (${output.length} bytes)`);

// --- update AUTOCONSENT_VERSION in src/consent.js ---
let consentSrc;
try {
  consentSrc = readFileSync(consentPath, 'utf8');
} catch {
  console.error('Could not find AUTOCONSENT_VERSION export in src/consent.js');
  process.exit(1);
}

const versionLine = /^export const AUTOCONSENT_VERSION = '.*?';$/m;
if (!versionLine.test(consentSrc)) {
  console.error('Could not find AUTOCONSENT_VERSION export in src/consent.js');
  process.exit(1);
}

const updated = consentSrc.replace(versionLine, `export const AUTOCONSENT_VERSION = '${version}';`);
writeFileSync(consentPath, updated, 'utf8');
console.log(`updated AUTOCONSENT_VERSION in src/consent.js to ${version}`);
