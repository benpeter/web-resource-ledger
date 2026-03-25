// tva
// Diff view for WRL Web UI.
// Exports a JS string constant for inline use in the HTML shell.

export const DIFF_VIEW_JS = `
// ---------------------------------------------------------------------------
// Diff view helpers
// ---------------------------------------------------------------------------

function diffFormatDatetime(isoStr) {
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
// Normalise API response into a flat shape for rendering
//
// API response shape (from GET /v1/captures/:id1/diff/:id2):
//   data.base     = { id, url, createdAt }
//   data.target   = { id, url, createdAt }
//   data.summary  = { changed, sections: { html, screenshot, headers } }
//   data.html     = { changed, truncated, stats: { additions, deletions }, hunks }
//                   hunks[].lines[].type = 'addition' | 'deletion' | 'context'
//   data.headers  = { changed, added[{ name, targetValue }],
//                     removed[{ name, baseValue }],
//                     modified[{ name, baseValue, targetValue }],
//                     unchanged (count), statusChanged }
//   data.screenshot = { changed }
// ---------------------------------------------------------------------------

function normaliseApiResponse(data) {
  var html = data.html || null;
  var headers = data.headers || null;
  var screenshot = data.screenshot || null;
  var summary = data.summary || null;

  // HTML hunks: translate type names and compute per-line numbers
  var hunks = [];
  var htmlTruncated = false;
  if (html && html.hunks) {
    htmlTruncated = !!(html.truncated);
    for (var h = 0; h < html.hunks.length; h++) {
      var rawHunk = html.hunks[h];
      var lines = [];
      var baseLineNo = rawHunk.baseLine || 1;
      var targetLineNo = rawHunk.targetLine || 1;
      for (var l = 0; l < (rawHunk.lines || []).length; l++) {
        var rawLine = rawHunk.lines[l];
        var uiType = rawLine.type === 'addition' ? 'add'
                   : rawLine.type === 'deletion'  ? 'remove'
                   : 'context';
        lines.push({
          type: uiType,
          content: rawLine.content || '',
          baseLineNo: (uiType === 'add') ? null : baseLineNo,
          targetLineNo: (uiType === 'remove') ? null : targetLineNo,
        });
        if (uiType !== 'add') baseLineNo++;
        if (uiType !== 'remove') targetLineNo++;
      }
      hunks.push({ lines: lines });
    }
  }

  // Header changes: normalise to a flat array with add/remove/change types
  var headerChanges = [];
  var unchangedHeaderCount = 0;
  if (headers) {
    var addedH = headers.added || [];
    var removedH = headers.removed || [];
    var modifiedH = headers.modified || [];
    unchangedHeaderCount = headers.unchanged || 0;

    for (var i = 0; i < addedH.length; i++) {
      headerChanges.push({ type: 'add', name: addedH[i].name, base: '', target: addedH[i].targetValue || '' });
    }
    for (var j = 0; j < removedH.length; j++) {
      headerChanges.push({ type: 'remove', name: removedH[j].name, base: removedH[j].baseValue || '', target: '' });
    }
    for (var k = 0; k < modifiedH.length; k++) {
      headerChanges.push({ type: 'change', name: modifiedH[k].name, base: modifiedH[k].baseValue || '', target: modifiedH[k].targetValue || '' });
    }
  }

  var screenshotChanged = !!(screenshot && screenshot.changed) ||
    !!(summary && summary.sections && summary.sections.screenshot && summary.sections.screenshot.changed);

  var htmlStats = (html && html.stats) ? html.stats : null;
  var htmlChangedLines = htmlStats ? (htmlStats.additions + htmlStats.deletions) : 0;

  return {
    base: data.base || null,
    target: data.target || null,
    hunks: hunks,
    htmlTruncated: htmlTruncated,
    headerChanges: headerChanges,
    unchangedHeaderCount: unchangedHeaderCount,
    screenshotChanged: screenshotChanged,
    htmlChangedLines: htmlChangedLines,
  };
}

// ---------------------------------------------------------------------------
// Canvas pixel diff
// ---------------------------------------------------------------------------

function computePixelDiff(img1, img2) {
  var maxW = Math.max(img1.width, img2.width);
  var maxH = Math.max(img1.height, img2.height);
  if (maxW * maxH > 8000000) {
    return { canvas: null, changedPercent: 'N/A', tooLarge: true };
  }
  var canvas1 = document.createElement('canvas');
  canvas1.width = maxW; canvas1.height = maxH;
  var ctx1 = canvas1.getContext('2d');
  ctx1.drawImage(img1, 0, 0);
  var data1 = ctx1.getImageData(0, 0, maxW, maxH).data;

  var canvas2 = document.createElement('canvas');
  canvas2.width = maxW; canvas2.height = maxH;
  var ctx2 = canvas2.getContext('2d');
  ctx2.drawImage(img2, 0, 0);
  var data2 = ctx2.getImageData(0, 0, maxW, maxH).data;

  var diffCanvas = document.createElement('canvas');
  diffCanvas.width = maxW; diffCanvas.height = maxH;
  var diffCtx = diffCanvas.getContext('2d');
  var diffData = diffCtx.createImageData(maxW, maxH);

  var changed = 0;
  var total = maxW * maxH;
  for (var i = 0; i < data1.length; i += 4) {
    var dr = data1[i] - data2[i];
    var dg = data1[i+1] - data2[i+1];
    var db = data1[i+2] - data2[i+2];
    var dist = Math.sqrt(dr*dr + dg*dg + db*db);
    if (dist > 35) {
      diffData.data[i] = 255; diffData.data[i+1] = 0;
      diffData.data[i+2] = 255; diffData.data[i+3] = 180;
      changed++;
    } else {
      var gray = Math.round(0.299*data2[i] + 0.587*data2[i+1] + 0.114*data2[i+2]);
      diffData.data[i] = gray; diffData.data[i+1] = gray;
      diffData.data[i+2] = gray; diffData.data[i+3] = 255;
    }
  }
  diffCtx.putImageData(diffData, 0, 0);
  return { canvas: diffCanvas, changedPercent: (changed / total * 100).toFixed(1) };
}

// ---------------------------------------------------------------------------
// Screenshot section with tabs
// ---------------------------------------------------------------------------

function buildScreenshotSection(id1, id2, normalised) {
  var section = document.createElement('section');
  section.className = 'section detail-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'Screenshot Comparison';
  section.appendChild(h2);

  var captionEl = document.createElement('p');
  captionEl.className = 'diff-screenshot-caption';
  captionEl.textContent = normalised.screenshotChanged ? 'Screenshot changed' : 'Screenshots identical';
  section.appendChild(captionEl);

  // Tab bar
  var tabBar = document.createElement('div');
  tabBar.className = 'diff-tab-bar';
  tabBar.setAttribute('role', 'tablist');
  tabBar.setAttribute('aria-label', 'Screenshot comparison mode');

  var tabs = [
    { id: 'side-by-side', label: 'Side by side' },
    { id: 'overlay',      label: 'Overlay' },
    { id: 'diff',         label: 'Diff' },
  ];

  var tabEls = [];
  var panelEls = [];

  for (var t = 0; t < tabs.length; t++) {
    (function(tab, idx) {
      var tabEl = document.createElement('button');
      tabEl.type = 'button';
      tabEl.className = 'diff-tab';
      tabEl.id = 'tab-' + tab.id;
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      tabEl.setAttribute('aria-controls', 'panel-' + tab.id);
      tabEl.setAttribute('tabindex', idx === 0 ? '0' : '-1');
      tabEl.textContent = tab.label;
      tabEls.push(tabEl);
      tabBar.appendChild(tabEl);
    })(tabs[t], t);
  }

  var panelContainer = document.createElement('div');
  panelContainer.className = 'diff-panels';

  // --- Panel: Side by side ---
  var panelSide = document.createElement('div');
  panelSide.className = 'diff-panel';
  panelSide.id = 'panel-side-by-side';
  panelSide.setAttribute('role', 'tabpanel');
  panelSide.setAttribute('aria-labelledby', 'tab-side-by-side');
  panelSide.setAttribute('tabindex', '-1');

  var sideGrid = document.createElement('div');
  sideGrid.className = 'diff-screenshot-grid';

  var fig1 = document.createElement('figure');
  fig1.className = 'detail-screenshot-figure';
  var img1El = document.createElement('img');
  img1El.src = '/v1/captures/' + id1 + '/artifacts/screenshot';
  img1El.alt = 'Base capture screenshot';
  img1El.className = 'detail-screenshot-img';
  img1El.id = 'diff-img-base';
  img1El.loading = 'lazy';
  var cap1 = document.createElement('figcaption');
  cap1.className = 'detail-screenshot-caption';
  cap1.textContent = 'Base';
  fig1.appendChild(img1El);
  fig1.appendChild(cap1);
  sideGrid.appendChild(fig1);

  var fig2 = document.createElement('figure');
  fig2.className = 'detail-screenshot-figure';
  var img2El = document.createElement('img');
  img2El.src = '/v1/captures/' + id2 + '/artifacts/screenshot';
  img2El.alt = 'Target capture screenshot';
  img2El.className = 'detail-screenshot-img';
  img2El.id = 'diff-img-target';
  img2El.loading = 'lazy';
  var cap2 = document.createElement('figcaption');
  cap2.className = 'detail-screenshot-caption';
  cap2.textContent = 'Target';
  fig2.appendChild(img2El);
  fig2.appendChild(cap2);
  sideGrid.appendChild(fig2);

  panelSide.appendChild(sideGrid);
  panelEls.push(panelSide);

  // --- Panel: Overlay ---
  var panelOverlay = document.createElement('div');
  panelOverlay.className = 'diff-panel';
  panelOverlay.id = 'panel-overlay';
  panelOverlay.setAttribute('role', 'tabpanel');
  panelOverlay.setAttribute('aria-labelledby', 'tab-overlay');
  panelOverlay.setAttribute('tabindex', '-1');
  panelOverlay.setAttribute('hidden', '');

  var overlayContainer = document.createElement('div');
  overlayContainer.className = 'diff-overlay-container';
  overlayContainer.id = 'diff-overlay-container';

  var overlayBase = document.createElement('img');
  overlayBase.src = '/v1/captures/' + id1 + '/artifacts/screenshot';
  overlayBase.alt = 'Base capture screenshot';
  overlayBase.className = 'diff-overlay-img diff-overlay-img--base';
  overlayBase.setAttribute('aria-hidden', 'true');
  overlayContainer.appendChild(overlayBase);

  var overlayTarget = document.createElement('img');
  overlayTarget.src = '/v1/captures/' + id2 + '/artifacts/screenshot';
  overlayTarget.alt = 'Target capture screenshot';
  overlayTarget.className = 'diff-overlay-img diff-overlay-img--top';
  overlayTarget.setAttribute('aria-hidden', 'true');
  overlayContainer.appendChild(overlayTarget);

  var sliderLine = document.createElement('div');
  sliderLine.className = 'diff-overlay-line';
  sliderLine.setAttribute('aria-hidden', 'true');
  overlayContainer.appendChild(sliderLine);

  var sliderHandle = document.createElement('div');
  sliderHandle.className = 'diff-overlay-slider';
  sliderHandle.setAttribute('role', 'slider');
  sliderHandle.setAttribute('tabindex', '0');
  sliderHandle.setAttribute('aria-valuemin', '0');
  sliderHandle.setAttribute('aria-valuemax', '100');
  sliderHandle.setAttribute('aria-valuenow', '50');
  sliderHandle.setAttribute('aria-label', 'Screenshot comparison slider');
  overlayContainer.appendChild(sliderHandle);

  panelOverlay.appendChild(overlayContainer);

  var overlayHint = document.createElement('p');
  overlayHint.className = 'diff-screenshot-caption';
  overlayHint.textContent = 'Drag or use arrow keys to compare screenshots';
  panelOverlay.appendChild(overlayHint);
  panelEls.push(panelOverlay);

  // --- Panel: Pixel diff ---
  var panelDiff = document.createElement('div');
  panelDiff.className = 'diff-panel';
  panelDiff.id = 'panel-diff';
  panelDiff.setAttribute('role', 'tabpanel');
  panelDiff.setAttribute('aria-labelledby', 'tab-diff');
  panelDiff.setAttribute('tabindex', '-1');
  panelDiff.setAttribute('hidden', '');

  var diffCanvasWrap = document.createElement('div');
  diffCanvasWrap.className = 'diff-canvas-wrap';
  diffCanvasWrap.id = 'diff-canvas-wrap';

  var diffStatusMsg = document.createElement('p');
  diffStatusMsg.className = 'diff-screenshot-caption';
  diffStatusMsg.id = 'diff-canvas-status';
  diffStatusMsg.style.padding = 'var(--space-4)';
  diffStatusMsg.textContent = 'Activate this tab to compute pixel diff';
  diffCanvasWrap.appendChild(diffStatusMsg);
  panelDiff.appendChild(diffCanvasWrap);
  panelEls.push(panelDiff);

  for (var p = 0; p < panelEls.length; p++) {
    panelContainer.appendChild(panelEls[p]);
  }

  // Tab state
  var diffComputed = false;
  var overlayInitialized = false;

  function activateTab(idx) {
    for (var k = 0; k < tabEls.length; k++) {
      tabEls[k].setAttribute('aria-selected', k === idx ? 'true' : 'false');
      tabEls[k].setAttribute('tabindex', k === idx ? '0' : '-1');
      if (k === idx) {
        panelEls[k].removeAttribute('hidden');
      } else {
        panelEls[k].setAttribute('hidden', '');
      }
    }
    panelEls[idx].focus();

    if (idx === 2 && !diffComputed) {
      diffComputed = true;
      computeDiffCanvas();
    }
    if (idx === 1 && !overlayInitialized) {
      overlayInitialized = true;
      initOverlaySlider(50);
    }
  }

  function computeDiffCanvas() {
    var statusEl = document.getElementById('diff-canvas-status');
    var wrapEl = document.getElementById('diff-canvas-wrap');
    if (!wrapEl) return;

    var baseImg = document.getElementById('diff-img-base');
    var targetImg = document.getElementById('diff-img-target');

    if (!baseImg || !targetImg) {
      if (statusEl) statusEl.textContent = 'Screenshots not available for diff.';
      return;
    }

    function runDiff() {
      if (statusEl) statusEl.textContent = 'Computing pixel diff...';
      try {
        var result = computePixelDiff(baseImg, targetImg);
        if (result.tooLarge) {
          if (statusEl) statusEl.textContent = 'Screenshots are too large for in-browser pixel diff.';
          return;
        }
        if (statusEl) statusEl.remove();

        var canvas = result.canvas;
        canvas.className = 'diff-canvas';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Pixel diff: changed pixels shown in magenta');
        wrapEl.appendChild(canvas);

        var pctMsg = document.createElement('p');
        pctMsg.className = 'diff-screenshot-caption';
        pctMsg.textContent = result.changedPercent + '% of pixels changed';
        panelDiff.appendChild(pctMsg);
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Could not compute pixel diff: ' + (err.message || 'Unknown error');
      }
    }

    var needed = 2;
    function onLoad() {
      needed--;
      if (needed <= 0) runDiff();
    }
    function onError() {
      if (statusEl) statusEl.textContent = 'Could not load screenshots for pixel diff.';
    }

    if (baseImg.complete && baseImg.naturalWidth > 0) {
      needed--;
    } else {
      baseImg.addEventListener('load', onLoad);
      baseImg.addEventListener('error', onError);
    }
    if (targetImg.complete && targetImg.naturalWidth > 0) {
      needed--;
    } else {
      targetImg.addEventListener('load', onLoad);
      targetImg.addEventListener('error', onError);
    }
    if (needed <= 0) runDiff();
  }

  // Tab keyboard navigation
  tabBar.addEventListener('keydown', function(e) {
    var currentIdx = -1;
    for (var k = 0; k < tabEls.length; k++) {
      if (tabEls[k].getAttribute('aria-selected') === 'true') { currentIdx = k; break; }
    }
    if (currentIdx === -1) return;
    var nextIdx = currentIdx;
    if (e.key === 'ArrowRight') {
      nextIdx = (currentIdx + 1) % tabEls.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (currentIdx - 1 + tabEls.length) % tabEls.length;
    } else {
      return;
    }
    e.preventDefault();
    tabEls[nextIdx].focus();
    activateTab(nextIdx);
  });

  for (var ti = 0; ti < tabEls.length; ti++) {
    (function(idx) {
      tabEls[idx].addEventListener('click', function() { activateTab(idx); });
      tabEls[idx].addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTab(idx); }
      });
    })(ti);
  }

  section.appendChild(tabBar);
  section.appendChild(panelContainer);
  return section;
}

// ---------------------------------------------------------------------------
// Overlay slider
// ---------------------------------------------------------------------------

function initOverlaySlider(initialPct) {
  var container = document.getElementById('diff-overlay-container');
  if (!container) return;

  var topImg = container.querySelector('.diff-overlay-img--top');
  var line = container.querySelector('.diff-overlay-line');
  var sliderHandle = container.querySelector('.diff-overlay-slider');
  if (!topImg || !line || !sliderHandle) return;

  var pct = initialPct;

  function applyPct(val) {
    pct = Math.max(0, Math.min(100, val));
    topImg.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
    sliderHandle.style.left = pct + '%';
    line.style.left = pct + '%';
    sliderHandle.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  applyPct(pct);

  sliderHandle.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight')     { e.preventDefault(); applyPct(pct + 5); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); applyPct(pct - 5); }
    else if (e.key === 'Home')      { e.preventDefault(); applyPct(0); }
    else if (e.key === 'End')       { e.preventDefault(); applyPct(100); }
  });

  var dragging = false;

  function getPctFromEvent(e) {
    var rect = container.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return ((clientX - rect.left) / rect.width) * 100;
  }

  sliderHandle.addEventListener('mousedown', function(e) { e.preventDefault(); dragging = true; });
  sliderHandle.addEventListener('touchstart', function() { dragging = true; }, { passive: true });
  document.addEventListener('mousemove',  function(e) { if (dragging) applyPct(getPctFromEvent(e)); });
  document.addEventListener('touchmove',  function(e) { if (dragging) applyPct(getPctFromEvent(e)); }, { passive: true });
  document.addEventListener('mouseup',   function() { dragging = false; });
  document.addEventListener('touchend',  function() { dragging = false; });
}

// ---------------------------------------------------------------------------
// Capture details two-column section
// ---------------------------------------------------------------------------

function buildCaptureDetailsSection(base, target) {
  var section = document.createElement('section');
  section.className = 'section detail-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'Capture Details';
  section.appendChild(h2);

  var grid = document.createElement('div');
  grid.className = 'diff-details-grid';

  function buildCol(label, data) {
    var col = document.createElement('div');
    col.className = 'diff-details-col';

    var colH = document.createElement('h3');
    colH.className = 'diff-details-col-heading';
    colH.textContent = label;
    col.appendChild(colH);

    var dl = document.createElement('dl');
    dl.className = 'data-grid diff-data-grid';

    function addRow(labelText, valueText) {
      var row = document.createElement('div');
      row.className = 'data-row';
      var dt = document.createElement('dt');
      dt.className = 'data-label';
      dt.textContent = labelText;
      var dd = document.createElement('dd');
      dd.className = 'data-value';
      dd.textContent = valueText || '';
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    }

    if (data) {
      addRow('ID', data.id || '');
      addRow('URL', data.url || '');
      addRow('Captured', diffFormatDatetime(data.completedAt || data.createdAt));
    } else {
      addRow('Status', 'Not available');
    }

    col.appendChild(dl);
    return col;
  }

  grid.appendChild(buildCol('Base', base));
  grid.appendChild(buildCol('Target', target));
  section.appendChild(grid);
  return section;
}

// ---------------------------------------------------------------------------
// HTML diff section
// ---------------------------------------------------------------------------

function buildHtmlDiffSection(hunks, truncated) {
  var section = document.createElement('section');
  section.className = 'section detail-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'HTML Changes';
  section.appendChild(h2);

  if (!hunks || hunks.length === 0) {
    var noChange = document.createElement('p');
    noChange.className = 'diff-no-changes';
    noChange.textContent = 'No HTML changes detected.';
    section.appendChild(noChange);
    return section;
  }

  var codeWrap = document.createElement('div');
  codeWrap.className = 'diff-code-block';

  for (var h = 0; h < hunks.length; h++) {
    var hunk = hunks[h];

    if (h > 0) {
      var sep = document.createElement('div');
      sep.className = 'diff-separator';
      sep.setAttribute('aria-hidden', 'true');
      codeWrap.appendChild(sep);
    }

    var lines = hunk.lines || [];
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      var lineDiv = document.createElement('div');
      lineDiv.className = 'diff-line';

      // type is 'add' | 'remove' | 'context' (normalised)
      var lineType = line.type || 'context';
      if (lineType === 'add')    { lineDiv.classList.add('diff-line--add'); }
      if (lineType === 'remove') { lineDiv.classList.add('diff-line--remove'); }

      // Gutter: two number columns (base line, target line)
      var gutter = document.createElement('span');
      gutter.className = 'diff-gutter';
      gutter.setAttribute('aria-hidden', 'true');

      var baseNum = document.createElement('span');
      baseNum.className = 'diff-gutter-num';
      baseNum.textContent = (line.baseLineNo != null) ? String(line.baseLineNo) : '';
      gutter.appendChild(baseNum);

      var targetNum = document.createElement('span');
      targetNum.className = 'diff-gutter-num';
      targetNum.textContent = (line.targetLineNo != null) ? String(line.targetLineNo) : '';
      gutter.appendChild(targetNum);

      lineDiv.appendChild(gutter);

      // Prefix character
      var prefix = document.createElement('span');
      prefix.className = 'diff-prefix';
      prefix.setAttribute('aria-hidden', 'true');
      prefix.textContent = lineType === 'add' ? '+' : lineType === 'remove' ? '-' : ' ';
      lineDiv.appendChild(prefix);

      // Content: always textContent, NEVER innerHTML
      var content = document.createElement('span');
      content.className = 'diff-content';
      content.textContent = line.content || '';
      lineDiv.appendChild(content);

      codeWrap.appendChild(lineDiv);
    }
  }

  section.appendChild(codeWrap);

  if (truncated) {
    var truncNote = document.createElement('p');
    truncNote.className = 'diff-truncation-note';
    truncNote.setAttribute('role', 'note');
    truncNote.textContent = 'Diff truncated. Only the first portion of changes is shown.';
    section.appendChild(truncNote);
  }

  return section;
}

// ---------------------------------------------------------------------------
// Header diff section
// ---------------------------------------------------------------------------

function buildHeaderDiffSection(headerChanges, unchangedHeaderCount) {
  var section = document.createElement('section');
  section.className = 'section detail-section';

  var h2 = document.createElement('h2');
  h2.textContent = 'Header Changes';
  section.appendChild(h2);

  if (!headerChanges || headerChanges.length === 0) {
    var noChange = document.createElement('p');
    noChange.className = 'diff-no-changes';
    noChange.textContent = 'No header changes detected.';
    section.appendChild(noChange);

    if (unchangedHeaderCount > 0) {
      var unchangedNote = document.createElement('p');
      unchangedNote.className = 'diff-no-changes';
      unchangedNote.style.marginTop = 'var(--space-1)';
      unchangedNote.textContent = unchangedHeaderCount + ' header' +
        (unchangedHeaderCount === 1 ? '' : 's') + ' unchanged.';
      section.appendChild(unchangedNote);
    }
    return section;
  }

  var table = document.createElement('table');
  table.className = 'diff-header-table';

  var thead = document.createElement('thead');
  var headRow = document.createElement('tr');
  var colLabels = ['Header', 'Base', 'Target'];
  for (var ci = 0; ci < colLabels.length; ci++) {
    var th = document.createElement('th');
    th.textContent = colLabels[ci];
    th.scope = 'col';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');

  for (var c = 0; c < headerChanges.length; c++) {
    var hc = headerChanges[c];
    var tr = document.createElement('tr');
    tr.className = 'diff-row--' + (hc.type || 'unchanged');

    var tdName = document.createElement('td');
    if (hc.type === 'change') {
      tdName.setAttribute('aria-label', hc.name + ': changed from ' + (hc.base || '') + ' to ' + (hc.target || ''));
    } else if (hc.type === 'add') {
      tdName.setAttribute('aria-label', hc.name + ': added with value ' + (hc.target || ''));
    } else if (hc.type === 'remove') {
      tdName.setAttribute('aria-label', hc.name + ': removed, was ' + (hc.base || ''));
    }
    tdName.textContent = hc.name || '';
    tr.appendChild(tdName);

    var tdBase = document.createElement('td');
    tdBase.textContent = hc.base || '';
    tr.appendChild(tdBase);

    var tdTarget = document.createElement('td');
    tdTarget.textContent = hc.target || '';
    tr.appendChild(tdTarget);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  section.appendChild(table);

  // Unchanged count disclosure (API returns count only, not individual values)
  if (unchangedHeaderCount > 0) {
    var details = document.createElement('details');
    details.className = 'diff-unchanged-headers disclosure';
    details.style.marginTop = 'var(--space-3)';

    var summaryEl = document.createElement('summary');
    summaryEl.textContent = unchangedHeaderCount + ' header' +
      (unchangedHeaderCount === 1 ? '' : 's') + ' unchanged';
    details.appendChild(summaryEl);

    var note = document.createElement('p');
    note.style.padding = 'var(--space-2) var(--space-3)';
    note.style.fontSize = 'var(--text-sm)';
    note.style.color = 'var(--color-text-muted)';
    note.textContent = 'Individual values are not returned for unchanged headers.';
    details.appendChild(note);

    section.appendChild(details);
  }

  return section;
}

// ---------------------------------------------------------------------------
// Summary banner
// ---------------------------------------------------------------------------

function buildSummaryBanner(normalised) {
  var banner = document.createElement('div');
  banner.className = 'diff-summary-banner';

  var parts = [];

  if (normalised) {
    var htmlChangedLines = normalised.htmlChangedLines || 0;
    if (htmlChangedLines > 0) {
      parts.push(htmlChangedLines + ' HTML ' + (htmlChangedLines === 1 ? 'change' : 'changes'));
    } else {
      parts.push('No HTML changes');
    }

    parts.push(normalised.screenshotChanged ? 'Screenshot changed' : 'Screenshot identical');

    var headerCount = normalised.headerChanges ? normalised.headerChanges.length : 0;
    if (headerCount > 0) {
      parts.push(headerCount + ' header ' + (headerCount === 1 ? 'change' : 'changes'));
    }
  } else {
    parts.push('Loading diff...');
  }

  banner.textContent = parts.join(' | ');
  return banner;
}

// ---------------------------------------------------------------------------
// renderDiff -- builds DOM skeleton with loading state
// ---------------------------------------------------------------------------

function renderDiff(id1, id2) {
  var view = document.getElementById('view');
  if (!view) return;
  // Safe: clearing the view container
  view.textContent = '';
  document.title = 'Diff \u2014 Web Resource Ledger';

  // Back link to target capture
  var back = document.createElement('a');
  back.href = '#/captures/' + id2;
  back.className = 'detail-back-link';
  back.textContent = 'Back to capture';
  view.appendChild(back);

  // Placeholder banner
  var bannerEl = document.createElement('div');
  bannerEl.className = 'diff-summary-banner diff-summary-banner--loading';
  bannerEl.id = 'diff-summary-banner';
  bannerEl.setAttribute('aria-live', 'polite');
  bannerEl.textContent = 'Loading diff\u2026';
  view.appendChild(bannerEl);

  // Card skeleton
  var card = document.createElement('div');
  card.className = 'card detail-card';
  card.id = 'diff-card';

  var loadingWrap = document.createElement('div');
  loadingWrap.className = 'detail-loading';
  loadingWrap.setAttribute('role', 'status');
  loadingWrap.setAttribute('aria-label', 'Loading diff');

  var spinner = document.createElement('div');
  spinner.className = 'detail-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  loadingWrap.appendChild(spinner);

  var loadingText = document.createElement('p');
  loadingText.className = 'detail-loading-text';
  loadingText.textContent = 'Loading diff\u2026';
  loadingWrap.appendChild(loadingText);

  card.appendChild(loadingWrap);
  view.appendChild(card);
}

// ---------------------------------------------------------------------------
// mountDiff -- fetches diff data from API and renders results
// ---------------------------------------------------------------------------

function mountDiff(id1, id2) {
  apiFetch('/v1/captures/' + id1 + '/diff/' + id2).then(function(res) {
    if (!res) return; // 401 handled by apiFetch

    var view = document.getElementById('view');
    var card = document.getElementById('diff-card');
    if (!view || !card) return;

    if (!res.ok) {
      card.textContent = '';
      var errDiv = document.createElement('div');
      errDiv.className = 'alert alert--error';
      errDiv.setAttribute('role', 'alert');
      errDiv.style.margin = 'var(--space-6)';
      errDiv.textContent = res.status === 404
        ? 'One or both captures not found.'
        : 'Could not load diff (HTTP ' + res.status + ').';
      card.appendChild(errDiv);

      var bannerEl = document.getElementById('diff-summary-banner');
      if (bannerEl) bannerEl.textContent = 'Error loading diff';
      return;
    }

    res.json().then(function(data) {
      var v = document.getElementById('view');
      var c = document.getElementById('diff-card');
      if (!v || !c) return;

      var normalised = normaliseApiResponse(data);

      // Update summary banner
      var bannerEl = document.getElementById('diff-summary-banner');
      if (bannerEl) {
        bannerEl.parentNode.replaceChild(buildSummaryBanner(normalised), bannerEl);
      }

      // Clear loading state
      c.textContent = '';

      c.appendChild(buildCaptureDetailsSection(normalised.base, normalised.target));
      c.appendChild(buildScreenshotSection(id1, id2, normalised));
      c.appendChild(buildHtmlDiffSection(normalised.hunks, normalised.htmlTruncated));
      c.appendChild(buildHeaderDiffSection(normalised.headerChanges, normalised.unchangedHeaderCount));

      document.title = 'Diff \u2014 Web Resource Ledger';

      var backLink = v.querySelector('.detail-back-link');
      if (backLink) backLink.focus();
    }).catch(function() {
      var c = document.getElementById('diff-card');
      if (!c) return;
      c.textContent = '';
      var errDiv = document.createElement('div');
      errDiv.className = 'alert alert--error';
      errDiv.setAttribute('role', 'alert');
      errDiv.style.margin = 'var(--space-6)';
      errDiv.textContent = 'Could not parse diff data.';
      c.appendChild(errDiv);
    });
  }).catch(function(err) {
    var c = document.getElementById('diff-card');
    if (!c) return;
    c.textContent = '';
    var errDiv = document.createElement('div');
    errDiv.className = 'alert alert--error';
    errDiv.setAttribute('role', 'alert');
    errDiv.style.margin = 'var(--space-6)';
    errDiv.textContent = (err && err.message === 'fetch_timeout')
      ? 'Connection timed out. Check your network and try again.'
      : 'Connection failed. Check your network and try again.';
    c.appendChild(errDiv);
  });
}
`;
