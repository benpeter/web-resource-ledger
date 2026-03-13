import { problemResponse, jsonResponse } from './responses.js';

// Routes: [method, pattern, handler]
// Order matters: most specific pattern first.
// Add new routes as one-line tuples.
const routes = [
  ['GET', /^\/health$/, handleHealth],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Normalize trailing slashes: /health/ matches /health
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    for (const [method, pattern, handler] of routes) {
      if (request.method !== method) continue;
      const match = pathname.match(pattern);
      if (match) return handler(request, env, ctx, match);
    }

    // SECURITY: Use static message -- never reflect request.method or url.pathname
    // into error responses (CWE-209 information disclosure)
    return problemResponse(404, 'The requested resource does not exist.');
  },
};

function handleHealth() {
  return jsonResponse({ status: 'ok' });
}
