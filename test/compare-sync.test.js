// tva
// The docs comparison page said it covered 13 tools and the landing page linked
// to it as 14, while its table compared WRL with 9. Neither page named ProofSnap
// or DEPT, the two tools the 2026-03-26 positioning decisions added. Both tables
// keep one cell per column in every row, every linked tool has a note, and both
// counts come from the docs table. Reads the sources as text, like
// og-image-sync.test.js.
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const comparePage = readFileSync(join(root, 'site/content/compare.njk'), 'utf8');
const landingPage = readFileSync(join(root, 'landing/public/index.html'), 'utf8');

function text(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

function table(html) {
  const match = html.match(/<table class="comparison-table[^"]*">([\s\S]*?)<\/table>/);
  expect(match).not.toBeNull();
  const headers = [...match[1].matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1]);
  const body = match[1].match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => ({
    feature: text(m[1].match(/<th scope="row"[^>]*>([\s\S]*?)<\/th>/)[1]),
    tools: [...m[1].matchAll(/<td[^>]*data-tool="([^"]*)"/g)].map((t) => t[1]),
  }));
  return { headers, rows };
}

function toolColumns(headers) {
  return headers.slice(1).map(text);
}

describe('comparison tables', () => {
  for (const [name, html] of [['docs', comparePage], ['landing', landingPage]]) {
    it(`has one cell per tool in every row of the ${name} table`, () => {
      const { headers, rows } = table(html);
      const tools = toolColumns(headers);
      expect(rows.length).toBeGreaterThan(5);
      for (const row of rows) {
        expect({ feature: row.feature, tools: row.tools }).toEqual({ feature: row.feature, tools });
      }
    });
  }

  it('links every compared product in the docs table and gives each a note', () => {
    const { headers } = table(comparePage);
    const notes = [...comparePage.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) => text(m[1]));
    const linked = headers.slice(2).filter((h) => h.includes('<a href="https://'));
    expect(linked.map(text)).toEqual(toolColumns(headers).slice(2));
    for (const tool of linked.map(text)) {
      expect({ tool, note: notes.includes(tool) }).toEqual({ tool, note: true });
    }
  });

  it('names ProofSnap and DEPT', () => {
    expect(toolColumns(table(comparePage).headers)).toContain('ProofSnap');
    expect(comparePage).toContain('href="https://digitalevidencetoolkit.org"');
  });

  it('counts the compared tools the same on both pages as the docs table', () => {
    const compared = toolColumns(table(comparePage).headers).length - 1;
    const description = comparePage.match(/^description: .*?\b(\d+)\b/m);
    const landingLink = landingPage.match(/Full comparison (?:across|of WRL with) (\d+) /);
    expect(description && Number(description[1])).toBe(compared);
    expect(landingLink && Number(landingLink[1])).toBe(compared);
  });
});
