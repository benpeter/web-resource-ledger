// tva
// Schedule management view for WRL.
// Exports a JS string constant for inline use in the HTML shell.

export const SCHEDULES_JS = `
// ---------------------------------------------------------------------------
// Schedules module state
// ---------------------------------------------------------------------------

var _schedulesLiveEl = null;
var _schedules = [];
var _scheduleLimit = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function schedulesAnnounce(message) {
  if (!_schedulesLiveEl) return;
  _schedulesLiveEl.textContent = '';
  setTimeout(function() { _schedulesLiveEl.textContent = message; }, 50);
}

var CRON_LABELS = {
  '0 * * * *': 'Every hour',
  '0 */6 * * *': 'Every 6 hours',
  '0 */12 * * *': 'Every 12 hours',
  '0 0 * * *': 'Daily at midnight UTC',
  '0 0 * * 1': 'Weekly on Monday',
};

function cronToLabel(cron) {
  return CRON_LABELS[cron] || cron || '';
}

// Returns the next approximate run time as a human string.
// Lightweight preview only -- not a full cron parser.
// Preset crons return a description; custom returns the raw expression.
function cronNextPreview(cron) {
  if (!cron) return '';
  if (CRON_LABELS[cron]) return 'Next: ' + CRON_LABELS[cron].toLowerCase();
  return 'Custom expression: ' + cron;
}

function formatScheduleDatetime(isoStr) {
  if (!isoStr) return '\u2014';
  try {
    return new Date(isoStr).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    return isoStr;
  }
}

function scheduleStatusBadge(schedule) {
  var badge = document.createElement('span');
  badge.className = 'badge';

  if (!schedule.active) {
    badge.classList.add('badge--skip');
    badge.textContent = 'Paused';
    return badge;
  }

  if (!schedule.lastRunAt) {
    badge.classList.add('badge--pass');
    badge.textContent = 'Pending';
    return badge;
  }

  if (schedule.lastRunStatus === 'failed') {
    badge.classList.add('badge--fail');
    badge.textContent = 'Error';
    return badge;
  }

  badge.classList.add('badge--pass');
  badge.textContent = 'Active';
  return badge;
}

// ---------------------------------------------------------------------------
// renderSchedules() -- builds DOM skeleton for the schedules view
// ---------------------------------------------------------------------------

function renderSchedules() {
  document.title = 'Schedules \u2014 WRL';

  var view = document.getElementById('view');
  // Safe: clearing the static view container; no user or API data involved
  view.textContent = '';

  // aria-live region for status announcements (sr-only, not visible)
  var liveEl = document.createElement('div');
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  liveEl.className = 'sr-only';
  liveEl.id = 'schedules-live';
  view.appendChild(liveEl);
  _schedulesLiveEl = liveEl;

  // Page heading
  var h1 = document.createElement('h1');
  h1.className = 'captures-heading';
  h1.tabIndex = -1;
  h1.textContent = 'Schedules';
  view.appendChild(h1);

  // --- Create form section ---
  var formSection = document.createElement('section');
  formSection.setAttribute('aria-label', 'Create new schedule');
  formSection.className = 'schedule-form-section card';

  var formH2 = document.createElement('h2');
  formH2.className = 'settings-section-heading';
  formH2.textContent = 'Create new schedule';
  formSection.appendChild(formH2);

  var form = document.createElement('form');
  form.id = 'schedule-create-form';
  form.className = 'schedule-form';
  form.noValidate = true;

  // URL input
  var urlLabel = document.createElement('label');
  urlLabel.htmlFor = 'schedule-url';
  urlLabel.className = 'schedule-field-label';
  urlLabel.textContent = 'URL to capture';
  form.appendChild(urlLabel);

  var urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.id = 'schedule-url';
  urlInput.className = 'input';
  urlInput.placeholder = 'https://example.com';
  urlInput.autocomplete = 'url';
  urlInput.required = true;
  form.appendChild(urlInput);

  // Frequency select
  var freqLabel = document.createElement('label');
  freqLabel.htmlFor = 'schedule-freq';
  freqLabel.className = 'schedule-field-label';
  freqLabel.textContent = 'Capture frequency';
  form.appendChild(freqLabel);

  var freqSelect = document.createElement('select');
  freqSelect.id = 'schedule-freq';
  freqSelect.className = 'input';

  var freqOptions = [
    { label: 'Every hour',            value: '0 * * * *' },
    { label: 'Every 6 hours',         value: '0 */6 * * *' },
    { label: 'Every 12 hours',        value: '0 */12 * * *' },
    { label: 'Daily at midnight UTC', value: '0 0 * * *' },
    { label: 'Weekly on Monday',      value: '0 0 * * 1' },
    { label: 'Custom...',             value: '__custom__' },
  ];

  for (var i = 0; i < freqOptions.length; i++) {
    var opt = document.createElement('option');
    opt.value = freqOptions[i].value;
    opt.textContent = freqOptions[i].label;
    freqSelect.appendChild(opt);
  }
  form.appendChild(freqSelect);

  // Custom cron input (hidden until Custom is selected)
  var customCronWrap = document.createElement('div');
  customCronWrap.id = 'schedule-cron-custom-wrap';
  customCronWrap.style.display = 'none';

  var customCronLabel = document.createElement('label');
  customCronLabel.htmlFor = 'schedule-cron-custom';
  customCronLabel.className = 'schedule-field-label';
  customCronLabel.textContent = 'Custom cron expression';
  customCronWrap.appendChild(customCronLabel);

  var customCronInput = document.createElement('input');
  customCronInput.type = 'text';
  customCronInput.id = 'schedule-cron-custom';
  customCronInput.className = 'input';
  customCronInput.placeholder = '0 8 * * 1-5';
  customCronInput.setAttribute('aria-describedby', 'schedule-cron-hint');
  customCronWrap.appendChild(customCronInput);

  var customCronHint = document.createElement('p');
  customCronHint.id = 'schedule-cron-hint';
  customCronHint.className = 'schedule-form-preview';
  customCronHint.textContent = '5-field cron, e.g. 0 8 * * 1-5. Minimum interval: 1 hour.';
  customCronWrap.appendChild(customCronHint);

  form.appendChild(customCronWrap);

  // "Next capture" preview
  var previewEl = document.createElement('p');
  previewEl.id = 'schedule-next-preview';
  previewEl.className = 'schedule-form-preview';
  previewEl.setAttribute('aria-live', 'polite');
  previewEl.textContent = cronNextPreview(freqSelect.value);
  form.appendChild(previewEl);

  // Name input
  var nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'schedule-name';
  nameLabel.className = 'schedule-field-label';
  nameLabel.textContent = 'Schedule name';
  form.appendChild(nameLabel);

  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'schedule-name';
  nameInput.className = 'input';
  nameInput.placeholder = 'e.g. Daily homepage check';
  nameInput.required = true;
  nameInput.maxLength = 128;
  form.appendChild(nameInput);

  // Form status region (success / error announcements)
  var statusEl = document.createElement('div');
  statusEl.id = 'schedule-form-status';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  statusEl.className = 'sr-only';
  form.appendChild(statusEl);

  // Inline error display
  var formErrorEl = document.createElement('div');
  formErrorEl.id = 'schedule-form-error';
  formErrorEl.className = 'alert alert--error';
  formErrorEl.setAttribute('role', 'alert');
  formErrorEl.style.display = 'none';
  form.appendChild(formErrorEl);

  // Submit button
  var createBtn = document.createElement('button');
  createBtn.type = 'submit';
  createBtn.id = 'schedule-create-btn';
  createBtn.className = 'btn btn--primary';
  createBtn.textContent = 'Create Schedule';
  form.appendChild(createBtn);

  formSection.appendChild(form);
  view.appendChild(formSection);

  // --- Limit indicator ---
  var limitEl = document.createElement('p');
  limitEl.id = 'schedule-limit';
  limitEl.className = 'captures-count';
  limitEl.textContent = '';
  view.appendChild(limitEl);

  // --- List section ---
  var listSection = document.createElement('section');
  listSection.setAttribute('aria-label', 'Schedules list');

  // Column header row
  var headerRow = document.createElement('div');
  headerRow.className = 'schedule-header-row';
  headerRow.setAttribute('aria-hidden', 'true');

  var hUrl = document.createElement('span');
  hUrl.className = 'schedule-col-url';
  hUrl.textContent = 'URL';
  headerRow.appendChild(hUrl);

  var hFreq = document.createElement('span');
  hFreq.className = 'schedule-col-freq';
  hFreq.textContent = 'Frequency';
  headerRow.appendChild(hFreq);

  var hNext = document.createElement('span');
  hNext.className = 'schedule-col-next';
  hNext.textContent = 'Next Run';
  headerRow.appendChild(hNext);

  var hActions = document.createElement('span');
  hActions.className = 'schedule-col-actions';
  hActions.textContent = 'Actions';
  headerRow.appendChild(hActions);

  listSection.appendChild(headerRow);

  // List container
  var listEl = document.createElement('div');
  listEl.id = 'schedule-list';
  listEl.className = 'schedule-list';
  listEl.setAttribute('role', 'list');

  var emptyEl = document.createElement('p');
  emptyEl.id = 'schedule-list-empty';
  emptyEl.className = 'capture-empty';
  emptyEl.textContent = 'No scheduled captures yet.';
  listEl.appendChild(emptyEl);

  listSection.appendChild(listEl);
  view.appendChild(listSection);

  // Stash refs on form for mountSchedules
  form._urlInput = urlInput;
  form._freqSelect = freqSelect;
  form._customCronWrap = customCronWrap;
  form._customCronInput = customCronInput;
  form._previewEl = previewEl;
  form._nameInput = nameInput;
  form._statusEl = statusEl;
  form._formErrorEl = formErrorEl;
  form._createBtn = createBtn;
  form._limitEl = limitEl;
  form._listEl = listEl;

  h1.focus();
}

// ---------------------------------------------------------------------------
// buildScheduleRow -- single schedule row with inline delete confirmation
// ---------------------------------------------------------------------------

function buildScheduleRow(schedule, listEl) {
  var row = document.createElement('div');
  row.className = 'schedule-item';
  row.setAttribute('role', 'listitem');
  row.dataset.scheduleId = schedule.id || '';

  // URL cell
  var urlCell = document.createElement('span');
  urlCell.className = 'schedule-col-url schedule-url-cell';
  urlCell.title = schedule.url || '';

  var urlText = document.createElement('span');
  urlText.className = 'schedule-url-text';
  urlText.textContent = schedule.url || '(no URL)';
  urlCell.appendChild(urlText);

  if (schedule.name) {
    var nameText = document.createElement('span');
    nameText.className = 'schedule-name-text';
    nameText.textContent = schedule.name;
    urlCell.appendChild(nameText);
  }

  row.appendChild(urlCell);

  // Frequency cell
  var freqCell = document.createElement('span');
  freqCell.className = 'schedule-col-freq';
  freqCell.textContent = cronToLabel(schedule.cron);
  row.appendChild(freqCell);

  // Next run cell
  var nextCell = document.createElement('span');
  nextCell.className = 'schedule-col-next';
  nextCell.textContent = formatScheduleDatetime(schedule.nextRunAt);
  row.appendChild(nextCell);

  // Actions cell
  var actionsCell = document.createElement('div');
  actionsCell.className = 'schedule-col-actions schedule-actions';

  // Status badge
  actionsCell.appendChild(scheduleStatusBadge(schedule));

  // Delete button
  var deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn--ghost btn--sm schedule-delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.setAttribute('aria-label', 'Delete schedule for ' + (schedule.url || 'this URL'));

  // Inline confirmation area
  var confirmArea = document.createElement('div');
  confirmArea.className = 'settings-confirm';
  confirmArea.style.display = 'none';
  confirmArea.setAttribute('role', 'group');
  confirmArea.setAttribute('aria-label', 'Confirm schedule deletion');

  var confirmText = document.createElement('span');
  confirmText.className = 'settings-confirm-text';
  confirmText.textContent = 'Delete this schedule?';
  confirmArea.appendChild(confirmText);

  var confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn--primary btn--sm schedule-confirm-delete';
  confirmBtn.textContent = 'Delete';
  confirmArea.appendChild(confirmBtn);

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--ghost btn--sm schedule-cancel-delete';
  cancelBtn.textContent = 'Cancel';
  confirmArea.appendChild(cancelBtn);

  // Show confirmation on delete click
  deleteBtn.addEventListener('click', function() {
    deleteBtn.style.display = 'none';
    confirmArea.style.display = '';
    // Focus Cancel -- safer action gets focus
    cancelBtn.focus();
  });

  // Cancel restores the delete button
  cancelBtn.addEventListener('click', function() {
    confirmArea.style.display = 'none';
    deleteBtn.style.display = '';
    deleteBtn.focus();
  });

  // Confirm deletes via API
  confirmBtn.addEventListener('click', function() {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
    cancelBtn.disabled = true;

    var scheduleId = schedule.id || '';
    apiFetch('/v1/schedules/' + encodeURIComponent(scheduleId), {
      method: 'DELETE',
    }).then(function(res) {
      if (!res) return; // 401 handled by apiFetch

      if (res.ok || res.status === 204) {
        // Remove from _schedules array
        for (var k = 0; k < _schedules.length; k++) {
          if (_schedules[k].id === scheduleId) {
            _schedules.splice(k, 1);
            break;
          }
        }
        // Remove row from DOM
        row.remove();

        // Update count
        updateScheduleCount();

        // Show empty state if no schedules remain
        if (_schedules.length === 0) {
          var currentListEl = document.getElementById('schedule-list');
          if (currentListEl) {
            var empty = document.createElement('p');
            empty.id = 'schedule-list-empty';
            empty.className = 'capture-empty';
            empty.textContent = 'No scheduled captures yet.';
            currentListEl.appendChild(empty);
          }
        }

        schedulesAnnounce('Schedule deleted.');
        return;
      }

      // Error response
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete';
      cancelBtn.disabled = false;
      schedulesAnnounce('Could not delete schedule (HTTP ' + res.status + '). Try again.');
    }).catch(function() {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete';
      cancelBtn.disabled = false;
      schedulesAnnounce('Connection failed deleting schedule. Check your network.');
    });
  });

  actionsCell.appendChild(deleteBtn);
  actionsCell.appendChild(confirmArea);
  row.appendChild(actionsCell);

  return row;
}

// ---------------------------------------------------------------------------
// updateScheduleCount -- update the "N of M schedules" indicator
// ---------------------------------------------------------------------------

function updateScheduleCount() {
  var limitEl = document.getElementById('schedule-limit');
  if (!limitEl) return;
  limitEl.textContent = _schedules.length + ' of ' + _scheduleLimit + ' schedules';
}

// ---------------------------------------------------------------------------
// populateScheduleList -- render rows into the list element
// ---------------------------------------------------------------------------

function populateScheduleList(listEl, schedules) {
  // Remove empty state if present
  var existingEmpty = document.getElementById('schedule-list-empty');
  if (existingEmpty) existingEmpty.remove();

  if (!schedules || schedules.length === 0) {
    var emptyEl = document.createElement('p');
    emptyEl.id = 'schedule-list-empty';
    emptyEl.className = 'capture-empty';
    emptyEl.textContent = 'No scheduled captures yet.';
    listEl.appendChild(emptyEl);
    return;
  }

  for (var i = 0; i < schedules.length; i++) {
    listEl.appendChild(buildScheduleRow(schedules[i], listEl));
  }
}

// ---------------------------------------------------------------------------
// mountSchedules() -- wire events and fetch data
// ---------------------------------------------------------------------------

function mountSchedules() {
  var form = document.getElementById('schedule-create-form');
  if (!form) return;

  var listEl = form._listEl;

  // Fetch existing schedules
  apiFetch('/v1/schedules').then(function(res) {
    if (!res) return; // 401 handled

    if (!res.ok) {
      schedulesAnnounce('Could not load schedules.');
      return;
    }

    return res.json().then(function(body) {
      _schedules = (body && body.data) ? body.data : (Array.isArray(body) ? body : []);
      _scheduleLimit = (body && body.limit) ? body.limit : _scheduleLimit;

      populateScheduleList(listEl, _schedules);
      updateScheduleCount();
    });
  }).catch(function() {
    schedulesAnnounce('Connection failed loading schedules. Check your network.');
    var errEl = document.createElement('p');
    errEl.className = 'capture-load-error';
    errEl.textContent = 'Could not load schedules. Check your connection.';
    listEl.appendChild(errEl);
  });

  // Wire frequency select: show/hide custom input, update preview
  form._freqSelect.addEventListener('change', function() {
    var isCustom = form._freqSelect.value === '__custom__';
    form._customCronWrap.style.display = isCustom ? '' : 'none';

    if (isCustom) {
      form._customCronInput.required = true;
      form._previewEl.textContent = 'Enter your cron expression above.';
    } else {
      form._customCronInput.required = false;
      form._previewEl.textContent = cronNextPreview(form._freqSelect.value);
    }
  });

  form._customCronInput.addEventListener('input', function() {
    var val = form._customCronInput.value.trim();
    form._previewEl.textContent = val ? cronNextPreview(val) : 'Enter your cron expression above.';
  });

  // Wire form submission
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    handleCreateSchedule(form);
  });
}

// ---------------------------------------------------------------------------
// handleCreateSchedule -- submit create schedule form
// ---------------------------------------------------------------------------

function handleCreateSchedule(form) {
  var urlInput = form._urlInput;
  var freqSelect = form._freqSelect;
  var customCronInput = form._customCronInput;
  var nameInput = form._nameInput;
  var statusEl = form._statusEl;
  var formErrorEl = form._formErrorEl;
  var createBtn = form._createBtn;
  var listEl = form._listEl;

  // Clear previous error
  formErrorEl.style.display = 'none';
  formErrorEl.textContent = '';
  statusEl.textContent = '';

  // Validate URL
  var rawUrl = urlInput.value.trim();
  if (!rawUrl) {
    formErrorEl.textContent = 'URL is required.';
    formErrorEl.style.display = '';
    urlInput.focus();
    return;
  }
  try {
    var parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('bad protocol');
    }
  } catch (e) {
    formErrorEl.textContent = 'Enter a valid http:// or https:// URL.';
    formErrorEl.style.display = '';
    urlInput.focus();
    return;
  }

  // Determine cron expression
  var cron;
  if (freqSelect.value === '__custom__') {
    cron = customCronInput.value.trim();
    if (!cron) {
      formErrorEl.textContent = 'Custom cron expression is required.';
      formErrorEl.style.display = '';
      customCronInput.focus();
      return;
    }
  } else {
    cron = freqSelect.value;
  }

  // Validate name
  var name = nameInput.value.trim();
  if (!name) {
    formErrorEl.textContent = 'Schedule name is required.';
    formErrorEl.style.display = '';
    nameInput.focus();
    return;
  }

  // Check schedule limit
  if (_schedules.length >= _scheduleLimit) {
    formErrorEl.textContent = 'Schedule limit reached (' + _scheduleLimit + '). Delete an existing schedule first.';
    formErrorEl.style.display = '';
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  apiFetch('/v1/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: rawUrl, cron: cron, name: name }),
  }).then(function(res) {
    if (!res) {
      createBtn.disabled = false;
      createBtn.textContent = 'Create Schedule';
      return;
    }

    createBtn.disabled = false;
    createBtn.textContent = 'Create Schedule';

    if (res.status === 201 || res.status === 200) {
      return res.json().then(function(data) {
        var newSchedule = data || {};

        // Remove empty state
        var existingEmpty = document.getElementById('schedule-list-empty');
        if (existingEmpty) existingEmpty.remove();

        // Prepend to list and state
        _schedules.unshift(newSchedule);
        var newRow = buildScheduleRow(newSchedule, listEl);
        if (listEl.firstChild) {
          listEl.insertBefore(newRow, listEl.firstChild);
        } else {
          listEl.appendChild(newRow);
        }

        // Reset form
        urlInput.value = '';
        nameInput.value = '';
        freqSelect.selectedIndex = 0;
        form._customCronWrap.style.display = 'none';
        customCronInput.value = '';
        form._previewEl.textContent = cronNextPreview(freqSelect.value);

        // Update count
        updateScheduleCount();

        // Announce success via status region
        statusEl.textContent = '';
        setTimeout(function() { statusEl.textContent = 'Schedule created.'; }, 50);
        schedulesAnnounce('Schedule created.');
      });
    }

    // Error response
    return res.json().then(function(data) {
      var detail;
      if (res.status === 429) {
        detail = 'Schedule limit reached. Delete an existing schedule first.';
      } else if (res.status === 400) {
        detail = (data && data.detail) ? data.detail : 'Invalid schedule data. Check the URL and cron expression.';
      } else {
        detail = (data && data.detail) ? data.detail : 'Could not create schedule (HTTP ' + res.status + ').';
      }
      formErrorEl.textContent = detail.length > 200 ? detail.slice(0, 200) + '...' : detail;
      formErrorEl.style.display = '';
    }).catch(function() {
      formErrorEl.textContent = 'Could not create schedule (HTTP ' + res.status + ').';
      formErrorEl.style.display = '';
    });
  }).catch(function() {
    createBtn.disabled = false;
    createBtn.textContent = 'Create Schedule';
    formErrorEl.textContent = 'Connection failed. Check your network.';
    formErrorEl.style.display = '';
  });
}
`;
