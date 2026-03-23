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
// mountSettings() -- fetch data and wire events
// ---------------------------------------------------------------------------

function mountSettings() {
  var infoGrid = document.getElementById('settings-account-info');
  var keysList = document.getElementById('settings-keys-list');
  var keysCount = document.getElementById('settings-keys-count');
  var createBtn = document.getElementById('settings-create-btn');
  var createForm = document.getElementById('settings-create-form');
  if (!infoGrid || !keysList || !createBtn || !createForm) return;

  // Fetch account info from session
  if (typeof _wrlUser !== 'undefined' && _wrlUser) {
    renderAccountInfo(infoGrid, _wrlUser);
  }

  // Fetch keys
  loadKeys(keysList, keysCount);

  // Create key toggle
  createBtn.addEventListener('click', function() {
    if (createForm.style.display === 'none') {
      showCreateForm(createForm, keysList, keysCount, createBtn);
    } else {
      createForm.style.display = 'none';
      createBtn.textContent = 'Create new key';
    }
  });
}

function renderAccountInfo(container, user) {
  container.innerHTML = '';

  var fields = [
    ['GitHub', user.githubLogin || 'Unknown'],
    ['Tenant ID', user.tenantId || 'Unknown'],
    ['Member since', user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown']
  ];

  for (var i = 0; i < fields.length; i++) {
    var row = document.createElement('div');
    row.className = 'data-row';
    var label = document.createElement('div');
    label.className = 'data-label';
    label.textContent = fields[i][0];
    var value = document.createElement('div');
    value.className = 'data-value';
    value.textContent = fields[i][1];
    row.appendChild(label);
    row.appendChild(value);
    container.appendChild(row);
  }
}

function loadKeys(container, countEl) {
  apiFetch('/v1/account/keys').then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function(data) {
    renderKeysList(container, data.data || [], 5, countEl);
  }).catch(function() {
    container.innerHTML = '';
    var err = document.createElement('p');
    err.className = 'alert alert--error';
    err.textContent = 'Failed to load API keys.';
    container.appendChild(err);
  });
}

function renderKeysList(container, keys, limit, countEl) {
  container.innerHTML = '';
  if (countEl) {
    countEl.textContent = keys.length + ' of ' + limit + ' keys';
  }

  if (keys.length === 0) {
    var empty = document.createElement('p');
    empty.className = 'text-muted';
    empty.textContent = 'No API keys yet.';
    container.appendChild(empty);
    return;
  }

  var table = document.createElement('table');
  table.className = 'table settings-keys-table';

  var thead = document.createElement('thead');
  var headRow = document.createElement('tr');
  ['Name', 'Created', 'Scopes', ''].forEach(function(h) {
    var th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  tbody.id = 'settings-keys-tbody';

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var tr = document.createElement('tr');
    tr.setAttribute('data-key-hash', key.keyHash || '');

    var tdName = document.createElement('td');
    tdName.textContent = key.name || 'Unnamed';
    tr.appendChild(tdName);

    var tdCreated = document.createElement('td');
    tdCreated.textContent = key.createdAt ? new Date(key.createdAt).toLocaleDateString() : '';
    tr.appendChild(tdCreated);

    var tdScopes = document.createElement('td');
    var scopes = key.scopes || [];
    for (var s = 0; s < scopes.length; s++) {
      var badge = document.createElement('span');
      badge.className = 'badge scope-badge';
      badge.textContent = scopes[s];
      tdScopes.appendChild(badge);
    }
    tr.appendChild(tdScopes);

    var tdAction = document.createElement('td');
    var revokeBtn = document.createElement('button');
    revokeBtn.type = 'button';
    revokeBtn.className = 'btn btn--ghost btn--sm settings-revoke-btn';
    revokeBtn.textContent = 'Revoke';
    revokeBtn.setAttribute('data-key-hash', key.keyHash || '');
    revokeBtn.setAttribute('data-key-name', key.name || 'Unnamed');
    if (keys.length <= 1) {
      revokeBtn.setAttribute('aria-disabled', 'true');
      revokeBtn.setAttribute('title', 'Cannot revoke your only key');
    }
    revokeBtn.addEventListener('click', function(e) {
      var btn = e.currentTarget;
      if (btn.getAttribute('aria-disabled') === 'true') return;
      showRevokeConfirm(btn, container, countEl);
    });
    tdAction.appendChild(revokeBtn);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);
}

function showRevokeConfirm(revokeBtn, container, countEl) {
  var keyHash = revokeBtn.getAttribute('data-key-hash');
  var keyName = revokeBtn.getAttribute('data-key-name');
  var row = revokeBtn.closest('tr');
  if (!row) return;

  // Remove any existing confirm
  var existing = row.querySelector('.settings-confirm');
  if (existing) { existing.remove(); return; }

  var confirmDiv = document.createElement('div');
  confirmDiv.className = 'settings-confirm';

  var msg = document.createElement('span');
  msg.className = 'settings-confirm-text';
  msg.textContent = 'Revoke \\'' + keyName + '\\'? This cannot be undone.';
  confirmDiv.appendChild(msg);

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost btn--sm';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', function() { confirmDiv.remove(); });
  confirmDiv.appendChild(cancelBtn);

  var confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn--primary btn--sm settings-confirm-revoke';
  confirmBtn.textContent = 'Confirm';
  confirmBtn.addEventListener('click', function() {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Revoking...';

    apiFetch('/v1/account/keys/' + keyHash, {
      method: 'DELETE'
    }).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      loadKeys(container, countEl);
    }).catch(function() {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm';
      msg.textContent = 'Failed to revoke key. Try again.';
    });
  });
  confirmDiv.appendChild(confirmBtn);

  // Insert confirm row
  var tdAction = revokeBtn.closest('td');
  if (tdAction) {
    tdAction.appendChild(confirmDiv);
    cancelBtn.focus();
  }
}

