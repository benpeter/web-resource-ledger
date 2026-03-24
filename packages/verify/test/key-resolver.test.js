/**
 * key-resolver.test.js -- Key resolution logic tests
 *
 * Tests resolveKey(), isWrlCaptureUrl(), originFromUrl(), and related helpers
 * from lib/key-resolver.js.
 *
 * Network calls (--origin mode) are NOT mocked here -- those require an
 * integration test environment with a live or mock HTTP server. The network
 * path is tested at the subprocess level in cli-args.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveKey,
  isWrlCaptureUrl,
  originFromUrl,
  fetchWaczFromCaptureUrl,
} from '../lib/key-resolver.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Generates a valid 32-byte Ed25519 public key and returns it as
 * { bytes: Uint8Array, base64: string }
 */
async function makeTestKey() {
  const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  const bytes = new Uint8Array(raw);
  const base64 = Buffer.from(bytes).toString('base64');
  return { bytes, base64 };
}

// ---------------------------------------------------------------------------
// isWrlCaptureUrl
// ---------------------------------------------------------------------------

describe('isWrlCaptureUrl', () => {
  it('returns true for valid WRL capture URLs', () => {
    assert.strictEqual(
      isWrlCaptureUrl('https://api.webresourceledger.com/v1/captures/cap_eebc8b957ee542c7a9a4d8a0a33ae1c8'),
      true
    );
    assert.strictEqual(
      isWrlCaptureUrl('https://api.webresourceledger.com/v1/verify/cap_eebc8b957ee542c7a9a4d8a0a33ae1c8'),
      true
    );
  });

  it('returns true for WRL capture URLs with query parameters', () => {
    assert.strictEqual(
      isWrlCaptureUrl('https://api.webresourceledger.com/v1/captures/cap_eebc8b957ee542c7a9a4d8a0a33ae1c8?foo=bar'),
      true
    );
    assert.strictEqual(
      isWrlCaptureUrl('https://api.webresourceledger.com/v1/verify/cap_eebc8b957ee542c7a9a4d8a0a33ae1c8?foo=bar'),
      true
    );
  });

  it('returns false for non-WRL URLs', () => {
    assert.strictEqual(isWrlCaptureUrl('https://example.com/file.wacz'), false);
    assert.strictEqual(isWrlCaptureUrl('/local/path/file.wacz'), false);
    assert.strictEqual(isWrlCaptureUrl(''), false);
  });

  it('returns false for WRL URLs with wrong path pattern', () => {
    // Missing cap_ prefix
    assert.strictEqual(
      isWrlCaptureUrl('https://api.webresourceledger.com/v1/captures/eebc8b957ee542c7a9a4d8a0a33ae1c8'),
      false
    );
    // Too short ID
    assert.strictEqual(
      isWrlCaptureUrl('https://api.webresourceledger.com/v1/captures/cap_abc123'),
      false
    );
  });
});

// ---------------------------------------------------------------------------
// originFromUrl
// ---------------------------------------------------------------------------

describe('originFromUrl', () => {
  it('extracts origin from HTTPS URL', () => {
    const origin = originFromUrl('https://api.webresourceledger.com/v1/captures/cap_abc');
    assert.strictEqual(origin, 'https://api.webresourceledger.com');
  });

  it('extracts origin preserving port if present', () => {
    const origin = originFromUrl('https://localhost:8787/v1/captures/cap_abc');
    assert.strictEqual(origin, 'https://localhost:8787');
  });
});

// ---------------------------------------------------------------------------
// resolveKey -- --key (base64)
// ---------------------------------------------------------------------------

