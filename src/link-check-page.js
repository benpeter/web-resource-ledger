// tva
/**
 * link-check-page.js -- the page of the free Link Rot Checker (phase 0211,
 * backlog #56), served at /tools/link-rot-checker. The landing Worker forwards
 * webresourceledger.com/tools/ here, so the page's fetches to /tools/link-check
 * stay on its own origin on both hosts.
 *
 * The script renders results with textContent only: URLs come from the visitor
 * or, on a shared link, from whoever made the run.
 */
import { DESIGN_SYSTEM_CSS } from './design-system.js';
import { FAVICON_SVG } from './favicon.js';
import { BATCH_SIZE, MAX_BATCHES } from './link-check.js';

const CANONICAL = 'https://webresourceledger.com/tools/link-rot-checker';
const TITLE = 'Free Link Rot Checker: find dead links in your URLs';
const DESCRIPTION = 'Paste up to 100 URLs and see which still work, which redirect and which are gone. Free, no sign-up. Every run gets a link you can share.';
const CARD_IMAGE = 'https://webresourceledger.com/assets/og-image.png';

const STYLE = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-sans); font-size: var(--text-md); line-height: var(--leading-normal); color: var(--color-text); background: var(--color-bg); padding: var(--space-6) var(--space-4); }
.page-wrap { max-width: 880px; margin: 0 auto; }
header { margin-bottom: var(--space-6); }
.wordmark { font-weight: var(--weight-medium); color: var(--color-primary); text-decoration: none; }
h1 { font-size: var(--text-2xl); margin-bottom: var(--space-3); }
h2 { font-size: var(--text-lg); margin-bottom: var(--space-2); }
p { margin-bottom: var(--space-3); }
a { color: var(--color-primary); }
.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); margin-bottom: var(--space-5); }
textarea { width: 100%; min-height: 12rem; font-family: var(--font-mono); font-size: var(--text-sm); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); color: var(--color-text); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-3); }
button, .button { font: inherit; font-weight: var(--weight-medium); padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-primary-text); cursor: pointer; text-decoration: none; display: inline-block; }
button.secondary, .button.secondary { background: transparent; color: var(--color-primary); }
button:disabled { opacity: 0.6; cursor: default; }
.muted { color: var(--color-text-muted); font-size: var(--text-sm); }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
.chip { font-size: var(--text-sm); font-weight: var(--weight-medium); padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); background: var(--color-surface-muted); white-space: nowrap; }
.s-alive { background: var(--color-success-bg); color: var(--color-success-text); }
.s-redirected { background: var(--color-info-bg); color: var(--color-info-text); }
.s-dead { background: var(--color-error-bg); color: var(--color-error-text); }
.s-unclear, .s-timeout { background: var(--color-warning-bg); color: var(--color-warning-text); }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
th, td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--color-border-subtle); vertical-align: top; }
td.url { word-break: break-all; min-width: 14rem; }
td.num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.share { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
.share input { flex: 1 1 18rem; font-family: var(--font-mono); font-size: var(--text-sm); padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); color: var(--color-text); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3); font-size: var(--text-sm); }
dt { font-weight: var(--weight-medium); }
[hidden] { display: none !important; }
`;

// String.raw keeps the regex backslashes; the script has no ${} on purpose.
const SCRIPT = String.raw`
(function () {
  var MAX = __MAX__, BATCH = __BATCH__;
  var LABELS = { alive: 'Works', redirected: 'Redirects', dead: 'Gone', unclear: 'Unclear', timeout: 'Timed out', invalid: 'Not checked' };
  var ORDER = ['alive', 'redirected', 'dead', 'unclear', 'timeout', 'invalid'];
  var form = document.getElementById('form');
  var input = document.getElementById('urls');
  var button = document.getElementById('check');
  var progress = document.getElementById('progress');
  var resultsCard = document.getElementById('results');
  var cta = document.getElementById('cta');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }

  function parseList(text) {
    var seen = {}, list = [];
    text.split(/\r?\n/).forEach(function (line) {
      var u = line.trim();
      if (!u) return;
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      if (seen[u]) return;
      seen[u] = true;
      list.push(u);
    });
    return list;
  }

  function csv(results) {
    var rows = [['url', 'status', 'http_code', 'final_url', 'redirects', 'ms', 'detail']];
    results.forEach(function (r) {
      var last = r.chain.length ? r.chain[r.chain.length - 1].url : '';
      rows.push([r.url, r.status, r.code == null ? '' : r.code, last, Math.max(r.chain.length - 1, 0), r.ms, r.detail || '']);
    });
    return rows.map(function (row) {
      return row.map(function (v) {
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n') + '\n';
  }

  function render(results, run, finished, note) {
    resultsCard.replaceChildren();
    resultsCard.hidden = false;
    var counts = {};
    results.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    resultsCard.appendChild(el('h2', null, results.length + (results.length === 1 ? ' URL checked' : ' URLs checked')));
    if (note) resultsCard.appendChild(el('p', 'muted', note));
    var chips = el('div', 'chips');
    ORDER.forEach(function (s) {
      if (counts[s]) chips.appendChild(el('span', 'chip s-' + s, LABELS[s] + ': ' + counts[s]));
    });
    resultsCard.appendChild(chips);

    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var head = el('tr');
    ['URL', 'Result', 'HTTP', 'Where it ends up', 'Time'].forEach(function (h) { head.appendChild(el('th', null, h)); });
    table.appendChild(head);
    results.forEach(function (r) {
      var tr = el('tr');
      var tdUrl = el('td', 'url');
      var a = el('a', null, r.url);
      a.href = r.url;
      a.rel = 'nofollow noopener noreferrer';
      tdUrl.appendChild(a);
      tr.appendChild(tdUrl);
      var tdStatus = el('td');
      tdStatus.appendChild(el('span', 'chip s-' + r.status, LABELS[r.status] || r.status));
      tr.appendChild(tdStatus);
      tr.appendChild(el('td', 'num', r.code == null ? '' : r.code));
      var detail = r.detail || '';
      if (r.chain.length > 1) detail = r.chain[r.chain.length - 1].url + (detail ? ' (' + detail + ')' : '');
      tr.appendChild(el('td', 'url', detail));
      tr.appendChild(el('td', 'num', (r.ms / 1000).toFixed(1) + ' s'));
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    resultsCard.appendChild(wrap);

    if (finished && run) {
      var share = el('div', 'share');
      var link = el('input');
      link.readOnly = true;
      link.value = location.origin + location.pathname + '?run=' + run;
      link.setAttribute('aria-label', 'Link to these results');
      var copy = el('button', 'secondary', 'Copy link');
      copy.type = 'button';
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(link.value).then(function () { copy.textContent = 'Copied'; });
      });
      var download = el('a', 'button secondary', 'Download CSV');
      download.href = URL.createObjectURL(new Blob([csv(results)], { type: 'text/csv' }));
      download.download = 'link-check-' + run + '.csv';
      share.appendChild(link);
      share.appendChild(copy);
      share.appendChild(download);
      resultsCard.appendChild(share);
      cta.hidden = false;
    }
  }

  async function post(body) {
    var res = await fetch('/tools/link-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
    return data;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var list = parseList(input.value);
    if (!list.length) { progress.textContent = 'Paste at least one URL.'; return; }
    var note = '';
    if (list.length > MAX) {
      note = 'You pasted ' + list.length + ' URLs; the first ' + MAX + ' were checked.';
      list = list.slice(0, MAX);
    }
    button.disabled = true;
    cta.hidden = true;
    var results = [], run = null;
    try {
      for (var seq = 0; seq * BATCH < list.length; seq++) {
        progress.textContent = 'Checked ' + results.length + ' of ' + list.length + ' URLs...';
        var data = await post({ urls: list.slice(seq * BATCH, (seq + 1) * BATCH), seq: seq, run: run, total: list.length });
        run = data.run;
        results = results.concat(data.results);
        render(results, run, false, note);
      }
      progress.textContent = '';
      history.replaceState(null, '', location.pathname + '?run=' + run);
      render(results, run, true, note);
    } catch (err) {
      progress.textContent = 'The check stopped: ' + err.message;
    }
    button.disabled = false;
  });

  var run = new URLSearchParams(location.search).get('run');
  if (run && /^[a-f0-9]{16}$/.test(run)) {
    progress.textContent = 'Loading the results...';
    fetch('/tools/link-check/' + run).then(function (res) {
      if (!res.ok) throw new Error('not found');
      return res.json();
    }).then(function (data) {
      input.value = data.results.map(function (r) { return r.url; }).join('\n');
      progress.textContent = 'Checked on ' + new Date(data.checkedAt).toUTCString() + '. Press Check links to check them again.';
      render(data.results, data.run, true, '');
    }).catch(function () {
      progress.textContent = 'These results are not available.';
    });
  }
}());
`.replace('__MAX__', String(BATCH_SIZE * MAX_BATCHES)).replace('__BATCH__', String(BATCH_SIZE));

/**
 * @param {{ shared?: boolean }} [opts] shared: the URL names a run, which
 *   search engines should not index on its own
 * @returns {Response}
 */
export function htmlLinkCheckPage({ shared = false } = {}) {
  const max = BATCH_SIZE * MAX_BATCHES;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
${shared ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${CANONICAL}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Web Resource Ledger">
<meta property="og:url" content="${CANONICAL}">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:image" content="${CARD_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">
<style>
${DESIGN_SYSTEM_CSS}
${STYLE}
</style>
</head>
<body>
<div class="page-wrap">
<header><a class="wordmark" href="https://webresourceledger.com/">Web Resource Ledger</a></header>
<main>
<h1>Link Rot Checker</h1>
<p>Paste up to ${max} URLs, one per line. The checker asks each one for its page and shows which still work, which redirect somewhere else and which are gone. It is free and needs no sign-up.</p>
<form id="form" class="card">
<label for="urls" class="muted">URLs, one per line</label>
<textarea id="urls" name="urls" spellcheck="false" autocomplete="off" placeholder="https://example.com/report-2019.pdf&#10;https://example.com/press/launch"></textarea>
<div class="actions">
<button id="check" type="submit">Check links</button>
<span id="progress" class="muted" role="status" aria-live="polite"></span>
</div>
</form>
<section id="results" class="card" hidden></section>
<aside id="cta" class="card" hidden>
<h2>Keep a copy of the pages that matter</h2>
<p>A link that works today can be gone next year. Of the web pages cited in US Supreme Court opinions since 2005, <a href="https://docs.webresourceledger.com/supreme-court-link-rot/">30% are gone</a>. Web Resource Ledger captures a page as it is now, with a screenshot, the HTML and the response headers, signed and timestamped, so you can show later what it said.</p>
<p><a class="button" href="https://webresourceledger.com/">Capture a page</a> <a class="button secondary" href="https://docs.webresourceledger.com/">How it works</a></p>
</aside>
<section class="card">
<h2>What the results mean</h2>
<dl>
<dt>Works</dt><dd>The URL answered with the page (HTTP 2xx).</dd>
<dt>Redirects</dt><dd>The URL sends visitors to another address, which answered with a page. Check that it is still the page you meant.</dd>
<dt>Gone</dt><dd>The server answered 404, 410 or another 4xx error, the domain no longer exists, or nothing answered.</dd>
<dt>Unclear</dt><dd>The server answered but did not show the page: it wants a login (401), refuses automated requests (403, 429), or had an error (5xx). Open the URL in a browser to see.</dd>
<dt>Timed out</dt><dd>No answer within 10 seconds.</dd>
<dt>Not checked</dt><dd>Not a public http or https URL, so the checker did not request it.</dd>
</dl>
</section>
<section class="card">
<h2>How the checker works</h2>
<p>It requests each URL from Cloudflare's network as WebResourceLedger-LinkRotChecker, with a HEAD request first and a GET request when HEAD fails, follows up to 5 redirects and gives each URL 10 seconds. It does not read the pages, so a page that still answers may have changed since you linked to it.</p>
<p>Each run is kept with its own link, so you can send the results to someone. Anyone with the link can see the URLs in it.</p>
</section>
</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
    },
  });
}
