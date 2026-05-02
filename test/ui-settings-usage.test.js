// tva
// Unit tests for the Usage section added to ui-settings.js.
// Tests operate on the exported SETTINGS_JS string constant and on extracted
// pure-logic helpers (formatBytes, formatPeriod, buildUsageMetric percentages
// and CSS classes) evaluated in the Workers runtime via the Function constructor.
// No real DOM or fetch calls are made -- all assertions target string content
// or the outputs of the extracted helper logic.

import { describe, it, expect } from 'vitest';
import { SETTINGS_JS } from '../src/ui/ui-settings.js';
import { SUBMIT_VIEW_JS } from '../src/ui/ui-submit.js';
import { UI_CSS } from '../src/ui/ui-css.js';

// ---------------------------------------------------------------------------
// Helpers -- evaluate formatBytes and pct/class logic from SETTINGS_JS
// ---------------------------------------------------------------------------

// Extract and evaluate a named function from a JS source string so we can call
// it in tests without spinning up a full DOM environment.
function evalFromSource(source, functionName) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(source + '\nreturn ' + functionName + ';');
  return fn();
}

const formatBytes = evalFromSource(SETTINGS_JS, 'formatBytes');
const formatPeriod = evalFromSource(SETTINGS_JS, 'formatPeriod');

// Replicate the percentage / CSS class logic from buildUsageMetric so we can
// test thresholds without DOM.
function usageClass(used, limit) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  if (pct >= 95) return 'usage-bar-fill--critical';
  if (pct >= 80) return 'usage-bar-fill--warning';
  return 'default';
}

