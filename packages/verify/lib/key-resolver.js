/**
 * key-resolver.js -- Ed25519 public key resolution for wrl-verify.
 *
 * Three trust levels, in descending order of security:
 *   1. origin  -- key fetched from {origin}/.well-known/signing-keys
 *   2. pinned  -- key supplied directly via --key or --key-file
 *   3. embedded -- key from WACZ itself (--trust-embedded; self-asserted only)
 *
 * SECURITY: HTTP origins are rejected except localhost. An attacker on the
 * network could serve a malicious signing key over plaintext HTTP.
 */ // tva

import { readFileSync } from 'node:fs';

const KEY_FETCH_TIMEOUT_MS   = 5_000;
const WACZ_FETCH_TIMEOUT_MS  = 30_000;
const MAX_KEY_RESPONSE_BYTES = 1_024 * 1_024;       // 1 MB
const MAX_WACZ_BYTES         = 100 * 1_024 * 1_024; // 100 MB

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Returns true for WRL capture URLs matching /v1/(captures|verify)/cap_<id>.
 *
 * @param {string} input
 * @returns {boolean}
 */
export function isWrlCaptureUrl(input) {
  try {
    const url = new URL(input);
    return /\/v1\/(captures|verify)\/cap_[a-f0-9]{32}$/.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Extracts the share token from a WRL capture URL, if present.
 *
 * @param {string} urlStr
 * @returns {string|null}
 */
export function shareTokenFromUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

/**
 * Extracts the origin (scheme + host + port) from a URL string.
 *
 * @param {string} urlStr
 * @returns {string}
 */
export function originFromUrl(urlStr) {
  const url = new URL(urlStr);
  return url.origin;
}

/**
 * Extracts the capture ID from a WRL capture URL.
 *
 * @param {string} urlStr
 * @returns {string}  e.g. "cap_abc123..."
 */
export function captureIdFromUrl(urlStr) {
  const url = new URL(urlStr);
  const match = url.pathname.match(/\/(cap_[a-f0-9]{32})$/);
  if (!match) throw new Error(`Cannot extract capture ID from URL: ${urlStr}`);
  return match[1];
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Fetches a URL with a timeout and response-size guard.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, maxBytes?: number }} opts
 * @returns {Promise<Uint8Array>}
 */
async function fetchBytes(url, { timeoutMs = KEY_FETCH_TIMEOUT_MS, maxBytes = MAX_KEY_RESPONSE_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const cause = err.name === 'AbortError' ? 'timed out' : err.message;
    throw new Error(`Network error fetching ${url}: ${cause}`);
  }
  clearTimeout(timer);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        `HTTP 401 fetching ${url}\n\n` +
        `This capture requires a share token. Use a share URL with ?token=:\n` +
        `  npx @w-r-l/verify "https://wrl.../v1/captures/cap_abc?token=wrl_share_..."\n\n` +
        `Or verify via the server-side endpoint (no token needed):\n` +
        `  npx @w-r-l/verify "https://wrl.../v1/verify/cap_abc"`
      );
    }
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  // Stream with size guard
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel();
      throw new Error(`Response from ${url} exceeds ${maxBytes} byte limit`);
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// ---------------------------------------------------------------------------
// WACZ download
// ---------------------------------------------------------------------------

/**
 * Downloads a WACZ file from a WRL capture URL.
 * Derives the artifact URL from the capture origin and ID.
 *
 * @param {string} captureUrl
 * @returns {Promise<{ waczBytes: Uint8Array, origin: string }>}
 */
export async function fetchWaczFromCaptureUrl(captureUrl) {
  const origin    = originFromUrl(captureUrl);
  const captureId = captureIdFromUrl(captureUrl);
  const token     = shareTokenFromUrl(captureUrl);

  let waczUrl = `${origin}/v1/captures/${captureId}/artifacts/wacz`;
  if (token) waczUrl += `?token=${encodeURIComponent(token)}`;

  process.stderr.write(`Fetching capture from ${waczUrl}\n`);

  const waczBytes = await fetchBytes(waczUrl, {
    timeoutMs: WACZ_FETCH_TIMEOUT_MS,
    maxBytes: MAX_WACZ_BYTES,
  });

  return { waczBytes, origin };
}

/**
 * Downloads a WACZ file from an arbitrary HTTPS URL.
 *
 * @param {string} url
 * @returns {Promise<Uint8Array>}
 */
