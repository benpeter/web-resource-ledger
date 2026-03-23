// tva
// Account settings view for WRL.
// Exports a JS string constant for inline use in the HTML shell.

export const SETTINGS_JS = `
// ---------------------------------------------------------------------------
// Settings module state
// ---------------------------------------------------------------------------

var _settingsLiveEl = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function settingsAnnounce(message) {
  if (!_settingsLiveEl) return;
  _settingsLiveEl.textContent = '';
  setTimeout(function() { _settingsLiveEl.textContent = message; }, 50);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}

// Format bytes as SI units (1000-based): KB, MB, GB.
function formatBytes(n) {
  if (n === null || n === undefined || isNaN(n)) return '0 B';
  if (n < 1000) return n + ' B';
  if (n < 1000000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + ' KB';
  if (n < 1000000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + ' MB';
  return (n / 1000000000).toFixed(n % 1000000000 === 0 ? 0 : 1) + ' GB';
}

// Format a "YYYY-MM" period string as a human-readable month label.
function formatPeriod(period) {
  if (!period) return '';
  try {
    // Append day so Date parsing is unambiguous UTC
    var d = new Date(period + '-01T00:00:00Z');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' });
  } catch (e) {
    return period;
  }
}

function buildScopeBadges(scopes) {
  var frag = document.createDocumentFragment();
  if (!scopes || !scopes.length) return frag;
  for (var i = 0; i < scopes.length; i++) {
    var badge = document.createElement('span');
    badge.className = 'scope-badge';
    badge.textContent = scopes[i];
    frag.appendChild(badge);
  }
  return frag;
}

// ---------------------------------------------------------------------------
// renderSettings() -- builds DOM skeleton for the settings view
// ---------------------------------------------------------------------------

function renderSettings() {
  document.title = 'Settings \u2014 WRL';

  var view = document.getElementById('view');
  // Safe: clearing the static view container; no user or API data involved
  view.innerHTML = '';

  // aria-live region
  var liveEl = document.createElement('div');
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  liveEl.className = 'sr-only';
  liveEl.id = 'settings-live';
  view.appendChild(liveEl);
  _settingsLiveEl = liveEl;

  var h1 = document.createElement('h1');
  h1.className = 'captures-heading';
  h1.tabIndex = -1;
  h1.textContent = 'Settings';
  view.appendChild(h1);

  // Loading state for initial data fetch
  var loadingEl = document.createElement('p');
  loadingEl.id = 'settings-loading';
  loadingEl.className = 'view-placeholder';
  loadingEl.textContent = 'Loading account settings...';
  view.appendChild(loadingEl);

  h1.focus();
}

// ---------------------------------------------------------------------------
// mountSettings() -- fetch data and build full content
// ---------------------------------------------------------------------------

function mountSettings() {
  var view = document.getElementById('view');
  var loadingEl = document.getElementById('settings-loading');
  if (!view) return;

  // Account info comes from _wrlUser (already fetched at boot via /auth/session)
  var accountData = {
    githubUsername: _wrlUser ? _wrlUser.githubLogin : '',
    tenantId: _wrlUser ? _wrlUser.tenantId : '',
    createdAt: _wrlUser ? _wrlUser.createdAt : ''
  };

  // Fetch keys, usage, and account settings in parallel.
  // Usage and settings failures must not block the keys section.
  var keysPromise = apiFetch('/v1/account/keys', { credentials: 'same-origin' });
  var usagePromise = apiFetch('/v1/account/usage', { credentials: 'same-origin' })
    .then(function(res) {
      if (!res || !res.ok) return null;
      return res.json();
    })
    .catch(function() { return null; });
  var settingsPromise = apiFetch('/v1/account/settings', { credentials: 'same-origin' })
    .then(function(res) {
      if (!res || !res.ok) return null;
      return res.json();
    })
    .catch(function() { return null; });

  Promise.all([keysPromise, usagePromise, settingsPromise])
  .then(function(results) {
    var keysRes = results[0];
    var usageData = results[1]; // null on failure
    var settingsData = results[2]; // null on failure

    if (!keysRes) return; // 401 handled by apiFetch

    if (!keysRes.ok) {
      if (loadingEl) loadingEl.remove();
      var errEl = document.createElement('div');
      errEl.className = 'alert alert--error';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = 'Could not load account settings. Please try refreshing.';
      view.appendChild(errEl);
      return;
    }

    return keysRes.json().then(function(keysBody) {
      if (loadingEl) loadingEl.remove();
      buildSettingsContent(view, accountData, keysBody || {}, usageData, settingsData);
    });
  }).catch(function() {
    if (loadingEl) loadingEl.remove();
    var netErrEl = document.createElement('div');
    netErrEl.className = 'alert alert--error';
    netErrEl.setAttribute('role', 'alert');
    netErrEl.textContent = 'Connection failed loading settings. Check your network.';
    view.appendChild(netErrEl);
  });
}

// ---------------------------------------------------------------------------
// buildUsageMetric -- single progress bar row (captures or storage)
// ---------------------------------------------------------------------------

function buildUsageMetric(labelText, used, limit, ariaLabel) {
  var pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  var metric = document.createElement('div');
  metric.className = 'usage-metric';

  // Header row: label + "N of M" value
  var header = document.createElement('div');
  header.className = 'usage-metric-header';

  var label = document.createElement('span');
  label.className = 'usage-metric-label';
  label.textContent = labelText;
  header.appendChild(label);

  var value = document.createElement('span');
  value.className = 'usage-metric-value';
  value.textContent = used + ' of ' + limit;
  header.appendChild(value);

  metric.appendChild(header);

  // Progress bar
  var bar = document.createElement('div');
  bar.className = 'usage-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuenow', String(used));
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(limit));
  bar.setAttribute('aria-label', ariaLabel);

  var fill = document.createElement('div');
  var fillClass = 'usage-bar-fill';
  if (pct >= 95) {
    fillClass += ' usage-bar-fill--critical';
  } else if (pct >= 80) {
    fillClass += ' usage-bar-fill--warning';
  }
  fill.className = fillClass;
  fill.style.width = pct + '%';
  bar.appendChild(fill);

  metric.appendChild(bar);
  return metric;
}

// ---------------------------------------------------------------------------
// buildUsageSection -- construct the Usage card (or error state)
// ---------------------------------------------------------------------------

function buildUsageSection(usageData) {
  var section = document.createElement('section');
  section.className = 'settings-section card';
  section.id = 'settings-usage-section';
  section.setAttribute('aria-labelledby', 'settings-usage-heading');

  // Section heading row with period label
  var headingRow = document.createElement('div');
  headingRow.className = 'settings-keys-header';

  var heading = document.createElement('h2');
  heading.id = 'settings-usage-heading';
  heading.className = 'settings-section-heading';
  heading.textContent = 'Usage';
  headingRow.appendChild(heading);

  if (usageData && usageData.period) {
    var periodEl = document.createElement('span');
    periodEl.className = 'settings-keys-limit';
    periodEl.textContent = formatPeriod(usageData.period);
    headingRow.appendChild(periodEl);
  }

  section.appendChild(headingRow);

  if (!usageData) {
    // Error state: fetch failed
    var errEl = document.createElement('p');
    errEl.className = 'alert alert--error';
    errEl.setAttribute('role', 'alert');
    errEl.textContent = 'Could not load usage data.';
    section.appendChild(errEl);
    settingsAnnounce('Usage data could not be loaded.');
    return section;
  }

  // Captures metric
  var captures = usageData.captures || { used: 0, limit: 0, remaining: 0 };
  var capturesAriaLabel = captures.used + ' of ' + captures.limit + ' captures used this month';
  section.appendChild(buildUsageMetric('Captures', captures.used, captures.limit, capturesAriaLabel));

  // Storage metric
  var storage = usageData.storageBytes || { used: 0, limit: 0, remaining: 0 };
  var storageUsedFmt = formatBytes(storage.used);
  var storageLimitFmt = formatBytes(storage.limit);
  var storageAriaLabel = storageUsedFmt + ' of ' + storageLimitFmt + ' storage used this month';

  // Override the value text to show formatted bytes
  var storageMetric = buildUsageMetric('Storage', storage.used, storage.limit, storageAriaLabel);
  var storageValue = storageMetric.querySelector('.usage-metric-value');
  if (storageValue) storageValue.textContent = storageUsedFmt + ' of ' + storageLimitFmt;

  section.appendChild(storageMetric);

  // Footer: plan name, reset date, refresh button
  var footer = document.createElement('div');
  footer.className = 'usage-footer';

  var footerLeft = document.createElement('span');
  var tierText = usageData.tierDisplay ? 'Plan: ' + usageData.tierDisplay : '';
  var resetText = usageData.resetsAt ? 'Resets ' + formatDate(usageData.resetsAt) : '';
  footerLeft.textContent = [tierText, resetText].filter(Boolean).join('  \u00b7  ');
  footer.appendChild(footerLeft);

  var refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'usage-refresh-btn';
  refreshBtn.textContent = '\u21bb';
  refreshBtn.setAttribute('aria-label', 'Refresh usage data');
  refreshBtn.addEventListener('click', function() {
    refreshUsageSection();
  });
  footer.appendChild(refreshBtn);

  section.appendChild(footer);

  settingsAnnounce('Usage data loaded.');
  return section;
}

// ---------------------------------------------------------------------------
// refreshUsageSection -- re-fetch usage and replace card in place
// ---------------------------------------------------------------------------

function refreshUsageSection() {
  var existing = document.getElementById('settings-usage-section');
  if (!existing) return;

  // Show a simple loading state on the heading
  var headingEl = existing.querySelector('#settings-usage-heading');
  if (headingEl) headingEl.textContent = 'Usage \u2026';

  apiFetch('/v1/account/usage', { credentials: 'same-origin' })
    .then(function(res) {
      if (!res || !res.ok) return null;
      return res.json();
    })
    .catch(function() { return null; })
    .then(function(usageData) {
      var current = document.getElementById('settings-usage-section');
      if (!current) return;
      var fresh = buildUsageSection(usageData);
      current.parentNode.replaceChild(fresh, current);
    });
}

// ---------------------------------------------------------------------------
// buildSettingsContent -- render account info + keys after data loads
// ---------------------------------------------------------------------------

function buildSettingsContent(view, accountData, keysData, usageData, settingsData) {
  // --- Account info section ---
  var accountSection = document.createElement('section');
  accountSection.className = 'settings-section card';
  accountSection.setAttribute('aria-labelledby', 'settings-account-heading');

  var accountHeading = document.createElement('h2');
  accountHeading.id = 'settings-account-heading';
  accountHeading.className = 'settings-section-heading';
  accountHeading.textContent = 'Account';
  accountSection.appendChild(accountHeading);

  var infoGrid = document.createElement('dl');
  infoGrid.className = 'settings-info-grid';

  function addInfoRow(labelText, valueText) {
    var row = document.createElement('div');
    row.className = 'settings-info-row';
    var dt = document.createElement('dt');
    dt.className = 'settings-info-label';
    dt.textContent = labelText;
    var dd = document.createElement('dd');
    dd.className = 'settings-info-value';
    dd.textContent = valueText || '\u2014';
    row.appendChild(dt);
    row.appendChild(dd);
    infoGrid.appendChild(row);
  }

  addInfoRow('GitHub username', accountData.githubUsername || '');
  addInfoRow('Tenant ID', accountData.tenantId || '');
  addInfoRow('Member since', formatDate(accountData.createdAt));

  accountSection.appendChild(infoGrid);
  view.appendChild(accountSection);

  // --- Usage section ---
  view.appendChild(buildUsageSection(usageData));

  // --- Add-ons section ---
  var addonsSection = document.createElement('section');
  addonsSection.className = 'settings-section card';
  addonsSection.id = 'settings-addons-section';
  addonsSection.setAttribute('aria-labelledby', 'settings-addons-heading');

  var addonsHeading = document.createElement('h2');
  addonsHeading.id = 'settings-addons-heading';
  addonsHeading.className = 'settings-section-heading';
  addonsHeading.textContent = 'Add-ons';
  addonsSection.appendChild(addonsHeading);

  if (!settingsData) {
    // Settings fetch failed -- show error state, do not block rest of page
    var addonsErrEl = document.createElement('p');
    addonsErrEl.className = 'alert alert--error';
    addonsErrEl.setAttribute('role', 'alert');
    addonsErrEl.textContent = 'Could not load add-on settings.';
    addonsSection.appendChild(addonsErrEl);
  } else {
    // Toggle row for Qualified Timestamps (eIDAS)
    var addonRow = document.createElement('div');
    addonRow.className = 'settings-addon-row';

    var toggleWrap = document.createElement('label');
    toggleWrap.className = 'settings-addon-toggle-label';
    toggleWrap.htmlFor = 'settings-toggle-qualified-timestamps';

    var toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.id = 'settings-toggle-qualified-timestamps';
    toggleInput.className = 'settings-toggle';
    toggleInput.setAttribute('role', 'switch');
    toggleInput.checked = !!(settingsData && settingsData.qualifiedTimestamps);
    toggleWrap.appendChild(toggleInput);

    var addonTextWrap = document.createElement('div');
    addonTextWrap.className = 'settings-addon-text';

    var addonLabel = document.createElement('span');
    addonLabel.className = 'settings-addon-label';
    addonLabel.textContent = 'Qualified Timestamps (eIDAS)';
    addonTextWrap.appendChild(addonLabel);

    var addonDesc = document.createElement('span');
    addonDesc.className = 'settings-addon-description';
    addonDesc.textContent = 'Each capture receives a legally compliant qualified electronic timestamp under eIDAS regulation.';
    addonTextWrap.appendChild(addonDesc);

    var addonCost = document.createElement('span');
    addonCost.className = 'settings-addon-cost';
    addonCost.textContent = '+EUR 0.10 per capture';
    addonTextWrap.appendChild(addonCost);

    toggleWrap.appendChild(addonTextWrap);
    addonRow.appendChild(toggleWrap);

    // Inline confirmation/error area (hidden by default)
    var addonConfirm = document.createElement('div');
    addonConfirm.className = 'settings-addon-confirm';
    addonConfirm.style.display = 'none';
    addonConfirm.setAttribute('role', 'group');
    addonConfirm.setAttribute('aria-label', 'Confirm enabling qualified timestamps');
    addonConfirm.setAttribute('aria-live', 'polite');

    var addonConfirmText = document.createElement('span');
    addonConfirmText.className = 'settings-confirm-text';
    addonConfirmText.textContent = 'This adds EUR 0.10 per capture to your bill. Enable?';
    addonConfirm.appendChild(addonConfirmText);

    var addonConfirmBtn = document.createElement('button');
    addonConfirmBtn.type = 'button';
    addonConfirmBtn.className = 'btn btn--primary btn--sm';
    addonConfirmBtn.textContent = 'Confirm';
    addonConfirm.appendChild(addonConfirmBtn);

    var addonCancelBtn = document.createElement('button');
    addonCancelBtn.type = 'button';
    addonCancelBtn.className = 'btn btn--ghost btn--sm';
    addonCancelBtn.textContent = 'Cancel';
    addonConfirm.appendChild(addonCancelBtn);

    addonRow.appendChild(addonConfirm);
    addonsSection.appendChild(addonRow);

    // Wire toggle behavior
    toggleInput.addEventListener('change', function() {
      var enabling = toggleInput.checked;

      if (enabling) {
        // Show inline confirmation before applying
        toggleInput.checked = false; // revert visually until confirmed
        addonConfirm.style.display = '';
        addonConfirmText.textContent = 'This adds EUR 0.10 per capture to your bill. Enable?';
        addonConfirmBtn.style.display = '';
        addonCancelBtn.style.display = '';
        addonCancelBtn.focus();
      } else {
        // Disabling -- no confirmation needed
        sendAddonToggle(false);
      }
    });

    addonCancelBtn.addEventListener('click', function() {
      addonConfirm.style.display = 'none';
      toggleInput.checked = false;
      toggleInput.focus();
    });

    addonConfirmBtn.addEventListener('click', function() {
      sendAddonToggle(true);
    });

    function sendAddonToggle(newValue) {
      toggleInput.disabled = true;
      addonConfirmBtn.disabled = true;
      addonCancelBtn.disabled = true;

      apiFetch('/v1/account/settings', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-WRL-CSRF': '1'
        },
        body: JSON.stringify({ qualifiedTimestamps: newValue })
      }).then(function(res) {
        toggleInput.disabled = false;
        addonConfirmBtn.disabled = false;
        addonCancelBtn.disabled = false;

        if (!res) return; // 401 handled by apiFetch

        if (res.ok) {
          toggleInput.checked = newValue;
          addonConfirm.style.display = 'none';
          settingsAnnounce(newValue ? 'Qualified Timestamps enabled.' : 'Qualified Timestamps disabled.');
          return;
        }

        if (res.status === 402) {
          addonConfirmText.textContent = '';
          addonConfirmBtn.style.display = 'none';
          addonCancelBtn.style.display = 'none';
          // Build message with billing portal link using safe DOM methods
          var payMsg = document.createElement('span');
          payMsg.textContent = 'A payment method is required to enable this add-on. ';
          var payLink = document.createElement('a');
          payLink.href = '/billing';
          payLink.className = 'settings-addon-billing-link';
          payLink.textContent = 'Add a payment method';
          addonConfirmText.appendChild(payMsg);
          addonConfirmText.appendChild(payLink);
          addonConfirm.style.display = '';
          // Add a standalone close button for the 402 state
          var dismissBtn = document.createElement('button');
          dismissBtn.type = 'button';
          dismissBtn.className = 'btn btn--ghost btn--sm';
          dismissBtn.textContent = 'Dismiss';
          dismissBtn.addEventListener('click', function() {
            addonConfirm.style.display = 'none';
            toggleInput.checked = false;
            // Restore confirm/cancel buttons for future use
            addonConfirmText.textContent = 'This adds EUR 0.10 per capture to your bill. Enable?';
            addonConfirmBtn.style.display = '';
            addonCancelBtn.style.display = '';
            addonConfirm.removeChild(dismissBtn);
            toggleInput.focus();
          });
          addonConfirm.appendChild(dismissBtn);
          settingsAnnounce('Payment method required to enable qualified timestamps.');
          return;
        }

        // Other error -- revert toggle and show inline error
        toggleInput.checked = !newValue;
        addonConfirm.style.display = 'none';
        settingsAnnounce('Could not update add-on setting (HTTP ' + res.status + '). Try again.');
      }).catch(function() {
        toggleInput.disabled = false;
        addonConfirmBtn.disabled = false;
        addonCancelBtn.disabled = false;
        toggleInput.checked = !newValue;
        addonConfirm.style.display = 'none';
        settingsAnnounce('Connection failed updating add-on setting. Check your network.');
      });
    }
  }

  view.appendChild(addonsSection);

  // --- API Keys section ---
  var keys = (keysData && keysData.data) ? keysData.data : [];
  var keyLimit = 5;

  var keysSection = document.createElement('section');
  keysSection.className = 'settings-section card settings-keys';
  keysSection.id = 'settings-keys-section';
  keysSection.setAttribute('aria-labelledby', 'settings-keys-heading');

  var keysHeader = document.createElement('div');
  keysHeader.className = 'settings-keys-header';

  var keysHeading = document.createElement('h2');
  keysHeading.id = 'settings-keys-heading';
  keysHeading.className = 'settings-section-heading';
  keysHeading.textContent = 'API Keys';
  keysHeader.appendChild(keysHeading);

  var limitEl = document.createElement('span');
  limitEl.className = 'settings-keys-limit';
  limitEl.id = 'settings-keys-limit';
  limitEl.textContent = keys.length + ' of ' + keyLimit + ' keys';
  keysHeader.appendChild(limitEl);

  keysSection.appendChild(keysHeader);

  // Key list container
  var keyListEl = document.createElement('div');
  keyListEl.className = 'settings-key-list';
  keyListEl.id = 'settings-key-list';
  keysSection.appendChild(keyListEl);

  // Render current keys
  renderKeyList(keyListEl, keys, keyLimit);

  // --- Create new key form ---
  var createSection = document.createElement('div');
  createSection.className = 'settings-create';
  createSection.id = 'settings-create-section';

  var createHeading = document.createElement('h3');
  createHeading.className = 'settings-create-heading';
  createHeading.textContent = 'Create new key';
  createSection.appendChild(createHeading);

  var createForm = document.createElement('form');
  createForm.id = 'settings-create-form';
  createForm.noValidate = true;

  var nameRow = document.createElement('div');
  nameRow.className = 'settings-create-row';

  var nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'settings-key-name';
  nameLabel.className = 'settings-create-label';
  nameLabel.textContent = 'Key name';
  nameRow.appendChild(nameLabel);

  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'settings-key-name';
  nameInput.className = 'input';
  nameInput.placeholder = 'e.g. My App';
  nameInput.setAttribute('aria-label', 'New key name');
  nameInput.maxLength = 64;
  nameRow.appendChild(nameInput);

  createForm.appendChild(nameRow);

  // Scope checkboxes
  var scopeRow = document.createElement('div');
  scopeRow.className = 'settings-create-scopes';
  scopeRow.setAttribute('role', 'group');
  scopeRow.setAttribute('aria-labelledby', 'settings-scope-label');

  var scopeLabel = document.createElement('span');
  scopeLabel.id = 'settings-scope-label';
  scopeLabel.className = 'settings-create-label';
  scopeLabel.textContent = 'Scopes';
  scopeRow.appendChild(scopeLabel);

  var scopeOptions = ['capture', 'read'];
  var scopeCheckboxes = {};
  for (var s = 0; s < scopeOptions.length; s++) {
    var scopeName = scopeOptions[s];
    var scopeItem = document.createElement('label');
    scopeItem.className = 'settings-scope-item';
    var scopeChk = document.createElement('input');
    scopeChk.type = 'checkbox';
    scopeChk.value = scopeName;
    scopeChk.checked = true;
    scopeChk.setAttribute('aria-label', scopeName + ' scope');
    scopeCheckboxes[scopeName] = scopeChk;
    scopeItem.appendChild(scopeChk);
    scopeItem.appendChild(document.createTextNode(' ' + scopeName));
    scopeRow.appendChild(scopeItem);
  }
  createForm.appendChild(scopeRow);

  // Create form error
  var createErrorEl = document.createElement('div');
  createErrorEl.id = 'settings-create-error';
  createErrorEl.className = 'alert alert--error';
  createErrorEl.setAttribute('role', 'alert');
  createErrorEl.setAttribute('aria-live', 'polite');
  createErrorEl.style.display = 'none';
  createForm.appendChild(createErrorEl);

  // Create button
  var createBtn = document.createElement('button');
  createBtn.type = 'submit';
  createBtn.className = 'btn btn--primary';
  createBtn.textContent = 'Create Key';
  createBtn.id = 'settings-create-btn';
  createForm.appendChild(createBtn);

  createSection.appendChild(createForm);
  keysSection.appendChild(createSection);

  // New key display (hidden until a key is created)
  var newKeyDisplay = document.createElement('div');
  newKeyDisplay.id = 'settings-new-key-display';
  newKeyDisplay.className = 'settings-new-key-display';
  newKeyDisplay.style.display = 'none';
  keysSection.appendChild(newKeyDisplay);

  view.appendChild(keysSection);

  // Wire the create form
  createForm._nameInput = nameInput;
  createForm._scopeCheckboxes = scopeCheckboxes;
  createForm._createBtn = createBtn;
  createForm._createErrorEl = createErrorEl;
  createForm._keys = keys;
  createForm._keyLimit = keyLimit;
  createForm._keyListEl = keyListEl;
  createForm._limitEl = limitEl;
  createForm._newKeyDisplay = newKeyDisplay;

  createForm.addEventListener('submit', function(e) {
    e.preventDefault();
    handleCreateKey(createForm);
  });
}

// ---------------------------------------------------------------------------
// renderKeyList -- populate key rows
// ---------------------------------------------------------------------------

function renderKeyList(keyListEl, keys, keyLimit) {
  // Safe: clearing the static key list container before re-render
  keyListEl.innerHTML = '';

  if (!keys || keys.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'settings-keys-empty';
    empty.textContent = 'No API keys. Create one below.';
    keyListEl.appendChild(empty);
    return;
  }

  for (var i = 0; i < keys.length; i++) {
    keyListEl.appendChild(buildKeyRow(keys[i], keys.length, keyLimit, keyListEl, keys));
  }
}

// ---------------------------------------------------------------------------
// buildKeyRow -- single key row with revoke inline confirmation
// ---------------------------------------------------------------------------

function buildKeyRow(key, totalKeys, keyLimit, keyListEl, allKeys) {
  var row = document.createElement('div');
  row.className = 'settings-key-row';
  row.dataset.keyHash = key.keyHash || '';

  // Key info
  var info = document.createElement('div');
  info.className = 'settings-key-info';

  var nameEl = document.createElement('span');
  nameEl.className = 'settings-key-name';
  nameEl.textContent = key.name || 'Unnamed key';
  info.appendChild(nameEl);

  var metaEl = document.createElement('span');
  metaEl.className = 'settings-key-meta';
  metaEl.textContent = 'Created ' + formatDate(key.createdAt);
  info.appendChild(metaEl);

  if (key.scopes && key.scopes.length) {
    var scopesEl = document.createElement('div');
    scopesEl.className = 'settings-key-scopes';
    scopesEl.appendChild(buildScopeBadges(key.scopes));
    info.appendChild(scopesEl);
  }

  row.appendChild(info);

  // Revoke action area
  var actionArea = document.createElement('div');
  actionArea.className = 'settings-key-actions';

  var isLastKey = (totalKeys <= 1);

  var revokeBtn = document.createElement('button');
  revokeBtn.type = 'button';
  revokeBtn.className = 'btn btn--ghost btn--sm settings-revoke-btn';
  revokeBtn.textContent = 'Revoke';
  revokeBtn.dataset.keyHash = key.keyHash || '';

  if (isLastKey) {
    revokeBtn.setAttribute('aria-disabled', 'true');
    revokeBtn.setAttribute('title', 'Cannot revoke your last API key');
  } else {
    revokeBtn.setAttribute('aria-disabled', 'false');
  }

  // Inline confirmation area (hidden until Revoke is clicked)
  var confirmArea = document.createElement('div');
  confirmArea.className = 'settings-confirm';
  confirmArea.style.display = 'none';
  confirmArea.setAttribute('role', 'group');
  confirmArea.setAttribute('aria-label', 'Confirm key revocation');

  var confirmText = document.createElement('span');
  confirmText.className = 'settings-confirm-text';
  confirmText.textContent = 'Revoke this key?';
  confirmArea.appendChild(confirmText);

  var confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn--primary btn--sm settings-confirm-revoke';
  confirmBtn.textContent = 'Confirm';
  confirmArea.appendChild(confirmBtn);

  var cancelConfirmBtn = document.createElement('button');
  cancelConfirmBtn.type = 'button';
  cancelConfirmBtn.className = 'btn btn--ghost btn--sm settings-cancel-revoke';
  cancelConfirmBtn.textContent = 'Cancel';
  confirmArea.appendChild(cancelConfirmBtn);

  // Revoke button shows confirmation inline
  revokeBtn.addEventListener('click', function() {
    if (revokeBtn.getAttribute('aria-disabled') === 'true') return;
    revokeBtn.style.display = 'none';
    confirmArea.style.display = '';
    // Focus Cancel by default -- safer action gets focus
    cancelConfirmBtn.focus();
  });

  // Cancel hides confirmation
  cancelConfirmBtn.addEventListener('click', function() {
    confirmArea.style.display = 'none';
    revokeBtn.style.display = '';
    revokeBtn.focus();
  });

  // Confirm revoke
  confirmBtn.addEventListener('click', function() {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Revoking...';
    cancelConfirmBtn.disabled = true;

    var keyHash = key.keyHash || '';
    apiFetch('/v1/account/keys/' + encodeURIComponent(keyHash), {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'X-WRL-CSRF': '1' }
    }).then(function(res) {
      if (!res) return; // 401 handled

      if (res.ok || res.status === 204) {
        // Remove from allKeys array
        for (var k = 0; k < allKeys.length; k++) {
          if (allKeys[k].keyHash === keyHash) {
            allKeys.splice(k, 1);
            break;
          }
        }
        // Re-render key list
        renderKeyList(keyListEl, allKeys, keyLimit);
        // Update limit indicator
        var limitEl = document.getElementById('settings-keys-limit');
        if (limitEl) limitEl.textContent = allKeys.length + ' of ' + keyLimit + ' keys';
        settingsAnnounce('API key revoked.');
        return;
      }

      // Error
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm';
      cancelConfirmBtn.disabled = false;
      settingsAnnounce('Could not revoke key (HTTP ' + res.status + '). Try again.');
    }).catch(function() {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm';
      cancelConfirmBtn.disabled = false;
      settingsAnnounce('Connection failed revoking key. Check your network.');
    });
  });

  actionArea.appendChild(revokeBtn);
  actionArea.appendChild(confirmArea);
  row.appendChild(actionArea);
  return row;
}

// ---------------------------------------------------------------------------
// handleCreateKey -- submit create key form
// ---------------------------------------------------------------------------

function handleCreateKey(createForm) {
  var nameInput = createForm._nameInput;
  var scopeCheckboxes = createForm._scopeCheckboxes;
  var createBtn = createForm._createBtn;
  var createErrorEl = createForm._createErrorEl;
  var keys = createForm._keys;
  var keyLimit = createForm._keyLimit;
  var keyListEl = createForm._keyListEl;
  var limitEl = createForm._limitEl;
  var newKeyDisplay = createForm._newKeyDisplay;

  createErrorEl.style.display = 'none';

  var name = nameInput.value.trim();
  if (!name) {
    createErrorEl.textContent = 'Key name is required.';
    createErrorEl.style.display = '';
    nameInput.focus();
    return;
  }

  var scopes = [];
  var scopeNames = Object.keys(scopeCheckboxes);
  for (var i = 0; i < scopeNames.length; i++) {
    if (scopeCheckboxes[scopeNames[i]].checked) {
      scopes.push(scopeNames[i]);
    }
  }

  if (scopes.length === 0) {
    createErrorEl.textContent = 'Select at least one scope.';
    createErrorEl.style.display = '';
    return;
  }

  if (keys.length >= keyLimit) {
    createErrorEl.textContent = 'Key limit reached (' + keyLimit + '). Revoke an existing key first.';
    createErrorEl.style.display = '';
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  apiFetch('/v1/account/keys', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-WRL-CSRF': '1'
    },
    body: JSON.stringify({ name: name, scopes: scopes })
  }).then(function(res) {
    if (!res) return; // 401 handled

    createBtn.disabled = false;
    createBtn.textContent = 'Create Key';

    if (res.status === 201) {
      return res.json().then(function(data) {
        var rawKey = (data && data.key) ? data.key : '';
        var newKeyMeta = {
          name: name,
          keyHash: (data && data.keyHash) ? data.keyHash : '',
          createdAt: new Date().toISOString(),
          scopes: scopes
        };

        // Add to keys array and re-render list
        keys.push(newKeyMeta);
        renderKeyList(keyListEl, keys, keyLimit);
        if (limitEl) limitEl.textContent = keys.length + ' of ' + keyLimit + ' keys';

        // Show the raw key with copy button
        showNewKeyDisplay(newKeyDisplay, rawKey);

        // Reset form
        nameInput.value = '';
        settingsAnnounce('New API key created. Copy it now.');
      });
    }

    return res.json().then(function(data) {
      var detail = (data && data.detail) ? data.detail : 'Could not create key (HTTP ' + res.status + ').';
      createErrorEl.textContent = detail.length > 200 ? detail.slice(0, 200) + '...' : detail;
      createErrorEl.style.display = '';
    }).catch(function() {
      createErrorEl.textContent = 'Could not create key (HTTP ' + res.status + ').';
      createErrorEl.style.display = '';
    });
  }).catch(function() {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Key';
    createErrorEl.textContent = 'Connection failed. Check your network.';
    createErrorEl.style.display = '';
  });
}

// ---------------------------------------------------------------------------
// showNewKeyDisplay -- reveal raw key after creation with copy button
// ---------------------------------------------------------------------------

function showNewKeyDisplay(container, rawKey) {
  // Safe: clearing the new-key display container before re-render
  container.innerHTML = '';
  container.style.display = '';

  var warning = document.createElement('div');
  warning.className = 'alert alert--warning welcome-warning';
  warning.setAttribute('role', 'alert');
  warning.textContent = 'This key will only be shown once. Copy it now.';
  container.appendChild(warning);

  var keyRow = document.createElement('div');
  keyRow.className = 'welcome-key-row';

  var keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.readOnly = true;
  keyInput.className = 'input welcome-key-input';
  keyInput.value = rawKey;
  keyInput.setAttribute('aria-label', 'New API key');
  keyInput.setAttribute('autocomplete', 'off');
  keyRow.appendChild(keyInput);

  var copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn--ghost btn--sm';
  copyBtn.textContent = 'Copy';
  copyBtn.setAttribute('aria-label', 'Copy API key');
  copyBtn.addEventListener('click', function() {
    copyToClipboard(rawKey, copyBtn);
    settingsAnnounce('API key copied to clipboard.');
  });
  keyRow.appendChild(copyBtn);

  container.appendChild(keyRow);

  // Focus copy button after creation
  copyBtn.focus();
}
`;
