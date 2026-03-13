You are creating the Cloudflare Worker entry point and response utilities
for WRL (Web Resource Ledger). The project scaffold (wrangler.toml,
package.json, vitest.config.js) already exists from a prior task.

Working directory: /Users/ben/github/benpeter/web-resource-ledger

## What to create

### 1. `src/responses.js` -- Response utilities

This module contains both the RFC 9457 error utility and the JSON success
response helper. Two functions, one module.

```js
// Detail message convention:
// - Name the specific resource: "Capture cap_abc123 not found"
// - State what is wrong and what to do: "URL scheme 'ftp' is not allowed; use http or https"
// - Human-readable, not machine-parseable (clients should switch on `status`)
// - Never leak internals (no stack traces, no storage keys, no reflected user input)

const titles = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export function problemResponse(status, detail, headers = {}) {
  const body = {
    type: 'about:blank',
    status,
    title: titles[status] || 'Error',
    detail,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...headers,
    },
  });
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
```

IMPORTANT security advisory from architecture review:
- The `titles[status] || 'Error'` fallback fires for unknown status codes.
  Add a comment on that line noting it signals a missing entry in the titles map.

### 2. `src/index.js` -- Worker entry point with route dispatch

```js
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
    // into error responses (CWE-209 information disclosure, sets wrong convention
    // for Steps 2-8)
    return problemResponse(404, 'The requested resource does not exist.');
  },
};

function handleHealth() {
  return jsonResponse({ status: 'ok' });
}
```

IMPORTANT: The fallback 404 MUST use a static detail message. Do NOT
echo `request.method` or `url.pathname` into the response. This was
flagged by security review as CWE-209 (information disclosure) and
sets the wrong convention for all subsequent implementation steps.

## What NOT to do
- Do NOT add routes beyond GET /health (Steps 2-8 will add them)
- Do NOT add CORS headers, security headers, or Cache-Control (Step 8 concern)
- Do NOT add 405 Method Not Allowed handling (YAGNI for Step 1)
- Do NOT import or use any npm packages
- Do NOT create additional files or subdirectories in src/
- Do NOT add error type constants or enums

## Team context
Team name: wrl-scaffold
Your task ID: 2
When you finish, mark task 2 as completed with TaskUpdate and send a message to the team lead with file paths and a 1-2 sentence summary.
