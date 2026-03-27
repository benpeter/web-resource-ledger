/*
 * oauth.js -- GitHub OAuth 2.0 + PKCE flow handlers for WRL self-serve auth
 *
 * Endpoints:
 *   GET  /auth/login              -- initiate OAuth flow (generate state + PKCE, redirect to GitHub)
 *   GET  /auth/callback           -- handle GitHub redirect, exchange code, create session
 *   POST /auth/logout             -- delete session, clear cookie
 *   GET  /auth/session            -- query current session state (UI boot check)
 *   GET  /v1/account/first-key    -- retrieve one-time first API key for new users
 *   POST /v1/account/first-key/ack -- explicitly discard first key from KV
 *
 * Security invariants:
 *   - GitHub access token is NEVER stored -- discarded after /user fetch
 *   - GitHub access token, authorization codes, raw state, raw session IDs
 *     are NEVER logged
 *   - State parameter is single-use (deleted from KV on consumption)
 *   - PKCE code_verifier is stored alongside state in KV (same entry, same TTL)
 *   - Session IDs are SHA-256 hashed before D1 storage
 *   - First API key is shown once then KV entry deleted on first read
 *   - OAuth state TTL: 600 seconds (10 minutes)
 *
 * Required secrets:
 *   GITHUB_CLIENT_ID     -- GitHub OAuth App client ID (can be [vars], it is public)
 *   GITHUB_CLIENT_SECRET -- GitHub OAuth App client secret (wrangler secret put)
 *   SESSION_SECRET       -- hex-encoded 32+ bytes for session cookie HMAC (wrangler secret put)
 *
 * Tests: test/oauth.test.js
 */ // tva

import { jsonResponse, problemResponse } from './responses.js';
import { log } from './log.js';
import { computeCip } from './ip-hash.js';
import { hashApiKey } from './auth.js';
import { verifySession, generateSessionId, createSessionCookie, clearSessionCookie } from './session.js';
import {
  findGitHubUser,
  createGitHubUser,
  updateGitHubLogin,
  createSession,
  deleteSession,
  deleteExpiredSessions,
  createApiKeyRecord,
  getNotificationPreferences,
  upsertNotificationPreferences,
} from './db.js';
import { trackEvent } from './pirsch.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

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

/**
 * Compute BASE64URL(SHA-256(input)) for PKCE code_challenge.
 *
 * @param {string} input
 * @returns {Promise<string>}
 */
async function sha256Base64url(input) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return toBase64url(new Uint8Array(buf));
}

/**
 * Returns the fetch function to use for GitHub API calls.
 * Accepts env._githubFetch for test injection.
 *
 * @param {{ _githubFetch?: typeof fetch }} env
 * @returns {typeof fetch}
 */
function githubFetch(env) {
  return env._githubFetch || fetch;
}

/**
 * Extract and sanitize attribution data from the login request.
 * Values are attacker-controlled — truncate, validate, and allowlist.
 *
 * @param {Request} request
 * @returns {{ from?: string, referer?: string, utmSource?: string, utmMedium?: string, utmCampaign?: string }}
 */
function sanitizeAttribution(request) {
  const url = new URL(request.url);
  const referer = request.headers.get('Referer');

  let cleanReferer = null;
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        cleanReferer = referer.slice(0, 512);
      }
    } catch { cleanReferer = null; }
  }

  const UTM_RE = /^[\w.+\-@ ]{0,256}$/;
  const sanitizeUtm = (val) => {
    if (!val) return undefined;
    const trimmed = val.slice(0, 256);
    return UTM_RE.test(trimmed) ? trimmed : undefined;
  };

  const ALLOWED_FROM = ['landing', 'docs', 'api', 'direct'];
  const fromParam = url.searchParams.get('from');
  const from = ALLOWED_FROM.includes(fromParam) ? fromParam : undefined;

  return {
    from,
    referer: cleanReferer,
    utmSource: sanitizeUtm(url.searchParams.get('utm_source')),
    utmMedium: sanitizeUtm(url.searchParams.get('utm_medium')),
    utmCampaign: sanitizeUtm(url.searchParams.get('utm_campaign')),
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /auth/login
 *
 * Generates PKCE code_verifier and state, stores both in KV (TTL 600s),
 * then redirects to GitHub's authorization endpoint.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleAuthLogin(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Generate cryptographically random state (32 bytes, base64url)
  const state = toBase64url(crypto.getRandomValues(new Uint8Array(32)));

  // Generate PKCE code_verifier (64 bytes, base64url -- satisfies 43-128 char requirement)
  const codeVerifier = toBase64url(crypto.getRandomValues(new Uint8Array(64)));

  // Compute PKCE code_challenge = BASE64URL(SHA-256(code_verifier))
  const codeChallenge = await sha256Base64url(codeVerifier);

  // Store state + codeVerifier in KV, TTL 600s (10 minutes)
  // SECURITY: state value is not logged -- only stored in KV under the key
  const attribution = sanitizeAttribution(request);
  await env.KV.put(
    `oauth_state:${state}`,
    JSON.stringify({ codeVerifier, createdAt: new Date().toISOString(), ...attribution }),
    { expirationTtl: 600 },
  );

  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/auth/callback`;

  const authParams = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: callbackUrl,
    state,
    scope: 'read:user user:email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const githubAuthUrl = `https://github.com/login/oauth/authorize?${authParams}`;

  ctx.waitUntil(log(env, 3, 'oauth', {
    event: 'oauth.login_start',
    provider: 'github',
    cip,
  }) ?? Promise.resolve());

  return new Response(null, {
    status: 302,
    headers: { Location: githubAuthUrl },
  });
}

