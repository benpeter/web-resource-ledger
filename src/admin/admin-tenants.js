// Admin tenant list view.
// Exports a JS string constant for inline use in the admin HTML shell.

export const ADMIN_TENANTS_JS = `
// ---------------------------------------------------------------------------
// Formatting helpers (used by both tenants and detail views)
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '0 B';
  var n = Number(bytes);
  if (n < 1000) return n + ' B';
  if (n < 1000000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + ' KB';
  if (n < 1000000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + ' MB';
  return (n / 1000000000).toFixed(n % 1000000000 === 0 ? 0 : 1) + ' GB';
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch (e) {
    return isoString;
  }
}

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  try {
    return Number(n).toLocaleString();
  } catch (e) {
    return String(n);
  }
}

// ---------------------------------------------------------------------------
// Tenant list module state
// ---------------------------------------------------------------------------

var _tenantsData = null;
var _tenantsSortCol = 'captures';
var _tenantsSortDir = 'desc';

// ---------------------------------------------------------------------------
// renderTenants() -- builds the static DOM skeleton for the tenant list view
// ---------------------------------------------------------------------------

function renderTenants() {
  document.title = 'Tenants \u2014 WRL Admin';

  var view = document.getElementById('admin-view');
  if (!view) return;
  // Safe: clearing static view container only
  view.textContent = '';

  // Restore live region (cleared by textContent)
  var liveEl = document.createElement('div');
  liveEl.id = 'admin-live';
  liveEl.className = 'sr-only';
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  view.appendChild(liveEl);

  var h1 = document.createElement('h1');
  h1.className = 'captures-heading';
  h1.tabIndex = -1;
  h1.textContent = 'Tenants';
  view.appendChild(h1);
  h1.focus();

  // Loading placeholder
  var loadingEl = document.createElement('p');
  loadingEl.id = 'tenants-loading';
  loadingEl.className = 'view-placeholder';
  loadingEl.textContent = 'Loading tenant data...';
  view.appendChild(loadingEl);
}

// ---------------------------------------------------------------------------
// mountTenants() -- fetches data and populates content
// ---------------------------------------------------------------------------

function mountTenants() {
  var view = document.getElementById('admin-view');
  if (!view) return;

  var overviewPromise = adminFetch('/v1/admin/overview')
    .then(function(res) {
      if (!res || !res.ok) return null;
      return res.json();
    })
    .catch(function() { return null; });

  var tenantsPromise = adminFetch('/v1/admin/tenants')
    .then(function(res) {
      if (!res || !res.ok) return null;
      return res.json();
    })
    .catch(function() { return null; });

  Promise.all([overviewPromise, tenantsPromise]).then(function(results) {
    var overviewData = results[0];
    var tenantsData = results[1];

    var loadingEl = document.getElementById('tenants-loading');
    if (loadingEl) loadingEl.remove();

    if (!overviewData || !tenantsData) {
      var errEl = document.createElement('div');
      errEl.className = 'alert alert--error';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = 'Could not load tenant data. Please try refreshing.';
      view.appendChild(errEl);
      return;
    }

    _tenantsData = { overview: overviewData, tenants: tenantsData.data || [] };
    buildTenantsContent(_tenantsData.overview, _tenantsData.tenants);
  }).catch(function() {
    var loadingEl = document.getElementById('tenants-loading');
    if (loadingEl) loadingEl.remove();
    var errEl = document.createElement('div');
    errEl.className = 'alert alert--error';
    errEl.setAttribute('role', 'alert');
    errEl.textContent = 'Could not load tenant data. Please try refreshing.';
    view.appendChild(errEl);
  });
}

// ---------------------------------------------------------------------------
// buildTenantsContent -- builds stat cards, toolbar, and table
// ---------------------------------------------------------------------------

function buildTenantsContent(overview, tenants) {
  var view = document.getElementById('admin-view');
  if (!view) return;

  // Remove any previously rendered content sections
  var existing = view.querySelectorAll('.admin-stats-row, .admin-toolbar, .admin-table-wrap, .alert--error');
  for (var i = 0; i < existing.length; i++) existing[i].remove();

  // --- Stat cards ---
  var activeCount = 0;
  for (var j = 0; j < tenants.length; j++) {
    if (tenants[j].currentPeriod && tenants[j].currentPeriod.captureCount > 0) activeCount++;
  }

  var statsRow = document.createElement('div');
  statsRow.className = 'admin-stats-row';
  statsRow.appendChild(buildAdminStat(formatNumber(overview.totalTenants), 'Total Tenants'));
  statsRow.appendChild(buildAdminStat(formatNumber(activeCount), 'Active This Period'));
  statsRow.appendChild(buildAdminStat(formatNumber(overview.totalCapturesCurrentPeriod), 'Captures This Period'));
  statsRow.appendChild(buildAdminStat(formatBytes(overview.totalStorageBytes), 'Total Storage'));
  view.appendChild(statsRow);

  // --- Toolbar (refresh button) ---
  var toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  var refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'admin-refresh-btn';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', function() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    reloadTenantsData(refreshBtn);
  });
  toolbar.appendChild(refreshBtn);
  view.appendChild(toolbar);

  // --- Table ---
  view.appendChild(buildTenantsTable(tenants));
}

function buildAdminStat(value, label) {
  var cell = document.createElement('div');
  cell.className = 'admin-stat';
  var valEl = document.createElement('span');
  valEl.className = 'admin-stat-value';
  valEl.textContent = value;
  var lblEl = document.createElement('span');
  lblEl.className = 'admin-stat-label';
  lblEl.textContent = label;
  cell.appendChild(valEl);
  cell.appendChild(lblEl);
  return cell;
}

function reloadTenantsData(refreshBtn) {
  var overviewPromise = adminFetch('/v1/admin/overview')
    .then(function(res) { return res && res.ok ? res.json() : null; })
    .catch(function() { return null; });
  var tenantsPromise = adminFetch('/v1/admin/tenants')
    .then(function(res) { return res && res.ok ? res.json() : null; })
    .catch(function() { return null; });

  Promise.all([overviewPromise, tenantsPromise]).then(function(results) {
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh'; }
    if (!results[0] || !results[1]) {
      adminAnnounce('Refresh failed. Please try again.');
      return;
    }
    _tenantsData = { overview: results[0], tenants: results[1].data || [] };
    buildTenantsContent(_tenantsData.overview, _tenantsData.tenants);
    adminAnnounce('Tenant data refreshed.');
  }).catch(function() {
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh'; }
    adminAnnounce('Refresh failed. Please try again.');
  });
}

// ---------------------------------------------------------------------------
// Table builder
// ---------------------------------------------------------------------------

var SORT_COLS = {
  tenant: function(t) { return t.tenantId || ''; },
  tier:   function(t) { return t.tier || ''; },
  captures: function(t) { return (t.currentPeriod && t.currentPeriod.captureCount) || 0; },
  storage:  function(t) { return (t.currentPeriod && t.currentPeriod.storageBytes) || 0; },
  keys:     function(t) { return t.keyCount || 0; },
  created:  function(t) { return t.createdAt || ''; },
};

function sortedTenants(tenants) {
  var col = _tenantsSortCol;
  var dir = _tenantsSortDir;
  var getter = SORT_COLS[col] || SORT_COLS.captures;

  var copy = tenants.slice();
  copy.sort(function(a, b) {
    var av = getter(a);
    var bv = getter(b);
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  return copy;
}

function buildTenantsTable(tenants) {
  var wrap = document.createElement('div');
  wrap.className = 'admin-table-wrap';

  if (!tenants || tenants.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'view-placeholder';
    empty.textContent = 'No tenants found.';
    wrap.appendChild(empty);
    return wrap;
  }

  var table = document.createElement('table');
  table.className = 'admin-table';
  table.setAttribute('aria-label', 'Tenant list');

  // Build thead
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');

  var cols = [
    { key: 'tenant',   label: 'Tenant ID',  sortable: true },
    { key: 'tier',     label: 'Tier',        sortable: true },
    { key: 'captures', label: 'Captures',    sortable: true },
    { key: 'storage',  label: 'Storage',     sortable: true },
    { key: 'keys',     label: 'Keys',        sortable: true },
    { key: 'created',  label: 'Created',     sortable: true },
  ];

  for (var i = 0; i < cols.length; i++) {
    var col = cols[i];
    var th = document.createElement('th');
    th.setAttribute('scope', 'col');

    if (col.sortable) {
      var sortBtn = document.createElement('button');
      sortBtn.type = 'button';
      sortBtn.textContent = col.label;

      if (_tenantsSortCol === col.key) {
        th.setAttribute('aria-sort', _tenantsSortDir === 'asc' ? 'ascending' : 'descending');
        sortBtn.setAttribute('data-sort', _tenantsSortDir);
      }

      (function(colKey, thEl, btnEl) {
        btnEl.addEventListener('click', function() {
          if (_tenantsSortCol === colKey) {
            _tenantsSortDir = _tenantsSortDir === 'asc' ? 'desc' : 'asc';
          } else {
            _tenantsSortCol = colKey;
            _tenantsSortDir = 'asc';
          }
          if (_tenantsData) {
            buildTenantsContent(_tenantsData.overview, _tenantsData.tenants);
          }
          adminAnnounce('Sorted by ' + colKey + ' ' + _tenantsSortDir + 'ending');
        });
      }(col.key, th, sortBtn));

      th.appendChild(sortBtn);
    } else {
      th.textContent = col.label;
    }

    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Build tbody
  var tbody = document.createElement('tbody');
  var sorted = sortedTenants(tenants);

  for (var j = 0; j < sorted.length; j++) {
    var t = sorted[j];
    var tr = document.createElement('tr');

    // Tenant ID -- navigate to detail on row click
    var idTd = document.createElement('td');
    var link = document.createElement('a');
    link.href = '#/tenants/' + encodeURIComponent(t.tenantId);
    link.className = 'admin-tenant-link';
    link.textContent = t.tenantId;
    idTd.appendChild(link);
    tr.appendChild(idTd);

    // Tier badge
    var tierTd = document.createElement('td');
    var badge = document.createElement('span');
    badge.className = 'badge badge--skip';
    badge.textContent = t.tier || 'free';
    tierTd.appendChild(badge);
    tr.appendChild(tierTd);

    // Captures (numeric)
    var capTd = document.createElement('td');
    capTd.className = 'num';
    capTd.textContent = formatNumber((t.currentPeriod && t.currentPeriod.captureCount) || 0);
    tr.appendChild(capTd);

    // Storage (numeric)
    var storageTd = document.createElement('td');
    storageTd.className = 'num';
    storageTd.textContent = formatBytes((t.currentPeriod && t.currentPeriod.storageBytes) || 0);
    tr.appendChild(storageTd);

    // Key count (numeric)
    var keysTd = document.createElement('td');
    keysTd.className = 'num';
    keysTd.textContent = formatNumber(t.keyCount || 0);
    tr.appendChild(keysTd);

    // Created date
    var createdTd = document.createElement('td');
    createdTd.textContent = formatDate(t.createdAt);
    tr.appendChild(createdTd);

    // Row click navigates to detail (excluding link clicks which handle themselves)
    (function(tenantId) {
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'A') return;
        location.hash = '#/tenants/' + encodeURIComponent(tenantId);
      });
    }(t.tenantId));

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}
`;
