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
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch (e) {
    if (urlStr && urlStr.indexOf('://') === -1) {
      try {
        var u2 = new URL('https://' + urlStr);
        if (u2.protocol === 'https:') return u2.href;
      } catch (e2) { /* fall through */ }
    }
  }
  return null;
}

function submit_formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}

function submit_quotaMessage(data) {
  var quota = (data && data.quota) || {};
  var resetDate = quota.resetsAt ? submit_formatDate(quota.resetsAt) : '';
  var needsPayment = !!(data && typeof data.detail === 'string' && data.detail.indexOf('Add a payment method') !== -1);
  return (quota.resource === 'storage' ? 'Monthly storage limit reached.' : 'Monthly capture limit reached.') +
    (resetDate ? ' Your quota resets on ' + resetDate + '.' : '') +
    (needsPayment ? ' Add a payment method in Settings to keep capturing.' : ' View usage in Settings.');
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

  // Change badge: shown when changeSummary is present and status is complete
  if (capture.status === 'complete' && capture.changeSummary) {
    var cs = capture.changeSummary;
    if (cs.changed === true && cs.previousCaptureId) {
      var changeBadge = document.createElement('a');
      changeBadge.className = 'badge badge--change-link';
      changeBadge.href = '#/diff/' + cs.previousCaptureId + '/' + capture.id;
      changeBadge.textContent = 'Changed';
      changeBadge.setAttribute('aria-label', 'View changes from previous capture');
      // Prevent capture item link navigation when clicking the badge
      changeBadge.addEventListener('click', function(e) { e.stopPropagation(); });
      badgeCell.appendChild(changeBadge);
    } else if (cs.changed === false) {
      var unchangedBadge = document.createElement('span');
      unchangedBadge.className = 'badge badge--unchanged';
      unchangedBadge.textContent = 'Unchanged';
      badgeCell.appendChild(unchangedBadge);
    }
  }

  item.appendChild(badgeCell);

  var failReason = submit_failReason(capture);
  if (failReason) item.appendChild(submit_failReasonEl(failReason));

  return item;
}

// Why a capture failed, for the capture list. null when it did not fail.
function submit_failReason(capture) {
  if (!capture || capture.status !== 'failed') return null;
  return capture.error || 'No reason was recorded.';
}

