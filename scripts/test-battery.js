#!/usr/bin/env node
// tva
/**
 * test-battery.js -- Manual capture quality validation against real sites
 *
 * Captures a curated list of complex sites via the WRL staging API,
 * checking robots.txt before each capture. Reports a table of results
 * including status, render quality, consent, timing, and screenshot size.
 *
 * Usage:
 *   node scripts/test-battery.js                    # uses staging
 *   WRL_BASE=https://... WRL_KEY=... node scripts/test-battery.js
 *
 * Requires: WRL_KEY env var or ~/.wrl-keys sourced with STAGING_API_KEY
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.WRL_BASE || 'https://wrl-staging.benpeter.workers.dev';
const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 3000;

const SITES = [
  { url: 'https://example.com', label: 'example.com' },
  { url: 'https://www.theguardian.com', label: 'Guardian' },
  { url: 'https://www.spiegel.de', label: 'Spiegel' },
  { url: 'https://www.bbc.com', label: 'BBC' },
  { url: 'https://www.cnn.com', label: 'CNN' },
  { url: 'https://www.reuters.com', label: 'Reuters' },
  { url: 'https://www.lemonde.fr', label: 'Le Monde' },
  { url: 'https://github.com', label: 'GitHub' },
  { url: 'https://www.nytimes.com', label: 'NYT' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey() {
  if (process.env.WRL_KEY) return process.env.WRL_KEY;
  try {
    const secrets = readFileSync(`${homedir()}/.wrl-keys`, 'utf8');
    const match = secrets.match(/STAGING_API_KEY=["']?([^\s"']+)/);
    if (match) return match[1];
  } catch { /* ignore */ }
  console.error('Error: Set WRL_KEY or source ~/.wrl-keys with STAGING_API_KEY');
  process.exit(1);
}

/**
 * Parse robots.txt for a URL and check if the path is allowed.
 * Respects User-Agent: WRL and User-Agent: * directives.
 */
async function checkRobotsTxt(siteUrl) {
  const parsed = new URL(siteUrl);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  try {
    const resp = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'WRL/0.1 (Web Resource Ledger)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return { allowed: true, reason: `robots.txt ${resp.status}` };

    const text = await resp.text();
    const lines = text.split('\n');

    // Simple robots.txt parser: find matching user-agent block
    let inBlock = false;
    let inWrlBlock = false;
    const disallowed = [];
    const wrlDisallowed = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (line.toLowerCase().startsWith('user-agent:')) {
        const agent = line.slice(11).trim().toLowerCase();
        inWrlBlock = agent === 'wrl';
        inBlock = agent === '*' || inWrlBlock;
        continue;
      }
      if (line.toLowerCase().startsWith('disallow:') && inBlock) {
        const path = line.slice(9).trim();
        if (path) {
          if (inWrlBlock) wrlDisallowed.push(path);
          else disallowed.push(path);
        }
      }
    }

    // WRL-specific rules take precedence
    const rules = wrlDisallowed.length > 0 ? wrlDisallowed : disallowed;
    const targetPath = parsed.pathname || '/';
    for (const rule of rules) {
      if (targetPath.startsWith(rule)) {
        return { allowed: false, reason: `Disallow: ${rule}` };
      }
    }

    return { allowed: true, reason: 'ok' };
  } catch (err) {
    return { allowed: true, reason: `fetch error: ${err.message}` };
  }
}

async function captureAndPoll(apiKey, siteUrl) {
  // Submit capture
  const captureResp = await fetch(`${BASE_URL}/v1/captures`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: siteUrl }),
  });

  if (!captureResp.ok) {
    const body = await captureResp.text();
    return { error: `POST ${captureResp.status}: ${body.slice(0, 200)}` };
  }

  const { captureId } = await captureResp.json();

  // Poll until terminal state
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollResp = await fetch(`${BASE_URL}/v1/captures/${captureId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;

    const data = await pollResp.json();
    if (data.status === 'complete' || data.status === 'failed') {
      return { captureId, ...data };
    }
  }

  return { captureId, error: 'poll timeout' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const apiKey = getApiKey();
console.log(`\nWRL Test Battery — ${BASE_URL}`);
console.log(`${'='.repeat(70)}\n`);

const results = [];

for (const site of SITES) {
  process.stdout.write(`${site.label.padEnd(15)} `);

  // Check robots.txt
  const robots = await checkRobotsTxt(site.url);
  if (!robots.allowed) {
    process.stdout.write(`SKIP (robots.txt: ${robots.reason})\n`);
    results.push({ label: site.label, status: 'skipped', reason: robots.reason });
    continue;
  }

  process.stdout.write('capturing... ');

  const result = await captureAndPoll(apiKey, site.url);
  if (result.error) {
    process.stdout.write(`ERROR: ${result.error}\n`);
    results.push({ label: site.label, status: 'error', reason: result.error });
    continue;
  }

  const consent = result.captureSettings?.consent;
  const render = result.render;
  process.stdout.write(`${result.status} (${result.renderQuality || 'n/a'})\n`);

  results.push({
    label: site.label,
    status: result.status,
    renderQuality: result.renderQuality,
    consentResult: consent?.result || 'n/a',
    cmp: consent?.cmpDetected || 'none',
    durationMs: render?.durationMs || 'n/a',
    error: result.error || null,
  });
}

// Print summary table
console.log(`\n${'='.repeat(70)}`);
console.log('Summary\n');
console.log(
  'Site'.padEnd(15) +
  'Status'.padEnd(10) +
  'Quality'.padEnd(10) +
  'Consent'.padEnd(14) +
  'CMP'.padEnd(16) +
  'Duration',
);
console.log('-'.repeat(70));

for (const r of results) {
  if (r.status === 'skipped' || r.status === 'error') {
    console.log(`${r.label.padEnd(15)} ${r.status.padEnd(10)} ${(r.reason || '').slice(0, 50)}`);
  } else {
    console.log(
      `${r.label.padEnd(15)}` +
      `${r.status.padEnd(10)}` +
      `${(r.renderQuality || 'n/a').padEnd(10)}` +
      `${(r.consentResult || 'n/a').padEnd(14)}` +
      `${(r.cmp || 'none').padEnd(16)}` +
      `${r.durationMs}ms`,
    );
  }
}

const passed = results.filter((r) => r.status === 'complete').length;
const failed = results.filter((r) => r.status === 'failed').length;
const skipped = results.filter((r) => r.status === 'skipped').length;
const errors = results.filter((r) => r.status === 'error').length;

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped, ${errors} errors`);
process.exit(failed + errors > 0 ? 1 : 0);