/**
 * GET /auth/callback
 *
 * Handles GitHub's redirect after user authorizes (or denies) the OAuth request.
 * Exchanges authorization code for access token (with PKCE), fetches GitHub user
 * identity, creates or updates the local user record, creates a D1 session, and
 * sets the session cookie.
 *
 * SECURITY: The GitHub access token is never stored or logged. It is used once
 * to fetch the user identity and then discarded (garbage collected).
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleAuthCallback(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Step 1: validate required params
  if (!code || !state) {
    ctx.waitUntil(log(env, 5, 'oauth', {
      event: 'oauth.callback_fail',
      cip,
      provider: 'github',
      reason: 'missing_params',
    }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=missing_params' } });
  }

  // Step 2: read and delete KV state entry (single-use)
  // SECURITY: state is not logged -- it is consumed and validated here only
  let stateData;
  try {
    const raw = await env.KV.get(`oauth_state:${state}`);
    if (!raw) {
      ctx.waitUntil(log(env, 5, 'oauth', {
        event: 'oauth.callback_fail',
        cip,
        provider: 'github',
        reason: 'invalid_state',
      }) ?? Promise.resolve());
      return new Response(null, { status: 302, headers: { Location: '/ui?error=invalid_state' } });
    }
    stateData = JSON.parse(raw);
    // Delete immediately -- state is single-use
    ctx.waitUntil(env.KV.delete(`oauth_state:${state}`));
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'oauth', {
      event: 'oauth.callback_fail',
      cip,
      provider: 'github',
      reason: 'state_lookup_error',
    }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=invalid_state' } });
  }

  const { codeVerifier } = stateData;
  const origin = url.origin;
  const callbackUrl = `${origin}/auth/callback`;

  // Step 3: exchange authorization code for GitHub access token (with PKCE)
  let accessToken;
  try {
    const ghFetch = githubFetch(env);
    const tokenResponse = await ghFetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!tokenResponse.ok) {
      throw new Error(`GitHub token endpoint returned ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      // SECURITY: do not log tokenData -- it may contain the error description
      // which could include fragments of the authorization code
      throw new Error('No access_token in GitHub response');
    }
    accessToken = tokenData.access_token;
    // tokenData is no longer referenced after this point -- GC eligible
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'oauth', {
      event: 'oauth.callback_fail',
      cip,
      provider: 'github',
      reason: 'token_exchange_failed',
    }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=token_exchange_failed' } });
  }

  // Step 4: fetch GitHub user identity and primary verified email
  // SECURITY: access token is used here and then discarded -- never stored
  let githubUser;
  let primaryEmail = null;
  try {
    const ghFetch = githubFetch(env);

    // Fetch user profile and emails in parallel
    const [userResponse, emailsResponse] = await Promise.all([
      ghFetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'web-resource-ledger',
        },
        signal: AbortSignal.timeout(5000),
      }),
      ghFetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'web-resource-ledger',
        },
        signal: AbortSignal.timeout(5000),
      }),
    ]);

    if (!userResponse.ok) {
      throw new Error(`GitHub user API returned ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    if (!userData.id || !userData.login) {
      throw new Error('GitHub user response missing id or login');
    }

    githubUser = { id: userData.id, login: userData.login };

    // Extract primary verified email from /user/emails (best-effort, never fails OAuth)
    if (emailsResponse.ok) {
      try {
        const emails = await emailsResponse.json();
        if (Array.isArray(emails)) {
          const found = emails.find(e => e.primary && e.verified);
          // SECURITY: email addresses are never logged -- only stored in notification_preferences
          primaryEmail = found ? { email: found.email } : null;
        }
      } catch {
        // Non-fatal: email fetch parse failure does not affect login
      }
    }
    // userData and accessToken are no longer referenced -- GC eligible
    // SECURITY: accessToken deliberately not assigned to null (no need, GC handles it)
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'oauth', {
      event: 'oauth.callback_fail',
      cip,
      provider: 'github',
      reason: 'github_api_error',
    }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=github_api_error' } });
  }

  // Step 5: look up or create local user record
  let tenantId;
  let isNewUser = false;

  try {
    const existingUser = await findGitHubUser(env.DB, githubUser.id);

    if (existingUser) {
      // Returning user: update login name (GitHub users can rename themselves)
      tenantId = existingUser.tenantId;
      await updateGitHubLogin(env.DB, githubUser.id, githubUser.login);

      // 3g: Update email if source is 'github' and a new primary email is available
      if (primaryEmail) {
        const prefs = await getNotificationPreferences(env.DB, tenantId);
        if (!prefs || prefs.emailSource === 'github') {
          // Only update if the email differs (avoids unnecessary writes)
          if (!prefs || prefs.email !== primaryEmail.email) {
            await upsertNotificationPreferences(env.DB, tenantId, {
              email: primaryEmail.email,
              emailVerified: true,
              emailSource: 'github',
            });
          }
        }
        // emailSource === 'manual': do NOT overwrite
      }
    } else {
      // New user: create github_users record, tenant, and first API key
      isNewUser = true;
      tenantId = `gh-${githubUser.id}`;

      await createGitHubUser(env.DB, {
        githubId: githubUser.id,
        githubLogin: githubUser.login,
        tenantId,
        tosAcceptedAt: null,
        tosVersion: null,
      });

      ctx.waitUntil(log(env, 3, 'oauth', {
        event: 'oauth.tenant_create',
        cip,
        tenantId,
        githubUserId: githubUser.id,
        provider: 'github',
      }) ?? Promise.resolve());

      // Generate first API key for new user (same pattern as admin.js)
      const rawKey = 'wrl_live_' + toBase64url(crypto.getRandomValues(new Uint8Array(32)));
      const keyHash = await hashApiKey(rawKey);
      const createdAt = new Date().toISOString();
      const keyRecord = {
        tenantId,
        scopes: ['capture', 'read'],
        name: 'primary',
        createdAt,
        createdBy: `github:${githubUser.id}`,
        revoked: false,
        revokedAt: null,
      };

      const result = await createApiKeyRecord(env.DB, keyHash, keyRecord);
      if (result.created) {
        // Store raw key in KV for one-time retrieval (TTL 1 hour)
        // SECURITY: this is the ONLY place the raw key exists after generation
        await env.KV.put(`first_key:${tenantId}`, rawKey, { expirationTtl: 3600 });
      } else {
        // Hash collision (astronomically rare) -- log but don't fail the OAuth flow
        console.error('wrl:oauth:first_key_collision', { tenantId, reason: result.reason });
      }

      // 3g: Auto-populate notification_preferences with GitHub email if available
      if (primaryEmail) {
        await upsertNotificationPreferences(env.DB, tenantId, {
          email: primaryEmail.email,
          emailVerified: true,
          emailSource: 'github',
        });
      }

      // Pirsch: track new user signup with attribution from login step
      const source = stateData.from || 'direct';
      const signupMeta = { tenantId, provider: 'github', source };
      if (stateData.utmSource) signupMeta.utm_source = stateData.utmSource;
      if (stateData.utmMedium) signupMeta.utm_medium = stateData.utmMedium;
      if (stateData.utmCampaign) signupMeta.utm_campaign = stateData.utmCampaign;
      if (stateData.referer) signupMeta.referer = stateData.referer;

      ctx.waitUntil(trackEvent(request, env, 'Signup', signupMeta, { property: 'api' }) ?? Promise.resolve());
    }
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'oauth', {
      event: 'oauth.callback_fail',
      cip,
      provider: 'github',
      reason: 'user_setup_error',
    }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=github_api_error' } });
  }

  // Step 6: create session
  let sessionCookie;
  try {
    const sessionId = generateSessionId();
    const idHash = await hashApiKey(sessionId);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    await createSession(env.DB, {
      idHash,
      githubId: githubUser.id,
      tenantId,
      expiresAt,
    });

    sessionCookie = await createSessionCookie(env, sessionId);

    // Opportunistic cleanup of expired sessions (fire-and-forget)
    ctx.waitUntil(deleteExpiredSessions(env.DB));

    ctx.waitUntil(log(env, 3, 'oauth', {
      event: 'oauth.session_create',
      cip,
      tenantId,
      githubUserId: githubUser.id,
      sessionIdPrefix: idHash.slice(0, 8),
      expiresAt,
    }) ?? Promise.resolve());

    ctx.waitUntil(log(env, 3, 'oauth', {
      event: 'oauth.callback_success',
      cip,
      provider: 'github',
      githubUserId: githubUser.id,
      tenantId,
      isNewUser,
      sessionIdPrefix: idHash.slice(0, 8),
    }) ?? Promise.resolve());
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'oauth', {
      event: 'oauth.callback_fail',
      cip,
      provider: 'github',
      reason: 'session_create_error',
    }) ?? Promise.resolve());
    return new Response(null, { status: 302, headers: { Location: '/ui?error=github_api_error' } });
  }

  // Step 7: redirect with session cookie set
  const destination = isNewUser ? '/ui?flow=welcome' : '/ui';
  return new Response(null, {
    status: 302,
    headers: {
      'Location': destination,
      'Set-Cookie': sessionCookie,
    },
  });
}

/**
 * POST /auth/logout
 *
 * Deletes the D1 session record and clears the session cookie.
 * Idempotent: if no valid session exists, still returns 200.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleAuthLogout(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  const auth = await verifySession(request, env);

  if (auth.ok) {
    // Hash the session ID to get the D1 key for deletion
    // We need to re-parse the cookie to get the raw sessionId for hashing
    const cookieHeader = request.headers.get('Cookie') || '';
    const COOKIE_NAME = '__Host-wrl_session';
    const match = cookieHeader
      .split(';')
      .map(s => s.trim())
      .find(s => s.startsWith(COOKIE_NAME + '='));

    if (match) {
      const rawValue = match.slice(COOKIE_NAME.length + 1);
      const dotIndex = rawValue.lastIndexOf('.');
      if (dotIndex !== -1) {
        const sessionId = rawValue.slice(0, dotIndex);
        const idHash = await hashApiKey(sessionId);
        try {
          await deleteSession(env.DB, idHash);
        } catch (err) {
          // Log but don't fail -- we still clear the cookie
          console.error('wrl:oauth:logout_delete_error', { errorMessage: String(err?.message ?? '').slice(0, 128) });
        }

        ctx.waitUntil(log(env, 3, 'oauth', {
          event: 'oauth.logout',
          cip,
          tenantId: auth.tenantId,
          sessionIdPrefix: idHash.slice(0, 8),
        }) ?? Promise.resolve());
      }
    }
  }
  // Idempotent: if no valid session, silently succeed

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}

/**
 * GET /auth/session
 *
 * Returns the current authentication state. Used by the UI on boot to
 * determine whether the user is logged in.
 *
 * Does NOT log (fires on every page load -- too noisy per spec).
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleAuthSession(request, env, ctx) {
  const auth = await verifySession(request, env);

  if (!auth.ok) {
    return jsonResponse({ authenticated: false });
  }

  // Fresh lookup to get tosVersion (verifySession JOIN only returns tosAcceptedAt)
  let user;
  try {
    user = await findGitHubUser(env.DB, auth.githubId);
  } catch (err) {
    console.error('wrl:oauth:session_user_lookup_error', { errorMessage: String(err?.message ?? '').slice(0, 128) });
    return problemResponse(500, 'Session service error');
  }

  if (!user) {
    // Session references a deleted user -- treat as unauthenticated
    return jsonResponse({ authenticated: false });
  }

  return jsonResponse({
    authenticated: true,
    user: {
      githubId: auth.githubId,
      githubLogin: auth.githubLogin,
      tenantId: auth.tenantId,
      tosAcceptedAt: user.tosAcceptedAt,
      tosVersion: user.tosVersion,
    },
  });
}

/**
 * GET /v1/account/first-key
 *
 * Returns the one-time first API key for a new user. The KV entry is deleted
 * immediately after reading (show-once semantics). If the entry no longer
 * exists (already retrieved or expired), returns 404.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleFirstKey(request, env, ctx) {
  const auth = await verifySession(request, env);
  if (!auth.ok) {
    return auth.response;
  }

  const kvKey = `first_key:${auth.tenantId}`;
  const rawKey = await env.KV.get(kvKey);

  if (!rawKey) {
    return problemResponse(404, 'No first key available. Create a new key in account settings.');
  }

  // Delete immediately after reading -- show-once semantics
  // Use waitUntil so the delete happens even if the client disconnects
  ctx.waitUntil(env.KV.delete(kvKey));

  return jsonResponse(
    { key: rawKey, warning: 'Store this key now. It will not be shown again.' },
    200,
    { 'Cache-Control': 'private, no-store' },
  );
}

/**
 * POST /v1/account/first-key/ack
 *
 * Explicitly discards the first key KV entry. Idempotent -- safe to call
 * even if the entry was already deleted by a prior GET /v1/account/first-key.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
export async function handleFirstKeyAck(request, env, ctx) {
  const auth = await verifySession(request, env);
  if (!auth.ok) {
    return auth.response;
  }

  // Idempotent delete -- no error if already gone
  ctx.waitUntil(env.KV.delete(`first_key:${auth.tenantId}`));

  return jsonResponse({ ok: true });
}
