/**
 * format.test.js -- Output formatting tests
 *
 * Tests formatHuman(), formatJson(), and formatJsonError() from lib/format.js.
 *
 * Because these functions write to process.stdout, we capture stdout using
 * a pipe-and-restore approach.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { formatHuman, formatJson, formatJsonError } from '../lib/format.js';

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

function makePassResult(source = 'test.wacz') {
  return {
    verified: true,
    checks: [
      { name: 'artifactHashes', status: 'pass' },
      { name: 'bundleHash', status: 'pass' },
      { name: 'signature', status: 'pass' },
    ],
    capture: {
      bundleHash: 'sha256:' + 'a'.repeat(64),
      signature: 'dGVzdA==',
      publicKey: 'dGVzdHB1YmxpY2tleQ==',
      signedAt: '2026-03-16T12:00:00.000Z',
    },
    keyResolution: {
      keyId: 'aabbccdd',
      source: 'pinned',
      origin: null,
      endpoint: null,
    },
    source,
  };
}

function makeFailResult(source = 'test.wacz') {
  return {
    verified: false,
    checks: [
      { name: 'artifactHashes', status: 'fail', detail: 'One or more artifact hashes do not match' },
      { name: 'bundleHash', status: 'pass' },
      { name: 'signature', status: 'pass' },
    ],
    capture: {
      bundleHash: 'sha256:' + 'b'.repeat(64),
      signature: 'dGVzdA==',
      publicKey: 'dGVzdHB1YmxpY2tleQ==',
      signedAt: '2026-03-16T12:00:00.000Z',
    },
    keyResolution: {
      keyId: 'aabbccdd',
      source: 'pinned',
      origin: null,
      endpoint: null,
    },
    source,
  };
}

function makeSkipResult(source = 'test.wacz') {
  return {
    verified: true,
    checks: [
      { name: 'artifactHashes', status: 'pass' },
      { name: 'bundleHash', status: 'pass' },
      { name: 'signature', status: 'pass' },
      { name: 'timestamp', status: 'skip', detail: 'No independent timestamp was obtained for this capture' },
    ],
    capture: {
      bundleHash: 'sha256:' + 'c'.repeat(64),
      signature: 'dGVzdA==',
      publicKey: 'dGVzdHB1YmxpY2tleQ==',
      signedAt: '2026-03-16T12:00:00.000Z',
    },
    keyResolution: {
      keyId: 'aabbccdd',
      source: 'pinned',
      origin: null,
      endpoint: null,
    },
    source,
  };
}

// ---------------------------------------------------------------------------
// formatHuman tests
// ---------------------------------------------------------------------------

describe('formatHuman -- verdict header', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('starts with "Verified" on success', () => {
    formatHuman(makePassResult(), { noColor: true });
    assert.match(stdoutOutput, /^Verified/);
  });

  it('starts with "FAILED" on failure', () => {
    formatHuman(makeFailResult(), { noColor: true });
    assert.match(stdoutOutput, /^FAILED/);
  });

  it('includes the source filename in header', () => {
    formatHuman(makePassResult('my-capture.wacz'), { noColor: true });
    assert.match(stdoutOutput, /my-capture\.wacz/);
  });
});

describe('formatHuman -- check table', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('shows "pass" (lowercase) for passing checks', () => {
    formatHuman(makePassResult(), { noColor: true });
    assert.match(stdoutOutput, /pass/);
  });

  it('shows "FAIL" (uppercase) for failing checks', () => {
    formatHuman(makeFailResult(), { noColor: true });
    assert.match(stdoutOutput, /FAIL/);
  });

  it('shows "skip" (lowercase) for skipped checks', () => {
    formatHuman(makeSkipResult(), { noColor: true });
    assert.match(stdoutOutput, /skip/);
  });

  it('shows check labels from the mapping table', () => {
    formatHuman(makePassResult(), { noColor: true });
    assert.match(stdoutOutput, /File integrity/);
    assert.match(stdoutOutput, /Bundle integrity/);
    assert.match(stdoutOutput, /Digital signature/);
  });

  it('shows detail inline for failed checks', () => {
    formatHuman(makeFailResult(), { noColor: true });
    assert.match(stdoutOutput, /One or more artifact hashes do not match/);
  });

  it('shows skip detail inline', () => {
    formatHuman(makeSkipResult(), { noColor: true });
    assert.match(stdoutOutput, /No independent timestamp/);
  });
});

describe('formatHuman -- verdict line', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('all pass: "All N cryptographic checks passed"', () => {
    formatHuman(makePassResult(), { noColor: true });
    assert.match(stdoutOutput, /All 3 cryptographic checks passed/);
  });

  it('pass with skip: shows N of M applicable and S skipped', () => {
    formatHuman(makeSkipResult(), { noColor: true });
    assert.match(stdoutOutput, /3 of 3 applicable checks passed/);
    assert.match(stdoutOutput, /1 check/);
    assert.match(stdoutOutput, /not applicable/);
  });

  it('failure: shows N of M checks failed and lists failed check labels', () => {
    formatHuman(makeFailResult(), { noColor: true });
    assert.match(stdoutOutput, /1 of 3 applicable check/);
    assert.match(stdoutOutput, /File integrity/);
    assert.match(stdoutOutput, /cannot be verified/i);
  });
});

// ---------------------------------------------------------------------------
// formatHuman -- timestamp merging
// ---------------------------------------------------------------------------

describe('formatHuman -- timestamp merging', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  function makeBase(extraChecks = []) {
    return {
      verified: true,
      checks: [
        { name: 'artifactHashes', status: 'pass' },
        { name: 'bundleHash',     status: 'pass' },
        { name: 'signature',      status: 'pass' },
        ...extraChecks,
      ],
      capture: {
        bundleHash: 'sha256:' + 'd'.repeat(64),
        signature:  'dGVzdA==',
        publicKey:  'dGVzdHB1YmxpY2tleQ==',
        signedAt:   '2026-03-16T12:00:00.000Z',
      },
      keyResolution: { keyId: 'aabbccdd', source: 'pinned', origin: null, endpoint: null },
      source: 'test.wacz',
    };
  }

  it('qualified only: shows single Time verification row with pass', () => {
    const result = makeBase([
      { name: 'qualifiedTimestamp', status: 'pass', detail: 'TSA: example.com' },
      { name: 'timestamp',          status: 'skip', detail: 'No independent timestamp was obtained' },
    ]);
    formatHuman(result, { noColor: true });
    assert.match(stdoutOutput, /Time verification/);
    assert.match(stdoutOutput, /pass/);
    assert.doesNotMatch(stdoutOutput, /Timestamp imprint/);
    assert.doesNotMatch(stdoutOutput, /Qualified timestamp/);
    assert.match(stdoutOutput, /All 4 cryptographic checks passed/);
  });

  it('standard only: shows Time verification with pass and correct verdict', () => {
    const result = makeBase([
      { name: 'timestamp', status: 'pass', detail: 'TSA: example.com' },
    ]);
    formatHuman(result, { noColor: true });
    assert.match(stdoutOutput, /Time verification/);
    assert.match(stdoutOutput, /pass/);
    assert.match(stdoutOutput, /All 4 cryptographic checks passed/);
  });

  it('both present: single Time verification row and verdict counts 4 not 5', () => {
    const result = makeBase([
      { name: 'timestamp',          status: 'pass', detail: 'TSA: ts.example.com' },
      { name: 'qualifiedTimestamp', status: 'pass', detail: 'QTSA: qtsa.example.com' },
    ]);
    formatHuman(result, { noColor: true });
    const matches = [...stdoutOutput.matchAll(/Time verification/g)];
    assert.strictEqual(matches.length, 1, 'Expected exactly one Time verification row');
    assert.match(stdoutOutput, /All 4 cryptographic checks passed/);
  });

  it('neither present: shows Time verification with skip', () => {
    const result = makeBase([
      { name: 'timestamp', status: 'skip', detail: 'No independent timestamp was obtained for this capture' },
    ]);
    formatHuman(result, { noColor: true });
    assert.match(stdoutOutput, /Time verification/);
    assert.match(stdoutOutput, /skip/);
    assert.doesNotMatch(stdoutOutput, /Timestamp imprint/);
  });

  it('failure propagation: shows Time verification with FAIL and propagated detail', () => {
    const result = makeBase([
      { name: 'timestamp', status: 'fail', detail: 'Timestamp mismatch detected' },
    ]);
    result.verified = false;
    formatHuman(result, { noColor: true });
    assert.match(stdoutOutput, /Time verification/);
    assert.match(stdoutOutput, /FAIL/);
    assert.match(stdoutOutput, /Timestamp mismatch detected/);
  });

  it('JSON output unchanged: emits separate timestamp and qualifiedTimestamp with original labels', () => {
    const result = makeBase([
      { name: 'timestamp',          status: 'pass', detail: null },
      { name: 'qualifiedTimestamp', status: 'pass', detail: null },
    ]);
    formatJson(result);
    const parsed = JSON.parse(stdoutOutput);
    const byName = Object.fromEntries(parsed.checks.map(c => [c.name, c]));
    assert.ok(byName.timestamp, 'timestamp check should be present in JSON');
    assert.ok(byName.qualifiedTimestamp, 'qualifiedTimestamp check should be present in JSON');
    assert.strictEqual(byName.timestamp.label, 'Timestamp imprint');
    assert.strictEqual(byName.qualifiedTimestamp.label, 'Qualified timestamp');
  });
});

// ---------------------------------------------------------------------------
// formatJson tests
// ---------------------------------------------------------------------------

describe('formatJson -- structure', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('outputs valid JSON to stdout', () => {
    formatJson(makePassResult());
    assert.doesNotThrow(() => JSON.parse(stdoutOutput));
  });

  it('JSON has verified, checks, capture, keyResolution, source, verifiedAt fields', () => {
    formatJson(makePassResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('verified' in parsed);
    assert.ok('checks' in parsed);
    assert.ok('capture' in parsed);
    assert.ok('keyResolution' in parsed);
    assert.ok('source' in parsed);
    assert.ok('verifiedAt' in parsed);
  });

  it('verified is true for passing result', () => {
    formatJson(makePassResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.verified, true);
  });

  it('verified is false for failing result', () => {
    formatJson(makeFailResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.verified, false);
  });

  it('checks array has name, label, status, detail fields', () => {
    formatJson(makeFailResult());
    const parsed = JSON.parse(stdoutOutput);
    const failCheck = parsed.checks.find(c => c.status === 'fail');
    assert.ok(failCheck);
    assert.ok('name' in failCheck);
    assert.ok('label' in failCheck);
    assert.ok('status' in failCheck);
    assert.ok('detail' in failCheck);
  });

  it('detail is null (not undefined) for passing checks', () => {
    formatJson(makePassResult());
    const parsed = JSON.parse(stdoutOutput);
    for (const check of parsed.checks) {
      // JSON.parse of undefined fields is absent; null must be explicit
      assert.strictEqual(check.detail, null);
    }
  });

  it('check labels match expected mapping', () => {
    formatJson(makePassResult());
    const parsed = JSON.parse(stdoutOutput);
    const byName = Object.fromEntries(parsed.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.artifactHashes.label, 'File integrity');
    assert.strictEqual(byName.bundleHash.label, 'Bundle integrity');
    assert.strictEqual(byName.signature.label, 'Digital signature');
  });

  it('capture renames publicKey to embeddedPublicKey', () => {
    formatJson(makePassResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.ok('embeddedPublicKey' in parsed.capture, 'embeddedPublicKey should be present');
    assert.ok(!('publicKey' in parsed.capture), 'publicKey should not be present');
  });

  it('verifiedAt is a valid ISO 8601 datetime string', () => {
    formatJson(makePassResult());
    const parsed = JSON.parse(stdoutOutput);
    assert.doesNotThrow(() => new Date(parsed.verifiedAt));
    assert.match(parsed.verifiedAt, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// formatJsonError tests
// ---------------------------------------------------------------------------

describe('formatJsonError -- structure', () => {
  beforeEach(captureStdout);
  afterEach(restoreStdout);

  it('outputs valid JSON with verified: null', () => {
    formatJsonError('Something went wrong', 'test.wacz');
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.verified, null);
  });

  it('includes error message', () => {
    formatJsonError('File not found', 'test.wacz');
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.error, 'File not found');
  });

  it('checks is empty array', () => {
    formatJsonError('Error', 'test.wacz');
    const parsed = JSON.parse(stdoutOutput);
    assert.deepStrictEqual(parsed.checks, []);
  });

  it('capture is null', () => {
    formatJsonError('Error', 'test.wacz');
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.capture, null);
  });

  it('source is preserved', () => {
    formatJsonError('Error', 'my-file.wacz');
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.source, 'my-file.wacz');
  });

  it('keyResolution is null', () => {
    formatJsonError('Error', 'test.wacz');
    const parsed = JSON.parse(stdoutOutput);
    assert.strictEqual(parsed.keyResolution, null);
  });
});
