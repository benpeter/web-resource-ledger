// tva
// Combined capture submission form + capture list view.
// Exports a JS string constant for inline use in the HTML shell.

export const SUBMIT_VIEW_JS = `
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeUrl(urlStr) {
  try {
    var u = new URL(urlStr);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch (e) {
    return null;
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}

function relativeTime(isoStr) {
  if (!isoStr) return '';
  var diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 5)   return 'just now';
  if (diff < 60)  return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

// Loaded captures and pagination
var _captures = [];
var _totalCount = 0;
var _hasMore = false;
var _currentOffset = 0;
var _listEl = null;    // the capture-list element
var _countEl = null;   // the count display element
var _moreBtn = null;   // "Load more" button
var _liveEl = null;    // aria-live region
var _elapsedTimers = {}; // captureId -> intervalId for "Capturing... Ns" labels

// ---------------------------------------------------------------------------
// Elapsed time ticker for pending items
// ---------------------------------------------------------------------------

function startElapsedTimer(captureId, enqueuedAt, badgeEl) {
  stopElapsedTimer(captureId);
  var startedAt = enqueuedAt || Date.now();
  _elapsedTimers[captureId] = setInterval(function() {
    var secs = Math.floor((Date.now() - startedAt) / 1000);
    badgeEl.textContent = 'Capturing... ' + secs + 's';
  }, 1000);
}

function stopElapsedTimer(captureId) {
  if (_elapsedTimers[captureId]) {
    clearInterval(_elapsedTimers[captureId]);
    delete _elapsedTimers[captureId];
  }
}

function stopAllElapsedTimers() {
  var ids = Object.keys(_elapsedTimers);
  for (var i = 0; i < ids.length; i++) {
    clearInterval(_elapsedTimers[ids[i]]);
  }
  _elapsedTimers = {};
}

// ---------------------------------------------------------------------------
// Build a single capture list item element
// ---------------------------------------------------------------------------

function buildCaptureItem(capture) {
  var item = document.createElement('a');
  item.className = 'capture-item';
  item.setAttribute('href', '#/captures/' + capture.id);
  item.dataset.captureId = capture.id;

  // URL cell
  var urlCell = document.createElement('span');
  urlCell.className = 'capture-url';
  urlCell.title = capture.url || '';

  var urlSpan = document.createElement('span');
  urlSpan.textContent = capture.url || '(unknown URL)';
  urlCell.appendChild(urlSpan);

  if (capture.scheduleId) {
    var scheduledLabel = document.createElement('span');
    scheduledLabel.className = 'capture-scheduled-label';
    scheduledLabel.textContent = 'Scheduled';
    urlCell.appendChild(scheduledLabel);
  }

  item.appendChild(urlCell);

  // Time cell
  var timeCell = document.createElement('span');
  timeCell.className = 'capture-time';
  var ts = capture.completedAt || capture.failedAt || capture.createdAt;
  if (ts) {
    timeCell.textContent = relativeTime(ts);
    timeCell.title = ts;
  } else {
    timeCell.textContent = '';
  }
  item.appendChild(timeCell);

  // Badge cell
  var badgeCell = document.createElement('span');
  badgeCell.className = 'capture-badge';

  var badge = document.createElement('span');
  if (capture.status === 'complete') {
    badge.className = 'badge badge--pass';
    badge.textContent = 'Complete';
  } else if (capture.status === 'failed') {
    badge.className = 'badge badge--fail';
    badge.textContent = 'Failed';
  } else {
    badge.className = 'badge badge--skip';
    badge.textContent = 'Pending';
  }
  badge.dataset.badge = '1';
  badgeCell.appendChild(badge);
  item.appendChild(badgeCell);

  return item;
}

// ---------------------------------------------------------------------------
// Update an existing item row in-place after polling resolves
// ---------------------------------------------------------------------------

function updateCaptureItem(captureId, statusData) {
  stopElapsedTimer(captureId);

  var item = _listEl && _listEl.querySelector('[data-capture-id="' + captureId + '"]');
  if (!item) return;

  var badge = item.querySelector('[data-badge]');
  if (!badge) return;

  var timeCell = item.querySelector('.capture-time');

  if (statusData.status === 'complete') {
    badge.className = 'badge badge--pass';
    badge.textContent = 'Complete';
    if (timeCell) {
      timeCell.textContent = relativeTime(new Date().toISOString());
      timeCell.title = new Date().toISOString();
    }
    announce('Capture complete.');
  } else if (statusData.status === 'failed') {
    badge.className = 'badge badge--fail';
    badge.textContent = 'Failed';
    if (timeCell) {
      timeCell.textContent = relativeTime(new Date().toISOString());
      timeCell.title = new Date().toISOString();
    }
    announce('Capture failed.');
  } else if (statusData.status === 'timeout') {
    badge.className = 'badge badge--skip';
    badge.textContent = 'Pending';
    announce('Capture is taking longer than expected. ID: ' + captureId);
    var msg = document.createElement('span');
    msg.className = 'capture-timeout-note';
    msg.textContent = 'Taking longer than expected. Capture ID: ' + captureId;
    item.appendChild(msg);
  } else if (statusData.status === 'poll_error') {
    badge.className = 'badge badge--skip';
    badge.textContent = 'Pending';
  }
}

// ---------------------------------------------------------------------------
// aria-live announcements
// ---------------------------------------------------------------------------

function announce(message) {
  if (!_liveEl) return;
  // Clear then set so screen readers re-announce identical strings
  _liveEl.textContent = '';
  setTimeout(function() { _liveEl.textContent = message; }, 50);
}

// ---------------------------------------------------------------------------
// Update the count line
// ---------------------------------------------------------------------------

function updateCount() {
  if (!_countEl) return;
  var shown = _captures.length;
  if (_totalCount > 0) {
    _countEl.textContent = 'Showing ' + shown + ' of ' + _totalCount + ' capture' + (_totalCount !== 1 ? 's' : '');
    _countEl.style.display = '';
  } else {
    _countEl.textContent = '';
    _countEl.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// Prepend a pending item (optimistic UI) and start polling
// ---------------------------------------------------------------------------

function prependPendingItem(captureId, url) {
  var fakeCapture = { id: captureId, url: url, status: 'pending', createdAt: new Date().toISOString() };
  _captures.unshift(fakeCapture);
  _totalCount++;

  var item = buildCaptureItem(fakeCapture);
  var badge = item.querySelector('[data-badge]');

  if (_listEl) {
    // Remove empty state guidance if present
    var guidance = _listEl.querySelector('.capture-empty');
    if (guidance) guidance.remove();

    _listEl.insertBefore(item, _listEl.firstChild);
  }

  updateCount();

  // Start elapsed timer on the badge
  if (badge) {
    badge.textContent = 'Capturing... 0s';
    startElapsedTimer(captureId, Date.now(), badge);
  }

  // Poll for resolution
  startPolling(captureId, function(statusData) {
    updateCaptureItem(captureId, statusData);
  });
}

// ---------------------------------------------------------------------------
// Append page of captures
// ---------------------------------------------------------------------------

function appendCaptures(items) {
  if (!_listEl) return;
  for (var i = 0; i < items.length; i++) {
    var item = buildCaptureItem(items[i]);
    _listEl.appendChild(item);

    // Start polling for any pending items in the loaded list
    if (items[i].status === 'pending') {
      var badge = item.querySelector('[data-badge]');
      if (badge) {
        badge.textContent = 'Capturing... 0s';
        startElapsedTimer(items[i].id, Date.now(), badge);
      }
      (function(cid) {
        startPolling(cid, function(statusData) {
          updateCaptureItem(cid, statusData);
        });
      }(items[i].id));
    }
  }
}

// ---------------------------------------------------------------------------
// Load the initial page of captures
// ---------------------------------------------------------------------------

function loadCaptures() {
  apiFetch('/v1/captures?limit=20').then(function(res) {
    if (!res.ok) return;
    return res.json();
  }).then(function(body) {
    if (!body) return;

    var items = body.data || [];
    _totalCount = (body.pagination && body.pagination.total) || items.length;
    _hasMore = (body.pagination && body.pagination.hasMore) || false;
    _currentOffset = items.length;
    _captures = items.slice();

    if (items.length === 0) {
      var guidance = document.createElement('p');
      guidance.className = 'capture-empty';
      guidance.textContent = 'Submit a URL above to create your first capture. The page will be captured with a screenshot and cryptographic verification.';
      if (_listEl) _listEl.appendChild(guidance);
    } else {
      appendCaptures(items);
    }

    updateCount();
    updateMoreBtn();
  }).catch(function() {
    if (_listEl) {
      var errEl = document.createElement('p');
      errEl.className = 'capture-load-error';
      errEl.textContent = 'Could not load captures. Check your connection.';
      _listEl.appendChild(errEl);
    }
  });
}

// ---------------------------------------------------------------------------
// "Load more" pagination
// ---------------------------------------------------------------------------

function updateMoreBtn() {
  if (!_moreBtn) return;
  _moreBtn.style.display = _hasMore ? '' : 'none';
}

function loadMoreCaptures() {
  if (!_hasMore) return;
  _moreBtn.disabled = true;
  _moreBtn.textContent = 'Loading...';

  apiFetch('/v1/captures?limit=20&offset=' + _currentOffset).then(function(res) {
    if (!res.ok) return;
    return res.json();
  }).then(function(body) {
    if (!body) return;

    var items = body.data || [];
    _hasMore = (body.pagination && body.pagination.hasMore) || false;
    _currentOffset += items.length;
    _captures = _captures.concat(items);

    appendCaptures(items);
    updateCount();
    updateMoreBtn();

    _moreBtn.disabled = false;
    _moreBtn.textContent = 'Load more';
  }).catch(function(err) {
    _moreBtn.disabled = false;
    _moreBtn.textContent = 'Load more';
    var isTimeout = err && err.message === 'fetch_timeout';
    showGlobalError(isTimeout
      ? 'Connection timed out. Check your network.'
      : 'Could not load more captures. Check your connection.');
  });
}

// ---------------------------------------------------------------------------
// Form submission handler
// ---------------------------------------------------------------------------

function handleSubmit(urlInput, submitBtn, formErrorEl) {
  var raw = urlInput.value.trim();

  // Clear previous error
  formErrorEl.style.display = 'none';
  urlInput.classList.remove('input--error');

  // Validate URL
  var safe = safeUrl(raw);
  if (!raw || !safe) {
    formErrorEl.textContent = 'Enter a valid http:// or https:// URL.';
    formErrorEl.style.display = '';
    urlInput.classList.add('input--error');
    urlInput.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Capturing...';

  apiFetch('/v1/captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: safe }),
  }).then(function(res) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Capture';

    if (res.status === 201 || res.status === 202) {
      return res.json().then(function(data) {
        var captureId = data && data.id;
        if (!captureId) return;

        // Clear input; keep focus for rapid multi-submission
        urlInput.value = '';
        urlInput.focus();
        formErrorEl.style.display = 'none';

        prependPendingItem(captureId, safe);
        announce('Capture submitted.');
      });
    }

    // Error response: show detail from Problem Details JSON
    return res.json().then(function(data) {
      var detail;
      // 429 with limitType: 'quota' means monthly capture limit reached
      if (res.status === 429 && data && data.limitType === 'quota') {
        var resetDate = data.resetsAt ? formatDate(data.resetsAt) : '';
        detail = 'Monthly capture limit reached.' +
          (resetDate ? ' Your quota resets on ' + resetDate + '.' : '') +
          ' View usage in Settings.';
      } else {
        detail = (data && data.detail) ? truncate(data.detail, 200) : 'Request failed (HTTP ' + res.status + ').';
      }
      formErrorEl.textContent = detail;
      formErrorEl.style.display = '';
      urlInput.focus();
    }).catch(function() {
      formErrorEl.textContent = 'Request failed (HTTP ' + res.status + ').';
      formErrorEl.style.display = '';
      urlInput.focus();
    });
  }).catch(function() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Capture';
    formErrorEl.textContent = 'Connection failed.';
    formErrorEl.style.display = '';
    urlInput.focus();
  });
}

// ---------------------------------------------------------------------------
// renderCaptures() -- builds DOM for the combined view
// ---------------------------------------------------------------------------

function renderCaptures() {
  stopAllPolling();
  stopAllElapsedTimers();

  // Reset module state
  _captures = [];
  _totalCount = 0;
  _hasMore = false;
  _currentOffset = 0;
  _listEl = null;
  _countEl = null;
  _moreBtn = null;

  var view = document.getElementById('view');
  // Safe: clearing the static view container; no user or API data involved
  view.innerHTML = '';

  document.title = 'Captures - Web Resource Ledger';

  // aria-live region for status announcements (sr-only, not visible)
  var liveEl = document.createElement('div');
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  liveEl.className = 'sr-only';
  liveEl.id = 'captures-live';
  view.appendChild(liveEl);
  _liveEl = liveEl;

  // Page heading
  var h1 = document.createElement('h1');
  h1.className = 'captures-heading';
  h1.tabIndex = -1;
  h1.textContent = 'Captures';
  view.appendChild(h1);

  // --- Submit form section ---
  var formSection = document.createElement('section');
  formSection.className = 'captures-form-section';
  formSection.setAttribute('aria-label', 'Submit a new capture');

  var form = document.createElement('form');
  form.id = 'capture-form';
  form.noValidate = true;

  var inputRow = document.createElement('div');
  inputRow.className = 'capture-form-row';

  var urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'input';
  urlInput.placeholder = 'https://example.com';
  urlInput.setAttribute('aria-label', 'URL to capture');
  urlInput.autocomplete = 'url';
  urlInput.id = 'capture-url-input';
  inputRow.appendChild(urlInput);

  var submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn--primary';
  submitBtn.textContent = 'Capture';
  inputRow.appendChild(submitBtn);

  form.appendChild(inputRow);

  var formErrorEl = document.createElement('div');
  formErrorEl.className = 'alert alert--error capture-form-error';
  formErrorEl.setAttribute('role', 'alert');
  formErrorEl.setAttribute('aria-live', 'polite');
  formErrorEl.style.display = 'none';
  form.appendChild(formErrorEl);

  formSection.appendChild(form);
  view.appendChild(formSection);

  // --- List section ---
  var listSection = document.createElement('section');
  listSection.className = 'captures-list-section';
  listSection.setAttribute('aria-label', 'Captures list');

  // Column header row (hidden on mobile via CSS)
  var headerRow = document.createElement('div');
  headerRow.className = 'capture-header-row';
  headerRow.setAttribute('aria-hidden', 'true');

  var hUrl = document.createElement('span');
  hUrl.className = 'capture-url';
  hUrl.textContent = 'URL';
  headerRow.appendChild(hUrl);

  var hTime = document.createElement('span');
  hTime.className = 'capture-time';
  hTime.textContent = 'Time';
  headerRow.appendChild(hTime);

  var hBadge = document.createElement('span');
  hBadge.className = 'capture-badge';
  hBadge.textContent = 'Status';
  headerRow.appendChild(hBadge);

  listSection.appendChild(headerRow);

  // Count line
  var countEl = document.createElement('p');
  countEl.className = 'captures-count';
  listSection.appendChild(countEl);
  _countEl = countEl;

  // List container
  var listEl = document.createElement('div');
  listEl.className = 'capture-list';
  listEl.setAttribute('role', 'list');
  listSection.appendChild(listEl);
  _listEl = listEl;

  // "Load more" button
  var moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'btn btn--ghost captures-more-btn';
  moreBtn.textContent = 'Load more';
  moreBtn.style.display = 'none';
  listSection.appendChild(moreBtn);
  _moreBtn = moreBtn;

  view.appendChild(listSection);

  // Stash refs on form element so mountCaptures can retrieve them
  form._urlInput = urlInput;
  form._submitBtn = submitBtn;
  form._formErrorEl = formErrorEl;

  h1.focus();
}

// ---------------------------------------------------------------------------
// mountCaptures() -- wire events and start initial data load
// ---------------------------------------------------------------------------

function mountCaptures() {
  var form = document.getElementById('capture-form');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    handleSubmit(form._urlInput, form._submitBtn, form._formErrorEl);
  });

  if (_moreBtn) {
    _moreBtn.addEventListener('click', loadMoreCaptures);
  }

  loadCaptures();
}
`;
