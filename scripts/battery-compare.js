#!/usr/bin/env node
// tva
/**
 * battery-compare.js -- compare two test-battery.js runs and fail on regressions.
 *
 * Usage:
 *   node scripts/battery-compare.js --baseline b.json --candidate c.json \
 *     [--retry r.json] [--report report.md] [--regressions-out labels.txt]
 *
 * --retry            results of re-running the regressed sites on the candidate;
 *                    they replace those sites' candidate results before comparing
 * --report           write the markdown comparison table to this file
 * --regressions-out  write the regressed site labels, comma-separated
 *
 * Exit codes: 0 no regressions, 1 regressions, 2 missing or unusable input.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { compareBattery, mergeRetry, formatReport } from './lib/battery-compare.js';

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    candidate: { type: 'string' },
    retry: { type: 'string' },
    report: { type: 'string' },
    'regressions-out': { type: 'string' },
  },
});

function load(path, name) {
  if (!path) {
    console.error(`--${name} is required`);
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`Cannot read ${name} results from ${path}: ${err.message}`);
    process.exit(2);
  }
}

const baseline = load(values.baseline, 'baseline');
let candidate = load(values.candidate, 'candidate');
if (values.retry) candidate = mergeRetry(candidate, load(values.retry, 'retry'));

let result;
try {
  result = compareBattery(baseline, candidate);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

const report = formatReport(result);
console.log(report);
if (values.report) writeFileSync(values.report, report + '\n');
if (values['regressions-out']) writeFileSync(values['regressions-out'], result.regressions.join(','));

process.exit(result.regressions.length > 0 ? 1 : 0);
