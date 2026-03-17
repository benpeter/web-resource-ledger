/**
 * cms-verify.js -- CMS/PKCS#7 certificate chain verification for RFC 3161 tokens.
 *
 * Performs steps 1-4 of RFC 3161 §2.4.2 verification:
 *   1. Parse the CMS ContentInfo envelope
 *   2. Verify the CMS cryptographic signature (node:crypto createVerify)
 *   3. Validate the TSA certificate chain (node:crypto X509Certificate)
 *   4. Validate certificate properties (EKU, validity period)
 *
 * Step 5 (messageImprint) is handled separately by rfc3161.js/verifyTimestamp().
 *
 * Uses PKIjs for CMS structure parsing only. All cryptographic operations
 * use node:crypto -- PKIjs SignedData.verify() has known issues with
 * RFC 3161 TSTInfo content types (requires detached data, signature
 * verification unreliable).
 *
 * NOTE: CRL/OCSP revocation checking is intentionally omitted -- this module
 * is designed for offline use where network access is unavailable. Operators
 * requiring revocation checking should supplement with online tools.
 */ // tva

import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X509Certificate, createVerify } from 'node:crypto';

// ---------------------------------------------------------------------------
// PKIjs crypto engine -- needed for schema parsing only
// ---------------------------------------------------------------------------

const _engine = new pkijs.CryptoEngine({ name: 'NodeJS', crypto: globalThis.crypto });
pkijs.setEngine('NodeJS', _engine);

// ---------------------------------------------------------------------------
// OIDs
// ---------------------------------------------------------------------------

const OID_ID_KP_TIMESTAMPING = '1.3.6.1.5.5.7.3.8';

// ---------------------------------------------------------------------------
// Trusted root loading
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const CERTS_DIR = join(__dirname, '..', 'certs', 'trusted-roots');

/**
 * Loads PEM files from the bundled trusted-roots directory.
 * Optionally merges additional PEM paths provided by the caller.
 *
 * @param {string[]} [extraPaths=[]]  Absolute paths to additional PEM files
 * @returns {string[]}  Array of PEM strings
 */
