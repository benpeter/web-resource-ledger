// tva
// Unit tests for ui-notifications.js.
// Tests operate on the exported NOTIFICATIONS_JS string constant and on
// extracted pure-logic helpers (notificationLabel, notificationDescription,
// defaultPreferences) evaluated via the Function constructor.
// No DOM environment, no fetch, no document -- all assertions target string
// content or the return values of extracted helper logic.

import { describe, it, expect } from 'vitest';
import { NOTIFICATIONS_JS } from '../src/ui/ui-notifications.js';
import { UI_CSS } from '../src/ui/ui-css.js';

// ---------------------------------------------------------------------------
// evalFromSource -- extract and return a named function from a JS source string
// ---------------------------------------------------------------------------

function evalFromSource(source, functionName) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(source + '\nreturn ' + functionName + ';');
  return fn();
}

const notificationLabel       = evalFromSource(NOTIFICATIONS_JS, 'notificationLabel');
const notificationDescription = evalFromSource(NOTIFICATIONS_JS, 'notificationDescription');
const defaultPreferences      = evalFromSource(NOTIFICATIONS_JS, 'defaultPreferences');

// ---------------------------------------------------------------------------
// Partition A -- notificationLabel display variants
// ---------------------------------------------------------------------------

describe('notificationLabel -- human-readable labels', () => {
  it('A1: captureFailures returns a non-empty label', () => {
    const result = notificationLabel('captureFailures');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('A2: weeklyDigest returns a distinct label from captureFailures', () => {
    expect(notificationLabel('weeklyDigest')).not.toBe(notificationLabel('captureFailures'));
  });

  it('A3: all six keys return distinct labels', () => {
    const keys = ['captureFailures', 'approachingLimit', 'limitReached', 'paymentFailure', 'invoiceGenerated', 'weeklyDigest'];
    const labels = keys.map(notificationLabel);
    const unique = new Set(labels);
    expect(unique.size).toBe(keys.length);
  });

  it('A4: unknown key returns the key itself as fallback', () => {
    expect(notificationLabel('unknownKey')).toBe('unknownKey');
  });
});

// ---------------------------------------------------------------------------
// Partition B -- notificationDescription display variants
// ---------------------------------------------------------------------------

describe('notificationDescription -- description text', () => {
  it('B1: captureFailures description is non-empty', () => {
    const result = notificationDescription('captureFailures');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('B2: invoiceGenerated description mentions invoice', () => {
    const result = notificationDescription('invoiceGenerated');
    expect(result.toLowerCase()).toContain('invoice');
  });

  it('B3: weeklyDigest description mentions weekly or summary', () => {
    const result = notificationDescription('weeklyDigest');
    expect(result.toLowerCase()).toMatch(/weekly|summary/);
  });

  it('B4: approachingLimit description mentions limit', () => {
    const result = notificationDescription('approachingLimit');
    expect(result.toLowerCase()).toContain('limit');
  });
});

// ---------------------------------------------------------------------------
// Partition C -- defaultPreferences
// ---------------------------------------------------------------------------

describe('defaultPreferences -- default toggle state', () => {
  it('C1: returns an object', () => {
    expect(typeof defaultPreferences()).toBe('object');
  });

  it('C2: all six keys are present', () => {
    const prefs = defaultPreferences();
    const keys = ['captureFailures', 'approachingLimit', 'limitReached', 'paymentFailure', 'invoiceGenerated', 'weeklyDigest'];
    keys.forEach(function(key) {
      expect(prefs).toHaveProperty(key);
    });
  });

  it('C3: all defaults are true (notifications on by default)', () => {
    const prefs = defaultPreferences();
    Object.values(prefs).forEach(function(value) {
      expect(value).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Partition D -- NOTIFICATIONS_JS structural smoke checks
// ---------------------------------------------------------------------------

describe('NOTIFICATIONS_JS -- structural function presence', () => {
  it('D1: contains function renderNotifications', () => {
    expect(NOTIFICATIONS_JS).toContain('function renderNotifications');
  });

  it('D2: contains function mountNotifications', () => {
    expect(NOTIFICATIONS_JS).toContain('function mountNotifications');
  });

  it('D3: contains function buildNotificationsContent', () => {
    expect(NOTIFICATIONS_JS).toContain('function buildNotificationsContent');
  });

  it('D4: contains function buildEmailSection', () => {
    expect(NOTIFICATIONS_JS).toContain('function buildEmailSection');
  });

  it('D5: contains function buildToggleSection', () => {
    expect(NOTIFICATIONS_JS).toContain('function buildToggleSection');
  });

  it('D6: contains function buildToggleRow', () => {
    expect(NOTIFICATIONS_JS).toContain('function buildToggleRow');
  });

  it('D7: fetches /v1/account/notifications endpoint', () => {
    expect(NOTIFICATIONS_JS).toContain('/v1/account/notifications');
  });
});

// ---------------------------------------------------------------------------
// Partition E -- email states: null / unverified / verified
// ---------------------------------------------------------------------------

describe('NOTIFICATIONS_JS -- email state handling', () => {
  it('E1: shows "add email" prompt when email is null', () => {
    expect(NOTIFICATIONS_JS).toContain('Add your email to receive notifications');
  });

  it('E2: shows "Not verified" badge when email unverified', () => {
    expect(NOTIFICATIONS_JS).toContain('Not verified');
  });

  it('E3: shows "Verified" badge when email verified', () => {
    expect(NOTIFICATIONS_JS).toContain('Verified');
  });

  it('E4: uses badge--pass for verified state', () => {
    expect(NOTIFICATIONS_JS).toContain('badge--pass');
  });

  it('E5: uses badge--skip for unverified state', () => {
    expect(NOTIFICATIONS_JS).toContain('badge--skip');
  });
});

// ---------------------------------------------------------------------------
// Partition F -- toggle groups: Alerts and Summaries subheadings
// ---------------------------------------------------------------------------

describe('NOTIFICATIONS_JS -- toggle groups', () => {
  it('F1: Alerts subheading present', () => {
    expect(NOTIFICATIONS_JS).toContain("'Alerts'");
  });

  it('F2: Summaries subheading present', () => {
    expect(NOTIFICATIONS_JS).toContain("'Summaries'");
  });

  it('F3: uses role="switch" on toggle inputs', () => {
    expect(NOTIFICATIONS_JS).toContain("'switch'");
  });

  it('F4: uses settings-toggle CSS class on checkbox inputs', () => {
    expect(NOTIFICATIONS_JS).toContain('settings-toggle');
  });
});

// ---------------------------------------------------------------------------
// Partition G -- PUT call with correct CSRF header
// ---------------------------------------------------------------------------

describe('NOTIFICATIONS_JS -- mutation API call', () => {
  it('G1: uses PUT method for email update', () => {
    expect(NOTIFICATIONS_JS).toContain("method: 'PUT'");
  });

  it('G2: includes X-WRL-CSRF header in mutations', () => {
    expect(NOTIFICATIONS_JS).toContain("'X-WRL-CSRF': '1'");
  });

  it('G3: honest feedback copy after email save (no false claim about verification email)', () => {
    expect(NOTIFICATIONS_JS).toContain('Verification required before notifications are sent.');
  });
});

// ---------------------------------------------------------------------------
// Partition H -- Error and loading states
// ---------------------------------------------------------------------------

describe('NOTIFICATIONS_JS -- error and loading states', () => {
  it('H1: has a loading placeholder text', () => {
    expect(NOTIFICATIONS_JS).toContain('Loading notification preferences...');
  });

  it('H2: shows error alert when data cannot be loaded', () => {
    expect(NOTIFICATIONS_JS).toContain('Could not load notification preferences.');
  });

  it('H3: shows connection failure message on network error', () => {
    expect(NOTIFICATIONS_JS).toContain('Connection failed loading notification preferences.');
  });
});

// ---------------------------------------------------------------------------
// Partition I -- Security: no innerHTML assignments
// ---------------------------------------------------------------------------

describe('NOTIFICATIONS_JS -- security: no innerHTML assignments', () => {
  it('I1: source contains no innerHTML assignments at all', () => {
    expect(NOTIFICATIONS_JS).not.toContain('innerHTML');
  });
});

// ---------------------------------------------------------------------------
// Partition J -- Accessibility markers
// ---------------------------------------------------------------------------

describe('NOTIFICATIONS_JS -- accessibility', () => {
  it('J1: aria-live region present for announcements', () => {
    expect(NOTIFICATIONS_JS).toContain('aria-live');
  });

  it('J2: h1 heading uses tabIndex for focus management', () => {
    expect(NOTIFICATIONS_JS).toContain('tabIndex');
  });

  it('J3: aria-labelledby used on sections', () => {
    expect(NOTIFICATIONS_JS).toContain('aria-labelledby');
  });
});

// ---------------------------------------------------------------------------
// Partition K -- UI_CSS notifications classes present
// ---------------------------------------------------------------------------

describe('UI_CSS -- notifications section styles', () => {
  it('K1: contains .notifications-email-row class', () => {
    expect(UI_CSS).toContain('.notifications-email-row');
  });

  it('K2: contains .notifications-email-address class', () => {
    expect(UI_CSS).toContain('.notifications-email-address');
  });

  it('K3: contains .notifications-email-input-row class', () => {
    expect(UI_CSS).toContain('.notifications-email-input-row');
  });
});