export async function fetchWaczFromUrl(url) {
  process.stderr.write(`Fetching capture from ${url}\n`);
  return fetchBytes(url, { timeoutMs: WACZ_FETCH_TIMEOUT_MS, maxBytes: MAX_WACZ_BYTES });
}

// ---------------------------------------------------------------------------
// Key parsing helpers
// ---------------------------------------------------------------------------

/**
 * Decodes a base64-encoded 32-byte Ed25519 public key.
 *
 * @param {string} b64
 * @returns {Uint8Array}
 */
function decodePublicKey(b64) {
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length !== 32) {
    throw new Error(`Expected 32-byte Ed25519 key, got ${bytes.length} bytes`);
  }
  return new Uint8Array(bytes);
}

/**
 * Extracts a short 8-hex-char key ID from a base64 public key.
 * Mirrors the server convention: first 4 bytes of the key as lowercase hex.
 *
 * @param {string} b64
 * @returns {string}
 */
function keyIdFromBase64(b64) {
  const bytes = Buffer.from(b64, 'base64');
  return bytes.slice(0, 4).toString('hex');
}

// ---------------------------------------------------------------------------
// Origin key fetch
// ---------------------------------------------------------------------------

/**
 * Fetches a signing key from {origin}/.well-known/signing-keys.
 * Falls back to /.well-known/signing-key for v0.1.0 captures without keyId.
 *
 * @param {string} origin
 * @param {string|null} keyId  8-char hex key ID from signedData, or null
 * @returns {Promise<{ publicKeyBytes: Uint8Array, keyId: string, endpoint: string }>}
 */