export function loadTrustedRoots(extraPaths = []) {
  const bundled = readdirSync(CERTS_DIR)
    .filter(f => f.endsWith('.pem'))
    .map(f => readFileSync(join(CERTS_DIR, f), 'utf8'));
  return [...bundled, ...extraPaths.map(p => readFileSync(p, 'utf8'))];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a PEM string to a node:crypto X509Certificate.
 * @param {string} pem
 * @returns {X509Certificate}
 */
function pemToX509(pem) {
  return new X509Certificate(pem);
}

/**
 * Converts a PKIjs Certificate to a node:crypto X509Certificate.
 * @param {pkijs.Certificate} cert
 * @returns {X509Certificate}
 */
function pkijsToX509(cert) {
  const der = Buffer.from(cert.toSchema().toBER());
  return new X509Certificate(der);
}

/**
 * Extracts CN and issuer info from an X509Certificate.
 * @param {X509Certificate} x509
 * @returns {{ commonName: string, issuer: string, validFrom: string, validTo: string }}
 */
function extractSignerInfo(x509) {
  // Extract CN from subject
  const cnMatch = x509.subject.match(/CN=([^\n]+)/);
  const commonName = cnMatch ? cnMatch[1] : '';

  return {
    commonName,
    issuer: x509.issuer.replace(/\n/g, ', '),
    validFrom: new Date(x509.validFrom).toISOString(),
    validTo: new Date(x509.validTo).toISOString(),
  };
}

/**
 * Checks if an X509Certificate has the id-kp-timeStamping EKU.
 * @param {X509Certificate} x509
 * @returns {boolean}
 */
function hasTimestampingEku(x509) {
  // node:crypto X509Certificate exposes EKU OIDs via keyUsage (array of OID strings)
  const ku = x509.keyUsage;
  if (!Array.isArray(ku)) return false;
  return ku.includes(OID_ID_KP_TIMESTAMPING);
}

/**
 * Builds a certificate chain from a leaf cert to a trusted root.
 * Returns the chain (leaf -> intermediate(s) -> root) or null if no chain found.
 *
 * Handles cross-signed roots: a cert is considered a trust anchor if it
 * matches a trusted cert by subject (same key, same identity) even if
 * the embedded version is cross-signed by a different root.
 *
 * @param {X509Certificate} leaf
 * @param {X509Certificate[]} pool     All available certs (embedded + bundled)
 * @param {X509Certificate[]} trusted  Bundled trusted certs
 * @returns {X509Certificate[] | null}
 */
function buildChain(leaf, pool, trusted) {
  const chain = [leaf];
  let current = leaf;
  const maxDepth = 10;

  for (let i = 0; i < maxDepth; i++) {
    // Self-signed = root reached
    if (current.checkIssued(current)) return chain;

    // Check if current cert is a trusted cert (by subject key match).
    // Handles cross-signed roots where the embedded cert is signed by
    // a different CA but represents the same identity/key as our
    // bundled self-signed root.
    const isTrusted = trusted.some(tc => tc.publicKey.equals(current.publicKey));
    if (isTrusted) return chain;

    // Find the issuer in the pool
    const issuer = pool.find(c => {
      try { return current.checkIssued(c); }
      catch { return false; }
    });
    if (!issuer) return null;

    chain.push(issuer);
    current = issuer;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies the CMS/PKCS#7 signature and certificate chain of an RFC 3161
 * timestamp token.
 *
 * @param {string} tokenBase64       Base64-encoded DER timestamp token
 * @param {string[]} trustedRootPems Array of PEM-encoded trusted root/intermediate certificates
 * @param {string} [genTime]         ISO 8601 genTime from the timestamp (for cert validity check)
 * @returns {Promise<{
 *   valid: boolean,
 *   detail: string|null,
 *   signerInfo: { commonName: string, issuer: string, validFrom: string, validTo: string } | null
 * }>}
 */
export async function verifyCmsChain(tokenBase64, trustedRootPems, genTime) {
  if (!trustedRootPems || trustedRootPems.length === 0) {
    return { valid: false, detail: 'No trusted root certificates provided', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Step 1: Parse the CMS ContentInfo envelope with PKIjs
  // -------------------------------------------------------------------------
  let signedData;
  try {
    const der = Buffer.from(tokenBase64, 'base64');
    const asn1 = asn1js.fromBER(new Uint8Array(der).buffer);
    if (asn1.offset === -1) {
      return { valid: false, detail: 'Failed to parse DER token', signerInfo: null };
    }
    const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
    signedData = new pkijs.SignedData({ schema: contentInfo.content });
  } catch (err) {
    return { valid: false, detail: `CMS parse error: ${err.message}`, signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Collect all available certificates: embedded in CMS + bundled
  // -------------------------------------------------------------------------
  const bundledX509 = trustedRootPems.map(pemToX509);

  // Convert any CMS-embedded certs to X509Certificate
  const embeddedX509 = (signedData.certificates || []).map(c => {
    try { return pkijsToX509(c); }
    catch { return null; }
  }).filter(Boolean);

  const allCerts = [...embeddedX509, ...bundledX509];

  // -------------------------------------------------------------------------
  // Find the signer certificate
  // -------------------------------------------------------------------------
  const signerInfo = signedData.signerInfos?.[0];
  if (!signerInfo) {
    return { valid: false, detail: 'No SignerInfo in CMS token', signerInfo: null };
  }

  // Match by issuer+serial (IssuerAndSerialNumber)
  const sid = signerInfo.sid;
  const signerSerial = Buffer.from(sid.serialNumber.valueBlock.valueHexView).toString('hex');

  const signerX509 = allCerts.find(c => c.serialNumber.toLowerCase() === signerSerial);
  if (!signerX509) {
    return { valid: false, detail: 'Signer certificate not found in token or trusted store', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Step 2: Verify the CMS cryptographic signature using node:crypto
  //
  // In CMS, when signedAttrs are present, the signature is over the DER
  // encoding of the signedAttrs with the IMPLICIT [0] tag replaced by
  // the universal SET OF tag (0x31).
  // -------------------------------------------------------------------------
  try {
    const signedAttrsDer = Buffer.from(signerInfo.signedAttrs.toSchema().toBER());
    // Replace the IMPLICIT [0] tag (0xA0) with SET OF (0x31) for verification
    signedAttrsDer[0] = 0x31;

    const signature = Buffer.from(signerInfo.signature.valueBlock.valueHexView);

    // Determine hash algorithm from digestAlgorithm
    const digestAlgOid = signerInfo.digestAlgorithm.algorithmId;
    const hashMap = {
      '2.16.840.1.101.3.4.2.1': 'SHA256',
      '2.16.840.1.101.3.4.2.2': 'SHA384',
      '2.16.840.1.101.3.4.2.3': 'SHA512',
      '1.3.14.3.2.26': 'SHA1',
    };
    const hashAlg = hashMap[digestAlgOid] || 'SHA256';

    const verifier = createVerify(hashAlg);
    verifier.update(signedAttrsDer);
    const sigValid = verifier.verify(signerX509.publicKey, signature);

    if (!sigValid) {
      return { valid: false, detail: 'CMS signature verification failed', signerInfo: null };
    }
  } catch (err) {
    return { valid: false, detail: `CMS signature verification error: ${err.message}`, signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Step 3: Validate the certificate chain to a trusted root
  //
  // Uses node:crypto X509Certificate.checkIssued() to walk the chain.
  // -------------------------------------------------------------------------
  const chain = buildChain(signerX509, allCerts, bundledX509);
  if (!chain) {
    return { valid: false, detail: 'Certificate chain does not terminate at a trusted root', signerInfo: null };
  }

  // The last cert in the chain must be in our trusted set (by public key match,
  // handles cross-signed roots with different fingerprints but same key)
  const root = chain[chain.length - 1];
  const isTrusted = bundledX509.some(tc => tc.publicKey.equals(root.publicKey));
  if (!isTrusted) {
    return { valid: false, detail: 'Certificate chain does not terminate at a trusted root', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Step 4a: Extended Key Usage -- signer cert MUST have id-kp-timeStamping
  // -------------------------------------------------------------------------
  if (!hasTimestampingEku(signerX509)) {
    return { valid: false, detail: 'Signer certificate missing id-kp-timeStamping EKU', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Step 4b: Validity period -- signer cert must have been valid at genTime
  // -------------------------------------------------------------------------
  const checkDate = genTime ? new Date(genTime) : new Date();
  const notBefore = new Date(signerX509.validFrom);
  const notAfter = new Date(signerX509.validTo);
  if (checkDate < notBefore || checkDate > notAfter) {
    return { valid: false, detail: 'Signer certificate was not valid at timestamp time', signerInfo: null };
  }

  return {
    valid: true,
    detail: null,
    signerInfo: extractSignerInfo(signerX509),
  };
}
