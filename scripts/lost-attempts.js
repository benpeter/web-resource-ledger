#!/usr/bin/env node
// tva
/**
 * lost-attempts.js -- list the capture attempts a killed Worker run was working
 * on, for the worker health alert email (backlog #99).
 *
 * Usage:
 *   CORALOGIX_QUERY_KEY=... node scripts/lost-attempts.js --app wrl-staging \
 *     --start 2026-11-25T14:00:00Z --end 2026-11-25T15:00:00Z
 *
 * Reads capture.dequeued and outcome events from Coralogix (EU2) for the window
 * and 15 minutes after it, prints one line per attempt that has no outcome
 * before the next delivery, with the account, its GitHub login for gh-<id>
 * accounts, the page and the capture. GITHUB_TOKEN, when set, is used for the
 * login lookups. Always exits 0: when the logs can't be read it prints why, so
 * the alert still goes out.
 */

import { parseArgs } from 'node:util';
import { findLostAttempts, formatLostAttempts, OUTCOME_EVENTS } from './lib/lost-attempts.js';

const CORALOGIX_QUERY_URL = 'https://api.eu2.coralogix.com/api/v1/dataprime/query';
const AFTER_WINDOW_MS = 15 * 60 * 1000;

const { values } = parseArgs({
  options: {
    app: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' },
  },
});

async function queryEvents(app, start, end) {
  const events = ['capture.dequeued', ...OUTCOME_EVENTS].map((e) => `$d.event == '${e}'`).join(' || ');
  const query = `source logs | filter $l.applicationname == '${app}' && (${events})`
    + ' | create ts from formatTimestamp($m.timestamp)'
    + ' | choose ts, $d.event as event, $d.captureId as captureId, $d.attempt as attempt, $d.tenantId as tenantId, $d.url as url'
    + ' | limit 5000';
  const queryEnd = new Date(Math.min(Date.parse(end) + AFTER_WINDOW_MS, Date.now())).toISOString();
  const res = await fetch(CORALOGIX_QUERY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CORALOGIX_QUERY_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      metadata: { startDate: start, endDate: queryEnd, syntax: 'QUERY_SYNTAX_DATAPRIME', tier: 'TIER_FREQUENT_SEARCH', limit: 5000 },
    }),
  });
  if (!res.ok) throw new Error(`Coralogix answered ${res.status}`);
  const rows = [];
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    const part = JSON.parse(line);
    if (part.error) throw new Error(`Coralogix: ${JSON.stringify(part.error).slice(0, 200)}`);
    for (const r of part.result?.results ?? []) rows.push(JSON.parse(r.userData));
  }
  return rows;
}

// gh-<id> accounts are GitHub user ids; the public users API names the login
async function githubLogins(tenantIds) {
  const logins = {};
  for (const tenantId of new Set(tenantIds)) {
    const id = /^gh-(\d+)$/.exec(tenantId ?? '')?.[1];
    if (!id) continue;
    const res = await fetch(`https://api.github.com/user/${id}`, {
      headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
    });
    if (res.ok) logins[tenantId] = (await res.json()).login;
  }
  return logins;
}

try {
  if (!values.app || !values.start || !values.end) throw new Error('needs --app, --start and --end');
  if (!process.env.CORALOGIX_QUERY_KEY) throw new Error('CORALOGIX_QUERY_KEY is not set');
  const lost = findLostAttempts(await queryEvents(values.app, values.start, values.end), values.start, values.end);
  console.log(formatLostAttempts(lost, await githubLogins(lost.map((a) => a.tenantId))));
} catch (err) {
  console.log(`Could not list the captures: ${err.message}`);
}
