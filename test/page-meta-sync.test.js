// tva
// Search results cut a title after about 60 characters and a description after
// about 160. Two use-case pages had titles of 61 and 69 characters once the docs
// layout added " — WRL Documentation", and four descriptions ran to 161-211.
// Every landing and docs page has a description, and its title and description
// fit. Reads the sources as text, like og-image-sync.test.js.
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;

function decode(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function docsSuffix() {
  const site = readFileSync(join(root, 'site/_data/site.js'), 'utf8');
  const layout = readFileSync(join(root, 'site/_includes/layouts/base.njk'), 'utf8');
  expect(layout).toContain('<title>{{ title }} — {{ site.title }}</title>');
  return ` — ${site.match(/^\s+title: "([^"]+)"/m)[1]}`;
}

function docsPages(dir = join(root, 'site/content')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return docsPages(path);
    if (!/\.(md|njk)$/.test(entry.name)) return [];
    const front = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---/);
    if (!front || !/^layout:/m.test(front[1])) return [];
    const field = (name) => front[1].match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1].trim();
    return [{ page: relative(root, path), title: field('title'), description: field('description') }];
  });
}

function landingPages() {
  const dir = join(root, 'landing/public');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.html') && name !== '404.html')
    .map((name) => {
      const html = readFileSync(join(dir, name), 'utf8');
      return {
        page: `landing/public/${name}`,
        title: decode(html.match(/<title>([^<]*)<\/title>/)[1]),
        description: decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''),
      };
    });
}

describe('page titles and descriptions', () => {
  it('fit search results on every docs page', () => {
    const suffix = docsSuffix();
    const pages = docsPages();
    expect(pages.length).toBeGreaterThan(20);
    for (const { page, title, description } of pages) {
      expect({ page, title: `${title}${suffix}`.length <= MAX_TITLE }).toEqual({ page, title: true });
      expect({ page, description: Boolean(description) && description.length <= MAX_DESCRIPTION })
        .toEqual({ page, description: true });
    }
  });

  // CI doesn't build the docs; only the deploy after merge does. An unquoted
  // title or description with ": " or " #" breaks its YAML front matter there.
  it('keeps docs titles and descriptions valid as plain YAML values', () => {
    for (const { page, title, description } of docsPages()) {
      for (const [field, value] of [['title', title], ['description', description]]) {
        expect({ page, field, plain: !/: | #|^["']/.test(value) }).toEqual({ page, field, plain: true });
      }
    }
  });

  it('fit search results on every landing page', () => {
    const pages = landingPages();
    expect(pages.length).toBeGreaterThan(5);
    for (const { page, title, description } of pages) {
      expect({ page, title: title.length <= MAX_TITLE }).toEqual({ page, title: true });
      expect({ page, description: Boolean(description) && description.length <= MAX_DESCRIPTION })
        .toEqual({ page, description: true });
    }
  });
});
