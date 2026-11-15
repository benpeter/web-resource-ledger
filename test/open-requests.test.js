// tva
/**
 * When a page's load event doesn't come within the navigation timeout, the
 * nav_timeout log names what the page was still waiting on, so an operator can
 * see which host kept it from finishing.
 */
import { describe, it, expect } from 'vitest';
import { summarizeOpenRequests } from '../src/capture.js';

function fakeRequest(url, type) {
  return { url: () => url, resourceType: () => type };
}

describe('summarizeOpenRequests', () => {
  it('names each open request by resource type and host', () => {
    const open = new Set([
      fakeRequest('https://www.youtube.com/embed/abc?autoplay=0', 'document'),
      fakeRequest('https://fonts.example.net/a.woff2', 'font'),
    ]);

    expect(summarizeOpenRequests(open)).toEqual(['document www.youtube.com', 'font fonts.example.net']);
  });

  it('lists a host once per resource type', () => {
    const open = new Set([
      fakeRequest('https://cdn.example.com/a.png', 'image'),
      fakeRequest('https://cdn.example.com/b.png', 'image'),
      fakeRequest('https://cdn.example.com/c.js', 'script'),
    ]);

    expect(summarizeOpenRequests(open)).toEqual(['image cdn.example.com', 'script cdn.example.com']);
  });

  it('stops at eight entries', () => {
    const open = new Set();
    for (let i = 0; i < 20; i++) open.add(fakeRequest(`https://h${i}.example.com/x.js`, 'script'));

    expect(summarizeOpenRequests(open)).toHaveLength(8);
  });

  it('returns an empty list when nothing is open', () => {
    expect(summarizeOpenRequests(new Set())).toEqual([]);
  });
});
