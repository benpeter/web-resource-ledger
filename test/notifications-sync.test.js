// tva
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prefsSourcePath = resolve(__dirname, '../src/notifications.js');
const uiSourcePath = resolve(__dirname, '../src/ui/ui-notifications.js');
const docsPath = resolve(__dirname, '../site/content/notifications.md');
const navPath = resolve(__dirname, '../site/_data/site.js');

// The notification types an account can turn on and off: the keys of
// DEFAULT_PREFS.notifications in src/notifications.js
function notificationTypes() {
  const source = readFileSync(prefsSourcePath, 'utf8');
  const block = source.match(/notifications:\s*\{([^}]*)\}/)[1];
  return [...block.matchAll(/(\w+):\s*true/g)].map((m) => m[1]);
}

// The label the dashboard's Notifications page shows for each type
function dashboardLabels() {
  const source = readFileSync(uiSourcePath, 'utf8');
  const block = source.match(/function notificationLabel[\s\S]*?var labels = \{([^}]*)\}/)[1];
  return Object.fromEntries([...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
}

describe('email notifications docs', () => {
  it('reads the notification types and their dashboard labels', () => {
    expect(notificationTypes()).toContain('weekly_digest');
    expect(Object.keys(dashboardLabels()).sort()).toEqual(notificationTypes().sort());
  });

  it('site/content/notifications.md describes every notification type by its dashboard label', () => {
    expect(existsSync(docsPath)).toBe(true);
    const docs = readFileSync(docsPath, 'utf8');
    const labels = dashboardLabels();
    const missing = notificationTypes().filter((type) => !docs.includes(`**${labels[type]}**`));
    expect(missing).toEqual([]);
  });

  it('the docs navigation links the notifications page', () => {
    expect(readFileSync(navPath, 'utf8')).toContain('url: "/notifications/"');
  });
});
