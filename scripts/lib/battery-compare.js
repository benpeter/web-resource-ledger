// tva
/**
 * battery-compare.js -- regression gate for the weekly autoconsent battery.
 *
 * The battery captures the same sites twice on staging: first on the version
 * that is deployed (baseline), then after deploying the autoconsent update
 * (candidate). A site regresses when it got worse between the two runs:
 *
 *   capture  baseline complete, candidate failed, timed out or missing
 *   render   both complete, baseline 'full', candidate 'partial'
 *   consent  both complete, baseline dismissed the banner ('success'), candidate did not
 *
 * Sites that fail on both runs are the site's problem, not the update's, and
 * sites skipped by robots.txt on either run are not compared.
 *
 * Pure module (no Node or Workers APIs): used by scripts/battery-compare.js
 * and tested in test/battery-compare.test.js.
 */

const COMPARABLE = new Set(['complete', 'failed', 'error']);

function byLabel(results) {
  const map = new Map();
  for (const r of results) map.set(r.label, r);
  return map;
}

function describeSide(r) {
  if (!r) return 'missing';
  if (r.status !== 'complete') return r.status;
  return `complete, ${r.renderQuality || 'full'}, consent ${r.consentResult || 'n/a'}`;
}

/**
 * @param {Array<object>} baseline   results of the baseline run (test-battery.js --out)
 * @param {Array<object>} candidate  results of the candidate run
 * @returns {{ rows: Array<object>, regressions: string[], improvements: string[] }}
 */
export function compareBattery(baseline, candidate) {
  const comparableBaseline = baseline.filter((r) => COMPARABLE.has(r.status));
  if (comparableBaseline.length === 0) {
    throw new Error('Baseline has no comparable site: the baseline run did not produce results');
  }

  const cand = byLabel(candidate);
  const rows = [];

  for (const b of baseline) {
    const c = cand.get(b.label);
    const row = { label: b.label, baseline: describeSide(b), candidate: describeSide(c), verdict: 'same', reasons: [] };

    if (b.status === 'skipped' || c?.status === 'skipped') {
      row.verdict = 'skipped';
      rows.push(row);
      continue;
    }

    const regress = [];
    const improve = [];

    if (b.status === 'complete') {
      if (!c) regress.push('missing');
      else if (c.status !== 'complete') regress.push('capture');
    } else if (c?.status === 'complete') {
      improve.push('capture');
    }

    if (b.status === 'complete' && c?.status === 'complete') {
      const bFull = (b.renderQuality || 'full') === 'full';
      const cFull = (c.renderQuality || 'full') === 'full';
      if (bFull && !cFull) regress.push('render');
      if (!bFull && cFull) improve.push('render');

      const bConsent = b.consentResult === 'success';
      const cConsent = c.consentResult === 'success';
      if (bConsent && !cConsent) regress.push('consent');
      if (!bConsent && cConsent) improve.push('consent');
    }

    if (regress.length > 0) {
      row.verdict = 'regression';
      row.reasons = regress;
    } else if (improve.length > 0) {
      row.verdict = 'improvement';
      row.reasons = improve;
    }
    rows.push(row);
  }

  return {
    rows,
    regressions: rows.filter((r) => r.verdict === 'regression').map((r) => r.label),
    improvements: rows.filter((r) => r.verdict === 'improvement').map((r) => r.label),
  };
}

/**
 * Replace the candidate results of retried sites with their retry results.
 * @param {Array<object>} candidate
 * @param {Array<object>} retry
 */
export function mergeRetry(candidate, retry) {
  const retried = byLabel(retry);
  return candidate.map((r) => retried.get(r.label) ?? r);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Markdown table for the PR body: regressions first, then improvements, then the rest.
 * @param {{ rows: Array<object> }} result  return value of compareBattery
 */
export function formatReport(result) {
  const order = { regression: 0, improvement: 1, same: 2, skipped: 3 };
  const rows = [...result.rows].sort((a, b) => order[a.verdict] - order[b.verdict]);
  const lines = [
    '| Site | Verdict | Baseline | Candidate |',
    '|---|---|---|---|',
    ...rows.map((r) => {
      const verdict = r.reasons.length > 0 ? `${r.verdict} (${r.reasons.join(', ')})` : r.verdict;
      return `| ${r.label} | ${verdict} | ${r.baseline} | ${r.candidate} |`;
    }),
  ];
  const count = (v) => result.rows.filter((r) => r.verdict === v).length;
  lines.push('');
  lines.push(`${plural(count('regression'), 'regression')}, ${plural(count('improvement'), 'improvement')}, ${count('same')} unchanged, ${count('skipped')} skipped`);
  return lines.join('\n');
}
