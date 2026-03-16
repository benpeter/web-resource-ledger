/**
 * build-wacz.js -- In-memory WACZ construction helpers for tests.
 *
 * Provides buildTestWacz() (v0.1.0) and buildTestWaczV2() (v0.2.0) so that
 * every test file can create valid, signed WACZ archives without touching disk.
 *
 * Signing is done with ephemeral Ed25519 keys via Web Crypto (globalThis.crypto)
 * which is available natively in Node.js 20+.
 */

import { zipSync } from 'fflate';
import { sha256 } from '../../lib/sha256.js';
import { canonicalize } from '../../lib/canonical-json.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// DER helpers for building synthetic RFC 3161 timestamp tokens
// (mirrors the helpers inlined in test/verify.test.js of the Worker)
// ---------------------------------------------------------------------------

function _writeLength(n) {
  if (n < 0x80) return new Uint8Array([n]);
  if (n <= 0xff) return new Uint8Array([0x81, n]);
  if (n <= 0xffff) return new Uint8Array([0x82, n >> 8, n & 0xff]);
  throw new Error('_writeLength: value too large');
}

function _writeTLV(tag, content) {
  const lenBytes = _writeLength(content.length);
  const out = new Uint8Array(1 + lenBytes.length + content.length);
  out[0] = tag;
  out.set(lenBytes, 1);
  out.set(content, 1 + lenBytes.length);
  return out;
}

function _concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

const _OID_SHA256 = new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
const _OID_POLICY = new Uint8Array([0x2a, 0x03, 0x04]);

function _buildTSTInfo(hashBytes, genTimeStr = '20260316120000Z') {
  const version    = _writeTLV(0x02, new Uint8Array([0x01]));
  const policy     = _writeTLV(0x06, _OID_POLICY);
  const algId      = _writeTLV(0x30, _concat(_writeTLV(0x06, _OID_SHA256), _writeTLV(0x05, new Uint8Array(0))));
  const msgImprint = _writeTLV(0x30, _concat(algId, _writeTLV(0x04, hashBytes)));
  const serial     = _writeTLV(0x02, new Uint8Array([0x01]));
  const genTime    = _writeTLV(0x18, enc.encode(genTimeStr));
  return _writeTLV(0x30, _concat(version, policy, msgImprint, serial, genTime));
}

function _buildTimeStampToken(tstInfoDer) {
  const oidSD      = _writeTLV(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]));
  const oidTSTI    = _writeTLV(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x04]));
  const eContent   = _writeTLV(0xa0, _writeTLV(0x04, tstInfoDer));
  const encapInfo  = _writeTLV(0x30, _concat(oidTSTI, eContent));
  const sdVersion  = _writeTLV(0x02, new Uint8Array([0x03]));
  const digestAlgs = _writeTLV(0x31, new Uint8Array(0));
  const signedData = _writeTLV(0x30, _concat(sdVersion, digestAlgs, encapInfo));
  const ctx0       = _writeTLV(0xa0, signedData);
  return _writeTLV(0x30, _concat(oidSD, ctx0));
}

/**
 * Builds a base64 RFC 3161 token whose messageImprint matches bundleHash.
 * The CMS signature is absent -- this is sufficient for verifyTimestamp()
 * (messageImprint check only) but will fail verifyCmsChain().
 *
 * @param {string} bundleHash  e.g. "sha256:<64 hex>"
 * @param {string} [genTimeStr]  ASN.1 GeneralizedTime string, default "20260316120000Z"
 * @returns {string}  base64-encoded DER token
 */
export function buildValidToken(bundleHash, genTimeStr = '20260316120000Z') {
  const hex = bundleHash.slice(7);
  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) hashBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const tokenDer = _buildTimeStampToken(_buildTSTInfo(hashBytes, genTimeStr));
  return Buffer.from(tokenDer).toString('base64');
}

/**
 * Builds a base64 RFC 3161 token whose messageImprint deliberately mismatches bundleHash.
 *
 * @param {string} bundleHash  (ignored -- used only to have same signature as buildValidToken)
 * @returns {string}  base64-encoded DER token
 */
