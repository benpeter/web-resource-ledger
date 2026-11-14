// tva
// Renders the docs diagrams, site/diagrams/<name>.mmd, to
// site/assets/diagrams/<name>.svg (phase 0171). The docs CSP (script-src
// 'self') blocks Mermaid in the page, so the pages show these files as images.
// Labels are SVG text (htmlLabels off), because an SVG shown through <img> may
// not render HTML labels, and width and height come from the viewBox so the
// image has a size. Run `npm run docs:diagrams` after editing a .mmd file; it
// fetches Mermaid from jsDelivr into a local headless Chromium.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'site/diagrams');
const outDir = join(root, 'site/assets/diagrams');

const sources = Object.fromEntries(
  readdirSync(sourceDir)
    .filter((file) => file.endsWith('.mmd'))
    .map((file) => [file.replace(/\.mmd$/, ''), readFileSync(join(sourceDir, file), 'utf8')]),
);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const svgs = await page.evaluate(async ({ url, sources }) => {
    const { default: mermaid } = await import(url);
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', htmlLabels: false, flowchart: { htmlLabels: false }, securityLevel: 'strict' });
    const out = {};
    for (const [name, source] of Object.entries(sources)) {
      const { svg } = await mermaid.render(`d-${name}`, source);
      const [, , , width, height] = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
      out[name] = svg
        .replace(/ width="100%"/, '')
        .replace(/ style="max-width: [\d.]+px;"/, '')
        .replace(/^<svg/, `<svg width="${Math.ceil(width)}" height="${Math.ceil(height)}"`);
    }
    return out;
  }, { url: MERMAID_URL, sources });
  for (const [name, svg] of Object.entries(svgs)) {
    writeFileSync(join(outDir, `${name}.svg`), svg);
    console.log(`site/assets/diagrams/${name}.svg`);
  }
} finally {
  await browser.close();
}
