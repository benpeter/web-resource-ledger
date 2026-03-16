/*
 * verify.js -- WACZ verification module (Node.js CLI edition)
 *
 * Vendored from src/verify.js with the following adaptations:
 *   - sha256 import redirected to ./sha256.js (Node.js native, synchronous)
 *   - sha256 calls made synchronous (no await)
 *   - verifyWacz signature extended with options: { trustedRoots, verifyCmsChain }
 *   - 5th check (timestampChain) added for CMS certificate chain validation
 *   - Zip bomb pre-check: rejects total decompressed size > 100 MB
 *
 * Origin: https://github.com/benpeter/web-resource-ledger/blob/main/src/verify.js
 *
 * SECURITY:
 *   - publicKeyBytes must come from a trusted source -- never from the WACZ itself.
 *   - Embedded publicKey is returned for informational purposes only.
 *   - Failed check details never include expected/actual hash values.
 *   - All checks always run -- no short-circuiting.
 *   - A present-but-invalid timestamp fails verification. An absent timestamp
 *     (TSA unreachable at capture time) is tolerated as status: 'skip'.
 */ // tva

import { unzipSync } from 'fflate';
import { canonicalize } from './canonical-json.js';
import { sha256 } from './sha256.js';
import { verifySignature } from './signing.js';
import { verifyTimestamp } from './rfc3161.js';
import { verifyCmsChain } from './cms-verify.js';

const enc = new TextEncoder();

const MAX_DECOMPRESSED = 100 * 1024 * 1024; // 100 MB

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies a WACZ file against a trusted Ed25519 public key.
 *
 * @param {Uint8Array} waczBytes       Raw WACZ ZIP file bytes
 * @param {Uint8Array} publicKeyBytes  Trusted 32-byte Ed25519 public key
 * @param {{ trustedRoots?: string[], verifyCmsChain?: boolean }} [options]
 *   trustedRoots   Array of PEM-encoded trusted root certificates for CMS chain check.
 *   verifyCmsChain Boolean flag; if false, timestampChain check is skipped even when
 *                  trustedRoots are provided. Defaults to true when trustedRoots present.
 * @returns {Promise<{
 *   verified: boolean,
 *   checks: Array<{ name: string, status: 'pass'|'fail'|'skip', detail?: string }>,
 *   capture?: {
 *     bundleHash: string,
 *     signature: string,
 *     publicKey: string,
 *     signedAt: string,
 *     timestamp?: { genTime: string, tsa: string }
 *   }
 * }>}
 */
