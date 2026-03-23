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

  // Fetch keys list
  apiFetch('/v1/account/keys', { credentials: 'same-origin' })
  .then(function(keysRes) {
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
      buildSettingsContent(view, accountData, keysBody || {});
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
// buildSettingsContent -- render account info + keys after data loads
// ---------------------------------------------------------------------------

function buildSettingsContent(view, accountData, keysData) {
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
