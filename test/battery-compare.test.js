// Tests for scripts/lib/battery-compare.js: the regression gate of the weekly
// autoconsent battery. Baseline = staging on the current version, candidate =
// staging after deploying the update.
import { describe, it, expect } from 'vitest';
import { compareBattery, mergeRetry, formatReport } from '../scripts/lib/battery-compare.js';

function site(label, overrides = {}) {
  return {
    label,
    status: 'complete',
    renderQuality: 'full',
    consentResult: 'success',
    cmp: 'onetrust',
    ...overrides,
  };
}

function verdictOf(result, label) {
  return result.rows.find((r) => r.label === label)?.verdict;
}

describe('compareBattery: capture status', () => {
  it('complete -> failed is a regression', () => {
    const result = compareBattery([site('A')], [site('A', { status: 'failed' })]);
    expect(result.regressions).toEqual(['A']);
    expect(result.rows[0].reasons).toContain('capture');
  });

  it('complete -> error (poll timeout) is a regression', () => {
    const result = compareBattery([site('A')], [{ label: 'A', status: 'error', reason: 'poll timeout' }]);
    expect(result.regressions).toEqual(['A']);
  });

  it('failed -> failed is unchanged, not a regression', () => {
    const result = compareBattery([site('A', { status: 'failed' })], [site('A', { status: 'failed' })]);
    expect(result.regressions).toEqual([]);
    expect(verdictOf(result, 'A')).toBe('same');
  });

  it('failed -> complete is an improvement', () => {
    const result = compareBattery([site('A', { status: 'failed' })], [site('A')]);
    expect(result.improvements).toEqual(['A']);
    expect(result.regressions).toEqual([]);
  });

  it('a site that completed on the baseline and is missing from the candidate is a regression', () => {
    const result = compareBattery([site('A'), site('B')], [site('A')]);
    expect(result.regressions).toEqual(['B']);
    expect(result.rows.find((r) => r.label === 'B').reasons).toContain('missing');
  });

  it('sites skipped by robots.txt on either side are not compared', () => {
    const result = compareBattery(
      [site('A', { status: 'skipped' }), site('B')],
      [site('A'), site('B', { status: 'skipped' })],
    );
    expect(result.regressions).toEqual([]);
    expect(verdictOf(result, 'A')).toBe('skipped');
    expect(verdictOf(result, 'B')).toBe('skipped');
  });
});

describe('compareBattery: render quality and consent', () => {
  it('full -> partial render is a regression', () => {
    const result = compareBattery([site('A')], [site('A', { renderQuality: 'partial' })]);
    expect(result.regressions).toEqual(['A']);
    expect(result.rows[0].reasons).toContain('render');
  });

  it('consent success -> notDetected is a regression', () => {
    const result = compareBattery([site('A')], [site('A', { consentResult: 'notDetected', cmp: 'none' })]);
    expect(result.regressions).toEqual(['A']);
    expect(result.rows[0].reasons).toContain('consent');
  });

  it('consent success -> failed is a regression', () => {
    const result = compareBattery([site('A')], [site('A', { consentResult: 'failed' })]);
    expect(result.regressions).toEqual(['A']);
  });

  it('consent notDetected -> success is an improvement', () => {
    const result = compareBattery(
      [site('A', { consentResult: 'notDetected', cmp: 'none' })],
      [site('A')],
    );
    expect(result.improvements).toEqual(['A']);
  });

  it('a site with several regressions is listed once with every reason', () => {
    const result = compareBattery(
      [site('A')],
      [site('A', { renderQuality: 'partial', consentResult: 'notDetected' })],
    );
    expect(result.regressions).toEqual(['A']);
    expect(result.rows[0].reasons).toEqual(expect.arrayContaining(['render', 'consent']));
  });
});

describe('compareBattery: input guards', () => {
  it('throws when the baseline has no comparable site', () => {
    expect(() => compareBattery([], [site('A')])).toThrow(/baseline/i);
    expect(() => compareBattery([site('A', { status: 'skipped' })], [site('A')])).toThrow(/baseline/i);
  });
});

describe('mergeRetry', () => {
  it('replaces only the retried labels in the candidate', () => {
    const candidate = [site('A', { status: 'failed' }), site('B', { status: 'failed' })];
    const retry = [site('A')];
    const merged = mergeRetry(candidate, retry);
    expect(merged.find((r) => r.label === 'A').status).toBe('complete');
    expect(merged.find((r) => r.label === 'B').status).toBe('failed');
    expect(merged).toHaveLength(2);
  });
});

describe('formatReport', () => {
  it('lists regressions first and ends with a count line', () => {
    const result = compareBattery(
      [site('Ok'), site('Broken'), site('Fixed', { status: 'failed' })],
      [site('Ok'), site('Broken', { status: 'failed' }), site('Fixed')],
    );
    const report = formatReport(result);
    expect(report.indexOf('Broken')).toBeLessThan(report.indexOf('Ok'));
    expect(report).toMatch(/1 regression, 1 improvement, 1 unchanged/);
  });

  it('names the reasons of a regression', () => {
    const report = formatReport(compareBattery([site('A')], [site('A', { consentResult: 'notDetected' })]));
    expect(report).toMatch(/A.*regression.*consent/);
  });
});
