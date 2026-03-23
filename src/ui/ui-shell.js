// tva
import { DESIGN_SYSTEM_CSS } from '../design-system.js';
import { UI_CSS } from './ui-css.js';
import { AUTH_JS } from './ui-auth.js';
import { LOGIN_JS } from './ui-login.js';
import { WELCOME_JS } from './ui-welcome.js';
import { TOS_JS } from './ui-tos.js';
import { SETTINGS_JS } from './ui-settings.js';
import { SUBMIT_VIEW_JS } from './ui-submit.js';
import { DETAIL_VIEW_JS } from './ui-detail.js';
import { POLL_JS } from './ui-poll.js';

export function htmlDashboard() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Web Resource Ledger</title>
<link rel="icon" type="image/svg+xml" href="/favicon.ico">
<style>
${DESIGN_SYSTEM_CSS}
${UI_CSS}
</style>
</head>
<body>
<div id="app"></div>
<noscript>
  <div style="max-width:480px;margin:4rem auto;padding:1rem;font-family:sans-serif;">
    <h1 style="font-size:1.25rem;margin-bottom:0.75rem;">JavaScript Required</h1>
    <p>Web Resource Ledger requires JavaScript to run. Enable JavaScript in your browser settings to continue.</p>
    <p style="margin-top:0.75rem;"><a href="https://github.com/benpeter/web-resource-ledger">API documentation</a></p>
  </div>
</noscript>
<script>
(function () {
'use strict';

// === AUTH ===
${AUTH_JS}

// === LOGIN ===
${LOGIN_JS}

// === WELCOME ===
${WELCOME_JS}

// === TOS ===
${TOS_JS}

// === SETTINGS ===
${SETTINGS_JS}

// === POLL ===
${POLL_JS}

// === VIEW: SUBMIT ===
${SUBMIT_VIEW_JS}

// === VIEW: DETAIL ===
${DETAIL_VIEW_JS}

// ---------------------------------------------------------------------------
// Hash router
// ---------------------------------------------------------------------------

var CAPTURE_RE = /^cap_[a-f0-9]{32}$/;

function route() {
  var hash = location.hash || '';
  // Strip leading #
  var path = hash.replace(/^#/, '') || '/';

  // Default: redirect empty or bare / to #/captures
  if (path === '/' || path === '') {
    location.replace('#/captures');
    return;
  }

  if (path === '/captures') {
    renderCaptures();
    mountCaptures();
    return;
  }

  if (path === '/settings') {
    if (_authMethod === 'session') {
      renderSettings();
      mountSettings();
    } else {
      location.replace('#/captures');
    }
    return;
  }

  // /captures/:id
  var detailMatch = path.match(/^\\/captures\\/([^/]+)$/);
  if (detailMatch) {
    var id = detailMatch[1];
    if (CAPTURE_RE.test(id)) {
      renderDetail(id);
      mountDetail(id);
      return;
    }
  }

  // Unmatched: fall back to captures
  location.replace('#/captures');
}

window.addEventListener('hashchange', function () {
  // Stop all active capture polls before rendering the next view
  stopAllPolling();
  // Clear global error on navigation
  var ge = document.getElementById('global-error');
  if (ge) ge.remove();
  route();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

bootApp();

}());
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      // Per-page CSP. Global security headers (X-Frame-Options, HSTS, etc.)
      // are applied by the router in index.js and must not be duplicated here.
      // img-src: 'self' covers screenshots and the favicon (served from /favicon.ico).
      'Content-Security-Policy': [
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        "img-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'Cache-Control': 'no-store',
    },
  });
}
