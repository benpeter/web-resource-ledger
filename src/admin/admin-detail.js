// Admin per-tenant detail view.
// Exports a JS string constant for inline use in the admin HTML shell.

export const ADMIN_DETAIL_JS = `
// ---------------------------------------------------------------------------
// renderDetail(tenantId) -- builds the static DOM skeleton for detail view
// ---------------------------------------------------------------------------

function renderAdminDetail(tenantId) {
  document.title = tenantId + ' \u2014 WRL Admin';

  var view = document.getElementById('admin-view');
  if (!view) return;
  // Safe: clearing static view container only
  view.textContent = '';

  // Restore live region
  var liveEl = document.createElement('div');
  liveEl.id = 'admin-live';
  liveEl.className = 'sr-only';
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  view.appendChild(liveEl);

  // Back link
  var backLink = document.createElement('a');
  backLink.href = '#/tenants';
  backLink.className = 'admin-back-link';
  backLink.textContent = '\u2190 Back to tenants';
  view.appendChild(backLink);

  // h1 + badge placeholder
  var header = document.createElement('div');
  header.className = 'admin-detail-header';
  var h1 = document.createElement('h1');
  h1.className = 'captures-heading';
  h1.style.margin = '0';
  h1.tabIndex = -1;
  h1.textContent = tenantId;
  header.appendChild(h1);
  view.appendChild(header);
  h1.focus();

  // Loading placeholder
  var loadingEl = document.createElement('p');
  loadingEl.id = 'detail-loading';
  loadingEl.className = 'view-placeholder';
  loadingEl.textContent = 'Loading tenant details...';
  view.appendChild(loadingEl);
}

// ---------------------------------------------------------------------------
// mountAdminDetail(tenantId) -- fetches data and populates content
// ---------------------------------------------------------------------------

function mountAdminDetail(tenantId) {
  var view = document.getElementById('admin-view');
  if (!view) return;

  adminFetch('/v1/admin/tenants/' + encodeURIComponent(tenantId) + '?periods=12')
    .then(function(res) {
      if (!res || !res.ok) {
        return res ? res.json().then(function(body) {
          return { error: true, status: res.status, body: body };
        }).catch(function() {
          return { error: true, status: res.status };
        }) : { error: true, status: 0 };
      }
      return res.json().then(function(data) { return { error: false, data: data }; });
    })
    .then(function(result) {
      var loadingEl = document.getElementById('detail-loading');
      if (loadingEl) loadingEl.remove();

      if (result.error) {
        var errEl = document.createElement('div');
        errEl.className = 'alert alert--error';
        errEl.setAttribute('role', 'alert');
        if (result.status === 404) {
          errEl.textContent = 'Tenant not found.';
        } else {
          errEl.textContent = 'Could not load tenant data. Please try refreshing.';
        }
        view.appendChild(errEl);
        return;
      }

      buildDetailContent(result.data);
    })
    .catch(function() {
      var loadingEl = document.getElementById('detail-loading');
      if (loadingEl) loadingEl.remove();
      var errEl = document.createElement('div');
      errEl.className = 'alert alert--error';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = 'Could not load tenant data. Please try refreshing.';
      view.appendChild(errEl);
    });
}

// ---------------------------------------------------------------------------
// buildDetailContent -- builds all sections from API data
// ---------------------------------------------------------------------------

function buildDetailContent(data) {
  var view = document.getElementById('admin-view');
  if (!view) return;

  // Update h1 header with tier badge (it was already rendered by renderAdminDetail)
  var header = view.querySelector('.admin-detail-header');
  if (header) {
    var existingBadge = header.querySelector('.badge');
    if (!existingBadge) {
      var tierBadge = document.createElement('span');
      tierBadge.className = 'badge badge--skip';
      tierBadge.textContent = data.tier || 'free';
      header.appendChild(tierBadge);
    }
  }

  // Section: Current period usage
  view.appendChild(buildCurrentPeriodSection(data));

  // Section: Usage history
  if (data.usageHistory && data.usageHistory.length > 0) {
    view.appendChild(buildUsageHistorySection(data.usageHistory));
  }

  // Section: API keys
  if (data.keys && data.keys.length > 0) {
    view.appendChild(buildKeysSection(data.keys));
  }

  // Section: Config (only if non-empty)
  if (data.config && Object.keys(data.config).length > 0) {
    view.appendChild(buildConfigSection(data.config));
  }
}

// ---------------------------------------------------------------------------
// Section: Current period usage
// ---------------------------------------------------------------------------

function buildCurrentPeriodSection(data) {
  var section = document.createElement('section');
  section.className = 'admin-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'Current Period';
  section.appendChild(h2);

  var current = data.usageHistory && data.usageHistory.length > 0
    ? data.usageHistory[0]
    : { captureCount: 0, storageBytes: 0, apiCallCount: 0, eidasCaptureCount: 0 };

  // Stat cards row
  var statsRow = document.createElement('div');
  statsRow.className = 'admin-stats-row';

  statsRow.appendChild(buildAdminStat(formatNumber(current.captureCount || 0), 'Captures'));
  statsRow.appendChild(buildAdminStat(formatBytes(current.storageBytes || 0), 'Storage'));
  statsRow.appendChild(buildAdminStat(formatNumber(current.apiCallCount || 0), 'API Calls'));

  if (current.eidasCaptureCount > 0) {
    statsRow.appendChild(buildAdminStat(formatNumber(current.eidasCaptureCount), 'eIDAS Captures'));
  }

  section.appendChild(statsRow);

  // Usage bar if quota is finite
  var quota = data.quota;
  if (quota && quota.capturesPerMonth !== null && quota.capturesPerMonth > 0) {
    var used = current.captureCount || 0;
    var pct = Math.min(100, Math.round((used / quota.capturesPerMonth) * 100));
    var barWrap = document.createElement('div');
    barWrap.style.marginBottom = 'var(--space-4)';

    var barLabel = document.createElement('p');
    barLabel.className = 'text-muted';
    barLabel.style.fontSize = 'var(--text-sm)';
    barLabel.style.marginBottom = 'var(--space-2)';
    barLabel.textContent = formatNumber(used) + ' / ' + formatNumber(quota.capturesPerMonth) + ' captures (' + pct + '%)';
    barWrap.appendChild(barLabel);

    var bar = document.createElement('div');
    bar.className = 'usage-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-label', 'Capture quota usage');

    var fill = document.createElement('div');
    fill.className = 'usage-bar-fill' + (pct >= 95 ? ' usage-bar-fill--critical' : pct >= 80 ? ' usage-bar-fill--warning' : '');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    barWrap.appendChild(bar);
    section.appendChild(barWrap);
  }

  // Billing status
  var billingRow = document.createElement('p');
  billingRow.className = 'text-muted';
  billingRow.style.fontSize = 'var(--text-sm)';
  billingRow.textContent = 'Billing status: ' + (data.billingStatus || 'unknown') +
    (data.hasPaymentMethod ? ' \u00b7 Payment method on file' : ' \u00b7 No payment method');
  section.appendChild(billingRow);

  return section;
}

// ---------------------------------------------------------------------------
// Section: Usage history table
// ---------------------------------------------------------------------------

function buildUsageHistorySection(history) {
  var section = document.createElement('section');
  section.className = 'admin-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'Usage History';
  section.appendChild(h2);

  var wrap = document.createElement('div');
  wrap.className = 'admin-table-wrap';

  var table = document.createElement('table');
  table.className = 'admin-detail-table';
  table.setAttribute('aria-label', 'Usage history');

  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  var histCols = ['Period', 'Captures', 'Storage', 'API Calls', 'eIDAS'];
  for (var i = 0; i < histCols.length; i++) {
    var th = document.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = histCols[i];
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  for (var j = 0; j < history.length; j++) {
    var h = history[j];
    var tr = document.createElement('tr');

    var periodTd = document.createElement('td');
    periodTd.textContent = h.period || '';
    tr.appendChild(periodTd);

    var capTd = document.createElement('td');
    capTd.style.fontVariantNumeric = 'tabular-nums';
    capTd.textContent = formatNumber(h.captureCount || 0);
    tr.appendChild(capTd);

    var storageTd = document.createElement('td');
    storageTd.textContent = formatBytes(h.storageBytes || 0);
    tr.appendChild(storageTd);

    var apiTd = document.createElement('td');
    apiTd.style.fontVariantNumeric = 'tabular-nums';
    apiTd.textContent = formatNumber(h.apiCallCount || 0);
    tr.appendChild(apiTd);

    var eidasTd = document.createElement('td');
    eidasTd.style.fontVariantNumeric = 'tabular-nums';
    eidasTd.textContent = formatNumber(h.eidasCaptureCount || 0);
    tr.appendChild(eidasTd);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
  return section;
}

// ---------------------------------------------------------------------------
// Section: API keys
// ---------------------------------------------------------------------------

function buildKeysSection(keys) {
  var section = document.createElement('section');
  section.className = 'admin-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'API Keys';
  section.appendChild(h2);

  var wrap = document.createElement('div');
  wrap.className = 'admin-table-wrap';

  var table = document.createElement('table');
  table.className = 'admin-detail-table';
  table.setAttribute('aria-label', 'API keys');

  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  var keyCols = ['Name', 'Scopes', 'Created'];
  for (var i = 0; i < keyCols.length; i++) {
    var th = document.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = keyCols[i];
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    var tr = document.createElement('tr');

    var nameTd = document.createElement('td');
    nameTd.style.fontFamily = 'var(--font-mono)';
    nameTd.style.fontSize = 'var(--text-sm)';
    nameTd.textContent = k.name || (k.keyHash ? k.keyHash.slice(0, 8) + '\\u2026' : '(unnamed)');
    tr.appendChild(nameTd);

    var scopesTd = document.createElement('td');
    var scopes = k.scopes || [];
    for (var s = 0; s < scopes.length; s++) {
      var badge = document.createElement('span');
      badge.className = 'badge badge--skip';
      badge.style.marginRight = 'var(--space-1)';
      badge.textContent = scopes[s];
      scopesTd.appendChild(badge);
    }
    tr.appendChild(scopesTd);

    var createdTd = document.createElement('td');
    createdTd.textContent = formatDate(k.createdAt);
    tr.appendChild(createdTd);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
  return section;
}

// ---------------------------------------------------------------------------
// Section: Config
// ---------------------------------------------------------------------------

function buildConfigSection(config) {
  var section = document.createElement('section');
  section.className = 'admin-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'Configuration';
  section.appendChild(h2);

  var pre = document.createElement('pre');
  pre.className = 'admin-config-block';
  var code = document.createElement('code');
  // IMPORTANT: textContent only -- never innerHTML for config data (XSS prevention)
  code.textContent = JSON.stringify(config, null, 2);
  pre.appendChild(code);
  section.appendChild(pre);
  return section;
}
`;