export function buildMismatchedToken(_bundleHash) {
  const wrongBytes = new Uint8Array(32).fill(0xff);
  const tokenDer = _buildTimeStampToken(_buildTSTInfo(wrongBytes));
  return Buffer.from(tokenDer).toString('base64');
}

// ---------------------------------------------------------------------------
// Key generation helpers
// ---------------------------------------------------------------------------

/**
 * Generates a fresh ephemeral Ed25519 key pair.
 *
 * @returns {Promise<{ privateKey: CryptoKey, publicKeyBytes: Uint8Array, publicKeyBase64: string }>}
 */
export async function generateKeyPair() {
  const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  const publicKeyBytes = new Uint8Array(raw);
  const publicKeyBase64 = Buffer.from(publicKeyBytes).toString('base64');
  return { privateKey: kp.privateKey, publicKeyBytes, publicKeyBase64 };
}

/**
 * Signs data bytes with a CryptoKey private key.
 *
 * @param {CryptoKey} privateKey
 * @param {Uint8Array} data
 * @returns {Promise<string>}  base64-encoded signature
 */
async function signBytes(privateKey, data) {
  const sigBuf = await crypto.subtle.sign('Ed25519', privateKey, data);
  return Buffer.from(sigBuf).toString('base64');
}

// ---------------------------------------------------------------------------
// WACZ builders
// ---------------------------------------------------------------------------

/**
 * Builds a minimal v0.1.0 WACZ in memory, signed with the provided key pair.
 *
 * Format: 3 checks (artifactHashes, bundleHash, signature). No timestamp.
 *
 * @param {CryptoKey} privateKey
 * @param {Uint8Array} publicKeyBytes
 * @returns {Promise<{
 *   waczBytes: Uint8Array,
 *   publicKeyBytes: Uint8Array,
 *   publicKeyBase64: string,
 *   bundleHash: string,
 *   datapackage: object,
 *   dpBytes: Uint8Array,
 *   digestDoc: object,
 *   digestBytes: Uint8Array,
 *   warcBytes: Uint8Array,
 *   cdxjBytes: Uint8Array,
 *   pagesBytes: Uint8Array,
 * }>}
 */
export async function buildTestWacz(privateKey, publicKeyBytes) {
  const warcBytes  = enc.encode('WARC/1.1\r\ntest warc content');
  const cdxjBytes  = enc.encode('test cdxj content');
  const pagesBytes = enc.encode('{"format":"json-pages-1.0"}\n');

  const warcHash  = sha256(warcBytes);
  const cdxjHash  = sha256(cdxjBytes);
  const pagesHash = sha256(pagesBytes);

  const datapackage = {
    profile: 'data-package',
    wacz_version: '1.1.1',
    resources: [
      { name: 'data.warc',    path: 'archive/data.warc',   hash: warcHash,  bytes: warcBytes.byteLength },
      { name: 'index.cdxj',  path: 'indexes/index.cdxj',  hash: cdxjHash,  bytes: cdxjBytes.byteLength },
      { name: 'pages.jsonl', path: 'pages/pages.jsonl',    hash: pagesHash, bytes: pagesBytes.byteLength },
    ],
  };

  const dpBytes    = enc.encode(JSON.stringify(datapackage, null, 2));
  const bundleHash = sha256(enc.encode(canonicalize(datapackage)));
  const signature  = await signBytes(privateKey, enc.encode(bundleHash));
  const publicKeyBase64 = Buffer.from(publicKeyBytes).toString('base64');
  const dpHashOfBytes   = sha256(dpBytes);

  const digestDoc = {
    path: 'datapackage.json',
    hash: dpHashOfBytes,
    signedData: {
      hash:      bundleHash,
      signature,
      publicKey: publicKeyBase64,
      created:   new Date().toISOString(),
      software:  'WRL/test',
      version:   '0.1.0',
    },
  };

  const digestBytes = enc.encode(JSON.stringify(digestDoc, null, 2));

  const waczBytes = zipSync({
    'datapackage.json':        [dpBytes,     { level: 0 }],
    'datapackage-digest.json': [digestBytes, { level: 0 }],
    'archive/data.warc':       [warcBytes,   { level: 0 }],
    'indexes/index.cdxj':      [cdxjBytes,   { level: 0 }],
    'pages/pages.jsonl':       [pagesBytes,  { level: 0 }],
  });

  return {
    waczBytes, publicKeyBytes, publicKeyBase64, bundleHash,
    datapackage, dpBytes, digestDoc, digestBytes,
    warcBytes, cdxjBytes, pagesBytes,
  };
}

