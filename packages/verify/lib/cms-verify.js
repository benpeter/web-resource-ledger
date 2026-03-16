// Placeholder -- PKIjs-based CMS certificate chain verification (Task 2)
// Will verify the TSA's CMS SignedData certificate chain against trusted roots.

/**
 * Verifies the CMS certificate chain in a RFC 3161 timestamp token.
 *
 * @param {string} tokenBase64   Base64-encoded raw DER TimeStampToken
 * @param {string[]} trustedRoots  Array of PEM-encoded trusted root certificates
 * @returns {Promise<{ valid: boolean, detail: string, signerInfo: object|null }>}
 */
export async function verifyCmsChain(tokenBase64, trustedRoots) {
  return { valid: false, detail: 'CMS verification not yet implemented', signerInfo: null };
}
