// tva
// The landing and docs "Sign in" and "Get started free" buttons went to
// /auth/login, which starts GitHub OAuth at once, so visitors never saw the
// emailed sign-in link that /ui offers next to GitHub (phase 0131). They open
// /ui now, keeping ?from= for attribution. Reads the sources as text, like
// llms-sync.test.js.
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function files(dir, pattern) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

const PAGES = [
  ...files(join(root, 'landing/public'), /\.html$/),
  ...files(join(root, 'site/_includes'), /\.njk$/),
  ...files(join(root, 'site/content'), /\.(md|njk)$/),
];

function signInLinks(source) {
  return [...source.matchAll(/<a href="([^"]+)"[^>]*>(Sign in|Get started free)<\/a>|\[(Sign in)\]\(([^)]+)\)/g)]
    .map((m) => m[1] ?? m[4]);
}

describe('sign-in links on the landing and docs sites', () => {
  it('never start GitHub OAuth directly', () => {
    const direct = PAGES.filter((file) => readFileSync(file, 'utf8').includes('webresourceledger.com/auth/login'))
      .map((file) => file.slice(root.length + 1));
    expect(direct).toEqual([]);
  });

  it('open the sign-in page with GitHub and email, attributed to the site', () => {
    const links = PAGES.flatMap((file) => {
      const site = file.includes('/landing/') ? 'landing' : 'docs';
      return signInLinks(readFileSync(file, 'utf8')).map((href) => ({ file: file.slice(root.length + 1), href, site }));
    });
    expect(links.length).toBeGreaterThan(8);
    for (const { file, href, site } of links) {
      expect({ file, href }).toEqual({ file, href: `https://api.webresourceledger.com/ui?from=${site}` });
    }
  });
});
