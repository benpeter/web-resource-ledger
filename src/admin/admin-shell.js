// tva
import { DESIGN_SYSTEM_CSS } from '../design-system.js';
import { ADMIN_CSS } from './admin-css.js';
import { ADMIN_AUTH_JS } from './admin-auth.js';
import { ADMIN_TENANTS_JS } from './admin-tenants.js';
import { ADMIN_DETAIL_JS } from './admin-detail.js';

export function htmlAdminDashboard() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WRL Admin</title>
<link rel="icon" type="image/svg+xml" href="/favicon.ico">
<style>
${DESIGN_SYSTEM_CSS}
${ADMIN_CSS}
</style>
</head>
<body>
<div id="admin-app"></div>
<noscript>
  <div style="max-width:480px;margin:4rem auto;padding:1rem;font-family:sans-serif;">
    <h1 style="font-size:1.25rem;margin-bottom:0.75rem;">JavaScript Required</h1>
    <p>WRL Admin requires JavaScript to run. Enable JavaScript in your browser settings to continue.</p>
  </div>
</noscript>
<script>
(function () {
'use strict';

// === AUTH + FETCH ===
${ADMIN_AUTH_JS}

// === VIEW: TENANTS ===
${ADMIN_TENANTS_JS}

// === VIEW: DETAIL ===
${ADMIN_DETAIL_JS}

// ---------------------------------------------------------------------------
// Hash router
// ---------------------------------------------------------------------------

function updateAdminNavCurrent(activePath) {
  var links = document.querySelectorAll('.nav-link');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || '';
    if (href.startsWith('http')) continue;
    var route = href.replace(/^#/, '');
    if (activePath === route || activePath.indexOf(route + '/') === 0) {
      links[i].setAttribute('aria-current', 'page');
    } else {
      links[i].removeAttribute('aria-current');
    }
  }
}

function adminRoute() {
  var hash = location.hash || '';
  var path = hash.replace(/^#/, '') || '/';

  // Redirect bare / or empty to #/tenants
  if (path === '/' || path === '') {
    location.replace('#/tenants');
    return;
  }

  // #/tenants/:id
  var detailMatch = path.match(/^\\/tenants\\/([^/]+)$/);
  if (detailMatch) {
    var tenantId = decodeURIComponent(detailMatch[1]);
    updateAdminNavCurrent('/tenants');
    renderAdminDetail(tenantId);
    mountAdminDetail(tenantId);
    return;
  }

  // #/tenants (list)
  if (path === '/tenants') {
    updateAdminNavCurrent('/tenants');
    renderTenants();
    mountTenants();
    return;
  }

  // Unmatched: fall back to tenants list
  location.replace('#/tenants');
}

window.addEventListener('hashchange', function () {
  adminRoute();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

bootAdminApp();

}());
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
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
      'X-Frame-Options': 'DENY',
    },
  });
}