describe('resolveKey -- --key (base64)', () => {
  it('returns correct bytes and keyId for valid 32-byte key', async () => {
    const { bytes, base64 } = await makeTestKey();
    const result = await resolveKey({ key: base64 });

    assert.ok(result.publicKeyBytes instanceof Uint8Array);
    assert.strictEqual(result.publicKeyBytes.length, 32);
    // Compare bytes
    for (let i = 0; i < 32; i++) {
      assert.strictEqual(result.publicKeyBytes[i], bytes[i]);
    }
    assert.strictEqual(result.source, 'pinned');
    assert.strictEqual(typeof result.keyId, 'string');
    assert.strictEqual(result.keyId.length, 8); // 4 bytes = 8 hex chars
    assert.strictEqual(result.origin, null);
    assert.strictEqual(result.endpoint, null);
  });

  it('throws for wrong-length key', async () => {
    const shortKey = Buffer.from(new Uint8Array(16)).toString('base64');
    await assert.rejects(
      () => resolveKey({ key: shortKey }),
      /Expected 32-byte/
    );
  });
});

// ---------------------------------------------------------------------------
// resolveKey -- --key-file
// ---------------------------------------------------------------------------

describe('resolveKey -- --key-file', () => {
  let tmpDir;

  it('reads key from file and returns correct bytes', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wrl-test-'));
    const { bytes, base64 } = await makeTestKey();
    const keyPath = join(tmpDir, 'test-key.txt');
    writeFileSync(keyPath, base64, 'utf8');

    try {
      const result = await resolveKey({ keyFile: keyPath });
      assert.ok(result.publicKeyBytes instanceof Uint8Array);
      assert.strictEqual(result.publicKeyBytes.length, 32);
      for (let i = 0; i < 32; i++) {
        assert.strictEqual(result.publicKeyBytes[i], bytes[i]);
      }
      assert.strictEqual(result.source, 'pinned');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws descriptive error for missing key file', async () => {
    await assert.rejects(
      () => resolveKey({ keyFile: '/nonexistent/path/key.txt' }),
      /Cannot read key file/
    );
  });
});

// ---------------------------------------------------------------------------
// resolveKey -- --trust-embedded
// ---------------------------------------------------------------------------

describe('resolveKey -- --trust-embedded', () => {
  it('extracts v0.1.0 embedded publicKey', async () => {
    const { bytes, base64 } = await makeTestKey();
    const signedData = {
      version: '0.1.0',
      publicKey: base64,
      signature: 'dGVzdA==',
      hash: 'sha256:' + 'ab'.repeat(32),
    };

    // Suppress the warning written to stderr
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
    try {
      const result = await resolveKey({ trustEmbedded: true, signedData });
      assert.ok(result.publicKeyBytes instanceof Uint8Array);
      assert.strictEqual(result.publicKeyBytes.length, 32);
      assert.strictEqual(result.source, 'embedded');
    } finally {
      process.stderr.write = origWrite;
    }
  });

  it('extracts v0.2.0 embedded publicKey from self signature', async () => {
    const { bytes, base64 } = await makeTestKey();
    const signedData = {
      version: '0.2.0',
      hash: 'sha256:' + 'ab'.repeat(32),
      signatures: [
        { type: 'self', signature: 'dGVzdA==', publicKey: base64, keyId: 'aabbccdd' },
        { type: 'rfc3161', token: 'dGVzdA==', tsa: 'https://tsa.example.com' },
      ],
    };

    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
    try {
      const result = await resolveKey({ trustEmbedded: true, signedData });
      assert.ok(result.publicKeyBytes instanceof Uint8Array);
      assert.strictEqual(result.source, 'embedded');
    } finally {
      process.stderr.write = origWrite;
    }
  });

  it('throws when no embedded key present', async () => {
    const signedData = {
      version: '0.1.0',
      // No publicKey field
      signature: 'dGVzdA==',
      hash: 'sha256:' + 'ab'.repeat(32),
    };

    await assert.rejects(
      () => resolveKey({ trustEmbedded: true, signedData }),
      /No embedded public key/
    );
  });
});

// ---------------------------------------------------------------------------
// resolveKey -- HTTPS enforcement
// ---------------------------------------------------------------------------

