// tva

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function htmlVerifyResponse(captureId, origin, cacheControl) {
  const safeId = escapeHtml(captureId);
  const safeOrigin = escapeHtml(origin);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verification: ${safeId} - Web Resource Ledger</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: #1a1a1a;
  background: #f8f8f8;
  padding: 1.5rem 1rem;
}

.page-wrap {
  max-width: 640px;
  margin: 0 auto;
}

header {
  margin-bottom: 2rem;
}

.wordmark {
  font-size: 1rem;
  font-weight: 600;
  color: #444;
  letter-spacing: 0.01em;
}

main { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }

/* Loading state */
.loading-state {
  padding: 3rem 2rem;
  text-align: center;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e0e0e0;
  border-top-color: #555;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    border: none;
    width: auto;
    height: auto;
    font-size: 0.9rem;
    color: #6d6d6d;
  }
  .spinner::before { content: "Loading..."; }
}

.loading-text { color: #6d6d6d; font-size: 0.9rem; }

/* Result sections */
.result-content { display: none; }
.result-content.visible { display: block; }

/* Status banner */
.status-banner {
  padding: 1.5rem 2rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-banner.verified { background: #e8f5e9; }
.status-banner.unverified { background: #ffebee; }

.status-icon { flex-shrink: 0; width: 28px; height: 28px; }
.status-icon.verified { color: #2e7d32; }
.status-icon.unverified { color: #c62828; }

.status-heading {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.2;
}

.status-banner.verified .status-heading { color: #1b5e20; }
.status-banner.unverified .status-heading { color: #b71c1c; }

/* Sections */
section { padding: 1.5rem 2rem; border-top: 1px solid #e8e8e8; }

h2 {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6d6d6d;
  margin-bottom: 0.75rem;
}

/* Capture metadata */
.meta-url {
  font-size: 0.95rem;
  word-break: break-all;
  margin-bottom: 0.4rem;
}

.meta-url a { color: #1a1a1a; }
.meta-url a:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }

.meta-time { font-size: 0.875rem; color: #6d6d6d; }

/* Checks */
.checks-list { list-style: none; }

.check-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid #f0f0f0;
}

.check-row:last-child { border-bottom: none; }

.check-icon { flex-shrink: 0; width: 20px; height: 20px; margin-top: 2px; }
.check-icon.pass { color: #2e7d32; }
.check-icon.fail { color: #c62828; }
.check-icon.skip { color: #6d6d6d; }

.check-body { flex: 1; min-width: 0; }

.check-label { font-weight: 600; font-size: 0.9rem; }
.check-desc { font-size: 0.8rem; color: #6d6d6d; margin-top: 0.15rem; }
.check-detail { font-size: 0.8rem; color: #6d6d6d; margin-top: 0.2rem; font-style: italic; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border-width: 0;
}

/* Screenshot */
.screenshot-img {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.screenshot-error { font-size: 0.875rem; color: #6d6d6d; font-style: italic; }

.screenshot-caption {
  font-size: 0.875rem;
  color: #6d6d6d;
  margin-top: 0.5rem;
}

.screenshot-section details {
  margin-top: 1rem;
}

/* Crypto details */
details { padding: 1.5rem 2rem; border-top: 1px solid #e8e8e8; }

summary {
  font-size: 0.875rem;
  font-weight: 600;
  color: #444;
  cursor: pointer;
  user-select: none;
  padding: 0.2rem 0;
}

summary:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }

.crypto-grid { margin-top: 1rem; }

.crypto-row { margin-bottom: 0.75rem; }
.crypto-label { font-size: 0.75rem; font-weight: 600; color: #6d6d6d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.2rem; }
.crypto-value {
  font-family: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  font-size: 0.8rem;
  word-break: break-all;
  color: #1a1a1a;
}

/* Verify independently */
.cli-block {
  position: relative;
  margin-top: 1rem;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 0.75rem 2.75rem 0.75rem 0.75rem;
}

.cli-block code {
  font-family: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  font-size: 0.8rem;
  color: #1a1a1a;
  word-break: break-all;
  white-space: pre-wrap;
}

.cli-desc {
  font-size: 0.8rem;
  color: #6d6d6d;
  margin-top: 0.75rem;
  line-height: 1.5;
}

.cli-copy-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: #6d6d6d;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.cli-copy-btn:hover { background: rgba(0,0,0,0.06); }
.cli-copy-btn:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }
.cli-copy-btn.copied { color: #2e7d32; }

/* Error state */
.error-state { padding: 1.5rem 2rem; }
.error-msg { font-size: 0.95rem; color: #b71c1c; margin-bottom: 0.75rem; }
.error-link { font-size: 0.875rem; }
.error-link a { color: #1a1a1a; }
.error-link a:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }
.crypto-value a:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }

/* Footer */
footer {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: #6d6d6d;
}

footer a { color: #1a1a1a; text-decoration: none; }
footer a:hover { text-decoration: underline; }
footer a:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }

@media (max-width: 640px) {
  body { padding: 1rem 0.75rem; }
  .status-banner, section, details { padding-left: 1.25rem; padding-right: 1.25rem; }
}
</style>
</head>
<body>
<div class="page-wrap">
  <header>
    <span class="wordmark">Web Resource Ledger</span>
  </header>

  <main>
    <h1 class="sr-only">Capture Verification</h1>

    <div id="loading" class="loading-state" role="status" aria-label="Loading verification result">
      <div class="spinner" aria-hidden="true"></div>
      <p class="loading-text">Loading verification result&hellip;</p>
    </div>

    <div id="result" class="result-content" aria-live="polite"></div>

    <noscript>
      <section>
        <p>This page requires JavaScript to display the full verification result.
        You can access the raw verification data at the link below.</p>
        <p style="margin-top:0.75rem">
          Capture ID: <code>${safeId}</code><br>
          <a href="${safeOrigin}/v1/verify/${safeId}">
            ${safeOrigin}/v1/verify/${safeId}
          </a>
        </p>
      </section>
    </noscript>
  </main>

  <footer>Web Resource Ledger · <a href="https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md" target="_blank" rel="noopener">Terms</a> · <a href="https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md#abuse-reporting" target="_blank" rel="noopener">Report Abuse</a></footer>
</div>

<script>
(function () {
  'use strict';

  var captureId = ${JSON.stringify(captureId)};
  var origin    = ${JSON.stringify(origin)};

  // SVG icons (inline, aria-hidden)
  var SVG_CHECK = '<svg class="check-icon pass" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
  var SVG_X     = '<svg class="check-icon fail" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
  var SVG_DASH  = '<svg class="check-icon skip" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>';
  var SVG_CLIPBOARD = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z"/></svg>';
  var SVG_CHECK_SM = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" clip-rule="evenodd"/></svg>';

  var CHECK_LABELS = {
    artifactHashes:  'File integrity',
    bundleHash:      'Bundle integrity',
    signature:       'Digital signature',
    timestamp:       'Independent time verification',
    consentHandling: 'Cookie consent handled',
  };

  var CHECK_DESCS = {
    artifactHashes:  'Confirms individual captured files have not been modified.',
    bundleHash:      'Confirms the overall archive bundle has not been altered.',
    signature:       'Confirms the bundle was signed by the capture service.',
    timestamp:       'Time was recorded by an independent authority (not verified cryptographically).',
    consentHandling: 'The capture dismissed a cookie consent banner to reveal the page content.',
  };

  function safeUrl(raw) {
    try {
      var u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (_) { /* URL constructor throws on invalid input -- intentional: return null */ }
    return null;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      }).format(new Date(iso));
    } catch (_) {
      return iso;
    }
  }

  function renderChecks(checks) {
    if (!Array.isArray(checks)) return '';
    return checks.map(function (c) {
      var icon = c.status === 'pass' ? SVG_CHECK : (c.status === 'fail' ? SVG_X : SVG_DASH);
      var label = CHECK_LABELS[c.name] || c.name;
      var desc  = CHECK_DESCS[c.name] || '';
      var srText = '<span class="sr-only">' + c.status + ':</span>';
      return '<li class="check-row">' + icon + srText +
        '<div class="check-body">' +
          '<div class="check-label" data-check-label="' + c.name + '">' + label + '</div>' +
          '<div class="check-desc">' + desc + '</div>' +
          (c.detail ? '<div class="check-detail" data-check-detail="' + c.name + '"></div>' : '') +
        '</div></li>';
    }).join('');
  }

  function buildResult(verifyData, retrievalData) {
    var verified = verifyData.verified;
    var capture  = verifyData.capture || {};
    var signing  = verifyData.signing || {};
    var checks   = (verifyData.checks || []).slice();

    var capturedUrl = retrievalData ? (retrievalData.url || null) : null;
    var screenshotUrl = retrievalData
      ? (retrievalData.artifacts && retrievalData.artifacts.screenshot ? retrievalData.artifacts.screenshot : null)
      : null;
    var screenshotBeforeUrl = retrievalData
      ? (retrievalData.artifacts && retrievalData.artifacts.screenshotBefore
         ? retrievalData.artifacts.screenshotBefore : null)
      : null;

    var captureSettings = verifyData.captureSettings;
    var consentResult = captureSettings && captureSettings.consent
      ? captureSettings.consent.result
      : null;

    // Append consent check if CMP was found
    if (consentResult === 'success') {
      checks = checks.concat([{
        name: 'consentHandling',
        status: 'pass',
        detail: captureSettings.consent.cmpDetected
          ? 'Detected: ' + captureSettings.consent.cmpDetected
          : null,
      }]);
    } else if (consentResult === 'failed') {
      checks = checks.concat([{
        name: 'consentHandling',
        status: 'skip',
        detail: 'A consent banner was detected but could not be dismissed.',
      }]);
    }

    var completedAt = fmtDate(capture.completedAt);

    // Status banner
    var bannerClass = verified ? 'verified' : 'unverified';
    var bannerIcon  = verified
      ? '<svg class="status-icon verified" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd"/></svg>'
      : '<svg class="status-icon unverified" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clip-rule="evenodd"/></svg>';
    var bannerText  = verified ? 'Verified' : 'Verification Failed';

    var html = '<div class="status-banner ' + bannerClass + '">' +
      bannerIcon +
      '<div class="status-text-wrap"><p class="status-heading">' + bannerText + '</p></div>' +
      '</div>';

    // Capture metadata
    if (capturedUrl || completedAt) {
      html += '<section aria-label="Capture metadata"><h2>Capture</h2>';
      if (capturedUrl) {
        html += '<div class="meta-url" id="meta-url-wrap"></div>';
      }
      if (completedAt) {
        html += '<p class="meta-time" id="meta-time"></p>';
      }
      html += '</section>';
    }

    // Verification checks
    html += '<section aria-label="Verification checks"><h2>Checks</h2>' +
      '<ul class="checks-list">' + renderChecks(checks) + '</ul>' +
      '</section>';

    // Screenshot
    if (screenshotUrl) {
      html += '<section aria-label="Screenshot" class="screenshot-section"><h2>Screenshot</h2>' +
        '<div id="screenshot-wrap"></div>' +
        '<p class="screenshot-caption" id="screenshot-caption"></p>' +
        '<div id="screenshot-before-wrap"></div>' +
        '</section>';
    }

    // Capture details (only when captureSettings present)
    if (captureSettings) {
      html += '<details id="capture-details-disclosure"><summary>Capture details</summary>' +
        '<div class="crypto-grid" id="capture-details-grid"></div>' +
        '</details>';
    }

    // Cryptographic details
    if (signing && signing.bundleHash) {
      html += '<details><summary>Cryptographic details</summary>' +
        '<div class="crypto-grid">' +
          '<div class="crypto-row">' +
            '<div class="crypto-label" id="bundle-hash-label">Bundle hash</div>' +
            '<div class="crypto-value" id="bundle-hash-value" aria-labelledby="bundle-hash-label"></div>' +
          '</div>' +
          '<div class="crypto-row">' +
            '<div class="crypto-label">Signed at</div>' +
            '<div class="crypto-value" id="signed-at-value"></div>' +
          '</div>' +
          '<div class="crypto-row">' +
            '<div class="crypto-label">Public key</div>' +
            '<div class="crypto-value" id="public-key-url"></div>' +
          '</div>' +
          (signing && signing.timestamp ? (
            '<div class="crypto-row">' +
              '<div class="crypto-label">Timestamp authority</div>' +
              '<div class="crypto-value" id="tsa-name-value"></div>' +
            '</div>' +
            '<div class="crypto-row">' +
              '<div class="crypto-label">Timestamp issued</div>' +
              '<div class="crypto-value" id="tsa-time-value"></div>' +
            '</div>'
          ) : '') +
        '</div>' +
        '</details>';
    }

    // Verify independently (shown for both verified and failed, not error state)
    html += '<details><summary>Verify independently</summary>' +
      '<p class="cli-desc">Run the verification yourself, including full timestamp certificate chain validation. Requires Node.js 20+.</p>' +
      '<div class="cli-block">' +
        '<code id="cli-command"></code>' +
        '<button type="button" class="cli-copy-btn" id="cli-copy-btn" aria-label="Copy command to clipboard">' +
          SVG_CLIPBOARD +
        '</button>' +
        '<span class="sr-only" id="cli-copy-status" aria-live="polite" role="status"></span>' +
      '</div>' +
      '</details>';

    return { html: html, checks: checks };
  }

  function populate(verifyData, retrievalData) {
    var el = document.getElementById('result');
    var built = buildResult(verifyData, retrievalData);
    el.innerHTML = built.html;
    var allChecks = built.checks;

    // Set h1
    var h1 = document.querySelector('h1');
    if (h1) {
      var label = verifyData.verified ? 'Verified' : 'Verification Failed';
      h1.textContent = 'Capture Verification: ' + label;
    }

    var capture  = verifyData.capture || {};
    var signing  = verifyData.signing || {};

    var captureSettings = verifyData.captureSettings;
    var consentResult = captureSettings && captureSettings.consent
      ? captureSettings.consent.result
      : null;

    // Populate capture metadata using textContent (no innerHTML for user data)
    var capturedUrl = retrievalData ? (retrievalData.url || null) : null;
    var screenshotUrl = retrievalData
      ? (retrievalData.artifacts && retrievalData.artifacts.screenshot ? retrievalData.artifacts.screenshot : null)
      : null;
    var screenshotBeforeUrl = retrievalData
      ? (retrievalData.artifacts && retrievalData.artifacts.screenshotBefore
         ? retrievalData.artifacts.screenshotBefore : null)
      : null;

    if (capturedUrl) {
      var urlWrap = document.getElementById('meta-url-wrap');
      if (urlWrap) {
        var safeHref = safeUrl(capturedUrl);
        if (safeHref) {
          var a = document.createElement('a');
          a.href = safeHref;
          a.textContent = capturedUrl;
          urlWrap.appendChild(a);
        } else {
          urlWrap.textContent = capturedUrl;
        }
      }
    }

    var metaTime = document.getElementById('meta-time');
    if (metaTime && capture.completedAt) {
      metaTime.textContent = 'Captured on ' + fmtDate(capture.completedAt);
    }

    // Populate check details (use augmented checks array including consent check)
    allChecks.forEach(function (c) {
      if (c.detail) {
        var detailEl = document.querySelector('[data-check-detail="' + c.name + '"]');
        if (detailEl) detailEl.textContent = c.detail;
      }
    });

    // Screenshot
    if (screenshotUrl) {
      var imgWrap = document.getElementById('screenshot-wrap');
      if (imgWrap) {
        var safeImgSrc = safeUrl(screenshotUrl);
        if (safeImgSrc) {
          var img = document.createElement('img');
          img.className = 'screenshot-img';
          var altDate = capture.completedAt ? fmtDate(capture.completedAt) : 'unknown date';
          var altUrl  = capturedUrl || 'unknown URL';
          if (consentResult === 'success') {
            img.alt = 'Screenshot of ' + altUrl + ' captured on ' + altDate + ', after cookie consent dismissal';
          } else {
            img.alt = 'Screenshot of ' + altUrl + ' captured on ' + altDate;
          }
          img.setAttribute('src', safeImgSrc);
          img.onerror = function () {
            var p = document.createElement('p');
            p.className = 'screenshot-error';
            p.textContent = 'Screenshot not available';
            imgWrap.replaceChild(p, img);
          };
          imgWrap.appendChild(img);
        } else {
          var errP = document.createElement('p');
          errP.className = 'screenshot-error';
          errP.textContent = 'Screenshot not available';
          imgWrap.appendChild(errP);
        }
      }

      // Screenshot caption (only when consent was dismissed)
      if (consentResult === 'success') {
        var captionEl = document.getElementById('screenshot-caption');
        if (captionEl) captionEl.textContent = 'Page after cookie consent dismissal';
      }

      // Before screenshot (inside a <details> disclosure)
      if (screenshotBeforeUrl) {
        var beforeWrap = document.getElementById('screenshot-before-wrap');
        if (beforeWrap) {
          var safeBeforeSrc = safeUrl(screenshotBeforeUrl);
          if (safeBeforeSrc) {
            var detailsEl = document.createElement('details');
            var summaryEl = document.createElement('summary');
            summaryEl.textContent = 'Show screenshot before consent dismissal';
            var beforeImg = document.createElement('img');
            beforeImg.className = 'screenshot-img';
            var beforeAltDate = capture.completedAt ? fmtDate(capture.completedAt) : 'unknown date';
            var beforeAltUrl  = capturedUrl || 'unknown URL';
            beforeImg.alt = 'Screenshot of ' + beforeAltUrl + ' captured on ' + beforeAltDate + ', showing original cookie consent banner';
            beforeImg.setAttribute('src', safeBeforeSrc);
            detailsEl.appendChild(summaryEl);
            detailsEl.appendChild(beforeImg);
            beforeWrap.appendChild(detailsEl);
          }
        }
      }
    }

    // Capture details disclosure
    if (captureSettings) {
      var captureGrid = document.getElementById('capture-details-grid');
      if (captureGrid && captureSettings.consent) {
        var consent = captureSettings.consent;
        var consentRow = document.createElement('div');
        consentRow.className = 'crypto-row';

        var consentLabelEl = document.createElement('div');
        consentLabelEl.className = 'crypto-label';
        consentLabelEl.textContent = 'Cookie consent';

        var consentValueEl = document.createElement('div');
        consentValueEl.className = 'crypto-value';

        var consentText;
        if (consent.result === 'success') {
          consentText = 'Dismissed';
          if (consent.cmpDetected) {
            consentText += ' (' + consent.cmpDetected + ')';
          }
        } else if (consent.result === 'notDetected') {
          consentText = 'Not detected';
        } else if (consent.result === 'failed') {
          consentText = 'Attempted, failed';
        } else {
          consentText = consent.result || '';
        }
        consentValueEl.textContent = consentText;

        consentRow.appendChild(consentLabelEl);
        consentRow.appendChild(consentValueEl);
        captureGrid.appendChild(consentRow);
      }
    }

    // Crypto details
    var hashEl = document.getElementById('bundle-hash-value');
    if (hashEl && signing.bundleHash) {
      hashEl.textContent = signing.bundleHash;
    }

    var signedAtEl = document.getElementById('signed-at-value');
    if (signedAtEl && signing.signedAt) {
      signedAtEl.textContent = fmtDate(signing.signedAt);
    }

    var keyUrlEl = document.getElementById('public-key-url');
    if (keyUrlEl) {
      var keyLink = document.createElement('a');
      keyLink.href = origin + '/.well-known/signing-key';
      keyLink.textContent = origin + '/.well-known/signing-key';
      keyUrlEl.appendChild(keyLink);
    }

    var tsaNameEl = document.getElementById('tsa-name-value');
    if (tsaNameEl && signing.timestamp && signing.timestamp.tsa) {
      tsaNameEl.textContent = signing.timestamp.tsa;
    }

    var tsaTimeEl = document.getElementById('tsa-time-value');
    if (tsaTimeEl && signing.timestamp && signing.timestamp.genTime) {
      tsaTimeEl.textContent = fmtDate(signing.timestamp.genTime);
    }

    // Verify independently -- populate command and wire copy button
    var cliCommand = 'npx @w-r-l/verify ' + origin + '/v1/captures/' + captureId;
    var cliCommandEl = document.getElementById('cli-command');
    if (cliCommandEl) cliCommandEl.textContent = cliCommand;

    var copyBtn = document.getElementById('cli-copy-btn');
    if (copyBtn) {
      var copyResetTimer = null;
      var statusResetTimer = null;
      copyBtn.addEventListener('click', function () {
        var statusEl = document.getElementById('cli-copy-status');
        if (copyResetTimer) { clearTimeout(copyResetTimer); copyResetTimer = null; }
        if (statusResetTimer) { clearTimeout(statusResetTimer); statusResetTimer = null; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cliCommand).then(function () {
            copyBtn.innerHTML = SVG_CHECK_SM;
            copyBtn.classList.add('copied');
            if (statusEl) statusEl.textContent = 'Command copied to clipboard';
            copyResetTimer = setTimeout(function () {
              copyBtn.innerHTML = SVG_CLIPBOARD;
              copyBtn.classList.remove('copied');
              copyResetTimer = null;
            }, 2000);
            statusResetTimer = setTimeout(function () {
              if (statusEl) statusEl.textContent = '';
              statusResetTimer = null;
            }, 3000);
          }).catch(function () {
            selectFallback(cliCommandEl, statusEl);
          });
        } else {
          selectFallback(cliCommandEl, statusEl);
        }
      });
    }
  }

  function selectFallback(codeEl, statusEl) {
    if (codeEl) {
      var range = document.createRange();
      range.selectNodeContents(codeEl);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (statusEl) statusEl.textContent = 'Could not copy. Select and copy manually.';
  }

  function showError() {
    var el = document.getElementById('result');
    var apiLink = origin + '/v1/verify/' + captureId;
    el.innerHTML = '<div class="error-state">' +
      '<p class="error-msg">Could not load verification data. Try refreshing, or use the JSON API link below.</p>' +
      '<p class="error-link" id="error-link-wrap"></p>' +
      '</div>';

    var linkWrap = document.getElementById('error-link-wrap');
    if (linkWrap) {
      var a = document.createElement('a');
      a.textContent = apiLink;
      // apiLink is constructed from validated origin + captureId, safe to use
      a.href = apiLink;
      linkWrap.appendChild(a);
    }

    el.classList.add('visible');
    document.getElementById('loading').style.display = 'none';
  }

  var verifyUrl   = origin + '/v1/verify/'   + captureId;
  var retrievalUrl = origin + '/v1/captures/' + captureId;

  Promise.all([
    fetch(verifyUrl,   { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }),
    fetch(retrievalUrl, { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
  ]).then(function (results) {
    var verifyData   = results[0];
    var retrievalData = results[1];

    populate(verifyData, retrievalData);

    document.getElementById('result').classList.add('visible');
    document.getElementById('loading').style.display = 'none';
  }).catch(function () {
    showError();
  });
}());
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl,
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'Vary': 'Accept',
    },
  });
}
