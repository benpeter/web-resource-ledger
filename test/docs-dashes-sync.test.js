// tva
// The docs site renders Markdown without a typographer, so a double hyphen
// shows on the live page as typed: "safe -- both are active" and
// "20--60 seconds" were printed like that (#415, #417, #418). Prose in
// site/content uses a comma, colon, semicolon, parentheses or a new sentence
// instead, and a single hyphen for number ranges. Code blocks and inline code
// may hold command-line flags, so they're left out. The descriptions and
// summaries in openapi.yaml render on /api-reference/ the same way, and the
// landing pages are plain HTML: their text, titles and FAQ JSON-LD (shown in
// search results) printed "--" as typed too.
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');
const contentDir = join(root, 'site', 'content');
const landingDir = join(root, 'landing', 'public');

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

// Every description and summary in the spec, with the path that leads to it.
function specTexts(node, path = []) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => {
    if (typeof value === 'string' && (key === 'description' || key === 'summary')) {
      return [{ path: [...path, key].join('.'), text: value.replace(/`[^`]*`/g, '``') }];
    }
    return specTexts(value, [...path, key]);
  });
}

// What a visitor or a search engine reads on a landing page: the text, the
// title and meta content, and the JSON-LD. Comments, scripts and styles aren't.
function landingText(path) {
  const html = readFileSync(path, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<(pre|code)[^>]*>[\s\S]*?<\/\1>/g, '');
  return { page: relative(root, path), text: html.replace(/\s+/g, ' ') };
}

describe('docs prose', () => {
  it('has no double hyphens, which the site prints as typed', () => {
    const lines = pageFiles(contentDir).flatMap(proseLines);
    expect(lines.length).toBeGreaterThan(1000);
    expect(lines.filter(({ text }) => / -- |\d--\d/.test(text)).map(({ page }) => page)).toEqual([]);
  });

  it('openapi.yaml descriptions and summaries have no double hyphens', () => {
    const texts = specTexts(parse(readFileSync(join(root, 'openapi.yaml'), 'utf8')));
    expect(texts.length).toBeGreaterThan(500);
    expect(texts.filter(({ text }) => / -- |\d--\d/.test(text)).map(({ path }) => path)).toEqual([]);
  });

  it('landing pages and llms.txt have no double hyphens', () => {
    const pages = readdirSync(landingDir).filter((name) => name.endsWith('.html')).map((name) => landingText(join(landingDir, name)));
    pages.push({ page: 'landing/public/llms.txt', text: readFileSync(join(landingDir, 'llms.txt'), 'utf8') });
    expect(pages.length).toBeGreaterThan(5);
    expect(pages.filter(({ text }) => / -- |\d--\d/.test(text)).map(({ page }) => page)).toEqual([]);
  });
});
