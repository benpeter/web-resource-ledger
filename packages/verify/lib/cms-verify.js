/**
 * cms-verify.js -- CMS/PKCS#7 certificate chain verification for RFC 3161 tokens.
 *
 * Performs steps 1-4 of RFC 3161 §2.4.2 verification:
 *   1. Parse the CMS ContentInfo envelope
 *   2. Verify the CMS cryptographic signature
 *   3. Validate the TSA certificate chain to a trusted root
 *   4. Validate certificate properties (EKU, validity period)
 *
 * Step 5 (messageImprint) is handled separately by rfc3161.js/verifyTimestamp().
 *
 * NOTE: CRL/OCSP revocation checking is intentionally omitted -- this module
 * is designed for offline use where network access is unavailable. Operators
 * requiring revocation checking should supplement with online tools.
 */ // tva

import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// PKIjs crypto engine -- globalThis.crypto is available in Node.js 20+
// ---------------------------------------------------------------------------

const crypto = globalThis.crypto;
const _engine = new pkijs.CryptoEngine({ name: 'NodeJS', crypto });
pkijs.setEngine('NodeJS', _engine);

// ---------------------------------------------------------------------------
// OIDs
// ---------------------------------------------------------------------------

/** Extended key usage OID for time stamping (RFC 3161) */
const OID_ID_KP_TIMESTAMPING = '1.3.6.1.5.5.7.3.8';

/** Extended key usage extension OID */
const OID_EXTENDED_KEY_USAGE = '2.5.29.37';

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
  const pems = [
    readFileSync(join(CERTS_DIR, 'DigiCertTrustedRootG4.pem'), 'utf8'),
    ...extraPaths.map(p => readFileSync(p, 'utf8')),
  ];
  return pems;
}

// ---------------------------------------------------------------------------
// PEM helpers
// ---------------------------------------------------------------------------

/**
 * Converts a PEM-encoded certificate to a PKIjs Certificate object.
 *
 * @param {string} pem
 * @returns {pkijs.Certificate}
 */
function pemToCertificate(pem) {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const der = Buffer.from(b64, 'base64');
  const asn1 = asn1js.fromBER(new Uint8Array(der).buffer);
  if (asn1.offset === -1) throw new Error('Failed to parse PEM certificate');
  return new pkijs.Certificate({ schema: asn1.result });
}

/**
 * Extracts the Common Name and Issuer DN string from a PKIjs Certificate.
 *
 * @param {pkijs.Certificate} cert
 * @returns {{ commonName: string, issuer: string, validFrom: string, validTo: string }}
 */
function extractSignerInfo(cert) {
  let commonName = '';
  for (const typeAndValue of cert.subject.typesAndValues) {
    // OID 2.5.4.3 = commonName
    if (typeAndValue.type === '2.5.4.3') {
      commonName = typeAndValue.value.valueBlock.value ?? '';
      break;
    }
  }

  const issuerParts = cert.issuer.typesAndValues.map(tv => {
    const value = tv.value.valueBlock.value ?? '';
    return `${tv.type}=${value}`;
  });

  return {
    commonName,
    issuer: issuerParts.join(', '),
    validFrom: cert.notBefore.value.toISOString(),
    validTo:   cert.notAfter.value.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// EKU validation
// ---------------------------------------------------------------------------

/**
 * Returns true if the certificate contains the id-kp-timeStamping EKU.
 *
 * PKIjs ExtKeyUsage.keyPurposes is an array of OID dot-notation strings
 * (e.g. "1.3.6.1.5.5.7.3.8") after fromSchema() parsing.
 *
 * @param {pkijs.Certificate} cert
 * @returns {boolean}
 */
function hasTimestampingEku(cert) {
  if (!cert.extensions) return false;
  for (const ext of cert.extensions) {
    if (ext.extnID !== OID_EXTENDED_KEY_USAGE) continue;
    const eku = ext.parsedValue;
    if (!eku || !Array.isArray(eku.keyPurposes)) return false;
    return eku.keyPurposes.includes(OID_ID_KP_TIMESTAMPING);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies the CMS/PKCS#7 signature and certificate chain of an RFC 3161
 * timestamp token.
 *
 * @param {string} tokenBase64       Base64-encoded DER timestamp token
 * @param {string[]} trustedRootPems Array of PEM-encoded trusted root certificates
 * @param {string} [genTime]         ISO 8601 genTime from the timestamp (for cert validity check)
 * @returns {Promise<{
 *   valid: boolean,
 *   detail: string|null,
 *   signerInfo: { commonName: string, issuer: string, validFrom: string, validTo: string } | null
 * }>}
 */
export async function verifyCmsChain(tokenBase64, trustedRootPems, genTime) {
  // -------------------------------------------------------------------------
  // Step 1: Parse the CMS ContentInfo envelope
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
  // Step 2 & 3: Verify CMS signature + certificate chain via PKIjs
  //
  // We pass checkChain: true and trustedCerts from the caller.
  // passedWhenNotRevValues: true is required for offline use (no CRL/OCSP).
  // -------------------------------------------------------------------------
  const trustedCerts = trustedRootPems.map(pemToCertificate);
  const checkDate = genTime ? new Date(genTime) : new Date();

  let verifyResult;
  try {
    verifyResult = await signedData.verify(
      {
        signer: 0,
        checkChain: true,
        trustedCerts,
        checkDate,
        passedWhenNotRevValues: true,
        extendedMode: true,
      },
      _engine,
    );
  } catch (err) {
    // PKIjs throws SignedDataVerifyError on failure; treat as verification failure
    const msg = err?.message ?? String(err);

    // Distinguish chain failure from signature failure by error message content
    if (
      msg.includes('certificate') ||
      msg.includes('chain') ||
      msg.includes('trust') ||
      msg.includes('issuer') ||
      (typeof err?.code === 'number' && err.code === 5)
    ) {
      return { valid: false, detail: 'Certificate chain does not terminate at a trusted root', signerInfo: null };
    }
    return { valid: false, detail: 'CMS signature verification failed', signerInfo: null };
  }

  // extendedMode returns an object; check signatureVerified
  if (!verifyResult || !verifyResult.signatureVerified) {
    return { valid: false, detail: 'CMS signature verification failed', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Belt-and-suspenders: if trustedCerts is empty, PKIjs may still return true
  // (see PKIjs issue #332). Guard explicitly.
  // -------------------------------------------------------------------------
  if (trustedRootPems.length === 0) {
    return { valid: false, detail: 'Certificate chain does not terminate at a trusted root', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Extract signer certificate
  // -------------------------------------------------------------------------
  const signerCert = verifyResult.signerCertificate;
  if (!signerCert) {
    return { valid: false, detail: 'CMS signature verification failed', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Step 4a: Extended Key Usage -- signer cert MUST have id-kp-timeStamping
  // -------------------------------------------------------------------------
  if (!hasTimestampingEku(signerCert)) {
    return { valid: false, detail: 'Signer certificate missing id-kp-timeStamping EKU', signerInfo: null };
  }

  // -------------------------------------------------------------------------
  // Step 4b: Validity period -- signer cert must have been valid at genTime
  // -------------------------------------------------------------------------
  const notBefore = signerCert.notBefore.value;
  const notAfter  = signerCert.notAfter.value;
  if (checkDate < notBefore || checkDate > notAfter) {
    return { valid: false, detail: 'Signer certificate was not valid at timestamp time', signerInfo: null };
  }

  return {
    valid: true,
    detail: null,
    signerInfo: extractSignerInfo(signerCert),
  };
}
