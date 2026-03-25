#!/usr/bin/env node
// tva
/**
 * test-battery.js -- Manual capture quality validation against real sites
 *
 * Submits all captures concurrently, then polls all in parallel.
 * Checks robots.txt before each capture. Reports a table of results
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

const BASE_URL = process.env.WRL_BASE || 'https://staging.webresourceledger.com';
const POLL_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 3000;

const SITES = [
  // Baseline
  { url: 'https://example.com', label: 'example.com' },
  { url: 'https://github.com', label: 'GitHub' },
  // European news (CMP-heavy: Sourcepoint, OneTrust)
  { url: 'https://www.theguardian.com', label: 'Guardian' },
  { url: 'https://www.spiegel.de', label: 'Spiegel' },
  { url: 'https://www.lemonde.fr', label: 'Le Monde' },
  { url: 'https://www.bbc.com', label: 'BBC' },
  { url: 'https://www.hurriyet.com.tr', label: 'Hurriyet' },
  // US news (high subresource count)
  { url: 'https://www.cnn.com', label: 'CNN' },
  { url: 'https://www.reuters.com', label: 'Reuters' },
  { url: 'https://www.nytimes.com', label: 'NYT' },
  { url: 'https://slashdot.org', label: 'Slashdot' },
  // Image-heavy / lazy-load
  { url: 'https://www.samsung.com', label: 'Samsung' },
  { url: 'https://www.etsy.com', label: 'Etsy' },
  { url: 'https://www.tesco.com', label: 'Tesco' },
  // Reference / tools
  { url: 'https://en.wikipedia.org', label: 'Wikipedia' },
  { url: 'https://www.merriam-webster.com', label: 'Merriam-Webster' },
  { url: 'https://www.gov.uk', label: 'GOV.UK' },
  // Finance / charts
  { url: 'https://finance.yahoo.com', label: 'Yahoo Finance' },
  { url: 'https://www.tradingview.com', label: 'TradingView' },
  // Video / heavy JS
  { url: 'https://www.youtube.com', label: 'YouTube' },
  // Analytics / dashboards
  { url: 'https://analytics.explodingtopics.com/website', label: 'ExplodingTopics' },
  { url: 'https://www.semrush.com/trending-websites/global/all/', label: 'Semrush' },
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

async function submitCapture(apiKey, siteUrl) {
  const resp = await fetch(`${BASE_URL}/v1/captures`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: siteUrl }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { error: `POST ${resp.status}: ${body.slice(0, 200)}` };
  }

  const data = await resp.json();
  return { captureId: data.id };
}

async function pollCapture(apiKey, captureId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const resp = await fetch(`${BASE_URL}/v1/captures/${captureId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!resp.ok) continue;

    const data = await resp.json();
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
console.log(`${'='.repeat(90)}\n`);

// Phase 1: Check robots.txt for all sites concurrently
console.log('Checking robots.txt...');
const robotsChecks = await Promise.all(
  SITES.map(async (site) => {
    const robots = await checkRobotsTxt(site.url);
    return { ...site, robots };
  }),
);

const allowed = [];
const results = [];
for (const site of robotsChecks) {
  if (!site.robots.allowed) {
    console.log(`  ${site.label.padEnd(18)} SKIP (${site.robots.reason})`);
    results.push({ label: site.label, status: 'skipped', reason: site.robots.reason });
  } else {
    allowed.push(site);
  }
}

// Phase 2: Submit all captures concurrently
console.log(`\nSubmitting ${allowed.length} captures...`);
const submissions = await Promise.all(
  allowed.map(async (site) => {
    const result = await submitCapture(apiKey, site.url);
    if (result.error) {
      console.log(`  ${site.label.padEnd(18)} ERROR: ${result.error}`);
    } else {
      console.log(`  ${site.label.padEnd(18)} ${result.captureId}`);
    }
    return { ...site, ...result };
  }),
);

const pending = submissions.filter((s) => s.captureId && !s.error);
const submitErrors = submissions.filter((s) => s.error);
for (const s of submitErrors) {
  results.push({ label: s.label, status: 'error', reason: s.error });
}

// Phase 3: Poll all captures concurrently
console.log(`\nPolling ${pending.length} captures (timeout ${POLL_TIMEOUT_MS / 1000}s)...`);
const pollResults = await Promise.all(
  pending.map(async (site) => {
    const result = await pollCapture(apiKey, site.captureId);
    const status = result.error ? 'error' : result.status;
    const quality = result.renderQuality || '';
    console.log(`  ${site.label.padEnd(18)} ${status} ${quality}`);
    return { label: site.label, result };
  }),
);

for (const { label, result } of pollResults) {
  if (result.error) {
    results.push({ label, status: 'error', reason: result.error });
    continue;
  }
  const consent = result.captureSettings?.consent;
  const render = result.render;
  results.push({
    label,
    captureId: result.captureId,
    status: result.status,
    renderQuality: result.renderQuality,
    consentResult: consent?.result || 'n/a',
    cmp: consent?.cmpDetected || 'none',
    durationMs: render?.durationMs || 'n/a',
    scrollMs: render?.stages?.scrollMs ?? 'n/a',
    error: result.error || null,
  });
}

// Print summary table
console.log(`\n${'='.repeat(90)}`);
console.log('Summary\n');
console.log(
  'Site'.padEnd(18) +
  'Status'.padEnd(10) +
  'Quality'.padEnd(10) +
  'Consent'.padEnd(14) +
  'CMP'.padEnd(18) +
  'Scroll'.padEnd(8) +
  'Duration',
);
console.log('-'.repeat(90));

for (const r of results) {
  if (r.status === 'skipped' || r.status === 'error') {
    console.log(`${r.label.padEnd(18)} ${r.status.padEnd(10)} ${(r.reason || '').slice(0, 60)}`);
  } else {
    const scrollStr = r.scrollMs !== 'n/a' ? `${r.scrollMs}ms` : 'n/a';
    console.log(
      `${r.label.padEnd(18)}` +
      `${r.status.padEnd(10)}` +
      `${(r.renderQuality || 'n/a').padEnd(10)}` +
      `${(r.consentResult || 'n/a').padEnd(14)}` +
      `${(r.cmp || 'none').padEnd(18)}` +
      `${scrollStr.padEnd(8)}` +
      `${r.durationMs}ms`,
    );
  }
}

// Print capture IDs for verification
const completed = results.filter((r) => r.captureId);
if (completed.length > 0) {
  console.log(`\nCapture IDs (for ${BASE_URL}/v1/verify/{id}):`);
  for (const r of completed) {
    console.log(`  ${r.label.padEnd(18)} ${r.captureId}`);
  }
}

const passed = results.filter((r) => r.status === 'complete').length;
const failed = results.filter((r) => r.status === 'failed').length;
const skipped = results.filter((r) => r.status === 'skipped').length;
const errors = results.filter((r) => r.status === 'error').length;

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped, ${errors} errors`);
process.exit(failed + errors > 0 ? 1 : 0);
