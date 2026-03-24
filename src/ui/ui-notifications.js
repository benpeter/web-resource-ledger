// tva
// Notification preferences view for WRL.
// Exports a JS string constant for inline use in the HTML shell.

export const NOTIFICATIONS_JS = `
// ---------------------------------------------------------------------------
// Notifications module state
// ---------------------------------------------------------------------------

var _notificationsLiveEl = null;

// ---------------------------------------------------------------------------
// Announce helper (mirrors settingsAnnounce pattern)
// ---------------------------------------------------------------------------

function notificationsAnnounce(message) {
  if (!_notificationsLiveEl) return;
  _notificationsLiveEl.textContent = '';
  setTimeout(function() { _notificationsLiveEl.textContent = message; }, 50);
}

// ---------------------------------------------------------------------------
// notificationLabel -- human-readable label for a toggle key
// ---------------------------------------------------------------------------

function notificationLabel(key) {
  var labels = {
    capture_failure: 'Capture failures',
    approaching_limit: 'Approaching limit',
    limit_reached: 'Limit reached',
    payment_failure: 'Payment failure',
    invoice_generated: 'Invoice generated',
    weekly_digest: 'Weekly digest'
  };
  return labels[key] || key;
}

// ---------------------------------------------------------------------------
// notificationDescription -- description text for a toggle key
// ---------------------------------------------------------------------------

function notificationDescription(key) {
  var descriptions = {
    capture_failure: 'Get notified when a web capture fails',
    approaching_limit: 'Warning when nearing your free capture limit',
    limit_reached: 'Alert when your free capture limit is reached',
    payment_failure: 'Alert when a payment attempt fails',
    invoice_generated: 'Notification when a new invoice is created',
    weekly_digest: 'Weekly summary of your scheduled captures'
  };
  return descriptions[key] || '';
}

// ---------------------------------------------------------------------------
// defaultPreferences -- used when API returns no toggles
// ---------------------------------------------------------------------------

function defaultPreferences() {
  return {
    capture_failure: true,
    approaching_limit: true,
    limit_reached: true,
    payment_failure: true,
    invoice_generated: true,
    weekly_digest: true
  };
}

// ---------------------------------------------------------------------------
// renderNotifications() -- builds DOM skeleton for the notifications view
// ---------------------------------------------------------------------------

function renderNotifications() {
  document.title = 'Notifications \u2014 WRL';

  var view = document.getElementById('view');
  // Safe: clearing the static view container; no user or API data involved
  view.textContent = '';

  // aria-live region for status announcements (sr-only, not visible)
  var liveEl = document.createElement('div');
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  liveEl.className = 'sr-only';
  liveEl.id = 'notifications-live';
  view.appendChild(liveEl);
  _notificationsLiveEl = liveEl;

  var h1 = document.createElement('h1');
  h1.className = 'captures-heading';
  h1.tabIndex = -1;
  h1.textContent = 'Notifications';
  view.appendChild(h1);

  // Loading state for initial data fetch
  var loadingEl = document.createElement('p');
  loadingEl.id = 'notifications-loading';
  loadingEl.className = 'view-placeholder';
  loadingEl.textContent = 'Loading notification preferences...';
  view.appendChild(loadingEl);

  h1.focus();
}

// ---------------------------------------------------------------------------
// mountNotifications() -- fetch data and build full content
// ---------------------------------------------------------------------------

function mountNotifications() {
  var view = document.getElementById('view');
  var loadingEl = document.getElementById('notifications-loading');
  if (!view) return;

  apiFetch('/v1/account/notifications', { credentials: 'same-origin' })
    .then(function(res) {
      if (!res || !res.ok) return null;
      return res.json();
    })
    .catch(function() { return null; })
    .then(function(data) {
      if (loadingEl) loadingEl.remove();

      if (!data) {
        var errEl = document.createElement('div');
        errEl.className = 'alert alert--error';
        errEl.setAttribute('role', 'alert');
        errEl.textContent = 'Could not load notification preferences. Please try refreshing.';
        view.appendChild(errEl);
        return;
      }

      buildNotificationsContent(data);
    })
    .catch(function() {
      if (loadingEl) loadingEl.remove();
      var netErrEl = document.createElement('div');
      netErrEl.className = 'alert alert--error';
      netErrEl.setAttribute('role', 'alert');
      netErrEl.textContent = 'Connection failed loading notification preferences. Check your network.';
      view.appendChild(netErrEl);
    });
}

// ---------------------------------------------------------------------------
// buildNotificationsContent -- orchestrates section builders
// ---------------------------------------------------------------------------

function buildNotificationsContent(data) {
  var view = document.getElementById('view');
  if (!view) return;

  // Remove any previous content sections (keep live region + h1)
  var existing = view.querySelectorAll('section');
  for (var i = 0; i < existing.length; i++) {
    existing[i].remove();
  }

  var prefs = data.notifications || defaultPreferences();

  view.appendChild(buildEmailSection(data));
  view.appendChild(buildToggleSection('Alerts', [
    'capture_failure',
    'approaching_limit',
    'limit_reached',
    'payment_failure'
  ], prefs));
  view.appendChild(buildToggleSection('Summaries', [
    'invoice_generated',
    'weekly_digest'
  ], prefs));
}

// ---------------------------------------------------------------------------
// buildEmailSection -- email address display and edit
// ---------------------------------------------------------------------------

function buildEmailSection(data) {
  var email = data.email || null;
  var emailVerified = !!data.emailVerified;

  var section = document.createElement('section');
  section.className = 'settings-section card';
  section.setAttribute('aria-labelledby', 'notifications-email-heading');

  var h2 = document.createElement('h2');
  h2.id = 'notifications-email-heading';
  h2.className = 'settings-section-heading';
  h2.textContent = 'Email address';
  section.appendChild(h2);

  // --- Email display row ---
  var displayRow = document.createElement('div');
  displayRow.className = 'notifications-email-row';
  displayRow.id = 'notifications-email-display';

  if (!email) {
    var promptEl = document.createElement('p');
    promptEl.className = 'text-muted';
    promptEl.style.fontSize = 'var(--text-sm)';
    promptEl.textContent = 'Add your email to receive notifications';
    displayRow.appendChild(promptEl);
  } else {
    var emailEl = document.createElement('span');
    emailEl.className = 'notifications-email-address';
    emailEl.textContent = email;
    displayRow.appendChild(emailEl);

    var badge = document.createElement('span');
    if (emailVerified) {
      badge.className = 'badge badge--pass';
      badge.textContent = 'Verified';
    } else {
      badge.className = 'badge badge--skip';
      badge.textContent = 'Not verified';
    }
    badge.style.marginLeft = 'var(--space-2)';
    displayRow.appendChild(badge);
  }

  var editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn--ghost btn--sm';
  editBtn.style.marginLeft = 'auto';
  editBtn.textContent = email ? 'Edit' : 'Add';
  editBtn.id = 'notifications-email-edit-btn';
  displayRow.appendChild(editBtn);

  section.appendChild(displayRow);

  // --- Edit form (hidden by default) ---
  var editForm = document.createElement('form');
  editForm.id = 'notifications-email-form';
  editForm.style.display = 'none';
  editForm.noValidate = true;

  var inputRow = document.createElement('div');
  inputRow.className = 'notifications-email-input-row';

  var emailLabel = document.createElement('label');
  emailLabel.htmlFor = 'notifications-email-input';
  emailLabel.className = 'sr-only';
  emailLabel.textContent = 'Email address';
  inputRow.appendChild(emailLabel);

  var emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.id = 'notifications-email-input';
  emailInput.className = 'input';
  emailInput.placeholder = 'you@example.com';
  emailInput.value = email || '';
  emailInput.autocomplete = 'email';
  emailInput.setAttribute('aria-required', 'true');
  inputRow.appendChild(emailInput);

  var saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary btn--sm';
  saveBtn.textContent = 'Save';
  inputRow.appendChild(saveBtn);

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost btn--sm';
  cancelBtn.textContent = 'Cancel';
  inputRow.appendChild(cancelBtn);

  editForm.appendChild(inputRow);

  // Inline feedback (hidden by default)
  var feedbackEl = document.createElement('p');
  feedbackEl.id = 'notifications-email-feedback';
  feedbackEl.style.display = 'none';
  feedbackEl.style.fontSize = 'var(--text-sm)';
  feedbackEl.style.marginTop = 'var(--space-2)';
  editForm.appendChild(feedbackEl);

  section.appendChild(editForm);

  // --- Wire edit button ---
  editBtn.addEventListener('click', function() {
    displayRow.style.display = 'none';
    editForm.style.display = '';
    emailInput.focus();
  });

  cancelBtn.addEventListener('click', function() {
    editForm.style.display = 'none';
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
    displayRow.style.display = '';
    editBtn.focus();
  });

  // --- Wire save form ---
  editForm.addEventListener('submit', function(e) {
    e.preventDefault();

    var newEmail = emailInput.value.trim();
    if (!newEmail) {
      feedbackEl.textContent = 'Please enter a valid email address.';
      feedbackEl.style.color = 'var(--color-error-text)';
      feedbackEl.style.display = '';
      emailInput.focus();
      return;
    }

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    feedbackEl.style.display = 'none';

    apiFetch('/v1/account/notifications', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1'
      },
      body: JSON.stringify({ email: newEmail })
    }).then(function(res) {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = 'Save';

      if (!res) return; // 401 handled by apiFetch

      if (res.ok) {
        // Update display row to reflect new email without re-fetching
        emailInput.value = newEmail;
        editForm.style.display = 'none';
        displayRow.style.display = '';

        // Refresh display row content to show new email + "not verified" badge
        updateEmailDisplay(displayRow, editBtn, newEmail, false);

        notificationsAnnounce('Email updated. Verification required before notifications are sent.');
        return;
      }

      feedbackEl.textContent = 'Could not update email (HTTP ' + res.status + '). Please try again.';
      feedbackEl.style.color = 'var(--color-error-text)';
      feedbackEl.style.display = '';
    }).catch(function() {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = 'Save';
      feedbackEl.textContent = 'Connection failed. Check your network and try again.';
      feedbackEl.style.color = 'var(--color-error-text)';
      feedbackEl.style.display = '';
    });
  });

  return section;
}

// ---------------------------------------------------------------------------
// updateEmailDisplay -- refresh email display row after a successful save
// ---------------------------------------------------------------------------

function updateEmailDisplay(displayRow, editBtn, newEmail, verified) {
  // Clear existing content from displayRow (not editBtn -- it lives in section)
  while (displayRow.firstChild) {
    displayRow.removeChild(displayRow.firstChild);
  }

  var emailEl = document.createElement('span');
  emailEl.className = 'notifications-email-address';
  emailEl.textContent = newEmail;
  displayRow.appendChild(emailEl);

  var badge = document.createElement('span');
  if (verified) {
    badge.className = 'badge badge--pass';
    badge.textContent = 'Verified';
  } else {
    badge.className = 'badge badge--skip';
    badge.textContent = 'Not verified';
  }
  badge.style.marginLeft = 'var(--space-2)';
  displayRow.appendChild(badge);

  editBtn.textContent = 'Edit';
  displayRow.appendChild(editBtn);
}

// ---------------------------------------------------------------------------
// buildToggleSection -- group of notification toggles with a subheading
// ---------------------------------------------------------------------------

function buildToggleSection(heading, keys, prefs) {
  var section = document.createElement('section');
  section.className = 'settings-section card';
  var headingId = 'notifications-heading-' + heading.toLowerCase();
  section.setAttribute('aria-labelledby', headingId);

  var h2 = document.createElement('h2');
  h2.id = headingId;
  h2.className = 'settings-section-heading';
  h2.textContent = heading;
  section.appendChild(h2);

  var list = document.createElement('div');
  list.className = 'settings-addon-list';

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var checked = prefs[key] !== false; // default on
    list.appendChild(buildToggleRow(key, checked));
  }

  section.appendChild(list);
  return section;
}

// ---------------------------------------------------------------------------
// buildToggleRow -- single toggle row (label + description + switch)
// ---------------------------------------------------------------------------

function buildToggleRow(key, checked) {
  var row = document.createElement('div');
  row.className = 'settings-addon-row';
  row.id = 'notifications-row-' + key;

  var inputId = 'notifications-toggle-' + key;

  var toggleWrap = document.createElement('label');
  toggleWrap.className = 'settings-addon-toggle-label';
  toggleWrap.htmlFor = inputId;

  var toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.id = inputId;
  toggleInput.className = 'settings-toggle';
  toggleInput.setAttribute('role', 'switch');
  toggleInput.checked = checked;
  toggleWrap.appendChild(toggleInput);

  var textWrap = document.createElement('div');
  textWrap.className = 'settings-addon-text';

  var labelEl = document.createElement('span');
  labelEl.className = 'settings-addon-label';
  labelEl.textContent = notificationLabel(key);
  textWrap.appendChild(labelEl);

  var descEl = document.createElement('span');
  descEl.className = 'settings-addon-description';
  descEl.textContent = notificationDescription(key);
  textWrap.appendChild(descEl);

  toggleWrap.appendChild(textWrap);
  row.appendChild(toggleWrap);

  // Wire toggle change
  toggleInput.addEventListener('change', function() {
    var newValue = toggleInput.checked;
    toggleInput.disabled = true;

    var notifications = {};
    notifications[key] = newValue;

    apiFetch('/v1/account/notifications', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1'
      },
      body: JSON.stringify({ notifications: notifications })
    }).then(function(res) {
      toggleInput.disabled = false;

      if (!res) return; // 401 handled by apiFetch

      if (res.ok) {
        notificationsAnnounce(notificationLabel(key) + (newValue ? ' enabled.' : ' disabled.'));
        return;
      }

      // Revert on error
      toggleInput.checked = !newValue;
      notificationsAnnounce('Could not update preference (HTTP ' + res.status + '). Try again.');
    }).catch(function() {
      toggleInput.disabled = false;
      toggleInput.checked = !newValue;
      notificationsAnnounce('Connection failed updating preference. Check your network.');
    });
  });

  return row;
}
`;