function submit_failReasonEl(text) {
  var el = document.createElement('span');
  el.className = 'capture-fail-reason';
  el.textContent = text;
  return el;
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
    var reason = submit_failReason({ status: 'failed', error: statusData.error });
    if (!item.querySelector('.capture-fail-reason')) item.appendChild(submit_failReasonEl(reason));
    announce('Capture failed: ' + reason);
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
    formErrorEl.textContent = 'Enter a valid URL (e.g. example.com or https://example.com).';
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
      // 429 with limitType: 'quota' means a monthly capture or storage limit was reached
      if (res.status === 429 && data && data.limitType === 'quota') {
        detail = submit_quotaMessage(data);
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
// Bulk capture (phase 0130): a pasted URL list or a sitemap, submitted in
// batches paced by the per-minute rate limit the API reports.
// ---------------------------------------------------------------------------

var BULK_MAX_URLS = 200;
var BULK_MAX_BATCH = 20;
var BULK_DEFAULT_PER_MINUTE = 10;

function bulk_parseList(text) {
  var urls = [];
  var invalid = [];
  var seen = {};
  var capped = false;
  String(text || '').split(/\\r?\\n/).forEach(function(line) {
    var raw = line.trim();
    if (!raw) return;
    var safe = safeUrl(raw);
    if (!safe) { invalid.push(raw); return; }
    if (seen[safe]) return;
    seen[safe] = true;
    if (urls.length >= BULK_MAX_URLS) { capped = true; return; }
    urls.push(safe);
  });
  return { urls: urls, invalid: invalid, capped: capped };
}

// How many URLs to send next and how long to wait first, from the rate-limit
// headers of the previous batch response.
function bulk_nextStep(headers) {
  var limit = parseInt(headers.get('X-RateLimit-Limit'), 10);
  var remaining = parseInt(headers.get('X-RateLimit-Remaining'), 10);
  var reset = parseInt(headers.get('X-RateLimit-Reset'), 10);
  var perMinute = limit > 0 ? limit : BULK_DEFAULT_PER_MINUTE;
  var full = Math.min(perMinute, BULK_MAX_BATCH);
  if (isNaN(remaining)) return { chunk: full, waitSeconds: 0 };
  if (remaining <= 0) return { chunk: full, waitSeconds: reset > 0 ? reset : 60 };
  return { chunk: Math.min(remaining, BULK_MAX_BATCH), waitSeconds: 0 };
}

function bulk_run(urls, ui) {
  var index = 0;
  var accepted = 0;
  var failed = [];
  var stopped = false;
  var timer = null;
  var step = { chunk: Math.min(BULK_DEFAULT_PER_MINUTE, BULK_MAX_BATCH), waitSeconds: 0 };

  function done(message) {
    if (timer) { clearInterval(timer); timer = null; }
    ui.finish(message, failed);
  }

  function wait(seconds, then) {
    var left = seconds;
    ui.status('Submitted ' + accepted + ' of ' + urls.length + '. Waiting ' + left + ' s for the rate limit...');
    timer = setInterval(function() {
      if (stopped) { clearInterval(timer); timer = null; return done('Stopped. ' + accepted + ' of ' + urls.length + ' submitted.'); }
      left -= 1;
      if (left <= 0) { clearInterval(timer); timer = null; then(); return; }
      ui.status('Submitted ' + accepted + ' of ' + urls.length + '. Waiting ' + left + ' s for the rate limit...');
    }, 1000);
  }

  function next() {
    if (stopped) return done('Stopped. ' + accepted + ' of ' + urls.length + ' submitted.');
    if (index >= urls.length) {
      return done('Done: ' + accepted + ' of ' + urls.length + ' submitted' + (failed.length ? ', ' + failed.length + ' refused.' : '.'));
    }
    if (step.waitSeconds > 0) {
      var w = step.waitSeconds;
      step.waitSeconds = 0;
      return wait(w, next);
    }
    var part = urls.slice(index, index + step.chunk);
    ui.status('Submitting ' + (index + 1) + '-' + (index + part.length) + ' of ' + urls.length + '...');
    apiFetch('/v1/captures/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: part.map(function(u) { return { url: u }; }) }),
    }).then(function(res) {
      return res.json().catch(function() { return null; }).then(function(data) {
        if (res.status === 429 && data && data.limitType === 'quota') {
          return done(submit_quotaMessage(data) + ' ' + accepted + ' of ' + urls.length + ' submitted.');
        }
        if (res.status === 429) {
          var retry = parseInt(res.headers.get('Retry-After'), 10) || 60;
          return wait(retry, next);
        }
        if (res.status !== 207 && res.status !== 202 && res.status !== 200) {
          var detail = (data && data.detail) ? truncate(data.detail, 200) : 'HTTP ' + res.status;
          return done('Stopped: ' + detail + '. ' + accepted + ' of ' + urls.length + ' submitted.');
        }
        var quotaHit = null;
        ((data && data.items) || []).forEach(function(item, i) {
          if (item.status === 202 && item.id) {
            prependPendingItem(item.id, item.url || part[i]);
            accepted += 1;
          } else {
            if (item.status === 429 && item.limitType === 'quota') quotaHit = item;
            failed.push((item.url || part[i]) + ': ' + (item.detail ? truncate(item.detail, 160) : 'HTTP ' + item.status));
          }
        });
        index += part.length;
        if (quotaHit) return done(submit_quotaMessage(quotaHit) + ' ' + accepted + ' of ' + urls.length + ' submitted.');
        step = bulk_nextStep(res.headers);
        next();
      });
    }).catch(function() {
      done('Connection failed. ' + accepted + ' of ' + urls.length + ' submitted.');
    });
  }

  ui.stop = function() { stopped = true; };
  next();
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

  // --- Bulk capture: a pasted list or a sitemap ---
  var bulk = document.createElement('details');
  bulk.className = 'bulk-capture';
  var bulkSummary = document.createElement('summary');
  bulkSummary.textContent = 'Capture a list of URLs or a sitemap';
  bulk.appendChild(bulkSummary);

  var bulkLabel = document.createElement('label');
  bulkLabel.htmlFor = 'bulk-urls';
  bulkLabel.className = 'bulk-capture__label';
  bulkLabel.textContent = 'URLs, one per line (up to 200)';
  bulk.appendChild(bulkLabel);

  var bulkText = document.createElement('textarea');
  bulkText.id = 'bulk-urls';
  bulkText.className = 'input bulk-capture__list';
  bulkText.rows = 8;
  bulkText.placeholder = 'https://example.com/\\nhttps://example.com/about';
  bulk.appendChild(bulkText);

  var sitemapRow = document.createElement('div');
  sitemapRow.className = 'capture-form-row bulk-capture__sitemap';
  var sitemapInput = document.createElement('input');
  sitemapInput.type = 'url';
  sitemapInput.className = 'input';
  sitemapInput.placeholder = 'https://example.com/sitemap.xml';
  sitemapInput.setAttribute('aria-label', 'Sitemap URL');
  sitemapRow.appendChild(sitemapInput);
  var sitemapBtn = document.createElement('button');
  sitemapBtn.type = 'button';
  sitemapBtn.className = 'btn btn--ghost';
  sitemapBtn.textContent = 'Load sitemap';
  sitemapRow.appendChild(sitemapBtn);
  bulk.appendChild(sitemapRow);

  var bulkHint = document.createElement('p');
  bulkHint.className = 'bulk-capture__hint';
  bulkHint.textContent = 'URLs are submitted at your rate limit (10 captures a minute unless raised), so keep this page open until they are all submitted. Each accepted URL counts against your monthly captures.';
  bulk.appendChild(bulkHint);

  var bulkActions = document.createElement('div');
  bulkActions.className = 'bulk-capture__actions';
  var bulkStart = document.createElement('button');
  bulkStart.type = 'button';
  bulkStart.className = 'btn btn--primary';
  bulkStart.textContent = 'Capture all';
  bulkActions.appendChild(bulkStart);
  var bulkStop = document.createElement('button');
  bulkStop.type = 'button';
  bulkStop.className = 'btn btn--ghost';
  bulkStop.textContent = 'Stop';
  bulkStop.style.display = 'none';
  bulkActions.appendChild(bulkStop);
  bulk.appendChild(bulkActions);

  var bulkStatus = document.createElement('p');
  bulkStatus.className = 'bulk-capture__status';
  bulkStatus.setAttribute('role', 'status');
  bulkStatus.setAttribute('aria-live', 'polite');
  bulk.appendChild(bulkStatus);

  var bulkErrors = document.createElement('ul');
  bulkErrors.className = 'bulk-capture__errors';
  bulk.appendChild(bulkErrors);

  function bulkShowErrors(lines) {
    // Safe: textContent only
    bulkErrors.innerHTML = '';
    lines.slice(0, 50).forEach(function(line) {
      var li = document.createElement('li');
      li.textContent = line;
      bulkErrors.appendChild(li);
    });
    if (lines.length > 50) {
      var more = document.createElement('li');
      more.textContent = '... and ' + (lines.length - 50) + ' more';
      bulkErrors.appendChild(more);
    }
  }

  sitemapBtn.addEventListener('click', function() {
    var sitemapUrl = safeUrl(sitemapInput.value.trim());
    if (!sitemapUrl) { bulkStatus.textContent = 'Enter the sitemap URL, for example https://example.com/sitemap.xml.'; return; }
    sitemapBtn.disabled = true;
    bulkStatus.textContent = 'Reading the sitemap...';
    apiFetch('/v1/sitemap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sitemapUrl }),
    }).then(function(res) {
      return res.json().catch(function() { return null; }).then(function(data) {
        sitemapBtn.disabled = false;
        if (!res.ok || !data || !Array.isArray(data.urls)) {
          bulkStatus.textContent = (data && data.detail) ? truncate(data.detail, 200) : 'Could not read the sitemap (HTTP ' + res.status + ').';
          return;
        }
        bulkText.value = data.urls.join('\\n');
        bulkStatus.textContent = data.truncated
          ? 'Loaded the first ' + data.urls.length + ' of ' + data.total + ' URLs. Remove the ones you do not need, then capture.'
          : 'Loaded ' + data.urls.length + ' URLs. Remove the ones you do not need, then capture.';
      });
    }).catch(function() {
      sitemapBtn.disabled = false;
      bulkStatus.textContent = 'Connection failed.';
    });
  });

  var bulkUi = null;
  bulkStart.addEventListener('click', function() {
    var parsed = bulk_parseList(bulkText.value);
    bulkShowErrors(parsed.invalid.map(function(line) { return 'Not a URL: ' + line; }));
    if (parsed.urls.length === 0) { bulkStatus.textContent = 'Paste at least one URL, or load a sitemap.'; return; }
    bulkStart.disabled = true;
    sitemapBtn.disabled = true;
    bulkStop.style.display = '';
    bulkUi = {
      status: function(text) { bulkStatus.textContent = text; },
      finish: function(text, failed) {
        bulkStatus.textContent = text + (parsed.capped ? ' Only the first 200 URLs were used.' : '');
        bulkShowErrors(parsed.invalid.map(function(line) { return 'Not a URL: ' + line; }).concat(failed));
        bulkStart.disabled = false;
        sitemapBtn.disabled = false;
        bulkStop.style.display = 'none';
        announce(text);
      },
    };
    bulk_run(parsed.urls, bulkUi);
  });
  bulkStop.addEventListener('click', function() {
    if (bulkUi && bulkUi.stop) bulkUi.stop();
    bulkStatus.textContent = 'Stopping after the current batch...';
  });

  formSection.appendChild(bulk);
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