function showCreateForm(formEl, keysContainer, countEl, toggleBtn) {
  formEl.style.display = '';
  formEl.innerHTML = '';
  toggleBtn.textContent = 'Cancel';

  var nameLabel = document.createElement('label');
  nameLabel.className = 'settings-create-label';
  nameLabel.textContent = 'Key name';
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'input settings-create-input';
  nameInput.placeholder = 'e.g. my-app';
  nameInput.maxLength = 64;
  nameLabel.appendChild(nameInput);
  formEl.appendChild(nameLabel);

  // Scope checkboxes
  var scopeFieldset = document.createElement('fieldset');
  scopeFieldset.className = 'settings-create-scopes';
  var legend = document.createElement('legend');
  legend.textContent = 'Scopes';
  scopeFieldset.appendChild(legend);

  ['capture', 'read'].forEach(function(scope) {
    var scopeLabel = document.createElement('label');
    scopeLabel.className = 'settings-scope-label';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = scope;
    cb.checked = true;
    cb.className = 'settings-scope-cb';
    scopeLabel.appendChild(cb);
    scopeLabel.appendChild(document.createTextNode(' ' + scope));
    scopeFieldset.appendChild(scopeLabel);
  });
  formEl.appendChild(scopeFieldset);

  var submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn--primary';
  submitBtn.textContent = 'Create';
  formEl.appendChild(submitBtn);

  var resultArea = document.createElement('div');
  resultArea.id = 'settings-create-result';
  formEl.appendChild(resultArea);

  nameInput.focus();

  submitBtn.addEventListener('click', function() {
    var name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    var scopes = [];
    var checkboxes = scopeFieldset.querySelectorAll('.settings-scope-cb:checked');
    for (var i = 0; i < checkboxes.length; i++) {
      scopes.push(checkboxes[i].value);
    }
    if (scopes.length === 0) scopes = ['capture', 'read'];

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    apiFetch('/v1/account/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, scopes: scopes })
    }).then(function(res) {
      if (!res.ok) {
        return res.json().then(function(err) {
          throw new Error(err.detail || 'Failed to create key');
        });
      }
      return res.json();
    }).then(function(data) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create';

      // Show the raw key
      resultArea.innerHTML = '';
      var keyAlert = document.createElement('div');
      keyAlert.className = 'alert alert--warning';
      keyAlert.textContent = 'Copy this key now. It will not be shown again.';
      resultArea.appendChild(keyAlert);

      var keyRow = document.createElement('div');
      keyRow.className = 'welcome-key-row';

      var keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.readOnly = true;
      keyInput.className = 'input text-mono welcome-key-input';
      keyInput.value = data.key;
      keyInput.setAttribute('aria-label', 'New API key');
      keyRow.appendChild(keyInput);

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn--secondary';
      copyBtn.textContent = 'Copy';
      copyBtn.setAttribute('aria-label', 'Copy API key');
      copyBtn.addEventListener('click', function() {
        copyToClipboard(data.key, copyBtn);
      });
      keyRow.appendChild(copyBtn);

      resultArea.appendChild(keyRow);
      copyBtn.focus();

      // Refresh the key list
      loadKeys(keysContainer, countEl);

      // Reset form
      nameInput.value = '';
    }).catch(function(err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create';
      resultArea.innerHTML = '';
      var errEl = document.createElement('div');
      errEl.className = 'alert alert--error';
      errEl.textContent = err.message || 'Failed to create key.';
      resultArea.appendChild(errEl);
    });
  });
}
`;
