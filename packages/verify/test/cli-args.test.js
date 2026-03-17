/**
 * cli-args.test.js -- Argument parsing and CLI behavior tests
 *
 * parseArgs is imported directly from cli.js for unit tests.
 * CLI behavior (exit codes, error messages) is tested via subprocess spawning.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from '../lib/cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = join(__dirname, '..', 'bin', 'wrl-verify.js');

// ---------------------------------------------------------------------------
// Helper: run CLI with given argv, capturing stdout/stderr and exit code
// ---------------------------------------------------------------------------

function runCli(...args) {
  return spawnSync(process.execPath, [CLI_BIN, ...args], {
    encoding: 'utf8',
    timeout: 5000,
  });
}

// ---------------------------------------------------------------------------
// Argument parsing unit tests (using exported parseArgs from cli.js)
// ---------------------------------------------------------------------------

describe('parseArgs -- boolean flags', () => {
  it('--help sets help: true', () => {
    const opts = parseArgs(['--help']);
    assert.strictEqual(opts.help, true);
  });

  it('-h sets help: true', () => {
    const opts = parseArgs(['-h']);
    assert.strictEqual(opts.help, true);
  });

  it('--version sets version: true', () => {
    const opts = parseArgs(['--version']);
    assert.strictEqual(opts.version, true);
  });

  it('--json sets json: true', () => {
    const opts = parseArgs(['--json', 'file.wacz']);
    assert.strictEqual(opts.json, true);
  });

  it('--no-color sets noColor: true', () => {
    const opts = parseArgs(['--no-color', 'file.wacz']);
    assert.strictEqual(opts.noColor, true);
  });

  it('--trust-embedded sets trustEmbedded: true', () => {
    const opts = parseArgs(['--trust-embedded', 'file.wacz']);
    assert.strictEqual(opts.trustEmbedded, true);
  });
});

describe('parseArgs -- value flags', () => {
  it('--key <value> parsed', () => {
    const opts = parseArgs(['file.wacz', '--key', 'AAAA/base64==']);
    assert.strictEqual(opts.key, 'AAAA/base64==');
  });

  it('--origin <url> parsed', () => {
    const opts = parseArgs(['file.wacz', '--origin', 'https://example.com']);
    assert.strictEqual(opts.origin, 'https://example.com');
  });

  it('--key-file <path> parsed', () => {
    const opts = parseArgs(['file.wacz', '--key-file', '/path/to/key.txt']);
    assert.strictEqual(opts.keyFile, '/path/to/key.txt');
  });

  it('--trust-root accumulates multiple values', () => {
    const opts = parseArgs([
      'file.wacz',
      '--trust-root', '/path/a.pem',
      '--trust-root', '/path/b.pem',
    ]);
    assert.deepStrictEqual(opts.trustRoots, ['/path/a.pem', '/path/b.pem']);
  });
});

describe('parseArgs -- positional argument', () => {
  it('first positional is target', () => {
    const opts = parseArgs(['capture.wacz']);
    assert.strictEqual(opts.target, 'capture.wacz');
  });

  it('URL as target is accepted', () => {
    const opts = parseArgs(['https://wrl.benpeter.workers.dev/v1/captures/cap_abc/artifacts/wacz']);
    assert.strictEqual(opts.target, 'https://wrl.benpeter.workers.dev/v1/captures/cap_abc/artifacts/wacz');
  });
});

describe('parseArgs -- error cases', () => {
  it('unknown flag throws', () => {
    assert.throws(
      () => parseArgs(['--unknown-flag']),
      /Unknown flag/
    );
  });

  it('--key without value throws', () => {
    assert.throws(
      () => parseArgs(['--key']),
      /requires a value/
    );
  });

  it('--origin without value throws', () => {
    assert.throws(
      () => parseArgs(['--origin']),
      /requires a value/
    );
  });

  it('--key-file without value throws', () => {
    assert.throws(
      () => parseArgs(['--key-file']),
      /requires a value/
    );
  });

  it('extra positional argument throws', () => {
    assert.throws(
      () => parseArgs(['file.wacz', 'extra']),
      /Unexpected argument/
    );
  });
});

describe('parseArgs -- defaults', () => {
  it('empty argv returns all defaults', () => {
    const opts = parseArgs([]);
    assert.strictEqual(opts.target, null);
    assert.strictEqual(opts.origin, null);
    assert.strictEqual(opts.key, null);
    assert.strictEqual(opts.keyFile, null);
    assert.strictEqual(opts.trustEmbedded, false);
    assert.deepStrictEqual(opts.trustRoots, []);
    assert.strictEqual(opts.json, false);
    assert.strictEqual(opts.noColor, false);
    assert.strictEqual(opts.help, false);
    assert.strictEqual(opts.version, false);
  });
});

// ---------------------------------------------------------------------------
// CLI subprocess tests -- --help and --version
// ---------------------------------------------------------------------------

describe('CLI -- --help and --version', () => {
  it('--help exits 0 and prints usage', () => {
    const result = runCli('--help');
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /USAGE/);
    assert.match(result.stdout, /wrl-verify/);
  });

  it('-h exits 0 and prints usage', () => {
    const result = runCli('-h');
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /USAGE/);
  });

  it('--version exits 0 and prints version number', () => {
    const result = runCli('--version');
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /\d+\.\d+\.\d+/);
  });
});

// ---------------------------------------------------------------------------
// CLI subprocess tests -- argument errors (exit 2)
// ---------------------------------------------------------------------------

describe('CLI -- argument validation', () => {
  it('no arguments exits 2 with usage hint', () => {
    const result = runCli();
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /Missing required argument/);
  });

  it('unknown flag exits 2 with error message', () => {
    const result = runCli('--unknown-flag', 'file.wacz');
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /Unknown flag/);
  });

  it('--key and --origin together exit 2 (mutually exclusive)', () => {
    const result = runCli('file.wacz', '--key', 'AAAA==', '--origin', 'https://example.com');
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /mutually exclusive/i);
  });

  it('--key and --key-file together exit 2', () => {
    const result = runCli('file.wacz', '--key', 'AAAA==', '--key-file', '/path/key.txt');
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /mutually exclusive/i);
  });

  it('--key and --trust-embedded together exit 2', () => {
    const result = runCli('file.wacz', '--key', 'AAAA==', '--trust-embedded');
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /mutually exclusive/i);
  });

  it('missing file exits 2 with error message', () => {
    const result = runCli('/nonexistent/path/to/file.wacz', '--trust-embedded');
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /Cannot read file/);
  });

  it('--json mode writes errors as JSON to stdout on argument error', () => {
    const result = runCli('--json');
    assert.strictEqual(result.status, 2);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.verified, null);
    assert.ok(parsed.error);
    assert.ok(Array.isArray(parsed.checks));
  });
});
