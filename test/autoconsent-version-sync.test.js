// tva
// The consent step runs two parts of @duckduckgo/autoconsent that have to be
// the same version: the page script, a copy committed as
// src/vendor/autoconsent-script.js, and the JSON rules, which src/consent.js
// imports from the installed package. `npm run vendor:autoconsent` refreshes
// the copy and AUTOCONSENT_VERSION after the package changed.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const root = join(import.meta.dirname, '..');
const pkgDir = join(root, 'node_modules/@duckduckgo/autoconsent');

describe('autoconsent: vendored page script and installed package', () => {
  it('AUTOCONSENT_VERSION in src/consent.js is the installed version', () => {
    const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
    const consent = readFileSync(join(root, 'src/consent.js'), 'utf8');
    expect(consent).toContain(`export const AUTOCONSENT_VERSION = '${installed}';`);
  });

  it('the vendored page script is the one of the installed package', () => {
    const dist = readFileSync(join(pkgDir, 'dist/autoconsent.playwright.js'), 'utf8');
    const vendored = readFileSync(join(root, 'src/vendor/autoconsent-script.js'), 'utf8');
    expect(vendored.includes(`export default ${JSON.stringify(dist)};`)).toBe(true);
  });
});
