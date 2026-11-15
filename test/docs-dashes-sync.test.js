// tva
// The docs site renders Markdown without a typographer, so a double hyphen
// shows on the live page as typed: "safe -- both are active" and
// "20--60 seconds" were printed like that (#415, #417, #418). Prose in
// site/content uses a comma, colon, semicolon, parentheses or a new sentence
// instead, and a single hyphen for number ranges. Code blocks and inline code
// may hold command-line flags, so they're left out.
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { describe, it, expect } from 'vitest';

const root = join(import.meta.dirname, '..');
const contentDir = join(root, 'site', 'content');

function pageFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(path);
    return /\.(md|njk)$/.test(entry.name) ? [path] : [];
  });
}

function proseLines(path) {
  let inCodeBlock = false;
  return readFileSync(path, 'utf8').split('\n').flatMap((line, index) => {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return [];
    }
    if (inCodeBlock) return [];
    return [{ page: `${relative(root, path)}:${index + 1}`, text: line.replace(/`[^`]*`/g, '``') }];
  });
}

describe('docs prose', () => {
  it('has no double hyphens, which the site prints as typed', () => {
    const lines = pageFiles(contentDir).flatMap(proseLines);
    expect(lines.length).toBeGreaterThan(1000);
    expect(lines.filter(({ text }) => / -- |\d--\d/.test(text)).map(({ page }) => page)).toEqual([]);
  });
});
