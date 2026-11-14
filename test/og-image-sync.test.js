// tva
// Shared links showed no picture: the landing page asked for a large card
// (twitter:card summary_large_image) without naming an image, and no landing or
// docs page set og:image. Every page with Open Graph tags names the one card
// image, and the PNG it names exists at the size the tags declare. Reads the
// sources as text, like llms-sync.test.js.
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const landingDir = join(root, 'landing/public');
const OG_IMAGE = 'https://webresourceledger.com/assets/og-image.png';

function meta(html, key) {
  const match = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return match ? match[1] : null;
}

function landingPagesWithOg() {
  return readdirSync(landingDir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => ({ name, html: readFileSync(join(landingDir, name), 'utf8') }))
    .filter(({ html }) => meta(html, 'og:url'));
}

describe('Open Graph card image', () => {
  it('is a 1200x630 PNG served from the landing assets', () => {
    const png = readFileSync(join(landingDir, 'assets/og-image.png'));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it('is named, with size and alt text, by every landing page with Open Graph tags', () => {
    const pages = landingPagesWithOg();
    expect(pages.length).toBeGreaterThan(5);
    for (const { name, html } of pages) {
      expect({ name, image: meta(html, 'og:image') }).toEqual({ name, image: OG_IMAGE });
      expect({ name, width: meta(html, 'og:image:width'), height: meta(html, 'og:image:height') })
        .toEqual({ name, width: '1200', height: '630' });
      expect({ name, alt: Boolean(meta(html, 'og:image:alt')) }).toEqual({ name, alt: true });
    }
  });

  it('is the large card image on the home page', () => {
    const html = readFileSync(join(landingDir, 'index.html'), 'utf8');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'twitter:image')).toBe(OG_IMAGE);
  });

  it('is named by the docs site layout', () => {
    const layout = readFileSync(join(root, 'site/_includes/layouts/base.njk'), 'utf8');
    expect(meta(layout, 'og:image')).toBe(OG_IMAGE);
    expect(meta(layout, 'og:image:width')).toBe('1200');
    expect(meta(layout, 'og:image:height')).toBe('630');
    expect(Boolean(meta(layout, 'og:image:alt'))).toBe(true);
  });
});
