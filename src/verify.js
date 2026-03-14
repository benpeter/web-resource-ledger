/*
 * verify.js -- WACZ verification module
 *
 * Pure function: takes WACZ bytes and a server public key, returns a
 * structured verification result with three checks:
 *   1. artifactHashes -- SHA-256 of each resource matches datapackage.json
 *   2. bundleHash     -- sha256(canonicalize(datapackage)) matches signedData.hash
 *   3. signature      -- Ed25519 signature over bundleHash bytes verifies
 *
 * SECURITY:
 *   - publicKeyBytes comes from the server (getSigningKeys(env)) -- never from
 *     the WACZ itself. Embedded publicKey is returned for informational purposes
 *     only, and is NEVER used for the verification decision.
 *   - Failed check details never include expected/actual hash values.
 *   - All three checks always run -- no short-circuiting.
 *
 * Tests: test/verify.test.js
 */ // tva

import { unzipSync } from 'fflate';
import { canonicalize } from './canonical-json.js';
import { sha256 } from './warc.js';
import { verifySignature } from './signing.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verifies a WACZ file against the server's Ed25519 public key.
 *
 * @param {Uint8Array} waczBytes   Raw WACZ ZIP file bytes
 * @param {Uint8Array} publicKeyBytes  Server's 32-byte Ed25519 public key
 * @returns {Promise<{
 *   verified: boolean,
 *   checks: Array<{ name: string, status: 'pass'|'fail'|'skip', detail?: string }>,
 *   capture?: { bundleHash: string, signature: string, publicKey: string, signedAt: string }
 * }>}
 */
export async function verifyWacz(waczBytes, publicKeyBytes) {
  // Step 1: Parse ZIP -- fflate throws on malformed input, never returns null
  let files;
  try {
    files = unzipSync(waczBytes);
  } catch {
    return {
      verified: false,
      checks: [
        { name: 'artifactHashes', status: 'fail', detail: 'WACZ bundle is not a valid ZIP archive' },
        { name: 'bundleHash',     status: 'fail', detail: 'WACZ bundle is not a valid ZIP archive' },
        { name: 'signature',      status: 'fail', detail: 'WACZ bundle is not a valid ZIP archive' },
      ],
    };
  }

  // Step 2: Extract required manifest files
  const dpRaw      = files['datapackage.json'];
  const digestRaw  = files['datapackage-digest.json'];

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

  // Run all three checks independently -- no early exit
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
      const computed = await sha256(fileBytes);
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
    const recomputed = await sha256(enc.encode(canonicalize(datapackage)));
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
  if (!signedData?.signature) {
    checks.push({ name: 'signature', status: 'fail', detail: 'signedData.signature missing from datapackage-digest.json' });
  } else {
    // Signed payload: UTF-8 bytes of the bundleHash string ("sha256:{hex}")
    const hashString = signedData.hash ?? '';
    const valid = await verifySignature(publicKeyBytes, enc.encode(hashString), signedData.signature);
    if (valid) {
      checks.push({ name: 'signature', status: 'pass' });
    } else {
      checks.push({ name: 'signature', status: 'fail', detail: 'Ed25519 signature verification failed' });
    }
  }

  // ---------------------------------------------------------------------------
  // Assemble result
  // ---------------------------------------------------------------------------
  const verified = checks.every(c => c.status === 'pass');

  const result = { verified, checks };

  // Attach capture metadata when the digest doc is coherent enough to extract
  if (signedData) {
    result.capture = {
      bundleHash:  signedData.hash      ?? null,
      signature:   signedData.signature ?? null,
      publicKey:   signedData.publicKey ?? null,   // informational only -- NOT used for verification
      signedAt:    signedData.created   ?? null,
    };
  }

  return result;
}
