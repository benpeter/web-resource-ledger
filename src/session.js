/*
 * session.js -- Session cookie creation, verification, and lifecycle management
 *
 * Session lifecycle:
 *   create: generateSessionId() -> hash -> D1 insert -> createSessionCookie()
 *   verify: read cookie -> verify HMAC sig -> hash id -> D1 lookup -> expiry check
 *   clear:  clearSessionCookie() + D1 delete (caller's responsibility)
 *
 * Cookie format:
 *   __Host-wrl_session={sessionId}.{hmacHex}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
 *
 * The __Host- prefix enforces Secure flag, no Domain attribute, and Path=/.
 * These are browser-enforced security invariants, not just conventions.
 *
 * Storage format:
 *   D1 key: SHA-256(sessionId) -- never stores raw session ID
 *   HMAC: SESSION_SECRET (hex-encoded 32+ bytes) signs the raw sessionId
 *
 * Required secrets:
 *   SESSION_SECRET -- hex-encoded 32+ random bytes (set via: wrangler secret put SESSION_SECRET)
 *
 * Tests: test/session.test.js
 */ // tva

import { getSession } from './db.js';
import { hashApiKey } from './auth.js';
import { log } from './log.js';
import { problemResponse } from './responses.js';

const COOKIE_NAME = '__Host-wrl_session';
const SESSION_MAX_AGE = 604800; // 7 days in seconds
const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Import the SESSION_SECRET (hex-encoded bytes) as an HMAC-SHA256 key.
 * Called once per request -- no module-level caching because secrets can
 * rotate across deployments and the Workers runtime already caches subtly.
 *
 * @param {string} secretHex  Hex-encoded 32+ byte secret
 * @returns {Promise<CryptoKey>}
 */
async function importHmacKey(secretHex) {
  const bytes = new Uint8Array(secretHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Encode a Uint8Array to base64url without padding.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toBase64url(bytes) {
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a new cryptographically random session ID (base64url, 32 bytes entropy).
 *
 * @returns {string}
 */
export function generateSessionId() {
  return toBase64url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Create an HMAC-signed session cookie string.
 *
 * Format: __Host-wrl_session={sessionId}.{hmacHex}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
 *
 * SECURITY: SESSION_SECRET must be set. If absent, throws -- misconfiguration
 * must surface loudly rather than silently degrade to unsigned cookies.
 *
 * @param {{ SESSION_SECRET?: string }} env
 * @param {string} sessionId  Raw session ID (not hashed)
 * @returns {Promise<string>}  Full Set-Cookie header value
 */
export async function createSessionCookie(env, sessionId) {
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is not configured');
  }
  const key = await importHmacKey(env.SESSION_SECRET);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(sessionId));
  const hmacHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const cookieValue = `${sessionId}.${hmacHex}`;
  return `${COOKIE_NAME}=${cookieValue}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

/**
 * Returns a Set-Cookie header value that clears the session cookie in the browser.
 *
 * @returns {string}  Full Set-Cookie header value with Max-Age=0
 */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Verify the session cookie on an incoming request.
 *
 * Steps:
 *   1. Read __Host-wrl_session cookie
 *   2. Split into sessionId + hmacHex
 *   3. Verify HMAC signature
 *   4. Hash sessionId with SHA-256 (reuses hashApiKey)
 *   5. D1 getSession() lookup (JOINs github_users -- one query)
 *   6. Expiry check
 *
 * Returns same shape as verifyApiKey() for consistent auth result handling.
 *
 * IMPORTANT: Returns tosAcceptedAt in the result. The router uses this to
 * enforce a 403 gate on /v1/account/* routes when ToS is not accepted.
 *
 * @param {Request} request
 * @param {{ DB?: D1Database, SESSION_SECRET?: string }} env
 * @returns {Promise<
 *   { ok: true, tenantId: string, githubId: number, githubLogin: string,
 *     tosAcceptedAt: string|null, authMethod: 'session' }
 *   | { ok: false, response: Response, reason: string }
 * >}
 */
export async function verifySession(request, env) {
  // Misconfiguration guard
  if (!env.SESSION_SECRET) {
    return {
      ok: false,
      response: problemResponse(503, 'Service is not configured'),
      reason: 'service_not_configured',
    };
  }

  if (!env.DB) {
    return {
      ok: false,
      response: problemResponse(503, 'Service is not configured'),
      reason: 'service_not_configured',
    };
  }

  // Extract cookie
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return {
      ok: false,
      response: problemResponse(401, 'Session cookie required'),
      reason: 'missing_cookie',
    };
  }

  // Parse __Host-wrl_session from Cookie header
  const match = cookieHeader
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(COOKIE_NAME + '='));

  if (!match) {
    return {
      ok: false,
      response: problemResponse(401, 'Session cookie required'),
      reason: 'missing_cookie',
    };
  }

  const rawValue = match.slice(COOKIE_NAME.length + 1); // strip "name="
  const dotIndex = rawValue.lastIndexOf('.');
  if (dotIndex === -1) {
    return {
      ok: false,
      response: problemResponse(401, 'Invalid session'),
      reason: 'malformed_cookie',
    };
  }

  const sessionId = rawValue.slice(0, dotIndex);
  const receivedHmacHex = rawValue.slice(dotIndex + 1);

  if (!sessionId || !receivedHmacHex) {
    return {
      ok: false,
      response: problemResponse(401, 'Invalid session'),
      reason: 'malformed_cookie',
    };
  }

  // Verify HMAC signature
  let signatureValid;
  try {
    const key = await importHmacKey(env.SESSION_SECRET);
    // Convert received hex HMAC back to bytes for timing-safe verify
    const receivedBytes = new Uint8Array(receivedHmacHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    signatureValid = await crypto.subtle.verify('HMAC', key, receivedBytes, enc.encode(sessionId));
  } catch {
    return {
      ok: false,
      response: problemResponse(401, 'Invalid session'),
      reason: 'signature_error',
    };
  }

  if (!signatureValid) {
    return {
      ok: false,
      response: problemResponse(401, 'Invalid session'),
      reason: 'invalid_signature',
    };
  }

  // Hash session ID before D1 lookup (raw ID is never stored)
  const idHash = await hashApiKey(sessionId);

  // D1 lookup (JOINs github_users -- no second query needed)
  let session;
  try {
    session = await getSession(env.DB, idHash);
  } catch (err) {
    log(env, 5, 'session', { event: 'session.db_error', errorMessage: String(err?.message ?? '').slice(0, 128) });
    return {
      ok: false,
      response: problemResponse(500, 'Session service error'),
      reason: 'db_error',
    };
  }

  if (!session) {
    return {
      ok: false,
      response: problemResponse(401, 'Invalid session'),
      reason: 'session_not_found',
    };
  }

  // Expiry check (getSession does NOT filter by expiry)
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  if (now > expiresAt) {
    return {
      ok: false,
      response: problemResponse(401, 'Session expired'),
      reason: 'session_expired',
    };
  }

  return {
    ok: true,
    tenantId: session.tenantId,
    githubId: session.githubId,
    githubLogin: session.githubLogin,
    tosAcceptedAt: session.tosAcceptedAt,
    authMethod: 'session',
  };
}
