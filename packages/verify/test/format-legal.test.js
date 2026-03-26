/**
 * format-legal.test.js -- Legal report formatter tests
 *
 * Tests formatLegal() and formatLegalJson() from lib/format-legal.js.
 *
 * Because these functions write to process.stdout, we capture stdout using
 * the same pipe-and-restore approach as format.test.js.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatLegal, formatLegalJson } from '../lib/format-legal.js';

// ---------------------------------------------------------------------------
// Stdout capture helper
// ---------------------------------------------------------------------------

let stdoutOutput = '';
let originalWrite;

function captureStdout() {
  stdoutOutput = '';
  originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    stdoutOutput += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  };
}

function restoreStdout() {
  if (originalWrite) {
    process.stdout.write = originalWrite;
    originalWrite = null;
  }
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeBaseResult(overrides = {}) {
  return {
    verified: true,
    checks: [
      { name: 'artifactHashes', status: 'pass', detail: null },
      { name: 'bundleHash',     status: 'pass', detail: null },
      { name: 'signature',      status: 'pass', detail: null },
    ],
    capture: {
      bundleHash: 'sha256:' + 'a'.repeat(64),
      signature:  'dGVzdHNpZ25hdHVyZWRhdGE=',
      publicKey:  'dGVzdHB1YmxpY2tleWRhdGE=',
      signedAt:   '2026-03-16T12:00:00.000Z',
    },
    keyResolution: {
      keyId:    'aabbccdd11223344',
      source:   'pinned',
      origin:   null,
      endpoint: null,
    },
    source: 'test.wacz',
    ...overrides,
  };
}

function makeEmbeddedResult() {
  return makeBaseResult({
    keyResolution: {
      keyId:    'aabbccdd11223344',
      source:   'embedded',
      origin:   null,
      endpoint: null,
    },
  });
}

function makeOriginResult() {
  return makeBaseResult({
    keyResolution: {
      keyId:    'aabbccdd11223344',
      source:   'origin',
      origin:   'https://keys.example.com/.well-known/wrl-key',
      endpoint: 'https://keys.example.com/.well-known/wrl-key',
    },
  });
}

function makeWithTimestamps() {
  return makeBaseResult({
    checks: [
      { name: 'artifactHashes',    status: 'pass', detail: null },
      { name: 'bundleHash',        status: 'pass', detail: null },
      { name: 'signature',         status: 'pass', detail: null },
      { name: 'timestamp',         status: 'pass', detail: 'TSA: tsa.example.com' },
      { name: 'qualifiedTimestamp', status: 'pass', detail: 'QTSA: qtsa.example.com' },
    ],
    capture: {
      bundleHash:  'sha256:' + 'b'.repeat(64),
      signature:   'dGVzdHNpZ25hdHVyZWRhdGE=',
      publicKey:   'dGVzdHB1YmxpY2tleWRhdGE=',
      signedAt:    '2026-03-16T12:00:00.000Z',
      timestamp: {
        genTime: '2026-03-16T12:00:01.000Z',
        tsa:     'tsa.example.com',
      },
      qualifiedTimestamp: {
        genTime: '2026-03-16T12:00:02.000Z',
        tsa:     'qtsa.example.com',
      },
    },
  });
}

function makeNoTimestampResult() {
  return makeBaseResult({
    checks: [
      { name: 'artifactHashes', status: 'pass', detail: null },
      { name: 'bundleHash',     status: 'pass', detail: null },
      { name: 'signature',      status: 'pass', detail: null },
      { name: 'timestamp',      status: 'skip', detail: 'No independent timestamp was obtained for this capture' },
    ],
  });
}

function makeFailResult() {
  return makeBaseResult({
    verified: false,
    checks: [
      { name: 'artifactHashes', status: 'fail', detail: 'Hash mismatch detected in main.html' },
      { name: 'bundleHash',     status: 'pass', detail: null },
      { name: 'signature',      status: 'pass', detail: null },
    ],
  });
}

function makeMinimalResult() {
  // No timestamp, no qualifiedTimestamp, no keyResolution -- tests graceful degradation
  return {
    verified: true,
    checks: [
      { name: 'artifactHashes', status: 'pass', detail: null },
      { name: 'bundleHash',     status: 'pass', detail: null },
      { name: 'signature',      status: 'pass', detail: null },
    ],
    capture: {},
    keyResolution: null,
    source: 'minimal.wacz',
  };
}

// ---------------------------------------------------------------------------
// formatLegal -- Section structure
// ---------------------------------------------------------------------------

describe('formatLegal -- section headers', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('includes Section 1 header', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /1\. SUMMARY/);
  });

  it('includes Section 2 header', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /2\. SUBJECT OF VERIFICATION/);
  });

  it('includes Section 3 header', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /3\. VERIFICATION CHECKS PERFORMED/);
  });

  it('includes Section 4 header', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /4\. CHAIN OF CUSTODY/);
  });

  it('includes Section 5 header', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /5\. APPLICABLE LEGAL STANDARDS/);
  });

  it('includes Section 6 header', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /6\. METHODOLOGY/);
  });

  it('includes Section 7 header', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /7\. FULL TECHNICAL DETAILS/);
  });

  it('report format version is present', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /WRL-LEGAL-1\.0/);
  });
});

// ---------------------------------------------------------------------------
// formatLegal -- No ANSI invariant
// ---------------------------------------------------------------------------

describe('formatLegal -- no ANSI escape sequences', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('pass result contains no ANSI codes', () => {
    formatLegal(makeBaseResult());
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(stdoutOutput, /\x1b\[/);
  });

  it('fail result contains no ANSI codes', () => {
    formatLegal(makeFailResult());
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(stdoutOutput, /\x1b\[/);
  });

  it('embedded key result contains no ANSI codes', () => {
    formatLegal(makeEmbeddedResult());
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(stdoutOutput, /\x1b\[/);
  });

  it('result with timestamps contains no ANSI codes', () => {
    formatLegal(makeWithTimestamps());
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(stdoutOutput, /\x1b\[/);
  });
});

// ---------------------------------------------------------------------------
// formatLegal -- Untruncated values
// ---------------------------------------------------------------------------

describe('formatLegal -- untruncated values in Section 7', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('bundle hash is present in full', () => {
    const result = makeBaseResult();
    formatLegal(result);
    assert.match(stdoutOutput, new RegExp('sha256:' + 'a'.repeat(64)));
  });

  it('bundle hash contains no ellipsis truncation marker', () => {
    formatLegal(makeBaseResult());
    // The hash value line must not be truncated
    const lines = stdoutOutput.split('\n');
    const hashLine = lines.find(l => l.includes('Bundle hash:') && l.includes('sha256:'));
    assert.ok(hashLine, 'Bundle hash line should be present');
    assert.doesNotMatch(hashLine, /\.\.\./);
  });

  it('signature value is present in full', () => {
    const result = makeBaseResult();
    formatLegal(result);
    assert.match(stdoutOutput, /dGVzdHNpZ25hdHVyZWRhdGE=/);
  });

  it('key ID is present in full', () => {
    const result = makeBaseResult();
    formatLegal(result);
    assert.match(stdoutOutput, /aabbccdd11223344/);
  });
});

// ---------------------------------------------------------------------------
// formatLegal -- Timestamp separation (NOT merged like formatHuman)
// ---------------------------------------------------------------------------

describe('formatLegal -- timestamp separation', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('shows standard timestamp as its own subsection (3.N)', () => {
    const result = makeWithTimestamps();
    formatLegal(result);
    // timestamp and qualifiedTimestamp each get their own 3.N subsection
    assert.match(stdoutOutput, /Timestamp imprint/);
  });

  it('shows qualified timestamp as its own subsection (3.N)', () => {
    const result = makeWithTimestamps();
    formatLegal(result);
    assert.match(stdoutOutput, /Qualified timestamp/);
  });

  it('shows both timestamp types when both are present', () => {
    const result = makeWithTimestamps();
    formatLegal(result);
    // Both labels must appear -- they are NOT merged into one row
    assert.match(stdoutOutput, /Timestamp imprint/);
    assert.match(stdoutOutput, /Qualified timestamp/);
  });

  it('shows TSA identity separately from QTSA identity', () => {
    const result = makeWithTimestamps();
    formatLegal(result);
    assert.match(stdoutOutput, /tsa\.example\.com/);
    assert.match(stdoutOutput, /qtsa\.example\.com/);
  });

  it('shows capture time and TSA time as separate entries in Section 7', () => {
    const result = makeWithTimestamps();
    formatLegal(result);
    assert.match(stdoutOutput, /Capture time/);
    assert.match(stdoutOutput, /TSA time/);
    assert.match(stdoutOutput, /QTSA time/);
  });
});

// ---------------------------------------------------------------------------
// formatLegal -- Trust model visibility (embedded key)
// ---------------------------------------------------------------------------

describe('formatLegal -- embedded key trust warning', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('SELF-ASSERTED warning appears in Section 1 when source is embedded', () => {
    formatLegal(makeEmbeddedResult());
    // The warning must appear before Section 2 (i.e., in Section 1)
    const section1End = stdoutOutput.indexOf('2. SUBJECT OF VERIFICATION');
    assert.ok(section1End > 0, 'Section 2 header must be present');
    const section1 = stdoutOutput.slice(0, section1End);
    assert.match(section1, /SELF-ASSERTED/);
  });

  it('SELF-ASSERTED warning appears in Section 7 when source is embedded', () => {
    formatLegal(makeEmbeddedResult());
    const section7Start = stdoutOutput.indexOf('7. FULL TECHNICAL DETAILS');
    assert.ok(section7Start > 0, 'Section 7 header must be present');
    const section7 = stdoutOutput.slice(section7Start);
    assert.match(section7, /SELF-ASSERTED/);
  });

  it('no SELF-ASSERTED warning when source is pinned', () => {
    formatLegal(makeBaseResult()); // pinned source
    assert.doesNotMatch(stdoutOutput, /SELF-ASSERTED/);
  });

  it('no SELF-ASSERTED warning when source is origin', () => {
    formatLegal(makeOriginResult());
    assert.doesNotMatch(stdoutOutput, /SELF-ASSERTED/);
  });
});

// ---------------------------------------------------------------------------
// formatLegal -- Legal references
// ---------------------------------------------------------------------------

describe('formatLegal -- legal references', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('FRE 901(b)(9) is referenced', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /901\(b\)\(9\)/);
  });

  it('eIDAS Art. 41 is referenced', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /Article 41|Art\. 41/);
  });

  it('both legal references are present together', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /901\(b\)\(9\)/);
    assert.match(stdoutOutput, /910\/2014/);
  });
});

// ---------------------------------------------------------------------------
// formatLegal -- Graceful degradation
// ---------------------------------------------------------------------------

describe('formatLegal -- graceful degradation', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('does not crash with no timestamp', () => {
    assert.doesNotThrow(() => formatLegal(makeNoTimestampResult()));
  });

  it('does not crash with no qualifiedTimestamp', () => {
    const result = makeBaseResult(); // no qualifiedTimestamp in capture
    assert.doesNotThrow(() => formatLegal(result));
  });

  it('does not crash with null keyResolution', () => {
    assert.doesNotThrow(() => formatLegal(makeMinimalResult()));
  });

  it('does not crash with empty capture object', () => {
    assert.doesNotThrow(() => formatLegal(makeMinimalResult()));
  });

  it('does not crash with empty checks array', () => {
    const result = makeBaseResult({ checks: [] });
    assert.doesNotThrow(() => formatLegal(result));
  });

  it('still emits all section headers with minimal result', () => {
    formatLegal(makeMinimalResult());
    assert.match(stdoutOutput, /1\. SUMMARY/);
    assert.match(stdoutOutput, /7\. FULL TECHNICAL DETAILS/);
  });

  it('does not crash with undefined source', () => {
    const result = makeBaseResult({ source: undefined });
    assert.doesNotThrow(() => formatLegal(result));
  });
});

// ---------------------------------------------------------------------------
// formatLegal -- Methodology / reproducibility
// ---------------------------------------------------------------------------

describe('formatLegal -- methodology section', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('trust-root note is present in Section 6 (Reproducibility)', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /trust.root/i);
  });

  it('reproducibility command includes --legal flag', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /--legal/);
  });

  it('reproducibility command includes source filename', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /test\.wacz/);
  });

  it('embedded key reproducibility command uses --trust-embedded', () => {
    formatLegal(makeEmbeddedResult());
    assert.match(stdoutOutput, /--trust-embedded/);
  });

  it('origin key reproducibility command uses --origin with URL', () => {
    formatLegal(makeOriginResult());
    assert.match(stdoutOutput, /--origin/);
    assert.match(stdoutOutput, /keys\.example\.com/);
  });

  it('cryptographic algorithms are listed', () => {
    formatLegal(makeBaseResult());
    assert.match(stdoutOutput, /SHA-256/);
    assert.match(stdoutOutput, /Ed25519/);
    assert.match(stdoutOutput, /RFC 3161/);
  });
});

// ---------------------------------------------------------------------------
// formatLegalJson -- Schema validation
// ---------------------------------------------------------------------------

describe('formatLegalJson -- top-level schema', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('outputs valid JSON', () => {
    formatLegalJson(makeBaseResult());
    assert.doesNotThrow(() => JSON.parse(stdoutOutput));
  });

  it('has reportFormat key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('reportFormat' in parsed);
  });

  it('has verified key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('verified' in parsed);
  });

  it('has tool key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('tool' in parsed);
  });

  it('has summary key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('summary' in parsed);
  });

  it('has checks key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('checks' in parsed);
  });

  it('has capture key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('capture' in parsed);
  });

  it('has timestamps key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('timestamps' in parsed);
  });

  it('has keyResolution key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('keyResolution' in parsed);
  });

  it('has legalContext key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('legalContext' in parsed);
  });

  it('has methodology key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('methodology' in parsed);
  });

  it('has verifiedAt key', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('verifiedAt' in parsed);
  });

  it('reportFormat value is WRL-LEGAL-1.0', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.reportFormat, 'WRL-LEGAL-1.0');
  });

  it('verified is true for passing result', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.verified, true);
  });

  it('verified is false for failing result', () => {
    formatLegalJson(makeFailResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.verified, false);
  });

  it('verifiedAt is a valid ISO 8601 datetime', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.match(parsed.verifiedAt, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.doesNotThrow(() => new Date(parsed.verifiedAt));
  });
});

// ---------------------------------------------------------------------------
// formatLegalJson -- Check enrichment
// ---------------------------------------------------------------------------

describe('formatLegalJson -- enriched checks', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('each check has an explanation field', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    for (const check of parsed.checks) {
      assert.ok('explanation' in check, `Check ${check.name} missing explanation`);
    }
  });

  it('each check has a result field', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    for (const check of parsed.checks) {
      assert.ok('result' in check, `Check ${check.name} missing result`);
    }
  });

  it('each check has a significance field', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    for (const check of parsed.checks) {
      assert.ok('significance' in check, `Check ${check.name} missing significance`);
    }
  });

  it('explanation is a non-empty string for known checks', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    const byName = Object.fromEntries(parsed.checks.map(c => [c.name, c]));
    assert.ok(typeof byName.artifactHashes.explanation === 'string');
    assert.ok(byName.artifactHashes.explanation.length > 0);
  });

  it('result field reflects check outcome (pass text for passing check)', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    const byName = Object.fromEntries(parsed.checks.map(c => [c.name, c]));
    // Pass checks get the "pass" explanation, not the "fail" explanation
    assert.ok(typeof byName.signature.result === 'string');
    assert.ok(byName.signature.result.length > 0);
  });

  it('checks array preserves all checks from input', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.checks.length, 3);
  });
});

// ---------------------------------------------------------------------------
// formatLegalJson -- Timestamp separation
// ---------------------------------------------------------------------------

describe('formatLegalJson -- timestamps object', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('timestamps.standard is present when timestamp check is passed', () => {
    formatLegalJson(makeWithTimestamps());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(parsed.timestamps.standard, 'timestamps.standard should be present');
  });

  it('timestamps.qualified is present when qualifiedTimestamp check is passed', () => {
    formatLegalJson(makeWithTimestamps());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(parsed.timestamps.qualified, 'timestamps.qualified should be present');
  });

  it('timestamps.standard and timestamps.qualified are separate keys (not merged)', () => {
    formatLegalJson(makeWithTimestamps());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('standard' in parsed.timestamps);
    assert.ok('qualified' in parsed.timestamps);
  });

  it('timestamps.verification is always present', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(parsed.timestamps.verification, 'timestamps.verification should always be present');
  });

  it('timestamps.standard absent when no timestamp in capture', () => {
    formatLegalJson(makeBaseResult()); // no timestamp in capture
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(!parsed.timestamps.standard, 'timestamps.standard should be absent');
  });

  it('timestamps.qualified absent when no qualifiedTimestamp in capture', () => {
    formatLegalJson(makeBaseResult()); // no qualifiedTimestamp in capture
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(!parsed.timestamps.qualified, 'timestamps.qualified should be absent');
  });
});

// ---------------------------------------------------------------------------
// formatLegalJson -- Legal context
// ---------------------------------------------------------------------------

describe('formatLegalJson -- legalContext', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('legalContext.applicableFrameworks is an array', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(Array.isArray(parsed.legalContext.applicableFrameworks));
  });

  it('FRE 901(b)(9) is in applicable frameworks', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    const refs = parsed.legalContext.applicableFrameworks.map(f => f.reference);
    assert.ok(refs.some(r => r.includes('901(b)(9)')));
  });

  it('eIDAS Art. 41 is in applicable frameworks', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    const refs = parsed.legalContext.applicableFrameworks.map(f => f.reference);
    assert.ok(refs.some(r => r.includes('41')));
  });

  it('legalContext.disclaimer is present and non-empty', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(typeof parsed.legalContext.disclaimer === 'string');
    assert.ok(parsed.legalContext.disclaimer.length > 0);
  });
});

// ---------------------------------------------------------------------------
// formatLegalJson -- Methodology
// ---------------------------------------------------------------------------

describe('formatLegalJson -- methodology', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('methodology.algorithms is a non-empty array', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(Array.isArray(parsed.methodology.algorithms));
    assert.ok(parsed.methodology.algorithms.length > 0);
  });

  it('SHA-256 is listed in algorithms', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(parsed.methodology.algorithms.some(a => a.name === 'SHA-256'));
  });

  it('Ed25519 is listed in algorithms', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(parsed.methodology.algorithms.some(a => a.name === 'Ed25519'));
  });

  it('methodology.limitations is a non-empty array', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(Array.isArray(parsed.methodology.limitations));
    assert.ok(parsed.methodology.limitations.length > 0);
  });

  it('methodology.cryptoLibrary is a non-empty string', () => {
    formatLegalJson(makeBaseResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok(typeof parsed.methodology.cryptoLibrary === 'string');
    assert.ok(parsed.methodology.cryptoLibrary.length > 0);
  });
});

// ---------------------------------------------------------------------------
// formatLegalJson -- Graceful degradation
// ---------------------------------------------------------------------------

describe('formatLegalJson -- graceful degradation', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('does not crash with null keyResolution', () => {
    assert.doesNotThrow(() => formatLegalJson(makeMinimalResult()));
  });

  it('outputs valid JSON with minimal result', () => {
    formatLegalJson(makeMinimalResult());
    assert.doesNotThrow(() => JSON.parse(stdoutOutput));
  });

  it('does not crash with empty checks array', () => {
    const result = makeBaseResult({ checks: [] });
    assert.doesNotThrow(() => formatLegalJson(result));
    const parsed = JSON.parse(stdoutOutput);
    assert.deepStrictEqual(parsed.checks, []);
  });

  it('capture fields are null (not undefined) when absent', () => {
    formatLegalJson(makeMinimalResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.capture.bundleHash, null);
    assert.strictEqual(parsed.capture.signature, null);
    assert.strictEqual(parsed.capture.signedAt, null);
  });
});