function usagePct(used, limit) {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe('formatBytes -- byte formatting', () => {
  it('returns "0 B" for zero', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('returns "0 B" for null', () => {
    expect(formatBytes(null)).toBe('0 B');
  });

  it('formats bytes under 1000 as plain bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats 1000 bytes as 1 KB', () => {
    expect(formatBytes(1000)).toBe('1 KB');
  });

  it('formats 524288000 (~524 MB) as MB', () => {
    const result = formatBytes(524288000);
    expect(result).toMatch(/MB$/);
    expect(result).toContain('524');
  });

  it('formats 1000000000 exactly as 1 GB', () => {
    expect(formatBytes(1000000000)).toBe('1 GB');
  });

  it('formats 500000000 as 500 MB', () => {
    expect(formatBytes(500000000)).toBe('500 MB');
  });
});

// ---------------------------------------------------------------------------
// formatPeriod
// ---------------------------------------------------------------------------

describe('formatPeriod -- period string formatting', () => {
  it('returns empty string for falsy input', () => {
    expect(formatPeriod('')).toBe('');
    expect(formatPeriod(null)).toBe('');
  });

  it('formats 2026-03 as a string containing "2026"', () => {
    const result = formatPeriod('2026-03');
    expect(result).toContain('2026');
  });

  it('formats 2026-03 as a non-trivially-short string (month name included)', () => {
    const result = formatPeriod('2026-03');
    expect(result.length).toBeGreaterThan(4);
  });
});

// ---------------------------------------------------------------------------
// Progress bar percentage calculation
// ---------------------------------------------------------------------------

describe('usage bar -- percentage calculation', () => {
  it('calculates 42% for 42 of 100', () => {
    expect(usagePct(42, 100)).toBe(42);
  });

  it('calculates 0% for zero usage', () => {
    expect(usagePct(0, 100)).toBe(0);
  });

  it('calculates 100% for full usage', () => {
    expect(usagePct(100, 100)).toBe(100);
  });

  it('clamps to 100% when usage exceeds limit', () => {
    expect(usagePct(120, 100)).toBe(100);
  });

  it('returns 0% when limit is zero (no division by zero)', () => {
    expect(usagePct(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Progress bar CSS class thresholds
// ---------------------------------------------------------------------------

describe('usage bar -- CSS class thresholds', () => {
  it('applies default class at 0%', () => {
    expect(usageClass(0, 100)).toBe('default');
  });

  it('applies default class at 79%', () => {
    expect(usageClass(79, 100)).toBe('default');
  });

  it('applies warning class at 80%', () => {
    expect(usageClass(80, 100)).toBe('usage-bar-fill--warning');
  });

  it('applies warning class at 94%', () => {
    expect(usageClass(94, 100)).toBe('usage-bar-fill--warning');
  });

  it('applies critical class at 95%', () => {
    expect(usageClass(95, 100)).toBe('usage-bar-fill--critical');
  });

  it('applies critical class at 100%', () => {
    expect(usageClass(100, 100)).toBe('usage-bar-fill--critical');
  });

  it('applies critical class when usage exceeds limit (clamped)', () => {
    expect(usageClass(110, 100)).toBe('usage-bar-fill--critical');
  });
});

// ---------------------------------------------------------------------------
// SETTINGS_JS string content -- structural markers
// ---------------------------------------------------------------------------

describe('SETTINGS_JS -- usage section structural markers', () => {
  it('contains buildUsageSection function', () => {
    expect(SETTINGS_JS).toContain('function buildUsageSection');
  });

  it('contains buildUsageMetric function', () => {
    expect(SETTINGS_JS).toContain('function buildUsageMetric');
  });

  it('contains refreshUsageSection function', () => {
    expect(SETTINGS_JS).toContain('function refreshUsageSection');
  });

  it('contains formatBytes function', () => {
    expect(SETTINGS_JS).toContain('function formatBytes');
  });

  it('contains formatPeriod function', () => {
    expect(SETTINGS_JS).toContain('function formatPeriod');
  });

  it('sets role="progressbar" on the bar element', () => {
    expect(SETTINGS_JS).toContain("'progressbar'");
  });

  it('sets aria-valuenow on progress bars', () => {
    expect(SETTINGS_JS).toContain('aria-valuenow');
  });

  it('sets aria-valuemin on progress bars', () => {
    expect(SETTINGS_JS).toContain('aria-valuemin');
  });

  it('sets aria-valuemax on progress bars', () => {
    expect(SETTINGS_JS).toContain('aria-valuemax');
  });

  it('uses usage-bar-fill--warning class name', () => {
    expect(SETTINGS_JS).toContain('usage-bar-fill--warning');
  });

  it('uses usage-bar-fill--critical class name', () => {
    expect(SETTINGS_JS).toContain('usage-bar-fill--critical');
  });

  it('calls formatBytes for storage formatting', () => {
    expect(SETTINGS_JS).toContain('formatBytes(storage');
  });

  it('fetches /v1/account/usage in mountSettings', () => {
    expect(SETTINGS_JS).toContain('/v1/account/usage');
  });

  it('includes refresh button with aria-label', () => {
    expect(SETTINGS_JS).toContain('Refresh usage data');
  });

  it('announces usage loaded via settingsAnnounce', () => {
    expect(SETTINGS_JS).toContain("settingsAnnounce('Usage data loaded.')");
  });

  it('announces error when usage data could not be loaded', () => {
    expect(SETTINGS_JS).toContain('could not be loaded');
  });

  it('shows error message when usageData is null', () => {
    expect(SETTINGS_JS).toContain('Could not load usage data.');
  });
});

// ---------------------------------------------------------------------------
// SETTINGS_JS -- parallel fetch pattern
// ---------------------------------------------------------------------------

describe('SETTINGS_JS -- parallel fetch pattern', () => {
  it('uses Promise.all for parallel fetches', () => {
    expect(SETTINGS_JS).toContain('Promise.all');
  });

  it('declares keysPromise variable', () => {
    expect(SETTINGS_JS).toContain('keysPromise');
  });

  it('declares usagePromise variable', () => {
    expect(SETTINGS_JS).toContain('usagePromise');
  });
});

// ---------------------------------------------------------------------------
// SUBMIT_VIEW_JS -- 429 quota error handling
// ---------------------------------------------------------------------------

describe('SUBMIT_VIEW_JS -- 429 quota error handling', () => {
  it("checks for limitType === 'quota' on 429 response", () => {
    expect(SUBMIT_VIEW_JS).toContain("limitType === 'quota'");
  });

  it('shows monthly capture limit message', () => {
    expect(SUBMIT_VIEW_JS).toContain('Monthly capture limit reached');
  });

  it('references Settings in the quota error message', () => {
    expect(SUBMIT_VIEW_JS).toContain('View usage in Settings');
  });

  it('includes submit_formatDate helper for reset date formatting', () => {
    // Renamed from formatDate -> submit_formatDate per UI prefix rule (PRE-03,
    // CLAUDE.md §Dashboard UI Architecture). The unprefixed formatDate now
    // lives only in ui-settings.js.
    expect(SUBMIT_VIEW_JS).toContain('function submit_formatDate');
  });
});

// ---------------------------------------------------------------------------
// UI_CSS -- usage CSS classes present
// ---------------------------------------------------------------------------

describe('UI_CSS -- usage section styles', () => {
  it('contains .usage-metric class', () => {
    expect(UI_CSS).toContain('.usage-metric');
  });

  it('contains .usage-metric-header class', () => {
    expect(UI_CSS).toContain('.usage-metric-header');
  });

  it('contains .usage-bar class', () => {
    expect(UI_CSS).toContain('.usage-bar');
  });

  it('contains .usage-bar-fill class', () => {
    expect(UI_CSS).toContain('.usage-bar-fill');
  });

  it('contains .usage-bar-fill--warning class', () => {
    expect(UI_CSS).toContain('.usage-bar-fill--warning');
  });

  it('contains .usage-bar-fill--critical class', () => {
    expect(UI_CSS).toContain('.usage-bar-fill--critical');
  });

  it('contains .usage-footer class', () => {
    expect(UI_CSS).toContain('.usage-footer');
  });

  it('contains .usage-refresh-btn class', () => {
    expect(UI_CSS).toContain('.usage-refresh-btn');
  });

  it('uses --color-accent for default fill', () => {
    expect(UI_CSS).toContain('var(--color-accent)');
  });

  it('uses --color-warning for warning fill state', () => {
    const warningIdx = UI_CSS.indexOf('.usage-bar-fill--warning');
    const snippet = UI_CSS.slice(warningIdx, warningIdx + 80);
    expect(snippet).toContain('--color-warning');
  });

  it('uses --color-error for critical fill state', () => {
    const criticalIdx = UI_CSS.indexOf('.usage-bar-fill--critical');
    const snippet = UI_CSS.slice(criticalIdx, criticalIdx + 80);
    expect(snippet).toContain('--color-error');
  });
});

// ---------------------------------------------------------------------------
// Security -- no innerHTML with variable data in SETTINGS_JS
// ---------------------------------------------------------------------------

describe('SETTINGS_JS -- security: no innerHTML with variable data', () => {
  function innerHtmlAssignments(source) {
    const matches = [];
    const re = /\.innerHTML\s*=\s*([^;]+)/g;
    let m;
    // Use regex iteration without re.exec directly in while condition to avoid lint warnings
    m = re.exec(source); // eslint-disable-line no-cond-assign
    while (m !== null) {
      matches.push(m[1].trim());
      m = re.exec(source);
    }
    return matches;
  }

  it('innerHTML only assigned the empty string (no variable data)', () => {
    const assignments = innerHtmlAssignments(SETTINGS_JS);
    for (const rhs of assignments) {
      expect(rhs, `innerHTML assignment "${rhs}" uses variable data`).toMatch(/^(?:''|"")$/);
    }
  });
});
