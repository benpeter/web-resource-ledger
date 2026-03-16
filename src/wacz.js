/*
 * wacz.js -- WACZ assembly orchestrator
 *
 * Assembles a signed WACZ file from capture artifacts:
 *   1. Builds WARC records (warc.js)
 *   2. Builds CDXJ index (cdxj.js)
 *   3. Assembles datapackage.json with SHA-256 hashes
 *   4. Signs bundle hash with Ed25519 (signing.js)
 *   5. Requests RFC 3161 timestamp from TSA (rfc3161.js, optional)
 *   6. Assembles datapackage-digest.json with signatures array (v0.2.0)
 *   7. Zips all files with fflate (STORE mode, level 0)
 *
 * datapackage-digest.json v0.2.0: signedData.signatures array with
 * type:"self" (Ed25519) and optional type:"rfc3161" (TSA timestamp).
 *
 * Graceful degradation: returns null if signing key is unavailable.
 * TSA timestamp is optional -- capture succeeds without it.
 *
 * Tests: test/wacz.test.js
 */ // tva

import { zipSync } from 'fflate';
import { getSigningKeys, signBytes } from './signing.js';
import { buildWarc, sha256 } from './warc.js';
import { buildCdxj } from './cdxj.js';
import { canonicalize } from './canonical-json.js';
import { requestTimestamp } from './rfc3161.js';
import { log } from './log.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a signed WACZ file from capture artifacts.
 *
 * @param {string} url Captured URL
 * @param {string} captureDate ISO 8601 capture timestamp
 * @param {{ screenshotBefore: Uint8Array, screenshotAfter: Uint8Array|null, html: string, headers: object|null, captureSettings: object|null }} artifacts
 * @param {{ SIGNING_KEY?: string }} env
 * @returns {Promise<{ waczBytes: Uint8Array, waczHash: string, bundleHash: string,
 *                     publicKeyBase64: string, keyId: string,
 *                     timestampStatus: 'present'|'absent'|'error' } | null>}
 */
export async function buildWacz(url, captureDate, artifacts, env) {
  // Step 1: Get signing keys -- graceful degradation if not configured
  const keys = await getSigningKeys(env);
  if (!keys) return null;

  const { privateKey, publicKeyBytes, keyId } = keys;

  // Step 2: Build WARC
  const { warcBytes, recordMeta } = await buildWarc(url, captureDate, artifacts);

  // Step 3: Build CDXJ index
  const cdxjString = buildCdxj(recordMeta, 'archive/data.warc');
  const cdxjBytes = enc.encode(cdxjString);

  // Step 4: Build pages.jsonl
  const pagesJsonl = [
    JSON.stringify({ format: 'json-pages-1.0', id: 'pages', title: 'All Pages' }),
    JSON.stringify({ url, ts: captureDate, title: 'WRL capture' }),
  ].join('\n') + '\n';
  const pagesBytes = enc.encode(pagesJsonl);

  // Step 5: Compute SHA-256 hash of each file
  const [warcHash, cdxjHash, pagesHash] = await Promise.all([
    sha256(warcBytes),
    sha256(cdxjBytes),
    sha256(pagesBytes),
  ]);

  // Step 6: Assemble datapackage.json
  const datapackage = {
    profile: 'data-package',
    wacz_version: '1.1.1',
    title: `WRL capture of ${url}`,
    software: 'WRL/0.1',
    created: captureDate,
    mainPageUrl: url,
    mainPageDate: captureDate,
    ...(artifacts.captureSettings ? { captureSettings: artifacts.captureSettings } : {}),
    resources: [
      { name: 'data.warc', path: 'archive/data.warc', hash: warcHash, bytes: warcBytes.byteLength },
      { name: 'index.cdxj', path: 'indexes/index.cdxj', hash: cdxjHash, bytes: cdxjBytes.byteLength },
      { name: 'pages.jsonl', path: 'pages/pages.jsonl', hash: pagesHash, bytes: pagesBytes.byteLength },
    ],
  };

  const dpBytes = enc.encode(JSON.stringify(datapackage, null, 2));

  // Step 7: Compute bundleHash = sha256 of canonical JSON of datapackage
  // NOTE: datapackage.json in the ZIP is pretty-printed (for readability), but
  // bundleHash is computed over the canonical (sorted, no-whitespace) form.
  // Verifiers must re-canonicalize to validate the signature.
  const bundleHash = await sha256(enc.encode(canonicalize(datapackage)));

  // Step 8: Sign the UTF-8 bytes of the bundleHash string "sha256:{hex}"
  // Signed payload: UTF-8 bytes of the bundleHash string "sha256:{hex}"
  const signature = await signBytes(privateKey, enc.encode(bundleHash));

  // Base64-encode the raw 32-byte public key for embedding
  const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));

  // Step 8.5: Request RFC 3161 timestamp (optional, graceful degradation)
  let tsaResult = null;
  let tsaError = false;
  if (env.TSA_URL) {
    try {
      tsaResult = await requestTimestamp(env.TSA_URL, bundleHash);
    } catch (err) {
      tsaError = true;
      await log(env, 4, 'capture', {
        event: 'capture.tsa_fail',
        tsaUrl: env.TSA_URL,
        errorName: err?.name,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      });
    }
  }

  // Step 9: Assemble datapackage-digest.json
  // NOTE: publicKey is embedded for convenience only. Verifiers MUST pin against
  // an operator-published key, not trust the embedded key blindly.
  const dpHashOfBytes = await sha256(dpBytes);

  const signatures = [
    { type: 'self', signature, publicKey: publicKeyBase64, keyId },
  ];
  if (tsaResult) {
    signatures.push({ type: 'rfc3161', token: tsaResult.token, tsa: tsaResult.tsa });
  }

  const digestDoc = {
    path: 'datapackage.json',
    hash: dpHashOfBytes,
    signedData: {
      hash: bundleHash,
      created: captureDate,
      software: 'WRL/0.1',
      version: '0.2.0',
      signatures,
    },
  };

  const digestBytes = enc.encode(JSON.stringify(digestDoc, null, 2));

  // Step 10: Create ZIP using fflate with STORE mode (level 0) for all files
  const waczBytes = zipSync({
    'datapackage.json': [dpBytes, { level: 0 }],
    'datapackage-digest.json': [digestBytes, { level: 0 }],
    'archive/data.warc': [warcBytes, { level: 0 }],
    'indexes/index.cdxj': [cdxjBytes, { level: 0 }],
    'pages/pages.jsonl': [pagesBytes, { level: 0 }],
  });

  // Step 11: Compute SHA-256 of the final WACZ bytes for content-addressed R2 key
  const waczHash = await sha256(waczBytes);

  return { waczBytes, waczHash, bundleHash, publicKeyBase64, keyId, timestampStatus: tsaResult ? 'present' : (tsaError ? 'error' : 'absent') };
}