export async function verifyWacz(waczBytes, publicKeyBytes, options = {}) {
  const { trustedRoots, verifyCmsChain: doCmsChain = true } = options;

  // Step 1: Parse ZIP -- fflate throws on malformed input, never returns null
  let files;
  try {
    files = unzipSync(waczBytes);
  } catch {
    return {
      verified: false,
      checks: [
        { name: 'artifactHashes',  status: 'fail', detail: 'WACZ bundle is not a valid ZIP archive' },
        { name: 'bundleHash',      status: 'fail', detail: 'WACZ bundle is not a valid ZIP archive' },
        { name: 'signature',       status: 'fail', detail: 'WACZ bundle is not a valid ZIP archive' },
      ],
    };
  }

  // Zip bomb pre-check: reject if total decompressed size exceeds limit
  const totalSize = Object.values(files).reduce((sum, f) => sum + f.byteLength, 0);
  if (totalSize > MAX_DECOMPRESSED) {
    const mb = Math.round(totalSize / (1024 * 1024));
    const detail = `Decompressed WACZ exceeds ${MAX_DECOMPRESSED / (1024 * 1024)} MB limit (got ~${mb} MB)`;
    return {
      verified: false,
      checks: [
        { name: 'artifactHashes',  status: 'fail', detail },
        { name: 'bundleHash',      status: 'fail', detail },
        { name: 'signature',       status: 'fail', detail },
      ],
    };
  }

  // Step 2: Extract required manifest files
  const dpRaw     = files['datapackage.json'];
  const digestRaw = files['datapackage-digest.json'];

  if (!dpRaw) {
    return {
      verified: false,
      checks: [
        { name: 'artifactHashes', status: 'fail', detail: 'datapackage.json missing from WACZ' },
        { name: 'bundleHash',     status: 'fail', detail: 'datapackage.json missing from WACZ' },
        { name: 'signature',      status: 'fail', detail: 'datapackage.json missing from WACZ' },
      ],
    };
  }

  if (!digestRaw) {
    return {
      verified: false,
      checks: [
        { name: 'artifactHashes', status: 'skip' },
        { name: 'bundleHash',     status: 'fail', detail: 'datapackage-digest.json missing from WACZ' },
        { name: 'signature',      status: 'fail', detail: 'datapackage-digest.json missing from WACZ' },
      ],
    };
  }

  let datapackage, digest;
  try {
    datapackage = JSON.parse(new TextDecoder().decode(dpRaw));
    digest      = JSON.parse(new TextDecoder().decode(digestRaw));
  } catch {
    return {
      verified: false,
      checks: [
        { name: 'artifactHashes', status: 'fail', detail: 'Manifest JSON is malformed' },
        { name: 'bundleHash',     status: 'fail', detail: 'Manifest JSON is malformed' },
        { name: 'signature',      status: 'fail', detail: 'Manifest JSON is malformed' },
      ],
    };
  }

  const signedData = digest?.signedData;
  const version    = signedData?.version ?? '0.1.0';

  // Run all checks independently -- no early exit
  const checks = [];

  // ---------------------------------------------------------------------------
  // Check 1: artifactHashes
  // ---------------------------------------------------------------------------
  let artifactPass = true;
  const resources = datapackage?.resources;
  if (!Array.isArray(resources) || resources.length === 0) {
    checks.push({ name: 'artifactHashes', status: 'fail', detail: 'No resources listed in datapackage.json' });
    artifactPass = false;
  } else {
    for (const resource of resources) {
      const fileBytes = files[resource.path];
      if (!fileBytes) {
        checks.push({ name: 'artifactHashes', status: 'fail', detail: 'One or more artifact hashes do not match' });
        artifactPass = false;
        break;
      }
      const computed = sha256(fileBytes);
      if (computed !== resource.hash) {
        checks.push({ name: 'artifactHashes', status: 'fail', detail: 'One or more artifact hashes do not match' });
        artifactPass = false;
        break;
      }
    }
    if (artifactPass) {
      checks.push({ name: 'artifactHashes', status: 'pass' });
    }
  }

  // ---------------------------------------------------------------------------
  // Check 2: bundleHash
  // ---------------------------------------------------------------------------
  let bundleHashPass = false;
  if (!signedData?.hash) {
    checks.push({ name: 'bundleHash', status: 'fail', detail: 'signedData.hash missing from datapackage-digest.json' });
  } else {
    const recomputed = sha256(enc.encode(canonicalize(datapackage)));
    if (recomputed === signedData.hash) {
      checks.push({ name: 'bundleHash', status: 'pass' });
      bundleHashPass = true;
    } else {
      checks.push({ name: 'bundleHash', status: 'fail', detail: 'Recomputed hash does not match stored bundleHash' });
    }
  }

  // ---------------------------------------------------------------------------
  // Check 3: signature
  // ---------------------------------------------------------------------------

  // Normalize: for v0.2.0 find the self-signature entry; for v0.1.0 signature
  // and publicKey sit directly on signedData.
  const selfSig = version === '0.2.0'
    ? (signedData?.signatures ?? []).find(s => s.type === 'self')
    : signedData;

  const sigValue = selfSig?.signature ?? null;

  if (!sigValue) {
    checks.push({ name: 'signature', status: 'fail', detail: 'signedData.signature missing from datapackage-digest.json' });
  } else {
    // Signed payload: UTF-8 bytes of the bundleHash string ("sha256:{hex}")
    const hashString = signedData?.hash ?? '';
    const valid = await verifySignature(publicKeyBytes, enc.encode(hashString), sigValue);
    if (valid) {
      checks.push({ name: 'signature', status: 'pass' });
    } else {
      checks.push({ name: 'signature', status: 'fail', detail: 'Ed25519 signature verification failed' });
    }
  }

  // ---------------------------------------------------------------------------
  // Check 4: timestamp (v0.2.0 only)
  // ---------------------------------------------------------------------------
  let timestampData = null;
  let tsToken = null;
  if (version === '0.2.0') {
    const sigs    = signedData?.signatures ?? [];
    const tsEntry = sigs.find(s => s.type === 'rfc3161');

    if (!tsEntry) {
      checks.push({ name: 'timestamp', status: 'skip', detail: 'No independent timestamp was obtained for this capture' });
    } else {
      tsToken = tsEntry.token ?? null;
      try {
        const result = verifyTimestamp(tsEntry.token, signedData.hash);
        if (result.valid) {
          checks.push({ name: 'timestamp', status: 'pass' });
          timestampData = { genTime: result.genTime, tsa: tsEntry.tsa };
        } else {
          checks.push({ name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' });
        }
      } catch {
        checks.push({ name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' });
      }
    }
  }
  // For v0.1.0: no timestamp check at all (3 checks, not 4)

  // ---------------------------------------------------------------------------
  // Check 5: timestampChain (CLI only -- CMS certificate chain validation)
  // ---------------------------------------------------------------------------
  if (version === '0.2.0' && tsToken && trustedRoots && trustedRoots.length > 0 && doCmsChain) {
    try {
      const cmsResult = await verifyCmsChain(tsToken, trustedRoots, timestampData?.genTime);
      if (cmsResult.valid) {
        checks.push({ name: 'timestampChain', status: 'pass' });
      } else {
        checks.push({
          name: 'timestampChain',
          status: 'fail',
          detail: cmsResult.detail ?? 'CMS certificate chain verification failed',
        });
      }
    } catch (err) {
      checks.push({
        name: 'timestampChain',
        status: 'fail',
        detail: 'CMS certificate chain verification failed',
      });
    }
  } else if (version === '0.2.0' && tsToken && (!trustedRoots || trustedRoots.length === 0)) {
    checks.push({ name: 'timestampChain', status: 'skip', detail: 'No trusted roots provided; certificate chain not checked' });
  }

  // ---------------------------------------------------------------------------
  // Assemble result
  // ---------------------------------------------------------------------------

  // skip is tolerated: absent timestamps (TSA unreachable) and skipped chain checks
  // do not fail verification. A present-but-invalid result DOES fail.
  const verified = checks.every(c => c.status === 'pass' || c.status === 'skip');

  const result = { verified, checks };

  // Attach capture metadata when the digest doc is coherent enough to extract
  if (signedData) {
    result.capture = {
      bundleHash: signedData.hash    ?? null,
      signature:  selfSig?.signature ?? null,
      publicKey:  selfSig?.publicKey ?? null,   // informational only -- NOT used for verification
      signedAt:   signedData.created ?? null,
    };
    if (timestampData) {
      result.capture.timestamp = timestampData;
    }
  }

  return result;
}
