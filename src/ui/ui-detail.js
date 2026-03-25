// tva
// Capture detail view for WRL Web UI.

export const DETAIL_VIEW_JS = `
// ---------------------------------------------------------------------------
// Detail view helpers
// ---------------------------------------------------------------------------

function formatDatetime(isoStr) {
  if (!isoStr) return '';
  try {
    var d = new Date(isoStr);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch (e) {
    return isoStr;
  }
}

// ---------------------------------------------------------------------------
// Shared structure builders
// ---------------------------------------------------------------------------

function buildBackLink() {
  var back = document.createElement('a');
  back.href = '#/captures';
  back.className = 'detail-back-link';
  back.textContent = 'Back to captures';
  return back;
}

function buildStatusBanner(status) {
  var banner = document.createElement('div');
  banner.className = 'detail-status-banner';

  var label = document.createElement('span');
  label.className = 'detail-status-label';

  if (status === 'complete') {
    banner.classList.add('detail-status-banner--complete');
    label.textContent = 'Status: Complete';
  } else if (status === 'failed') {
    banner.classList.add('detail-status-banner--failed');
    label.textContent = 'Status: Failed';
  } else {
    banner.classList.add('detail-status-banner--pending');
    label.textContent = 'Status: Pending';
  }

  banner.appendChild(label);
  return banner;
}

// Build a single data-grid row: label + value node
function addDataRow(grid, labelText, valueNode) {
  var row = document.createElement('div');
  row.className = 'data-row';

  var lbl = document.createElement('dt');
  lbl.className = 'data-label';
  lbl.textContent = labelText;

  var val = document.createElement('dd');
  val.className = 'data-value';
  if (typeof valueNode === 'string') {
    val.textContent = valueNode;
  } else {
    val.appendChild(valueNode);
  }

  row.appendChild(lbl);
  row.appendChild(val);
  grid.appendChild(row);
}

function buildMetadataSection(data) {
  var section = document.createElement('section');
  section.className = 'section detail-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'Capture Details';
  section.appendChild(h2);

  var grid = document.createElement('dl');
  grid.className = 'data-grid detail-data-grid';

  // URL
  var safe = safeUrl(data.url);
  if (safe) {
    var urlLink = document.createElement('a');
    urlLink.href = safe;
    urlLink.target = '_blank';
    urlLink.rel = 'noopener noreferrer';
    urlLink.className = 'detail-url-link text-break';
    urlLink.textContent = data.url || '';
    addDataRow(grid, 'URL', urlLink);
  } else {
    var urlText = document.createElement('span');
    urlText.className = 'text-break';
    urlText.textContent = data.url || '';
    addDataRow(grid, 'URL', urlText);
  }

  // Capture ID
  var idSpan = document.createElement('span');
  idSpan.className = 'text-mono';
  idSpan.textContent = data.id || '';
  addDataRow(grid, 'Capture ID', idSpan);

  // Status
  addDataRow(grid, 'Status', data.status || '');

  // Created at
  if (data.createdAt) {
    addDataRow(grid, 'Created', formatDatetime(data.createdAt));
  }

  // Completed at
  if (data.completedAt) {
    addDataRow(grid, 'Completed', formatDatetime(data.completedAt));
  }

  // Failed at
  if (data.failedAt) {
    addDataRow(grid, 'Failed', formatDatetime(data.failedAt));
  }

  // Schedule association
  if (data.scheduleId) {
    var schedLink = document.createElement('a');
    schedLink.href = '#/schedules';
    schedLink.className = 'detail-url-link text-mono';
    schedLink.textContent = data.scheduleId;
    addDataRow(grid, 'Schedule', schedLink);
  }

  // Render quality
  if (data.renderQuality) {
    addDataRow(grid, 'Render Quality', data.renderQuality);
  }

  // Timestamp status (only when WACZ is present and timestamps field exists)
  if (data.wacz && data.timestamps) {
    var tsSpan = document.createElement('span');
    if (data.timestamps.qualified === true) {
      tsSpan.textContent = 'Qualified (eIDAS)';
      tsSpan.className = 'text-success';
    } else if (data.timestamps.standard === true) {
      tsSpan.textContent = 'Standard (RFC 3161)';
    } else {
      tsSpan.textContent = 'Not available';
      tsSpan.className = 'text-muted';
    }
    addDataRow(grid, 'Timestamp', tsSpan);
  }

  section.appendChild(grid);
  return section;
}

// ---------------------------------------------------------------------------
// Full (complete) capture layout
// ---------------------------------------------------------------------------

function renderDetailComplete(view, id, data) {
  // Back link
  view.appendChild(buildBackLink());

  // Status banner
  view.appendChild(buildStatusBanner('complete'));

  // Card wrapping the main content
  var card = document.createElement('div');
  card.className = 'card detail-card';

  // Metadata
  card.appendChild(buildMetadataSection(data));

  // Screenshot section
  var hasBeforeScreenshot = !!(data.artifacts && data.artifacts.screenshotBefore);
  var screenshotSection = document.createElement('section');
  screenshotSection.className = 'section detail-section';

  var ssH2 = document.createElement('h2');
  ssH2.textContent = 'Screenshot';
  screenshotSection.appendChild(ssH2);

  if (hasBeforeScreenshot) {
    var screenshotGrid = document.createElement('div');
    screenshotGrid.className = 'detail-screenshot-grid';

    var beforeWrap = document.createElement('figure');
    beforeWrap.className = 'detail-screenshot-figure';
    var beforeImg = document.createElement('img');
    beforeImg.loading = 'lazy';
    beforeImg.src = '/v1/captures/' + id + '/artifacts/screenshot-before';
    beforeImg.alt = 'Before consent screenshot of ' + (data.url || '');
    beforeImg.className = 'detail-screenshot-img';
    var beforeCaption = document.createElement('figcaption');
    beforeCaption.className = 'detail-screenshot-caption';
    beforeCaption.textContent = 'Before consent';
    beforeWrap.appendChild(beforeImg);
    beforeWrap.appendChild(beforeCaption);

    var afterWrap = document.createElement('figure');
    afterWrap.className = 'detail-screenshot-figure';
    var afterImg = document.createElement('img');
    afterImg.loading = 'lazy';
    afterImg.src = '/v1/captures/' + id + '/artifacts/screenshot';
    afterImg.alt = 'After consent screenshot of ' + (data.url || '');
    afterImg.className = 'detail-screenshot-img';
    var afterCaption = document.createElement('figcaption');
    afterCaption.className = 'detail-screenshot-caption';
    afterCaption.textContent = 'After consent';
    afterWrap.appendChild(afterImg);
    afterWrap.appendChild(afterCaption);

    screenshotGrid.appendChild(beforeWrap);
    screenshotGrid.appendChild(afterWrap);
    screenshotSection.appendChild(screenshotGrid);
  } else {
    var singleFigure = document.createElement('figure');
    singleFigure.className = 'detail-screenshot-figure';
    var singleImg = document.createElement('img');
    singleImg.loading = 'lazy';
    singleImg.src = '/v1/captures/' + id + '/artifacts/screenshot';
    singleImg.alt = 'Screenshot of ' + (data.url || '');
    singleImg.className = 'detail-screenshot-img';
    singleFigure.appendChild(singleImg);
    screenshotSection.appendChild(singleFigure);
  }

  card.appendChild(screenshotSection);

  // Artifacts section
  var artifactsSection = document.createElement('section');
  artifactsSection.className = 'section detail-section';

  var artH2 = document.createElement('h2');
  artH2.textContent = 'Artifacts';
  artifactsSection.appendChild(artH2);

  var artList = document.createElement('ul');
  artList.className = 'detail-artifact-list';

  function addArtifactLink(label, path) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = path;
    a.className = 'detail-artifact-link';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    li.appendChild(a);
    artList.appendChild(li);
  }

  addArtifactLink('Screenshot', '/v1/captures/' + id + '/artifacts/screenshot');
  addArtifactLink('HTML snapshot', '/v1/captures/' + id + '/artifacts/html');
  addArtifactLink('HTTP headers', '/v1/captures/' + id + '/artifacts/headers');
  if (data.wacz) {
    addArtifactLink('WACZ archive', '/v1/captures/' + id + '/artifacts/wacz');

    var certLi = document.createElement('li');
    certLi.className = 'detail-artifact-cert';
    var certLink = document.createElement('a');
    certLink.href = '/v1/captures/' + id + '/certificate';
    certLink.className = 'btn btn--ghost';
    certLink.setAttribute('download', '');
    certLink.textContent = 'Download Certificate (PDF)';
    certLi.appendChild(certLink);
    artList.appendChild(certLi);
  }

  artifactsSection.appendChild(artList);
  card.appendChild(artifactsSection);

  // Compare with previous (only when changeSummary has previousCaptureId)
  if (data.changeSummary && data.changeSummary.previousCaptureId) {
    var compareSection = document.createElement('section');
    compareSection.className = 'section detail-section';

    var compareH2 = document.createElement('h2');
    compareH2.textContent = 'Changes';
    compareSection.appendChild(compareH2);

    var compareLink = document.createElement('a');
    compareLink.href = '#/diff/' + data.changeSummary.previousCaptureId + '/' + id;
    compareLink.className = 'detail-url-link';

    if (data.changeSummary.changed === true) {
      compareLink.textContent = 'Compare with previous capture (changes detected)';
    } else {
      compareLink.textContent = 'Compare with previous capture (no changes)';
    }
    compareSection.appendChild(compareLink);
    card.appendChild(compareSection);
  }

  // Verification link (only when WACZ is present)
  if (data.wacz) {
    var verifySection = document.createElement('section');
    verifySection.className = 'section detail-section';

    var verifyH2 = document.createElement('h2');
    verifyH2.textContent = 'Verification';
    verifySection.appendChild(verifyH2);

    var verifyLink = document.createElement('a');
    verifyLink.href = '/v1/verify/' + id;
    verifyLink.target = '_blank';
    verifyLink.rel = 'noopener';
    verifyLink.className = 'detail-verify-link';
    verifyLink.textContent = 'Verify this capture';
    verifySection.appendChild(verifyLink);

    card.appendChild(verifySection);
  }

  view.appendChild(card);
}

// ---------------------------------------------------------------------------
// Pending capture layout (with polling)
// ---------------------------------------------------------------------------

function renderDetailPending(view, id, statusData) {
  view.appendChild(buildBackLink());
  view.appendChild(buildStatusBanner('pending'));

  var card = document.createElement('div');
  card.className = 'card detail-card';

  var metaData = {
    id: id,
    status: 'pending',
    url: statusData && statusData.url ? statusData.url : null,
    createdAt: statusData && statusData.createdAt ? statusData.createdAt : null,
  };
  card.appendChild(buildMetadataSection(metaData));

  var pollSection = document.createElement('section');
  pollSection.className = 'section detail-section';

  var pollH2 = document.createElement('h2');
  pollH2.textContent = 'Capture Status';
  pollSection.appendChild(pollH2);

  var pollRow = document.createElement('div');
  pollRow.className = 'detail-poll-row';

  var spinner = document.createElement('div');
  spinner.className = 'detail-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  pollRow.appendChild(spinner);

  var pollLabel = document.createElement('span');
  pollLabel.id = 'detail-poll-label';
  pollLabel.className = 'detail-poll-label';
  pollLabel.setAttribute('role', 'status');
  pollLabel.setAttribute('aria-live', 'polite');
  pollLabel.textContent = 'Capturing... 0s';
  pollRow.appendChild(pollLabel);

  pollSection.appendChild(pollRow);
  card.appendChild(pollSection);
  view.appendChild(card);

  // Elapsed timer
  var startedAt = Date.now();
  var elapsedTimer = setInterval(function() {
    var el = document.getElementById('detail-poll-label');
    if (!el) {
      clearInterval(elapsedTimer);
      return;
    }
    var secs = Math.floor((Date.now() - startedAt) / 1000);
    el.textContent = 'Capturing... ' + secs + 's';
  }, 1000);

  startPolling(id, function(update) {
    clearInterval(elapsedTimer);

    if (update.status === 'complete') {
      fetchAndRenderDetail(id);
    } else if (update.status === 'failed') {
      var v = document.getElementById('view');
      if (!v) return;
      // Safe: clearing the view container before re-render
      v.innerHTML = '';
      renderDetailFailed(v, id, {
        id: id,
        status: 'failed',
        error: update.error || null,
        retryable: update.retryable || false,
      });
    } else if (update.status === 'timeout') {
      var v2 = document.getElementById('view');
      if (!v2) return;
      // Safe: clearing the view container before re-render
      v2.innerHTML = '';
      renderDetailError(v2, 'The capture is taking longer than expected. Try refreshing the page.');
    } else if (update.status === 'poll_error') {
      var v3 = document.getElementById('view');
      if (!v3) return;
      // Safe: clearing the view container before re-render
      v3.innerHTML = '';
      renderDetailError(v3, update.message || 'Could not check capture status.');
    }
  });
}

// ---------------------------------------------------------------------------
// Failed capture layout
// ---------------------------------------------------------------------------

function renderDetailFailed(view, id, data) {
  view.appendChild(buildBackLink());
  view.appendChild(buildStatusBanner('failed'));

  var card = document.createElement('div');
  card.className = 'card detail-card';

  card.appendChild(buildMetadataSection(data));

  if (data.error) {
    var errorSection = document.createElement('section');
    errorSection.className = 'section detail-section';

    var errH2 = document.createElement('h2');
    errH2.textContent = 'Error';
    errorSection.appendChild(errH2);

    var errDiv = document.createElement('div');
    errDiv.className = 'alert alert--error';
    errDiv.setAttribute('role', 'alert');
    var errMsg = typeof data.error === 'string' ? data.error : String(data.error);
    errDiv.textContent = errMsg.length > 200 ? errMsg.slice(0, 200) + '...' : errMsg;
    errorSection.appendChild(errDiv);

    card.appendChild(errorSection);
  }

  view.appendChild(card);
}

// ---------------------------------------------------------------------------
// Error states (fetch failures, not-found)
// ---------------------------------------------------------------------------

function renderDetailNotFound(view) {
  view.appendChild(buildBackLink());

  var msg = document.createElement('div');
  msg.className = 'alert alert--error detail-not-found';
  msg.setAttribute('role', 'alert');
  msg.textContent = 'Capture not found.';
  view.appendChild(msg);
}

function renderDetailError(view, message) {
  view.appendChild(buildBackLink());

  var msg = document.createElement('div');
  msg.className = 'alert alert--error';
  msg.setAttribute('role', 'alert');
  msg.textContent = message || 'An error occurred loading this capture.';
  view.appendChild(msg);

  var retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn btn--ghost detail-retry-btn';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', function() {
    var idMatch = location.hash.match(/^#\\/captures\\/(cap_[a-f0-9]{32})$/);
    if (idMatch) {
      renderDetail(idMatch[1]);
      mountDetail(idMatch[1]);
    }
  });
  view.appendChild(retryBtn);
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function renderDetailLoading(view) {
  var wrap = document.createElement('div');
  wrap.className = 'detail-loading';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-label', 'Loading capture');

  var spinner = document.createElement('div');
  spinner.className = 'detail-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  wrap.appendChild(spinner);

  var txt = document.createElement('p');
  txt.className = 'detail-loading-text';
  txt.textContent = 'Loading capture...';
  wrap.appendChild(txt);

  view.appendChild(wrap);
}

// ---------------------------------------------------------------------------
// Fetch dispatch -- tries complete endpoint, falls back to status for pending/failed
// ---------------------------------------------------------------------------

function fetchAndRenderDetail(id) {
  var view = document.getElementById('view');
  if (!view) return;
  // Safe: clearing the view container before loading state
  view.innerHTML = '';
  renderDetailLoading(view);

  apiFetch('/v1/captures/' + id).then(function(res) {
    if (!res) return; // 401 handled by apiFetch -- redirects to auth gate

    if (res.ok) {
      res.json().then(function(data) {
        var v = document.getElementById('view');
        if (!v) return;
        // Safe: clearing the view container before re-render
        v.innerHTML = '';
        renderDetailComplete(v, id, data);
        document.title = 'Capture ' + id + ' - Web Resource Ledger';
        var firstFocusable = v.querySelector('a, button, [tabindex="-1"]');
        if (firstFocusable) firstFocusable.focus();
      }).catch(function() {
        var v = document.getElementById('view');
        if (!v) return;
        // Safe: clearing the view container before re-render
        v.innerHTML = '';
        renderDetailError(v, 'Could not parse capture data.');
      });
      return;
    }

    if (res.status === 404) {
      // Could be pending/failed -- check status endpoint to distinguish
      apiFetch('/v1/captures/' + id + '/status').then(function(statusRes) {
        if (!statusRes) return;

        if (statusRes.ok) {
          statusRes.json().then(function(statusData) {
            var v = document.getElementById('view');
            if (!v) return;
            // Safe: clearing the view container before re-render
            v.innerHTML = '';

            if (statusData.status === 'pending') {
              renderDetailPending(v, id, statusData);
              document.title = 'Capture ' + id + ' - Web Resource Ledger';
            } else if (statusData.status === 'failed') {
              renderDetailFailed(v, id, {
                id: id,
                status: 'failed',
                error: statusData.error || null,
                retryable: statusData.retryable || false,
              });
              document.title = 'Capture ' + id + ' - Web Resource Ledger';
            } else if (statusData.status === 'complete') {
              // Race condition: completed between the two requests -- retry
              fetchAndRenderDetail(id);
            } else {
              renderDetailNotFound(v);
              document.title = 'Capture Not Found - Web Resource Ledger';
            }
          }).catch(function() {
            var v = document.getElementById('view');
            if (!v) return;
            // Safe: clearing the view container before re-render
            v.innerHTML = '';
            renderDetailNotFound(v);
          });
        } else if (statusRes.status === 404) {
          var v = document.getElementById('view');
          if (!v) return;
          // Safe: clearing the view container before re-render
          v.innerHTML = '';
          renderDetailNotFound(v);
          document.title = 'Capture Not Found - Web Resource Ledger';
        } else {
          var v = document.getElementById('view');
          if (!v) return;
          // Safe: clearing the view container before re-render
          v.innerHTML = '';
          renderDetailError(v, 'Could not load capture (HTTP ' + statusRes.status + ').');
        }
      }).catch(function(err) {
        var v = document.getElementById('view');
        if (!v) return;
        // Safe: clearing the view container before re-render
        v.innerHTML = '';
        var msg = (err && err.message === 'fetch_timeout')
          ? 'Connection timed out. Check your network and try again.'
          : 'Connection failed. Check your network and try again.';
        renderDetailError(v, msg);
      });
      return;
    }

    // Other HTTP error from the complete endpoint
    var v = document.getElementById('view');
    if (!v) return;
    // Safe: clearing the view container before re-render
    v.innerHTML = '';
    renderDetailError(v, 'Could not load capture (HTTP ' + res.status + ').');
  }).catch(function(err) {
    var v = document.getElementById('view');
    if (!v) return;
    // Safe: clearing the view container before re-render
    v.innerHTML = '';
    var msg = (err && err.message === 'fetch_timeout')
      ? 'Connection timed out. Check your network and try again.'
      : 'Connection failed. Check your network and try again.';
    renderDetailError(v, msg);
  });
}

// ---------------------------------------------------------------------------
// Public entry points -- called by the hash router
// ---------------------------------------------------------------------------

function renderDetail(id) {
  var view = document.getElementById('view');
  // Safe: clearing the view container
  view.innerHTML = '';
  document.title = 'Capture Detail - Web Resource Ledger';
  renderDetailLoading(view);
}

function mountDetail(id) {
  fetchAndRenderDetail(id);
}
`;