/**
 * Builds a minimal v0.2.0 WACZ in memory, signed with the provided key pair.
 *
 * Format: 4 checks (artifactHashes, bundleHash, signature, timestamp).
 * A synthetic (messageImprint-only) RFC 3161 token can be attached via options.
 *
 * @param {CryptoKey} privateKey
 * @param {Uint8Array} publicKeyBytes
 * @param {{
 *   token?: string,   base64 DER token (default: null = skip timestamp entry)
 *   tsa?: string,     TSA URL string (default: 'https://tsa.example.com')
 *   keyId?: string,   8-char hex key ID (default: 'aaaabbbb')
 * }} [options={}]
 * @returns {Promise<{
 *   waczBytes: Uint8Array,
 *   publicKeyBytes: Uint8Array,
 *   publicKeyBase64: string,
 *   bundleHash: string,
 *   keyId: string,
 *   datapackage: object,
 *   dpBytes: Uint8Array,
 *   digestDoc: object,
 *   digestBytes: Uint8Array,
 *   warcBytes: Uint8Array,
 *   cdxjBytes: Uint8Array,
 *   pagesBytes: Uint8Array,
 * }>}
 */
export async function buildTestWaczV2(privateKey, publicKeyBytes, options = {}) {
  const {
    token = null,
    tsa   = 'https://tsa.example.com',
    keyId = 'aaaabbbb',
  } = options;

  const warcBytes  = enc.encode('WARC/1.1\r\ntest warc content v2');
  const cdxjBytes  = enc.encode('test cdxj content v2');
  const pagesBytes = enc.encode('{"format":"json-pages-1.0"}\n');

  const warcHash  = sha256(warcBytes);
  const cdxjHash  = sha256(cdxjBytes);
  const pagesHash = sha256(pagesBytes);

  const datapackage = {
    profile: 'data-package',
    wacz_version: '1.1.1',
    resources: [
      { name: 'data.warc',    path: 'archive/data.warc',   hash: warcHash,  bytes: warcBytes.byteLength },
      { name: 'index.cdxj',  path: 'indexes/index.cdxj',  hash: cdxjHash,  bytes: cdxjBytes.byteLength },
      { name: 'pages.jsonl', path: 'pages/pages.jsonl',    hash: pagesHash, bytes: pagesBytes.byteLength },
    ],
  };

  const dpBytes    = enc.encode(JSON.stringify(datapackage, null, 2));
  const bundleHash = sha256(enc.encode(canonicalize(datapackage)));
  const signature  = await signBytes(privateKey, enc.encode(bundleHash));
  const publicKeyBase64 = Buffer.from(publicKeyBytes).toString('base64');
  const dpHashOfBytes   = sha256(dpBytes);

  const signatures = [
    { type: 'self', signature, publicKey: publicKeyBase64, keyId },
  ];
  if (token !== null) {
    signatures.push({ type: 'rfc3161', token, tsa });
  }

  const digestDoc = {
    path: 'datapackage.json',
    hash: dpHashOfBytes,
    signedData: {
      hash:      bundleHash,
      created:   new Date().toISOString(),
      software:  'WRL/test',
      version:   '0.2.0',
      signatures,
    },
  };

  const digestBytes = enc.encode(JSON.stringify(digestDoc, null, 2));

  const waczBytes = zipSync({
    'datapackage.json':        [dpBytes,     { level: 0 }],
    'datapackage-digest.json': [digestBytes, { level: 0 }],
    'archive/data.warc':       [warcBytes,   { level: 0 }],
    'indexes/index.cdxj':      [cdxjBytes,   { level: 0 }],
    'pages/pages.jsonl':       [pagesBytes,  { level: 0 }],
  });

  return {
    waczBytes, publicKeyBytes, publicKeyBase64, bundleHash, keyId,
    datapackage, dpBytes, digestDoc, digestBytes,
    warcBytes, cdxjBytes, pagesBytes,
  };
}
