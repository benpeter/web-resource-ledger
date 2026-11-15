// tva
// Cache key utilities for Workers Cache API.
// The Cache API does not implement HTTP Vary semantics -- it uses the full
// Request object as cache key. Two requests with different Accept headers
// to the same URL would overwrite each other. We solve this by appending
// a synthetic ?_fmt=json|html parameter to the cache key URL.

/**
 * Build a cache key from the request URL, normalizing the Accept header
 * into a format suffix to handle Vary:Accept correctly.
 */
export function buildCacheKey(request) {
  const url = new URL(request.url);
  url.searchParams.set('_fmt', wantsHtml(request) ? 'html' : 'json');
  return new Request(url.toString(), { method: 'GET' });
}

// Clients that fetch a shared link to build a preview card. Most send
// `Accept: */*`, which would otherwise get them JSON and no card.
const LINK_PREVIEW_AGENTS = /Slackbot|Twitterbot|facebookexternalhit|Facebot|LinkedInBot|Discordbot|WhatsApp|TelegramBot|SkypeUriPreview|Mastodon|Bluesky Cardyb/i;

/**
 * Content negotiation for endpoints that serve a page to people and JSON to
 * programs: HTML when the client asks for it, or when it is a link-preview
 * client that accepts anything.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function wantsHtml(request) {
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/html')) return true;
  return (accept === '' || accept.includes('*/*')) && LINK_PREVIEW_AGENTS.test(request.headers.get('User-Agent') || '');
}

/**
 * Build a cache key for endpoints that always return the same format
 * (no content negotiation). Uses the request URL directly.
 */
export function buildSimpleCacheKey(request) {
  return new Request(request.url, { method: 'GET' });
}

/**
 * Get the default cache instance, or null when edge caching is disabled.
 * Workers Cache API operations (match/put) hang in the workerd test
 * runtime, so caching is opt-in via env.ENABLE_EDGE_CACHE = "true".
 */
export function getCache(env) {
  if (env?.ENABLE_EDGE_CACHE !== 'true') return null;
  try {
    return caches.default;
  } catch {
    return null;
  }
}
