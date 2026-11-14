// tva
// The webhooks guide said every delivery carries two headers, the signature and
// the timestamp. Deliveries also send X-WRL-Event, X-WRL-Delivery (the event id,
// the same on every retry) and a User-Agent. Every header the delivery code
// sends is in the guide's table; reads the sources as text, like
// llms-sync.test.js.
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../src/webhook-signing.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('webhook delivery headers', () => {
  it('are all listed in the webhooks guide', () => {
    const dispatch = readFileSync(join(root, 'src/webhook-dispatch.js'), 'utf8');
    const guide = readFileSync(join(root, 'site/content/webhooks.md'), 'utf8');
    const sent = [...new Set([...dispatch.matchAll(/'(X-WRL-[A-Za-z0-9-]+)'/g)].map((m) => m[1]))];
    const userAgent = dispatch.match(/'User-Agent': '([^']+)'/)[1];
    expect(sent).toEqual(expect.arrayContaining(['X-WRL-Event', 'X-WRL-Delivery']));
    const documented = [...guide.matchAll(/^\| `([A-Za-z0-9-]+)` \|/gm)].map((m) => m[1]);
    const missing = [...sent, SIGNATURE_HEADER, TIMESTAMP_HEADER, 'User-Agent'].filter((h) => !documented.includes(h));
    expect(missing).toEqual([]);
    expect(guide).toContain(`\`${userAgent}\``);
  });
});
