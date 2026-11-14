// tva
// The docs diagrams never rendered: the pages loaded Mermaid from a CDN in an
// inline script, and the docs Content-Security-Policy (script-src 'self', set
// by site/src/index.js) blocks both, so readers saw the diagram source as code.
// Diagrams are now SVG files rendered from site/diagrams/*.mmd and shown as
// images. Reads the sources as text, like llms-sync.test.js.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'site/content');
const diagramsDir = join(root, 'site/diagrams');
const assetsDir = join(root, 'site/assets/diagrams');

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

function diagramImages() {
  return markdownFiles(contentDir).flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    return [...text.matchAll(/!\[([^\]]*)\]\(\/assets\/diagrams\/([a-z0-9-]+)\.svg\)/g)]
      .map(([, alt, name]) => ({ page: relative(root, path), alt, name }));
  });
}

describe('docs diagrams', () => {
  it('no docs page has a mermaid code block, which the CSP would leave unrendered', () => {
    const pages = markdownFiles(contentDir)
      .filter((path) => /^```mermaid\s*$/m.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    expect(pages).toEqual([]);
  });

  it('every diagram source in site/diagrams is shown on a docs page', () => {
    const shown = new Set(diagramImages().map(({ name }) => name));
    const sources = readdirSync(diagramsDir).filter((f) => f.endsWith('.mmd')).map((f) => f.replace(/\.mmd$/, ''));
    expect(sources.length).toBe(5);
    expect(sources.filter((name) => !shown.has(name))).toEqual([]);
  });

  it('every diagram image has alt text, a source and an SVG that renders inside an img', () => {
    const images = diagramImages();
    expect(images.length).toBe(5);
    for (const { page, alt, name } of images) {
      expect({ page, name, alt: alt.length > 20 }).toEqual({ page, name, alt: true });
      expect({ name, source: existsSync(join(diagramsDir, `${name}.mmd`)) }).toEqual({ name, source: true });
      const svg = readFileSync(join(assetsDir, `${name}.svg`), 'utf8');
      expect({ name, svg: svg.startsWith('<svg') }).toEqual({ name, svg: true });
      // An SVG shown through <img> runs no script, and browsers differ on
      // foreignObject (HTML labels) there, so labels must be SVG text.
      expect({ name, script: /<script/i.test(svg), foreignObject: /<foreignObject/i.test(svg) })
        .toEqual({ name, script: false, foreignObject: false });
      expect({ name, size: /^<svg[^>]* width="\d+(\.\d+)?" height="\d+(\.\d+)?"/.test(svg) }).toEqual({ name, size: true });
    }
  });
});