describe('resolveKey -- HTTPS enforcement', () => {
  it('rejects http:// origins (non-localhost)', async () => {
    await assert.rejects(
      () => resolveKey({ origin: 'http://example.com' }),
      /HTTPS/
    );
  });

  it('rejects ftp:// origins', async () => {
    await assert.rejects(
      () => resolveKey({ origin: 'ftp://example.com' }),
      /HTTPS/
    );
  });

  it('allows http://localhost', async () => {
    // This will attempt a network call and fail, but the HTTPS guard should pass
    await assert.rejects(
      () => resolveKey({ origin: 'http://localhost' }),
      (err) => {
        // Should fail for network reasons, NOT for HTTPS enforcement
        assert.doesNotMatch(err.message, /HTTPS/);
        return true;
      }
    );
  });

  it('allows http://127.0.0.1', async () => {
    await assert.rejects(
      () => resolveKey({ origin: 'http://127.0.0.1' }),
      (err) => {
        assert.doesNotMatch(err.message, /HTTPS/);
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// fetchWaczFromCaptureUrl -- artifact URL construction
// ---------------------------------------------------------------------------

describe('fetchWaczFromCaptureUrl -- artifact URL construction', () => {
  let originalFetch;

  function mockFetch(handler) {
    originalFetch = globalThis.fetch;
    globalThis.fetch = handler;
  }

  function restoreFetch() {
    globalThis.fetch = originalFetch;
  }

  it('constructs artifact URL from capture URL', async () => {
    let capturedUrl;
    mockFetch(async (url) => {
      capturedUrl = url;
      const body = new Uint8Array(4);
      return {
        ok: true,
        body: {
          getReader() {
            let done = false;
            return {
              read() {
                if (done) return Promise.resolve({ done: true });
                done = true;
                return Promise.resolve({ done: false, value: body });
              },
              cancel() {},
            };
          },
        },
      };
    });

    try {
      const origWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = () => true;
      try {
        await fetchWaczFromCaptureUrl(
          'https://api.webresourceledger.com/v1/captures/cap_eebc8b957ee542c7a9a4d8a0a33ae1c8'
        );
      } finally {
        process.stderr.write = origWrite;
      }
    } finally {
      restoreFetch();
    }

    assert.ok(capturedUrl, 'fetch should have been called');
    assert.match(capturedUrl, /\/v1\/captures\/cap_eebc8b957ee542c7a9a4d8a0a33ae1c8\/artifacts\/wacz/);
    assert.doesNotMatch(capturedUrl, /token=/);
  });

  it('throws actionable error message on 401', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 401,
      body: { getReader() { return { read() { return Promise.resolve({ done: true }); }, cancel() {} }; } },
    }));

    try {
      const origWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = () => true;
      try {
        await assert.rejects(
          () => fetchWaczFromCaptureUrl(
            'https://api.webresourceledger.com/v1/captures/cap_eebc8b957ee542c7a9a4d8a0a33ae1c8'
          ),
          /publicly accessible/
        );
      } finally {
        process.stderr.write = origWrite;
      }
    } finally {
      restoreFetch();
    }
  });
});

// ---------------------------------------------------------------------------
// resolveKey -- no key source specified
// ---------------------------------------------------------------------------

describe('resolveKey -- no key source', () => {
  it('throws descriptive error when no key source is given', async () => {
    const signedData = {
      version: '0.1.0',
      publicKey: 'AAAA', // embedded but not trusted
      hash: 'sha256:' + 'ab'.repeat(32),
    };

    await assert.rejects(
      () => resolveKey({ signedData }),
      /No signing key source/
    );
  });

  it('error message includes embedded keyId', async () => {
    const { base64 } = await makeTestKey();
    const signedData = {
      version: '0.1.0',
      publicKey: base64,
      hash: 'sha256:' + 'ab'.repeat(32),
    };

    let errorMessage = '';
    try {
      await resolveKey({ signedData });
    } catch (err) {
      errorMessage = err.message;
    }

    assert.match(errorMessage, /keyId/);
  });
});
