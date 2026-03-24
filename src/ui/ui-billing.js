// tva
// Billing dashboard view for WRL.
// Exports a JS string constant for inline use in the HTML shell.

export const BILLING_JS = `
// ---------------------------------------------------------------------------
// Billing module state
// ---------------------------------------------------------------------------

var _billingLiveEl = null;
var _lastBillingStatus = null;

// ---------------------------------------------------------------------------
// Pure helper functions (extracted for testability via evalFromSource)
// ---------------------------------------------------------------------------

function formatCurrency(amount) {
  var n = parseFloat(amount);
  if (!isFinite(n)) return 'EUR 0.00';
  return 'EUR ' + n.toFixed(2);
}

function billingStatusLabel(status) {
  if (status === 'free') return 'Free';
  if (status === 'active') return 'Active';
  if (status === 'grace_period') return 'Grace period';
  if (status === 'blocked') return 'Blocked';
  return status || 'Unknown';
}

function tierDescription(tier) {
  if (!tier) return '';
  if (tier.unitPrice === 0) {
    var toStr = tier.to ? 'up to ' + tier.to.toLocaleString() + ' captures per month at no charge' : 'free';
    return ' \u2014 ' + toStr;
  }
  return ' \u2014 EUR ' + tier.unitPrice.toFixed(3).replace(/0+$/, '').replace(/\\.$/, '') + ' per capture';
}

function shouldShowCheckout(hasPaymentMethod, billingStatus) {
  return !hasPaymentMethod && (billingStatus === 'free' || !billingStatus);
}

function thresholdPercent(amount, threshold) {
  if (!threshold || threshold <= 0) return 0;
  var pct = Math.round((amount / threshold) * 100);
  return Math.min(100, Math.max(0, pct));
}

function thresholdClass(pct) {
  if (pct >= 95) return 'usage-bar-fill--critical';
  if (pct >= 80) return 'usage-bar-fill--warning';
  return '';
}

// ---------------------------------------------------------------------------
// Announce helper
// ---------------------------------------------------------------------------

function billingAnnounce(message) {
  if (!_billingLiveEl) return;
  _billingLiveEl.textContent = '';
  setTimeout(function() { _billingLiveEl.textContent = message; }, 50);
}

// ---------------------------------------------------------------------------
// renderBilling() -- builds DOM skeleton for the billing view
// ---------------------------------------------------------------------------

function renderBilling() {
  document.title = 'Billing \u2014 WRL';

  var view = document.getElementById('view');
  // Safe: clearing the static view container; no user or API data involved
  view.textContent = '';

  // aria-live region for status announcements (sr-only, not visible)
  var liveEl = document.createElement('div');
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  liveEl.className = 'sr-only';
  liveEl.id = 'billing-live';
  view.appendChild(liveEl);
  _billingLiveEl = liveEl;

  var h1 = document.createElement('h1');
  h1.className = 'captures-heading';
  h1.tabIndex = -1;
  h1.textContent = 'Billing';
  view.appendChild(h1);

  // Loading state for initial data fetch
  var loadingEl = document.createElement('p');
  loadingEl.id = 'billing-loading';
  loadingEl.className = 'view-placeholder';
  loadingEl.textContent = 'Loading billing information...';
  view.appendChild(loadingEl);

  h1.focus();
}

// ---------------------------------------------------------------------------
// mountBilling() -- fetch data and build full content
// ---------------------------------------------------------------------------

function mountBilling() {
  var view = document.getElementById('view');
  var loadingEl = document.getElementById('billing-loading');
  if (!view) return;

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

  Promise.all([usagePromise, settingsPromise])
    .then(function(results) {
      var usageData = results[0];
      var settingsData = results[1];

      if (loadingEl) loadingEl.remove();

      if (!usageData) {
        var errEl = document.createElement('div');
        errEl.className = 'alert alert--error';
        errEl.setAttribute('role', 'alert');
        errEl.textContent = 'Could not load billing information. Please try refreshing.';
        view.appendChild(errEl);
        return;
      }

      _lastBillingStatus = usageData.billingStatus || null;
      buildBillingContent(usageData, settingsData);
    })
    .catch(function() {
      if (loadingEl) loadingEl.remove();
      var netErrEl = document.createElement('div');
      netErrEl.className = 'alert alert--error';
      netErrEl.setAttribute('role', 'alert');
      netErrEl.textContent = 'Connection failed loading billing information. Check your network.';
      view.appendChild(netErrEl);
    });
}

// ---------------------------------------------------------------------------
// buildBillingContent -- orchestrates section builders (pure of side effects)
// ---------------------------------------------------------------------------

function buildBillingContent(usageData, settingsData) {
  var view = document.getElementById('view');
  if (!view) return;

  // Remove any previous content sections (keep live region + h1)
  var existing = view.querySelectorAll('section, .billing-status-banner, .billing-refresh-row');
  for (var i = 0; i < existing.length; i++) {
    existing[i].remove();
  }

  // Section A: Status banner (conditional)
  var banner = buildStatusBanner(usageData);
  if (banner) view.appendChild(banner);

  // Refresh row (below banner, above sections)
  view.appendChild(buildRefreshRow(usageData));

  // Section B: Current period summary
  view.appendChild(buildPeriodSummary(usageData));

  // Section C: Invoice threshold progress
  var thresholdSection = buildThresholdSection(usageData);
  if (thresholdSection) view.appendChild(thresholdSection);

  // Section D: Graduated pricing tiers
  view.appendChild(buildPricingSection(usageData));

  // Section E: eIDAS add-on (conditional)
  if (settingsData && settingsData.qualifiedTimestamps) {
    view.appendChild(buildEidasSection(usageData));
  }

  // Section F: Payment and portal
  view.appendChild(buildPaymentSection(usageData));
}

// ---------------------------------------------------------------------------
// Section A: Status banner
// ---------------------------------------------------------------------------

function buildStatusBanner(usageData) {
  var status = usageData.billingStatus;
  if (status !== 'grace_period' && status !== 'blocked') return null;

  var banner = document.createElement('div');
  banner.className = 'billing-status-banner alert';

  var msg = document.createElement('p');

  if (status === 'grace_period') {
    banner.setAttribute('role', 'status');
    banner.classList.add('alert--warning');

    var graceDateStr = '';
    if (usageData.gracePeriodEnd) {
      try {
        graceDateStr = new Date(usageData.gracePeriodEnd).toLocaleDateString(undefined, {
          year: 'numeric', month: 'long', day: 'numeric'
        });
      } catch (e) {
        graceDateStr = usageData.gracePeriodEnd;
      }
    }

    msg.textContent = 'Payment issue detected. Please update your payment method' +
      (graceDateStr ? ' by ' + graceDateStr : '') + '.';

  } else if (status === 'blocked') {
    banner.setAttribute('role', 'alert');
    banner.classList.add('alert--error');
    msg.textContent = 'Captures paused due to payment failure. Update your payment method to resume.';
  }

  banner.appendChild(msg);

  var updateBtn = document.createElement('button');
  updateBtn.type = 'button';
  updateBtn.className = 'btn btn--primary btn--sm';
  updateBtn.style.marginTop = 'var(--space-2)';
  updateBtn.textContent = 'Update payment method';
  updateBtn.addEventListener('click', function() {
    handlePortalRedirect(updateBtn);
  });
  banner.appendChild(updateBtn);

  return banner;
}

// ---------------------------------------------------------------------------
// Section B: Current period summary
// ---------------------------------------------------------------------------

function buildPeriodSummary(usageData) {
  var billing = usageData.billing || {};
  var section = document.createElement('section');
  section.className = 'settings-section card';
  section.setAttribute('aria-labelledby', 'billing-period-heading');

  var h2 = document.createElement('h2');
  h2.id = 'billing-period-heading';
  h2.className = 'settings-section-heading';
  h2.textContent = formatPeriod(usageData.period) || 'Current Period';
  section.appendChild(h2);

  // Three-stat row
  var statsRow = document.createElement('div');
  statsRow.className = 'billing-stats-row';

  // Stat 1: Capture count
  var captureCount = (usageData.captures && usageData.captures.used != null)
    ? usageData.captures.used : 0;
  statsRow.appendChild(buildStatCell(String(captureCount), 'Captures'));

  // Stat 2: Current charges
  var charges = billing.currentCharges || {};
  statsRow.appendChild(buildStatCell(
    formatCurrency(charges.amount != null ? charges.amount : 0),
    'Current charges'
  ));

  // Stat 3: Current tier with sr-only description
  var tier = billing.tier || null;
  var tierName = tier ? tier.name : 'Free';

  var tierCell = document.createElement('div');
  tierCell.className = 'billing-stat';

  var tierValueEl = document.createElement('span');
  tierValueEl.className = 'billing-stat-value';
  tierValueEl.textContent = tierName;

  var tierDescSpan = document.createElement('span');
  tierDescSpan.className = 'sr-only';
  tierDescSpan.textContent = tierDescription(tier);
  tierValueEl.appendChild(tierDescSpan);

  var tierLabelEl = document.createElement('span');
  tierLabelEl.className = 'billing-stat-label';
  tierLabelEl.textContent = 'Pricing tier';

  tierCell.appendChild(tierValueEl);
  tierCell.appendChild(tierLabelEl);
  statsRow.appendChild(tierCell);

  section.appendChild(statsRow);

  // Reset date note
  if (usageData.resetsAt) {
    var resetNote = document.createElement('p');
    resetNote.className = 'text-muted';
    resetNote.style.fontSize = 'var(--text-sm)';
    resetNote.style.marginTop = 'var(--space-3)';
    try {
      var resetDate = new Date(usageData.resetsAt).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      resetNote.textContent = 'Period resets ' + resetDate;
    } catch (e) {
      resetNote.textContent = 'Period resets ' + usageData.resetsAt;
    }
    section.appendChild(resetNote);
  }

  return section;
}

function buildStatCell(value, label) {
  var cell = document.createElement('div');
  cell.className = 'billing-stat';

  var valueEl = document.createElement('span');
  valueEl.className = 'billing-stat-value';
  valueEl.textContent = value;
  cell.appendChild(valueEl);

  var labelEl = document.createElement('span');
  labelEl.className = 'billing-stat-label';
  labelEl.textContent = label;
  cell.appendChild(labelEl);

  return cell;
}

// ---------------------------------------------------------------------------
// Section C: Invoice threshold progress
// ---------------------------------------------------------------------------

function buildThresholdSection(usageData) {
  var billing = usageData.billing || {};
  var invoiceThreshold = billing.invoiceThreshold;
  var billingStatus = usageData.billingStatus;

  // Hide for free users with no payment method (irrelevant -- won't be invoiced)
  if (billingStatus === 'free' && !usageData.hasPaymentMethod) return null;
  if (!invoiceThreshold) return null;

  var thresholdAmount = invoiceThreshold.amount || 5.00;
  var thresholdCents = Math.round(thresholdAmount * 100);
  var currentAmount = (billing.currentCharges && billing.currentCharges.amount != null)
    ? billing.currentCharges.amount : 0;
  var currentCents = Math.round(currentAmount * 100);
  var pct = thresholdPercent(currentAmount, thresholdAmount);
  var fillCls = thresholdClass(pct);

  var section = document.createElement('section');
  section.className = 'settings-section card';
  section.setAttribute('aria-labelledby', 'billing-threshold-heading');

  var h2 = document.createElement('h2');
  h2.id = 'billing-threshold-heading';
  h2.className = 'settings-section-heading';
  h2.textContent = 'Invoice Threshold';
  section.appendChild(h2);

  var metric = document.createElement('div');
  metric.className = 'usage-metric';

  var header = document.createElement('div');
  header.className = 'usage-metric-header';

  var labelEl = document.createElement('span');
  labelEl.className = 'usage-metric-label';
  labelEl.textContent = formatCurrency(currentAmount) + ' of ' + formatCurrency(thresholdAmount) + ' invoice threshold';
  header.appendChild(labelEl);
  metric.appendChild(header);

  var bar = document.createElement('div');
  bar.className = 'usage-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuenow', String(currentCents));
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(thresholdCents));
  // SHORT label -- do not repeat valuetext to avoid double-announcement
  bar.setAttribute('aria-label', 'Invoice threshold');
  bar.setAttribute('aria-valuetext', formatCurrency(currentAmount) + ' of ' + formatCurrency(thresholdAmount));

  var fill = document.createElement('div');
  fill.className = 'usage-bar-fill' + (fillCls ? ' ' + fillCls : '');
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  metric.appendChild(bar);
  section.appendChild(metric);

  if (invoiceThreshold.met) {
    var metNote = document.createElement('p');
    metNote.style.fontSize = 'var(--text-sm)';
    metNote.style.marginTop = 'var(--space-2)';
    metNote.style.color = 'var(--color-success-text)';
    metNote.textContent = 'Invoice will be issued at period end.';
    section.appendChild(metNote);
  } else {
    var deferNote = document.createElement('p');
    deferNote.className = 'text-muted';
    deferNote.style.fontSize = 'var(--text-sm)';
    deferNote.style.marginTop = 'var(--space-2)';
    deferNote.textContent = 'Charges under ' + formatCurrency(thresholdAmount) + ' are deferred to next period.';
    section.appendChild(deferNote);
  }

  return section;
}

// ---------------------------------------------------------------------------
// Section D: Graduated pricing tiers
// ---------------------------------------------------------------------------

function buildPricingSection(usageData) {
  var billing = usageData.billing || {};
  var tiers = billing.tiers || [];
  var activeTier = billing.tier || null;

  var section = document.createElement('section');
  section.className = 'settings-section card';
  section.setAttribute('aria-labelledby', 'billing-pricing-heading');

  var h2 = document.createElement('h2');
  h2.id = 'billing-pricing-heading';
  h2.className = 'settings-section-heading';
  h2.textContent = 'Pricing';
  section.appendChild(h2);

  // Current tier inline summary as dl
  if (activeTier) {
    var dl = document.createElement('dl');
    dl.style.marginBottom = 'var(--space-3)';
    dl.style.display = 'flex';
    dl.style.gap = 'var(--space-2)';
    dl.style.flexWrap = 'wrap';
    dl.style.alignItems = 'baseline';

    var dt = document.createElement('dt');
    dt.className = 'text-muted';
    dt.style.fontSize = 'var(--text-sm)';
    dt.textContent = 'Current tier:';
    dl.appendChild(dt);

    var dd = document.createElement('dd');
    dd.style.fontSize = 'var(--text-sm)';
    dd.style.fontWeight = 'var(--weight-medium)';
    var priceStr = activeTier.unitPrice === 0 ? 'free'
      : 'EUR ' + activeTier.unitPrice.toFixed(3).replace(/0+$/, '').replace(/\\.$/, '') + '/capture';
    dd.textContent = activeTier.name + ' (' + priceStr + ')';
    dl.appendChild(dd);

    section.appendChild(dl);
  }

  // Tiers disclosure (collapsed by default)
  if (tiers.length > 0) {
    var details = document.createElement('details');
    details.className = 'disclosure';

    var summary = document.createElement('summary');
    summary.textContent = 'View all tiers';
    details.appendChild(summary);

    var tableWrap = document.createElement('div');
    tableWrap.style.padding = 'var(--space-3) var(--space-4) var(--space-4)';
    tableWrap.style.overflowX = 'auto';

    var table = document.createElement('table');
    table.className = 'billing-tier-table';
    table.setAttribute('aria-label', 'Pricing tiers');

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Tier', 'Range', 'Price per capture'].forEach(function(colName) {
      var th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = colName;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var i = 0; i < tiers.length; i++) {
      var tier = tiers[i];
      var isActive = activeTier && activeTier.id === tier.id;

      var fromStr = tier.from != null ? tier.from.toLocaleString() : '1';
      var toStr = tier.to != null ? tier.to.toLocaleString() : '';
      var rangeStr = tier.to != null ? (fromStr + '\u2013' + toStr) : (fromStr + '+');
      var priceStr = tier.unitPrice === 0 ? 'Free'
        : ('EUR ' + tier.unitPrice.toFixed(3).replace(/0+$/, '').replace(/\\.$/, ''));

      var tr = document.createElement('tr');
      if (isActive) {
        tr.className = 'billing-tier-active';
        tr.setAttribute('aria-current', 'true');
      }

      var tdName = document.createElement('td');
      tdName.setAttribute('data-label', 'Tier');
      tdName.textContent = tier.name || '';
      tr.appendChild(tdName);

      var tdRange = document.createElement('td');
      tdRange.setAttribute('data-label', 'Range');
      tdRange.textContent = rangeStr;
      tr.appendChild(tdRange);

      var tdPrice = document.createElement('td');
      tdPrice.setAttribute('data-label', 'Price per capture');
      tdPrice.textContent = priceStr;
      tr.appendChild(tdPrice);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    details.appendChild(tableWrap);
    section.appendChild(details);
  }

  return section;
}

// ---------------------------------------------------------------------------
// Section E: eIDAS add-on usage
// ---------------------------------------------------------------------------

function buildEidasSection(usageData) {
  var billing = usageData.billing || {};
  var eidasData = billing.eidas || null;

  var section = document.createElement('section');
  section.className = 'settings-section card';
  section.setAttribute('aria-labelledby', 'billing-eidas-heading');

  var h2 = document.createElement('h2');
  h2.id = 'billing-eidas-heading';
  h2.className = 'settings-section-heading';
  h2.textContent = 'Qualified Timestamps';
  section.appendChild(h2);

  if (!eidasData) {
    // API does not yet return eIDAS usage data -- degrade gracefully
    var note = document.createElement('p');
    note.style.fontSize = 'var(--text-sm)';
    note.textContent = 'Qualified Timestamps enabled. ';

    var portalLink = document.createElement('a');
    portalLink.href = '#';
    portalLink.style.color = 'var(--color-accent)';
    portalLink.textContent = 'View usage details in Stripe.';
    portalLink.addEventListener('click', function(e) {
      e.preventDefault();
      // Create a temporary button element to satisfy handlePortalRedirect signature
      var tmpBtn = document.createElement('button');
      tmpBtn.textContent = 'View usage details in Stripe.';
      handlePortalRedirect(tmpBtn);
    });
    note.appendChild(portalLink);
    section.appendChild(note);
  } else {
    // Future: eIDAS data present in API response
    var count = eidasData.count != null ? eidasData.count : 0;
    var eidasCharges = eidasData.charges != null ? eidasData.charges : 0;

    var dl = document.createElement('dl');
    dl.style.display = 'flex';
    dl.style.flexDirection = 'column';
    dl.style.gap = 'var(--space-2)';

    var dtCount = document.createElement('dt');
    dtCount.className = 'text-muted';
    dtCount.style.fontSize = 'var(--text-sm)';
    dtCount.textContent = 'Qualified timestamps this period';
    dl.appendChild(dtCount);

    var ddCount = document.createElement('dd');
    ddCount.style.fontWeight = 'var(--weight-medium)';
    ddCount.textContent = count.toLocaleString();
    dl.appendChild(ddCount);

    var dtCharges = document.createElement('dt');
    dtCharges.className = 'text-muted';
    dtCharges.style.fontSize = 'var(--text-sm)';
    dtCharges.textContent = 'Charges';
    dl.appendChild(dtCharges);

    var ddCharges = document.createElement('dd');
    ddCharges.style.fontWeight = 'var(--weight-medium)';
    ddCharges.textContent = formatCurrency(eidasCharges);
    dl.appendChild(ddCharges);

    section.appendChild(dl);

    var pricing = document.createElement('p');
    pricing.className = 'text-muted';
    pricing.style.fontSize = 'var(--text-sm)';
    pricing.style.marginTop = 'var(--space-2)';
    pricing.textContent = 'First 50 free, then EUR 0.10 each.';
    section.appendChild(pricing);
  }

  return section;
}

// ---------------------------------------------------------------------------
// Section F: Payment and portal
// ---------------------------------------------------------------------------

function buildPaymentSection(usageData) {
  var status = usageData.billingStatus;
  var hasPaymentMethod = !!usageData.hasPaymentMethod;

  var section = document.createElement('section');
  section.className = 'settings-section card';
  section.setAttribute('aria-labelledby', 'billing-payment-heading');

  var h2 = document.createElement('h2');
  h2.id = 'billing-payment-heading';
  h2.className = 'settings-section-heading';
  h2.textContent = 'Payment';
  section.appendChild(h2);

  // sr-only portal description for aria-describedby
  var portalDesc = document.createElement('span');
  portalDesc.id = 'billing-portal-desc';
  portalDesc.className = 'sr-only';
  portalDesc.textContent = "Opens Stripe's secure billing portal. You will leave this site.";
  section.appendChild(portalDesc);

  if (status === 'free' && !hasPaymentMethod) {
    var infoBox = document.createElement('div');
    infoBox.className = 'alert alert--info';
    infoBox.setAttribute('role', 'status');
    infoBox.style.marginBottom = 'var(--space-4)';
    infoBox.textContent = 'No payment method required. First 200 captures/month are free.';
    section.appendChild(infoBox);

    var setupBtn = document.createElement('button');
    setupBtn.type = 'button';
    setupBtn.className = 'btn btn--primary';
    setupBtn.textContent = 'Set up billing';
    setupBtn.setAttribute('aria-describedby', 'billing-portal-desc');
    setupBtn.addEventListener('click', function() {
      handleCheckoutRedirect(setupBtn);
    });
    section.appendChild(setupBtn);

  } else if (status === 'active' && hasPaymentMethod) {
    var activeRow = document.createElement('div');
    activeRow.style.display = 'flex';
    activeRow.style.alignItems = 'center';
    activeRow.style.gap = 'var(--space-4)';
    activeRow.style.flexWrap = 'wrap';

    var activeBadge = document.createElement('span');
    activeBadge.className = 'badge badge--pass';
    activeBadge.textContent = 'Payment method active';
    activeRow.appendChild(activeBadge);

    var manageBtn = document.createElement('button');
    manageBtn.type = 'button';
    manageBtn.className = 'btn btn--ghost btn--sm';
    manageBtn.textContent = 'Manage billing';
    manageBtn.setAttribute('aria-describedby', 'billing-portal-desc');
    manageBtn.addEventListener('click', function() {
      handlePortalRedirect(manageBtn);
    });
    activeRow.appendChild(manageBtn);

    section.appendChild(activeRow);

  } else if (status === 'grace_period') {
    var graceNote = document.createElement('p');
    graceNote.style.fontSize = 'var(--text-sm)';
    graceNote.style.marginBottom = 'var(--space-3)';
    graceNote.textContent = 'See the notice above to update your payment method.';
    section.appendChild(graceNote);

    var graceBtn = document.createElement('button');
    graceBtn.type = 'button';
    graceBtn.className = 'btn btn--secondary';
    graceBtn.textContent = 'Update payment method';
    graceBtn.setAttribute('aria-describedby', 'billing-portal-desc');
    graceBtn.addEventListener('click', function() {
      handlePortalRedirect(graceBtn);
    });
    section.appendChild(graceBtn);

  } else if (status === 'blocked') {
    var blockedNote = document.createElement('p');
    blockedNote.style.fontSize = 'var(--text-sm)';
    blockedNote.style.marginBottom = 'var(--space-3)';
    blockedNote.textContent = 'Captures are paused. Update your payment method to resume.';
    section.appendChild(blockedNote);

    var blockedBtn = document.createElement('button');
    blockedBtn.type = 'button';
    blockedBtn.className = 'btn btn--primary';
    blockedBtn.textContent = 'Update payment method';
    blockedBtn.setAttribute('aria-describedby', 'billing-portal-desc');
    blockedBtn.addEventListener('click', function() {
      handlePortalRedirect(blockedBtn);
    });
    section.appendChild(blockedBtn);

  } else {
    // Fallback for unexpected or transitional status values
    var fallbackNote = document.createElement('p');
    fallbackNote.className = 'text-muted';
    fallbackNote.style.fontSize = 'var(--text-sm)';
    fallbackNote.style.marginBottom = 'var(--space-3)';
    fallbackNote.textContent = billingStatusLabel(status);
    section.appendChild(fallbackNote);

    if (shouldShowCheckout(hasPaymentMethod, status)) {
      var fallbackCheckoutBtn = document.createElement('button');
      fallbackCheckoutBtn.type = 'button';
      fallbackCheckoutBtn.className = 'btn btn--primary';
      fallbackCheckoutBtn.textContent = 'Set up billing';
      fallbackCheckoutBtn.setAttribute('aria-describedby', 'billing-portal-desc');
      fallbackCheckoutBtn.addEventListener('click', function() {
        handleCheckoutRedirect(fallbackCheckoutBtn);
      });
      section.appendChild(fallbackCheckoutBtn);
    } else {
      var fallbackPortalBtn = document.createElement('button');
      fallbackPortalBtn.type = 'button';
      fallbackPortalBtn.className = 'btn btn--ghost';
      fallbackPortalBtn.textContent = 'Manage billing';
      fallbackPortalBtn.setAttribute('aria-describedby', 'billing-portal-desc');
      fallbackPortalBtn.addEventListener('click', function() {
        handlePortalRedirect(fallbackPortalBtn);
      });
      section.appendChild(fallbackPortalBtn);
    }
  }

  return section;
}

// ---------------------------------------------------------------------------
// Refresh row
// ---------------------------------------------------------------------------

function buildRefreshRow(usageData) {
  var row = document.createElement('div');
  row.className = 'billing-refresh-row usage-footer';
  row.style.marginBottom = 'var(--space-4)';

  var leftEl = document.createElement('span');
  leftEl.className = 'text-muted';
  leftEl.style.fontSize = 'var(--text-sm)';
  leftEl.textContent = 'Status: ' + billingStatusLabel(usageData.billingStatus);
  row.appendChild(leftEl);

  var refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'usage-refresh-btn';
  refreshBtn.textContent = '\u21bb';
  refreshBtn.setAttribute('aria-label', 'Refresh billing data');
  refreshBtn.addEventListener('click', function() {
    refreshBillingData();
  });
  row.appendChild(refreshBtn);

  return row;
}

// ---------------------------------------------------------------------------
// refreshBillingData -- re-fetch and rebuild billing content
// ---------------------------------------------------------------------------

function refreshBillingData() {
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

  Promise.all([usagePromise, settingsPromise])
    .then(function(results) {
      var usageData = results[0];
      var settingsData = results[1];

      if (!usageData) {
        billingAnnounce('Could not refresh billing data.');
        return;
      }

      var newStatus = usageData.billingStatus || null;
      var statusChanged = newStatus !== _lastBillingStatus;
      _lastBillingStatus = newStatus;

      buildBillingContent(usageData, settingsData);

      if (statusChanged) {
        billingAnnounce('Billing status updated: ' + billingStatusLabel(newStatus));
      }
    })
    .catch(function() {
      billingAnnounce('Connection failed refreshing billing data.');
    });
}

// ---------------------------------------------------------------------------
// Stripe redirect handlers
// ---------------------------------------------------------------------------

function handleCheckoutRedirect(btn) {
  btn.disabled = true;
  btn.textContent = 'Redirecting...';

  var returnUrl = window.location.origin + '/ui#/billing';

  apiFetch('/v1/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUrl: returnUrl }),
  }).then(function(res) {
    if (!res) {
      btn.disabled = false;
      btn.textContent = 'Set up billing';
      return;
    }
    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = 'Set up billing';
      billingAnnounce('Could not start billing setup (HTTP ' + res.status + '). Please try again.');
      return;
    }
    return res.json().then(function(data) {
      var url = data && data.url;
      if (typeof url !== 'string' ||
          !(url.startsWith('https://billing.stripe.com/') || url.startsWith('https://checkout.stripe.com/'))) {
        btn.disabled = false;
        btn.textContent = 'Set up billing';
        billingAnnounce('Invalid redirect URL received. Please try again.');
        return;
      }
      window.location.href = url;
    });
  }).catch(function() {
    btn.disabled = false;
    btn.textContent = 'Set up billing';
    billingAnnounce('Connection failed. Check your network and try again.');
  });
}

function handlePortalRedirect(btn) {
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Redirecting...';

  var returnUrl = window.location.origin + '/ui#/billing';

  apiFetch('/v1/billing/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUrl: returnUrl }),
  }).then(function(res) {
    if (!res) {
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }
    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = originalText;
      billingAnnounce('Could not open billing portal (HTTP ' + res.status + '). Please try again.');
      return;
    }
    return res.json().then(function(data) {
      var url = data && data.url;
      if (typeof url !== 'string' ||
          !(url.startsWith('https://billing.stripe.com/') || url.startsWith('https://checkout.stripe.com/'))) {
        btn.disabled = false;
        btn.textContent = originalText;
        billingAnnounce('Invalid redirect URL received. Please try again.');
        return;
      }
      window.location.href = url;
    });
  }).catch(function() {
    btn.disabled = false;
    btn.textContent = originalText;
    billingAnnounce('Connection failed. Check your network and try again.');
  });
}
`;
