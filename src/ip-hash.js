// tva

/**
 * ip-hash.js -- HMAC-SHA256 hashed IP for abuse correlation
 *
 * Produces a pseudonymized client identifier (cip) from CF-Connecting-IP.
 * Two-step HMAC derivation: daily key from seed, then hash IP with daily key.
 * Same IP + same day = same cip. Different days = different cip.
 *
 * Returns undefined when IP_HASH_SEED is absent (local dev, tests without seed).
 * Never throws -- crypto errors degrade to undefined.
 *
 * GDPR: The output is pseudonymized data (Art. 4(5)), not anonymous.
 * Daily rotation limits the tracking window to 24 hours.
 */

const encoder = new TextEncoder();

// Module-scoped cache: one importKey per isolate per day
let _cachedKey = null;
let _cachedDate = '';

/**
 * Computes a pseudonymized client identifier from an IP address.
 *
 * @param {{ IP_HASH_SEED?: string }} env Worker env bindings
 * @param {string} ip CF-Connecting-IP value
 * @returns {Promise<string|undefined>} 16-char hex string, or undefined if seed absent
 */
export async function computeCip(env, ip) {
  if (!env?.IP_HASH_SEED) return undefined;
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Step 1: derive daily key (cached per isolate per day)
    if (today !== _cachedDate || !_cachedKey) {
      const seedKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(env.IP_HASH_SEED),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const dailyKeyBuf = await crypto.subtle.sign('HMAC', seedKey, encoder.encode(today));
      _cachedKey = await crypto.subtle.importKey(
        'raw',
        dailyKeyBuf,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      _cachedDate = today;
    }

    // Step 2: HMAC the IP with the daily key
    const hashBuf = await crypto.subtle.sign('HMAC', _cachedKey, encoder.encode(String(ip)));
    const hex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 16);
  } catch (err) {
    console.warn('wrl:cip_hash_fail', err?.message);
    return undefined;
  }
}
