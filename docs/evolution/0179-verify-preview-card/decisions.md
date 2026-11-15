# Decisions

- The card names the captured URL and the capture time. Both are on the
  verification page already, for anyone who has the link, and the person who
  pastes the link means to show them.
- The image is the Web Resource Ledger card from the landing site, never the
  screenshot. The screenshot is someone else's page, a card image gets copied
  into the caches of every service the link is pasted into, and a capture
  quarantined later couldn't be taken back from there.
- The existing URL stays the shared link. Link-preview clients are recognised
  by user agent (`LINK_PREVIEW_AGENTS` in `src/cache.js`) and get the page
  when they accept anything. A second, always-HTML URL would have meant
  changing `verifyUrl` in every surface, and links already shared would stay
  without a card.
- A preview client that asks for `application/json` still gets JSON, and so
  does every other client with `*/*` (curl, API clients).
- `wantsHtml()` decides both the response format and the cache key, so the
  two can't disagree.
- A capture that fails verification gets a card that says so, without a
  date. Only verified pages are cached, as before.
- The URL in the card is host, path and query, cut at 80 characters. It goes
  through `new URL()` and `escapeHtml()`.
- No `Vary: User-Agent`. The page is cached under WRL's own key, and adding
  it would stop browsers from reusing their copy.
- A self-hosted instance shows webresourceledger.com's card image. Left as
  is until someone self-hosts with their own brand.
- Pages cached before this change keep the old HTML for up to 24 hours per
  Cloudflare location.