async function fetchKeyFromOrigin(origin, keyId) {
  // Try the multi-key endpoint first
  const keysUrl = `${origin}/.well-known/signing-keys`;
  let keysData;
  let usedFallback = false;

  try {
    const bytes = await fetchBytes(keysUrl);
    keysData = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    // If the multi-key endpoint fails and we have a keyId, propagate the error.
    // If no keyId (v0.1.0), try the single-key fallback endpoint below.
    if (keyId) {
      throw new Error(
        `Failed to fetch signing keys from ${keysUrl}: ${err.message}\n\n` +
        `Specify the key directly with:\n` +
        `  --key <base64>       Provide key directly\n` +
        `  --key-file <path>    Read key from file`
      );
    }
    keysData = null;
  }

  // Try to find a matching entry in the keys list
  if (keysData && keyId) {
    const keys = Array.isArray(keysData.keys) ? keysData.keys : (Array.isArray(keysData) ? keysData : []);
    const entry = keys.find(k => k.keyId === keyId);
    if (entry?.publicKey) {
      return {
        publicKeyBytes: decodePublicKey(entry.publicKey),
        keyId,
        endpoint: keysUrl,
      };
    }
  }

  // Fall back to the single-key endpoint
  const singleUrl = `${origin}/.well-known/signing-key`;
  usedFallback = true;
  let singleData;
  try {
    const bytes = await fetchBytes(singleUrl);
    singleData = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    throw new Error(
      `Failed to fetch signing key from ${singleUrl}: ${err.message}\n\n` +
      `Specify the key directly with:\n` +
      `  --key <base64>       Provide key directly\n` +
      `  --key-file <path>    Read key from file`
    );
  }

  const rawKey = singleData?.publicKey ?? singleData?.key ?? null;
  if (!rawKey) {
    throw new Error(`No publicKey field found in ${singleUrl}`);
  }

  const resolvedKeyId = keyIdFromBase64(rawKey);

  // If we had a keyId and the fallback key doesn't match, fail explicitly
  if (keyId && resolvedKeyId !== keyId) {
    throw new Error(
      `Key not found for keyId: ${keyId}\n\n` +
      `The signing-keys endpoint did not contain the expected key, ` +
      `and the fallback key has a different ID (${resolvedKeyId}).\n\n` +
      `Specify the key directly with:\n` +
      `  --key <base64>       Provide key directly\n` +
      `  --key-file <path>    Read key from file`
    );
  }

  return {
    publicKeyBytes: decodePublicKey(rawKey),
    keyId: resolvedKeyId,
    endpoint: singleUrl,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves the Ed25519 signing key from the configured trust source.
 *
 * @param {{
 *   origin?: string,
 *   key?: string,
 *   keyFile?: string,
 *   trustEmbedded?: boolean,
 *   signedData?: object,
 * }} options
 * @returns {Promise<{
 *   publicKeyBytes: Uint8Array,
 *   keyId: string,
 *   source: 'origin'|'pinned'|'embedded',
 *   origin: string|null,
 *   endpoint: string|null,
 * }>}
 */
export async function resolveKey(options) {
  const { origin, key, keyFile, trustEmbedded, signedData } = options;

  // HTTPS enforcement: reject insecure origins (except localhost for dev/testing)
  if (origin &&
      !origin.startsWith('https://') &&
      !origin.startsWith('http://localhost') &&
      !origin.startsWith('http://127.0.0.1')) {
    throw new Error(
      `Origin must use HTTPS (except localhost).\n` +
      `Got: ${origin}\n\n` +
      `An attacker on the network could serve a malicious signing key over HTTP.`
    );
  }

  // --key: directly provided base64 key
  if (key) {
    const publicKeyBytes = decodePublicKey(key);
    return {
      publicKeyBytes,
      keyId: keyIdFromBase64(key),
      source: 'pinned',
      origin: null,
      endpoint: null,
    };
  }

  // --key-file: read key from a file
  if (keyFile) {
    let raw;
    try {
      raw = readFileSync(keyFile, 'utf8').trim();
    } catch (err) {
      throw new Error(`Cannot read key file ${keyFile}: ${err.message}`);
    }
    const publicKeyBytes = decodePublicKey(raw);
    return {
      publicKeyBytes,
      keyId: keyIdFromBase64(raw),
      source: 'pinned',
      origin: null,
      endpoint: null,
    };
  }

  // --trust-embedded: use the key from WACZ itself (insecure)
  if (trustEmbedded) {
    const version = signedData?.version ?? '0.1.0';
    let embeddedKey = null;

    if (version === '0.2.0') {
      const selfSig = (signedData?.signatures ?? []).find(s => s.type === 'self');
      embeddedKey = selfSig?.publicKey ?? null;
    } else {
      embeddedKey = signedData?.publicKey ?? null;
    }

    if (!embeddedKey) {
      throw new Error('No embedded public key found in WACZ datapackage-digest.json');
    }

    process.stderr.write(
      `Warning: Verification used the self-asserted key embedded in the WACZ.\n` +
      `This proves internal consistency only -- not that the capture was\n` +
      `produced by a trusted operator.\n`
    );

    const publicKeyBytes = decodePublicKey(embeddedKey);
    return {
      publicKeyBytes,
      keyId: keyIdFromBase64(embeddedKey),
      source: 'embedded',
      origin: null,
      endpoint: null,
    };
  }

  // --origin (or auto-derived from capture URL): fetch from well-known endpoint
  if (origin) {
    // Extract keyId from signedData for matching
    const version = signedData?.version ?? '0.1.0';
    let keyId = null;
    if (version === '0.2.0') {
      const selfSig = (signedData?.signatures ?? []).find(s => s.type === 'self');
      keyId = selfSig?.keyId ?? null;
    }
    // v0.1.0 captures have no keyId field -- will use fallback endpoint

    const { publicKeyBytes, keyId: resolvedKeyId, endpoint } = await fetchKeyFromOrigin(origin, keyId);
    return {
      publicKeyBytes,
      keyId: resolvedKeyId,
      source: 'origin',
      origin,
      endpoint,
    };
  }

  // No key source -- extract embedded keyId for the error message
  const version = signedData?.version ?? '0.1.0';
  let embeddedKeyId = 'unknown';
  if (version === '0.2.0') {
    const selfSig = (signedData?.signatures ?? []).find(s => s.type === 'self');
    if (selfSig?.publicKey) embeddedKeyId = keyIdFromBase64(selfSig.publicKey);
    else if (selfSig?.keyId) embeddedKeyId = selfSig.keyId;
  } else if (signedData?.publicKey) {
    embeddedKeyId = keyIdFromBase64(signedData.publicKey);
  }

  throw new Error(
    `No signing key source specified for local verification.\n\n` +
    `The WACZ file contains an embedded public key, but using it would be\n` +
    `insecure -- an attacker who modifies the capture can also replace the\n` +
    `embedded key.\n\n` +
    `Specify one of:\n` +
    `  --origin https://api.webresourceledger.com  Fetch key from the operator\n` +
    `  --key <base64>                             Provide key directly\n` +
    `  --key-file <path>                          Read key from file\n\n` +
    `The embedded keyId is: ${embeddedKeyId}`
  );
}
