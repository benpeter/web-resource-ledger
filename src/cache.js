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
  const accept = request.headers.get('Accept') || '';
  url.searchParams.set('_fmt', accept.includes('text/html') ? 'html' : 'json');
  return new Request(url.toString(), { method: 'GET' });
}

/**
 * Build a cache key for endpoints that always return the same format
 * (no content negotiation). Uses the request URL directly.
 */
export function buildSimpleCacheKey(request) {
  return new Request(request.url, { method: 'GET' });
}
