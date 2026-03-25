import { problemResponse, jsonResponse, batchItemSuccess, batchItemError } from './responses.js';
import { verifyApiKey, verifyAdminKey } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createCapture, getCapture, failCapture, listCaptures, listArchivedSigningKeys, TENANT_ID_RE, SCHEDULE_ID_RE, getTenantConfig, setTenantConfig, incrementUsage, setCaptureThreatCheck, getPreviousCaptureId, setChangeSummary } from './db.js';
import { diffHtml, diffHeaders, diffScreenshot, computeChangeSummary } from './diff.js';
import { checkUrl, checkUrls } from './threat-check.js';
import { rateLimitCounter } from './kv.js';
import { performCapture } from './capture.js';
import { performVerification } from './verify.js';
import { getSigningKeys } from './signing.js';
import { htmlVerifyResponse } from './verify-page.js';
import { FAVICON_SVG } from './favicon.js';
import { log } from './log.js';
import { RATE_LIMITS, getEffectiveLimit } from './rate-limits.js';
import { checkQuota, FREE_CAPTURE_LIMIT } from './quotas.js';
import { computeCip } from './ip-hash.js';
import { handleAdminCreateKey, handleAdminListKeys, handleAdminRevokeKey, handleAdminGetUsage } from './admin.js';
import { handleMcp } from './mcp.js';
import { htmlDashboard } from './ui/ui-shell.js';
import { handleCreateWebhook, handleListWebhooks, handleDeleteWebhook, handlePingWebhook } from './webhooks.js';
import { handleCreateSchedule, handleListSchedules, handleGetSchedule, handleDeleteSchedule } from './schedules.js';
import { handleWebhookMessage, handleWebhookDlqMessage, dispatchWebhooks } from './webhook-dispatch.js';
import { handleEmailMessage, handleEmailDlqMessage, dispatchNotification } from './email-dispatch.js';
import { handleAuthLogin, handleAuthCallback, handleAuthLogout, handleAuthSession, handleFirstKey, handleFirstKeyAck } from './oauth.js';
import { handleAccountListKeys, handleAccountCreateKey, handleAccountRevokeKey, handleAccountAcceptTos, handleAccountGetUsage, handleGetSettings, handleUpdateSettings } from './account.js';
import { handleGetNotificationPreferences, handleUpdateNotificationPreferences, handleWeeklyDigest } from './notifications.js';
import { handleGetUnsubscribe, handlePostUnsubscribe } from './unsubscribe.js';
import { handleBillingCheckout, handleBillingPortal, handleStripeWebhook } from './billing.js';
import { verifySession } from './session.js';
import { handleScheduledTick } from './scheduler.js';
import { reportPendingMeterEvents } from './meter-reporter.js';
import { generateCertificate } from './certificate.js';

// tva

/**
 * Dual auth: try session cookie first, then API key.
 * Allows OAuth-authenticated users to use capture endpoints via the Web UI.
 */
async function verifyAuth(request, env, options) {
  // Try session cookie first (Web UI users)
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader && cookieHeader.includes('__Host-wrl_session')) {
    const session = await verifySession(request, env);
    if (session.ok) {
      return {
        ok: true,
        tenantId: session.tenantId,
        authMethod: 'session',
        keyName: null,
        keyHashPrefix: null,
      };
    }
  }
  // Fall back to API key
  return verifyApiKey(request, env, options);
}

// Routes: [method, pattern, handler]
// Order matters: most specific pattern first.
// Add new routes as one-line tuples.
const routes = [
  ['GET',    /^\/favicon\.ico$/, handleFavicon],
  ['GET',    /^\/health$/, handleHealth],
  // UI dashboard -- same-origin only; no CORS needed (browser-only, uses credentials via sessionStorage)
  ['GET',    /^\/ui$/, handleDashboard],
  ['POST',   /^\/v1\/captures\/batch$/, handleBatchCapture],
  ['POST',   /^\/v1\/captures$/, handleCreateCapture],
  ['GET',    /^\/v1\/captures$/, handleListCaptures],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})\/status$/, handleCaptureStatus],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot-before|screenshot|html|headers|wacz)$/, handleGetCaptureArtifact],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})\/certificate$/, handleGetCertificate],
  ['GET',    /^\/v1\/captures\/(cap_[a-f0-9]{32})\/diff\/(cap_[a-f0-9]{32})$/, handleDiffCaptures],
  ['GET',    /^\/v1\/verify\/(cap_[a-f0-9]{32})$/, handleVerifyCapture],
  ['GET',    /^\/\.well-known\/signing-key$/, handleGetSigningKey],
  ['GET',    /^\/\.well-known\/signing-keys$/, handleGetSigningKeys],
  ['POST',   /^\/v1\/admin\/keys$/, handleAdminCreateKey],
  ['GET',    /^\/v1\/admin\/keys$/, handleAdminListKeys],
  ['DELETE', /^\/v1\/admin\/keys\/([a-f0-9]{64})$/, handleAdminRevokeKey],
  ['GET',    /^\/v1\/admin\/usage$/, handleAdminGetUsage],
  ['GET',    /^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})\/config$/, handleGetTenantConfig],
  ['PUT',    /^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})\/config$/, handlePutTenantConfig],
  ['POST',   /^\/v1\/webhooks$/, handleCreateWebhook],
  ['GET',    /^\/v1\/webhooks$/, handleListWebhooks],
  ['DELETE', /^\/v1\/webhooks\/(whk_[a-f0-9]{32})$/, handleDeleteWebhook],
  ['POST',   /^\/v1\/webhooks\/(whk_[a-f0-9]{32})\/ping$/, handlePingWebhook],
  // Schedule routes
  ['POST',   /^\/v1\/schedules$/, handleCreateSchedule],
  ['GET',    /^\/v1\/schedules$/, handleListSchedules],
  ['GET',    /^\/v1\/schedules\/(sch_[a-f0-9]{32})$/, handleGetSchedule],
  ['DELETE', /^\/v1\/schedules\/(sch_[a-f0-9]{32})$/, handleDeleteSchedule],
  // OAuth / session routes
  ['GET',    /^\/auth\/login$/, handleAuthLogin],
  ['GET',    /^\/auth\/callback$/, handleAuthCallback],
  ['POST',   /^\/auth\/logout$/, handleAuthLogout],
  ['GET',    /^\/auth\/session$/, handleAuthSession],
  // Account self-serve routes (session-gated in fetch handler)
  ['GET',    /^\/v1\/account\/first-key$/, handleFirstKey],
  ['POST',   /^\/v1\/account\/first-key\/ack$/, handleFirstKeyAck],
  ['GET',    /^\/v1\/account\/keys$/, handleAccountListKeys],
  ['POST',   /^\/v1\/account\/keys$/, handleAccountCreateKey],
  ['DELETE', /^\/v1\/account\/keys\/([a-f0-9]{64})$/, handleAccountRevokeKey],
  ['POST',   /^\/v1\/account\/tos$/, handleAccountAcceptTos],
  ['GET',    /^\/v1\/account\/usage$/, handleAccountGetUsage],
  ['GET',    /^\/v1\/account\/settings$/, handleGetSettings],
  ['PATCH',  /^\/v1\/account\/settings$/, handleUpdateSettings],
  ['GET',    /^\/v1\/account\/notifications$/, handleGetNotificationPreferences],
  ['PUT',    /^\/v1\/account\/notifications$/, handleUpdateNotificationPreferences],
  // Unsubscribe routes (unauthenticated -- rate-limited via AUTH_RATE_LIMITER in fetch handler)
  ['GET',    /^\/v1\/notifications\/unsubscribe$/, handleGetUnsubscribe],
  ['POST',   /^\/v1\/notifications\/unsubscribe$/, handlePostUnsubscribe],
  // Billing routes (session-gated in fetch handler via /v1/account/ prefix check)
  ['POST',   /^\/v1\/billing\/checkout$/, handleBillingCheckout],
  ['POST',   /^\/v1\/billing\/portal$/, handleBillingPortal],
  // Stripe webhook (public -- signature-verified internally)
  ['POST',   /^\/v1\/stripe\/webhook$/, handleStripeWebhook],
];

function getAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (allowed.includes(origin)) return origin;
  return null;
}

function getRateLimitGroup(method, pathname) {
  if (pathname.startsWith('/v1/admin/')) return 'admin';
  if (pathname === '/v1/captures' || pathname === '/v1/captures/batch') return 'capture';
  if (pathname.startsWith('/v1/schedules')) return 'capture';
  if (pathname.startsWith('/v1/verify/') || pathname.startsWith('/.well-known/signing-key')) return 'verify';
  if (pathname.startsWith('/v1/account/') || pathname.startsWith('/v1/billing/')) return 'account';
  if (pathname.startsWith('/auth/')) return 'auth';
  if (pathname.startsWith('/v1/notifications/unsubscribe')) return 'auth';
  return null;
}

// ---------------------------------------------------------------------------
// Queue consumer helpers
// ---------------------------------------------------------------------------

async function handleCaptureMessage(msg, env, ctx) {
  const { url, ip, captureId, tenantId, cip, enqueuedAt, scheduleId, qualifiedTimestamps } = msg.body ?? {};

  // Defense-in-depth: validate message structure before trusting it
  const valid =
    typeof tenantId === 'string' && TENANT_ID_RE.test(tenantId) &&
    typeof captureId === 'string' && /^cap_[a-f0-9]{32}$/.test(captureId) &&
    typeof url === 'string' && url.length > 0;

  if (!valid) {
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.invalid_message',
      captureId: captureId ?? null,
      tenantId: tenantId ?? null,
      reason: 'invalid_message_structure',
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // SSRF check on the URL from the queue message
  const urlCheck = await validateUrl(url);
  if (!urlCheck.ok) {
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.invalid_message',
      captureId,
      tenantId,
      reason: 'url_validation_failed',
      detail: urlCheck.detail,
    }) ?? Promise.resolve());
    msg.ack();
    return;
  }

  // Idempotency guard: skip if already terminal
  const existing = await getCapture(env.DB, captureId);
  if (existing && (existing.status === 'complete' || existing.status === 'failed' || existing.status === 'quarantined')) {
    msg.ack();
    return;
  }

  const queueTimeMs = Date.now() - msg.timestamp.getTime();

  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.dequeued',
    captureId,
    tenantId,
    url,
    attempt: msg.attempts,
    queueTimeMs,
    scheduleId: scheduleId ?? null,
  }) ?? Promise.resolve());

  let result;
  try {
    result = await performCapture(env, url, ip, captureId, tenantId, cip, undefined, msg.attempts, qualifiedTimestamps);
  } catch (err) {
    // Catastrophic error (OOM, binding failure, etc.)
    // max_retries=3 in wrangler.toml → up to 4 deliveries (attempts 1-4)
    if (msg.attempts >= 4) {
      try {
        await failCapture(env.DB, captureId, 'Capture permanently failed after catastrophic error', false);
      } catch {
        // Best-effort -- do not block ack
      }
      msg.ack();
    } else {
      const delay = Math.min(10 * Math.pow(2, msg.attempts - 1), 300);
      msg.retry({ delaySeconds: delay });
    }
    return;
  }

  if (result.ok === true) {
    const eidasCaptures = result.qualifiedTimestampStatus === 'present' ? 1 : 0;
    ctx.waitUntil(
      incrementUsage(env.DB, tenantId, {
        captures: 1,
        storageBytes: result.storedBytes || 0,
        eidasCaptures,
      }).then(() =>
        log(env, 3, 'usage', {
          event: 'usage.counter_incremented',
          tenantId,
          captureId,
          captures: 1,
          storageBytes: result.storedBytes || 0,
          eidasCaptures,
        })
      ).catch((err) => {
        console.warn('wrl:usage_increment_fail', { captureId, tenantId, errorMessage: String(err?.message ?? '').slice(0, 128) });
      })
    );
    msg.ack();
    // Dispatch webhooks after ack -- must not block capture completion
    ctx.waitUntil((async () => {
      try {
        const captureRecord = await getCapture(env.DB, captureId);
        if (captureRecord) {
          await dispatchWebhooks(env, tenantId, 'capture.complete', captureRecord);
        }
      } catch (err) {
        log(env, 4, 'webhook', { event: 'webhook.dispatch_error', captureId, tenantId, errorCategory: 'unexpected', error: err.message });
      }
    })());
    // Compute change summary for scheduled captures (non-blocking)
    ctx.waitUntil((async () => {
      try {
        if (!scheduleId) return; // Only for scheduled captures
        const previousId = await getPreviousCaptureId(env.DB, scheduleId, captureId);
        if (!previousId) return; // First capture in schedule

        // Fetch artifacts for hash/diff comparison
        const [baseHtmlObj, targetHtmlObj, baseHeadersObj, targetHeadersObj] = await Promise.all([
          env.BUCKET.get(`captures/${previousId}/rendered.html`),
          env.BUCKET.get(`captures/${captureId}/rendered.html`),
          env.BUCKET.get(`captures/${previousId}/headers.json`),
          env.BUCKET.get(`captures/${captureId}/headers.json`),
        ]);

        // Screenshot: hash comparison via R2 head
        const [baseScreenHead, targetScreenHead] = await Promise.all([
          env.BUCKET.head(`captures/${previousId}/screenshot.png`),
          env.BUCKET.head(`captures/${captureId}/screenshot.png`),
        ]);

        const screenshotDiff = diffScreenshot(
          baseScreenHead?.httpEtag,
          targetScreenHead?.httpEtag,
        );

        // HTML: lightweight diff for summary stats
        let htmlDiff = { changed: false, stats: { additions: 0, deletions: 0 } };
        if (baseHtmlObj && targetHtmlObj) {
          const baseHtml = await baseHtmlObj.text();
          const targetHtml = await targetHtmlObj.text();
          htmlDiff = diffHtml(baseHtml, targetHtml);
        }

        // Headers
        let headerDiff = { changed: false, added: [], removed: [], modified: [], unchanged: 0 };
        if (baseHeadersObj && targetHeadersObj) {
          headerDiff = diffHeaders(await baseHeadersObj.json(), await targetHeadersObj.json());
        }

        const summary = computeChangeSummary(htmlDiff, headerDiff, screenshotDiff);
        summary.previousCaptureId = previousId;
        await setChangeSummary(env.DB, captureId, summary);
      } catch (err) {
        // Graceful degradation: change_summary stays NULL, badge just does not show
        log(env, 4, 'diff', { event: 'diff.summary_error', captureId, scheduleId, error: err?.message });
      }
    })());
    // 3b: Approaching free tier limit notification
    ctx.waitUntil((async () => {
      try {
        const quota = await checkQuota(env.DB, tenantId);
        // Only free-tier tenants (no payment method); dispatched when count crosses 80%
        if (quota.allowed && !quota.hasPaymentMethod) {
          const newCount = quota.captureCount;
          const threshold = Math.floor(FREE_CAPTURE_LIMIT * 0.8);
          if (newCount >= threshold) {
            const baseUrl = env.VERIFICATION_BASE_URL
              ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
              : 'https://api.webresourceledger.com';
            await dispatchNotification(env, tenantId, 'approaching_limit', {
              used: newCount,
              limit: FREE_CAPTURE_LIMIT,
              period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
              addPaymentUrl: `${baseUrl}/v1/billing/checkout`,
            }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId }));
          }
        }
      } catch (err) {
        log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId });
      }
    })());
  } else if (!result.retryable) {
    // Already written to D1 as failed by performCapture
    msg.ack();
    // Dispatch webhooks after ack -- must not block capture completion
    ctx.waitUntil((async () => {
      try {
        const captureRecord = await getCapture(env.DB, captureId);
        if (captureRecord) {
          await dispatchWebhooks(env, tenantId, 'capture.failed', captureRecord);
          const baseUrl = env.VERIFICATION_BASE_URL
            ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
            : 'https://api.webresourceledger.com';
          await dispatchNotification(env, tenantId, 'capture_failure', {
            url: captureRecord.url,
            errorCategory: captureRecord.error,
            failedAt: new Date().toISOString(),
            captureDetailUrl: `${baseUrl}/v1/captures/${captureRecord.captureId}`,
          }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId }));
        }
      } catch (err) {
        log(env, 4, 'webhook', { event: 'webhook.dispatch_error', captureId, tenantId, errorCategory: 'unexpected', error: err.message });
      }
    })());
  } else {
    const delay = Math.min(10 * Math.pow(2, msg.attempts - 1), 300);
    ctx.waitUntil(log(env, 4, 'capture', {
      event: 'capture.retry',
      captureId,
      tenantId,
      attempt: msg.attempts,
      retryDelaySeconds: delay,
      scheduleId: scheduleId ?? null,
      retryReason: result.error,
    }) ?? Promise.resolve());
    msg.retry({ delaySeconds: delay });
  }
}

async function handleDlqMessage(msg, env, ctx) {
  const { captureId, tenantId, url } = msg.body ?? {};

  ctx.waitUntil(log(env, 5, 'capture', {
    event: 'capture.dlq',
    captureId: captureId ?? null,
    tenantId: tenantId ?? null,
    url: url ?? null,
    attempts: msg.attempts,
  }) ?? Promise.resolve());

  if (captureId) {
    try {
      await failCapture(env.DB, captureId, 'Capture permanently failed after all retry attempts', false);
    } catch {
      // Best-effort
    }
    // Dispatch webhooks and email notification after failCapture -- must not block DLQ ack
    ctx.waitUntil((async () => {
      try {
        const captureRecord = await getCapture(env.DB, captureId);
        if (captureRecord) {
          await dispatchWebhooks(env, tenantId, 'capture.failed', captureRecord);
          const baseUrl = env.VERIFICATION_BASE_URL
            ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
            : 'https://api.webresourceledger.com';
          await dispatchNotification(env, tenantId, 'capture_failure', {
            url: captureRecord.url,
            errorCategory: captureRecord.error,
            failedAt: new Date().toISOString(),
            captureDetailUrl: `${baseUrl}/v1/captures/${captureRecord.captureId}`,
          }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId }));
        }
      } catch (err) {
        log(env, 4, 'webhook', { event: 'webhook.dispatch_error', captureId, tenantId, errorCategory: 'unexpected', error: err.message });
      }
    })());
  }

  msg.ack();
}

// ---------------------------------------------------------------------------
// Worker default export
// ---------------------------------------------------------------------------

export default {
  async scheduled(controller, env, ctx) {
    if (env.RESCAN_CRON && controller.cron === env.RESCAN_CRON) {
      const { handleRescanTick } = await import('./rescan.js');
      await handleRescanTick(controller, env, ctx);
      return;
    }
    // Weekly digest: Monday 9:00 UTC
    if (controller.cron === '0 9 * * 1') {
      ctx.waitUntil(handleWeeklyDigest(env).catch(err => log(env, 4, 'email', {
        event: 'email.digest_error',
        error: err?.message,
      })));
    }
    await handleScheduledTick(controller, env, ctx);
    if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
      ctx.waitUntil(reportPendingMeterEvents(env, ctx));
    }
  },

  async queue(batch, env, ctx) {
    for (const msg of batch.messages) {
      const q = batch.queue;
      if (q.includes('emails')) {
        if (q.endsWith('-dlq')) {
          await handleEmailDlqMessage(msg, env, ctx);
        } else {
          await handleEmailMessage(msg, env, ctx);
        }
      } else if (q.includes('webhooks')) {
        if (q.endsWith('-dlq')) {
          await handleWebhookDlqMessage(msg, env, ctx);
        } else {
          await handleWebhookMessage(msg, env, ctx);
        }
      } else {
        if (q.endsWith('-dlq')) {
          await handleDlqMessage(msg, env, ctx);
        } else {
          await handleCaptureMessage(msg, env, ctx);
        }
      }
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Normalize trailing slashes: /health/ matches /health
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    let response;

    // MCP endpoint -- handle before regex router
    // MCP transport handles POST internally; OPTIONS for CORS preflight
    if (pathname === '/mcp') {
      if (request.method === 'OPTIONS') {
        response = new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '7200',
          },
        });
      } else {
        response = await handleMcp(request, env, ctx);
      }
    }

    // CORS preflight for POST /v1/captures
    if (!response && request.method === 'OPTIONS' && pathname === '/v1/captures') {
      const allowedOrigin = getAllowedOrigin(request, env);
      const headers = {
        'Access-Control-Max-Age': '7200',
        'Cache-Control': 'no-store',
      };
      if (allowedOrigin) {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
        headers['Access-Control-Allow-Methods'] = 'POST';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
        headers['Vary'] = 'Origin';
      }
      response = new Response(null, { status: 204, headers });
    }

    if (!response) {
      const isAdminRoute = pathname.startsWith('/v1/admin/');

      // Admin rate limit: check BEFORE auth (per spec)
      if (isAdminRoute) {
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (env.ADMIN_RATE_LIMITER) {
          const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: clientIp });
          if (!success) {
            const cip = await computeCip(env, clientIp);
            ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'admin_per_ip', responseStatus: 429, cip }) ?? Promise.resolve());
            response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
          }
        }

        // Admin auth: only if rate limit passed
        if (!response) {
          const auth = await verifyAdminKey(request, env);
          if (!auth.ok) {
            const cip = await computeCip(env, clientIp);
            ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: auth.reason, responseStatus: auth.response.status, cip }) ?? Promise.resolve());
            response = auth.response;
          }
        }
      }

      // Auth rate limit for /auth/* routes and /v1/notifications/unsubscribe
      const isAuthRoute = pathname.startsWith('/auth/');
      const isUnsubscribeRoute = pathname.startsWith('/v1/notifications/unsubscribe');
      if (!response && (isAuthRoute || isUnsubscribeRoute) && env.AUTH_RATE_LIMITER) {
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const { success } = await env.AUTH_RATE_LIMITER.limit({ key: clientIp });
        if (!success) {
          response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
        }
      }

      // Session auth gate for /v1/account/* and /v1/billing/* routes
      const isAccountRoute = pathname.startsWith('/v1/account/') || pathname.startsWith('/v1/billing/');
      if (!response && isAccountRoute) {
        // Rate limit: per-IP using AUTH_RATE_LIMITER
        if (env.AUTH_RATE_LIMITER) {
          const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
          const { success } = await env.AUTH_RATE_LIMITER.limit({ key: clientIp });
          if (!success) {
            response = problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
          }
        }

        // Session auth
        if (!response) {
          const session = await verifySession(request, env);
          if (!session.ok) {
            response = session.response;
          } else {
            // ToS enforcement: 403 if ToS not accepted (exempt tos + first-key endpoints)
            if (!session.tosAcceptedAt
                && !pathname.startsWith('/v1/account/tos')
                && !pathname.startsWith('/v1/account/first-key')) {
              response = problemResponse(403, 'You must accept the Terms of Service before using account endpoints.');
            }
            // CSRF check for mutations
            if (!response && (request.method === 'POST' || request.method === 'DELETE' || request.method === 'PATCH')) {
              if (!request.headers.has('X-WRL-CSRF')) {
                response = problemResponse(403, 'CSRF header X-WRL-CSRF is required for mutations');
              }
            }
            // Attach session to request for handlers
            if (!response) {
              env._session = session;
            }
          }
        }
      }

      // Auth gate for capture GET routes.
      // CRITICAL: /v1/verify/ must NOT be gated -- verify is public by design.
      // /v1/verify/ uses a different path prefix and is naturally excluded here.
      //
      // Access model (#169):
      //   GET /v1/captures            -- list endpoint, requires tenant auth
      //   GET /v1/captures/{id}       -- public (no auth required)
      //   GET /v1/captures/{id}/status -- public (no auth required)
      //   GET /v1/captures/{id}/artifacts/* -- public (no auth required)
      //
      // For individual capture routes: auth is optional. When present, it is
      // resolved and attached as env._captureAuth so handlers can enforce
      // tenant isolation (authenticated tenants only see their own captures).
      // Unauthenticated requests skip isolation and may access any capture.
      const isCaptureGetRoute = (
        request.method === 'GET' && (
          pathname.startsWith('/v1/captures/') || pathname === '/v1/captures'
        )
      );
      if (!response && isCaptureGetRoute) {
        if (pathname === '/v1/captures') {
          // List endpoint: requires tenant auth (API key or session)
          const auth = await verifyAuth(request, env, { requiredScope: 'read' });
          if (!auth.ok) {
            response = auth.response;
          } else {
            env._captureAuth = {
              tenantId: auth.tenantId,
              authMethod: auth.authMethod,
            };
          }
        } else {
          // Individual capture routes: auth is optional.
          // - No credentials: public access (env._captureAuth unset, no isolation).
          // - Valid credentials: tenant-isolated access (env._captureAuth set).
          // - Invalid credentials (bad key, expired session): 401.
          //   Presenting bad credentials is not equivalent to presenting none.
          const hasCredentials = request.headers.has('Authorization')
            || (request.headers.has('Cookie') && request.headers.get('Cookie').includes('__Host-wrl_session'));
          if (hasCredentials) {
            const auth = await verifyAuth(request, env, { requiredScope: 'read' });
            if (auth.ok) {
              env._captureAuth = {
                tenantId: auth.tenantId,
                authMethod: auth.authMethod,
              };
            } else {
              response = auth.response;
            }
          }
          // No credentials: env._captureAuth stays unset, handler allows public access.
        }
      }

      if (!response) {
        let matched = false;
        for (const [method, pattern, handler] of routes) {
          if (request.method !== method) continue;
          const match = pathname.match(pattern);
          if (match) {
            response = await handler(request, env, ctx, match);
            matched = true;
            break;
          }
        }

        if (!matched) {
          // SECURITY: Use static message -- never reflect request.method or url.pathname
          // into error responses (CWE-209 information disclosure)
          response = problemResponse(404, 'The requested resource does not exist.');
        }
      }
    }

    // CORS response headers for POST /v1/captures
    if (request.method === 'POST' && pathname === '/v1/captures') {
      const allowedOrigin = getAllowedOrigin(request, env);
      if (allowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
        response.headers.set('Vary', 'Origin');
      }
    }

    // CORS response headers for MCP endpoint
    if (pathname === '/mcp' && response && request.method !== 'OPTIONS') {
      response = new Response(response.body, response);
      response.headers.set('Access-Control-Allow-Origin', '*');
    }

    // X-RateLimit headers: authenticated handlers set their own (Limit/Remaining/Reset);
    // fall back to static Limit for unauthenticated endpoints (verify, admin)
    const rateLimitGroup = getRateLimitGroup(request.method, pathname);
    const rateLimitConfig = RATE_LIMITS[rateLimitGroup];
    if (rateLimitConfig && response.status !== 503 && !response.headers.has('X-RateLimit-Limit')) {
      response.headers.set('X-RateLimit-Limit', String(rateLimitConfig.limit));
    }

    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    // URL is coupled to the GitHub repository path -- update if the repo is renamed.
    response.headers.set('Link', '<https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md>; rel="terms-of-service"');
    if (typeof BUILD_VERSION !== 'undefined') {
      response.headers.set('WRL-API-Version', BUILD_VERSION);
    }
    return response;
  },
};

function handleFavicon() {
  // Serve SVG as favicon (modern browsers accept SVG favicons)
  const body = FAVICON_SVG;
  return new Response(body, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function handleHealth() {
  const body = {
    status: 'ok',
    legal: {
      terms: 'https://github.com/benpeter/web-resource-ledger/blob/main/TERMS.md',
      policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md',
    },
  };

  // Build identity -- injected at deploy time via wrangler --define.
  // typeof guard required: these are compile-time text replacements,
  // accessing undeclared identifiers without typeof throws ReferenceError.
  if (typeof BUILD_COMMIT !== 'undefined') {
    body.build = {
      commit: BUILD_COMMIT,
      version: BUILD_VERSION,
      env: BUILD_ENV,
      deployedAt: BUILD_DEPLOYED_AT,
    };
  }

  return jsonResponse(body, 200, { 'Cache-Control': 'no-store' });
}

function handleDashboard() {
  return htmlDashboard();
}

/**
 * Dual-layer rate limit check for authenticated capture endpoints.
 * - Legacy auth: IP-only via CF binding (unchanged behavior)
 * - KV auth: CF ceiling → KV counter → IP guard
 */
async function checkCaptureRateLimit(env, auth, clientIp, group, count = 1) {
  // Legacy auth: IP-only using existing CF binding (unchanged behavior)
  if (auth.authMethod === 'legacy') {
    if (env.CAPTURE_RATE_LIMITER) {
      const { success } = await env.CAPTURE_RATE_LIMITER.limit({ key: clientIp });
      if (!success) {
        return { exceeded: true, type: 'ip' };
      }
    }
    return { exceeded: false };
  }

  // KV auth: three-layer check
  // Layer 1: CF binding ceiling (tenantId key -- hard backstop at 100/60s)
  if (env.CAPTURE_RATE_LIMITER) {
    const { success } = await env.CAPTURE_RATE_LIMITER.limit({ key: auth.tenantId });
    if (!success) {
      return { exceeded: true, type: 'tenant' };
    }
  }

  // Layer 2: KV counter (per-tenant, respects custom overrides)
  const tenantConfig = await getTenantConfig(env.DB, auth.tenantId);
  const effective = getEffectiveLimit(tenantConfig, group);
  const counter = await rateLimitCounter(env.KV, auth.tenantId, group, effective.limit, effective.period, count);

  if (counter.exceeded) {
    return {
      exceeded: true,
      type: 'tenant',
      remaining: 0,
      resetIn: counter.resetIn,
      limit: effective.limit,
      writePromise: counter.writePromise,
    };
  }

  // Layer 3: IP secondary guard (per-IP abuse prevention)
  if (env.CAPTURE_IP_GUARD) {
    const { success } = await env.CAPTURE_IP_GUARD.limit({ key: clientIp });
    if (!success) {
      return {
        exceeded: true,
        type: 'ip_guard',
        remaining: counter.remaining,
        resetIn: counter.resetIn,
        limit: effective.limit,
        writePromise: counter.writePromise,
      };
    }
  }

  return {
    exceeded: false,
    remaining: counter.remaining,
    resetIn: counter.resetIn,
    limit: effective.limit,
    writePromise: counter.writePromise,
  };
}

// Build X-Quota-* headers for successful capture responses.
// Only called when quotaCheck.allowed is true -- callers must guard.
function buildQuotaHeaders(quotaCheck) {
  if (!quotaCheck?.allowed) return {};
  if (quotaCheck.quota?.capturesPerMonth === Infinity) return {};
  return {
    'X-Quota-Limit': String(quotaCheck.quota.capturesPerMonth),
    'X-Quota-Used': String(quotaCheck.captureCount),
    'X-Quota-Remaining': String(Math.max(0, quotaCheck.quota.capturesPerMonth - quotaCheck.captureCount)),
  };
}

async function handleCreateCapture(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Step 2: Auth check
  const auth = await verifyAuth(request, env, { requiredScope: 'capture' });
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: auth.reason, keyHashPrefix: auth.keyHashPrefix || null, responseStatus: auth.response.status, cip }) ?? Promise.resolve());
    return auth.response;
  }
  const { tenantId, keyName, keyHashPrefix, authMethod } = auth;

  ctx.waitUntil(
    incrementUsage(env.DB, tenantId, { apiCalls: 1 })
      .catch((err) => {
        console.warn('wrl:usage_increment_fail', { tenantId, errorMessage: String(err?.message ?? '').slice(0, 128) });
      })
  );

  // Step 3: Per-tenant rate limit (dual-layer for KV auth, IP-only for legacy)
  const rl = await checkCaptureRateLimit(env, auth, clientIp, 'capture');
  if (rl.exceeded) {
    const limiter = rl.type === 'ip_guard' ? 'capture_per_ip_guard' : rl.type === 'ip' ? 'capture_per_ip' : 'capture_per_tenant';
    ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter, tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
    if (rl.writePromise) ctx.waitUntil(rl.writePromise);
    const retryAfter = String(rl.resetIn || 60);
    const headers = { 'Retry-After': retryAfter };
    if (rl.limit !== undefined) {
      headers['X-RateLimit-Limit'] = String(rl.limit);
      headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = retryAfter;
    }
    if (rl.type === 'tenant') {
      return problemResponse(429, 'Per-tenant rate limit exceeded.', headers, { limitType: 'tenant' });
    }
    return problemResponse(429, 'Rate limit exceeded. Try again later.', headers);
  }
  if (rl.writePromise) ctx.waitUntil(rl.writePromise);
  const rlHeaders = {};
  if (rl.limit !== undefined) {
    rlHeaders['X-RateLimit-Limit'] = String(rl.limit);
    rlHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
    rlHeaders['X-RateLimit-Reset'] = String(rl.resetIn);
  }

  // Step 3b: Monthly quota check (KV auth only -- legacy auth has no D1 tenant record)
  let quotaCheck = null;
  if (authMethod !== 'legacy') {
    quotaCheck = await checkQuota(env.DB, tenantId);
    if (!quotaCheck.allowed) {
      ctx.waitUntil(log(env, 4, 'security', {
        event: 'security.quota_exceeded',
        tenantId, keyName, keyHashPrefix, authMethod,
        reason: quotaCheck.reason,
        limit: quotaCheck.limit,
        used: quotaCheck.used,
        responseStatus: 429,
        cip,
      }) ?? Promise.resolve());

      const retryAfterDate = new Date(quotaCheck.resetsAt).toUTCString();
      const quotaHeaders = {
        'Retry-After': retryAfterDate,
        ...rlHeaders,
      };
      const isCaptureLimit = quotaCheck.reason === 'capture_limit' || quotaCheck.reason === 'payment_required';
      const detail = quotaCheck.reason === 'payment_required'
        ? `Free tier limit reached (${quotaCheck.used}/${quotaCheck.limit}). Add a payment method to continue capturing. Resets ${quotaCheck.resetsAt}.`
        : isCaptureLimit
          ? `Monthly capture quota reached (${quotaCheck.used}/${quotaCheck.limit}). Resets ${quotaCheck.resetsAt}. View usage in Settings.`
          : `Storage quota reached. Resets ${quotaCheck.resetsAt}. View usage in Settings.`;

      // 3c: Notify tenant when free tier limit is reached
      if (quotaCheck.reason === 'payment_required') {
        const baseUrl = env.VERIFICATION_BASE_URL
          ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
          : 'https://api.webresourceledger.com';
        ctx.waitUntil(dispatchNotification(env, tenantId, 'limit_reached', {
          used: quotaCheck.used,
          limit: quotaCheck.limit,
          period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          addPaymentUrl: `${baseUrl}/v1/billing/checkout`,
          resetsAt: quotaCheck.resetsAt,
        }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId })));
      }

      return problemResponse(429, detail, quotaHeaders, {
        limitType: 'quota',
        quota: {
          limit: quotaCheck.limit,
          used: quotaCheck.used,
          resource: isCaptureLimit ? 'captures' : 'storage',
          resetsAt: quotaCheck.resetsAt,
        },
      });
    }
  }

  // Global rate limit check (service capacity protection)
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
  }

  // Step 4: Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  // Step 5: Validate url field
  if (body === null || body === undefined || !Object.prototype.hasOwnProperty.call(body, 'url')) {
    return problemResponse(400, "Field 'url' is required");
  }
  if (typeof body.url !== 'string') {
    return problemResponse(400, "Field 'url' must be a string");
  }

  // Step 6: URL validation (SSRF prevention)
  const result = await validateUrl(body.url);
  if (!result.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.ssrf_block', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: result.status, reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail, cip }) ?? Promise.resolve());
    return problemResponse(result.status, result.detail);
  }

  // Step 6b: Threat check (content security screening)
  const threat = await checkUrl(result.url, env);
  if (!threat.safe) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'threatcheck.block',
      tenantId, keyName, keyHashPrefix, authMethod,
      threatTypes: threat.threatTypes,
      responseStatus: 422,
      cip,
    }) ?? Promise.resolve());
    return problemResponse(422, 'URL flagged by content security screening', rlHeaders, {
      threatTypes: threat.threatTypes,
    });
  }
  if (threat.degraded) {
    ctx.waitUntil(log(env, 4, 'security', {
      event: 'threatcheck.api_fail',
      tenantId, keyName, keyHashPrefix, authMethod,
      context: 'pre_capture',
      reason: threat.reason,
      responseStatus: 202,
      cip,
    }) ?? Promise.resolve());
  }

  // Step 7: Generate capture ID
  const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

  // Step 8: Write pending record to KV (synchronously before returning 202)
  try {
    await createCapture(env.DB, captureId, result.url, result.ip, tenantId);
  } catch (err) {
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.kv_create_fail',
      captureId,
      tenantId,
      keyName,
      keyHashPrefix,
      authMethod,
      responseStatus: 500,
      cip,
      errorMessage: String(err?.message ?? '').slice(0, 256),
    }) ?? Promise.resolve());
    return problemResponse(500, 'Could not create capture record');
  }

  // Step 8b: Store pre-capture threat check result
  ctx.waitUntil(
    setCaptureThreatCheck(env.DB, captureId, threat.degraded ? 'unavailable' : 'pass')
      .catch(err => console.warn('threat check storage failed', err))
  );

  // Step 9: Log capture accepted (bridge event: ties captureId to keyName for correlation)
  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.accepted',
    captureId,
    tenantId,
    keyName,
    keyHashPrefix,
    authMethod,
    responseStatus: 202,
    url: result.url,
    cip,
  }) ?? Promise.resolve());

  // Step 10a: Dispatch to queue
  // eIDAS setting captured at quota-check time (quotaCheck.eidasQualified) —
  // no extra D1 round-trip. Legacy auth tenants cannot enable eIDAS (requires payment method).
  const eidasQualified = quotaCheck?.eidasQualified ?? false;
  try {
    await env.CAPTURE_QUEUE.send({
      captureId, url: result.url, ip: result.ip, tenantId, cip,
      enqueuedAt: Date.now(),
      qualifiedTimestamps: eidasQualified,
    });
  } catch (err) {
    await failCapture(env.DB, captureId, 'Queue dispatch failed', true);
    ctx.waitUntil(log(env, 5, 'capture', {
      event: 'capture.enqueue_fail', captureId, tenantId, cip,
      errorMessage: String(err?.message ?? '').slice(0, 256),
    }) ?? Promise.resolve());
    return problemResponse(500, 'Could not dispatch capture');
  }

  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.enqueued',
    captureId,
    tenantId,
    url: result.url,
    cip,
  }) ?? Promise.resolve());

  // Step 10b: Build absolute status URL
  const statusUrl = new URL(`/v1/captures/${captureId}/status`, request.url).href;

  // Step 11: Return 202
  return jsonResponse({
    id: captureId,
    statusUrl,
    note: 'Use GET /v1/captures to list and search your captures.',
  }, 202, { 'Retry-After': '10', ...rlHeaders, ...buildQuotaHeaders(quotaCheck) });
}

async function handleBatchCapture(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Content-Type check
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  // Step 2: Auth check
  const auth = await verifyAuth(request, env, { requiredScope: 'capture' });
  if (!auth.ok) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: auth.reason, keyHashPrefix: auth.keyHashPrefix || null, responseStatus: auth.response.status, cip }) ?? Promise.resolve());
    return auth.response;
  }
  const { tenantId, keyName, keyHashPrefix, authMethod } = auth;

  ctx.waitUntil(
    incrementUsage(env.DB, tenantId, { apiCalls: 1 })
      .catch((err) => {
        console.warn('wrl:usage_increment_fail', { tenantId, errorMessage: String(err?.message ?? '').slice(0, 128) });
      })
  );

  // Step 3: Parse JSON body (before rate limit -- need batch size)
  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  // Step 4: Validate batch structure
  if (!body || !Array.isArray(body.urls)) {
    return problemResponse(400, "Field 'urls' is required and must be an array");
  }
  if (body.urls.length === 0) {
    return problemResponse(400, "Field 'urls' must contain at least one item");
  }
  const ABSOLUTE_MAX_BATCH_SIZE = 100;
  const maxBatchSize = Math.min(parseInt(env.MAX_BATCH_SIZE, 10) || 20, ABSOLUTE_MAX_BATCH_SIZE);
  if (body.urls.length > maxBatchSize) {
    return problemResponse(400, `Batch size exceeds the maximum of ${maxBatchSize} items`);
  }

  // Step 5: Per-tenant rate limit (KV auth: upfront check for entire batch; legacy: single pre-check)
  const rl = await checkCaptureRateLimit(env, auth, clientIp, 'capture', body.urls.length);
  if (rl.exceeded) {
    const limiter = rl.type === 'ip_guard' ? 'capture_per_ip_guard' : rl.type === 'ip' ? 'capture_per_ip' : 'capture_per_tenant';
    ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter, tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
    if (rl.writePromise) ctx.waitUntil(rl.writePromise);
    const retryAfter = String(rl.resetIn || 60);
    const headers = { 'Retry-After': retryAfter };
    if (rl.limit !== undefined) {
      headers['X-RateLimit-Limit'] = String(rl.limit);
      headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = retryAfter;
    }
    if (rl.type === 'tenant') {
      return problemResponse(429, 'Per-tenant rate limit exceeded.', headers, { limitType: 'tenant' });
    }
    return problemResponse(429, 'Rate limit exceeded. Try again later.', headers);
  }
  if (rl.writePromise) ctx.waitUntil(rl.writePromise);
  const rlHeaders = {};
  if (rl.limit !== undefined) {
    rlHeaders['X-RateLimit-Limit'] = String(rl.limit);
    rlHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
    rlHeaders['X-RateLimit-Reset'] = String(rl.resetIn);
  }

  // Step 5b: Monthly quota check -- entire batch (KV auth only -- legacy has no D1 tenant record)
  let quotaCheck = null;
  if (authMethod !== 'legacy') {
    quotaCheck = await checkQuota(env.DB, tenantId, body.urls.length);
    if (!quotaCheck.allowed) {
      ctx.waitUntil(log(env, 4, 'security', {
        event: 'security.quota_exceeded',
        tenantId, keyName, keyHashPrefix, authMethod,
        reason: quotaCheck.reason,
        limit: quotaCheck.limit,
        used: quotaCheck.used,
        requested: body.urls.length,
        responseStatus: 429,
        cip,
      }) ?? Promise.resolve());

      const retryAfterDate = new Date(quotaCheck.resetsAt).toUTCString();
      const quotaHeaders = {
        'Retry-After': retryAfterDate,
        ...rlHeaders,
      };
      const isCaptureLimit = quotaCheck.reason === 'capture_limit' || quotaCheck.reason === 'payment_required';
      const detail = quotaCheck.reason === 'payment_required'
        ? `Batch of ${body.urls.length} captures would exceed free tier limit (${quotaCheck.used}/${quotaCheck.limit}). Add a payment method to continue capturing.`
        : isCaptureLimit
          ? `Batch of ${body.urls.length} captures would exceed monthly quota (${quotaCheck.used}/${quotaCheck.limit}). Resets ${quotaCheck.resetsAt}. View usage in Settings.`
          : `Storage quota reached. Resets ${quotaCheck.resetsAt}. View usage in Settings.`;

      return problemResponse(429, detail, quotaHeaders, {
        limitType: 'quota',
        quota: {
          limit: quotaCheck.limit,
          used: quotaCheck.used,
          requested: body.urls.length,
          resource: isCaptureLimit ? 'captures' : 'storage',
          resetsAt: quotaCheck.resetsAt,
        },
      });
    }
  }

  // Step 6: Global capacity pre-check
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
  }

  // Step 7: Validate all URLs (structure + SSRF) and collect valid results for bulk threat check
  // Phase 7a: validate, tracking original index for ordering
  const items = new Array(body.urls.length).fill(null);
  const queueMessages = [];
  let rateLimitedStatus = null; // 429 or 503 if a limiter fires mid-batch (legacy auth only)
  const usePerUrlRateLimits = auth.authMethod === 'legacy';
  // validatedItems holds { i, item, result } for each URL that passed SSRF validation
  const validatedItems = [];

  for (let i = 0; i < body.urls.length; i++) {
    const item = body.urls[i];

    // If a rate limit fired on a prior iteration, mark all remaining URLs the same way
    if (rateLimitedStatus !== null) {
      const url = (item && typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
      if (rateLimitedStatus === 429) {
        items[i] = batchItemError(url, 429, 'Rate limit exceeded. Try again later.');
      } else {
        items[i] = batchItemError(url, 503, 'Service is at capacity. Retry in 10 seconds.');
      }
      continue;
    }

    // Per-URL rate limits (legacy auth only -- KV auth uses upfront batch check)
    if (usePerUrlRateLimits && i > 0) {
      if (env.CAPTURE_RATE_LIMITER) {
        const { success } = await env.CAPTURE_RATE_LIMITER.limit({ key: clientIp });
        if (!success) {
          ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'capture_per_ip', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
          rateLimitedStatus = 429;
          const url = (item && typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
          items[i] = batchItemError(url, 429, 'Rate limit exceeded. Try again later.');
          continue;
        }
      }
      if (env.GLOBAL_CAPTURE_LIMITER) {
        const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
        if (!success) {
          ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
          rateLimitedStatus = 503;
          const url = (item && typeof item === 'object' && typeof item.url === 'string') ? item.url : '';
          items[i] = batchItemError(url, 503, 'Service is at capacity. Retry in 10 seconds.');
          continue;
        }
      }
    }

    // Validate per-item structure
    if (!item || typeof item !== 'object' || typeof item.url !== 'string') {
      items[i] = batchItemError('', 400, 'Each item must be an object with a string url field');
      continue;
    }

    // SSRF validation
    const result = await validateUrl(item.url);
    if (!result.ok) {
      ctx.waitUntil(log(env, 5, 'security', { event: 'security.ssrf_block', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: result.status, reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail, cip }) ?? Promise.resolve());
      items[i] = batchItemError(item.url, result.status, result.detail);
      continue;
    }

    validatedItems.push({ i, item, result });
  }

  // Phase 7b: Bulk threat check for all SSRF-validated URLs (single fan-out)
  const validatedUrls = validatedItems.map(v => v.result.url);
  const threatResults = await checkUrls(validatedUrls, env);

  // Log degraded results for monitoring
  for (const [url, threat] of threatResults) {
    if (threat.degraded) {
      ctx.waitUntil(log(env, 4, 'security', {
        event: 'threatcheck.api_fail',
        tenantId, keyName, keyHashPrefix, authMethod,
        context: 'pre_capture',
        reason: threat.reason,
        cip,
      }) ?? Promise.resolve());
    }
  }

  // Phase 7c: Process validated items -- create captures for those that pass threat check
  for (const { i, item, result } of validatedItems) {
    const threat = threatResults.get(result.url) ?? { safe: true };

    if (!threat.safe) {
      ctx.waitUntil(log(env, 5, 'security', {
        event: 'threatcheck.block',
        tenantId, keyName, keyHashPrefix, authMethod,
        threatTypes: threat.threatTypes,
        responseStatus: 422,
        cip,
      }) ?? Promise.resolve());
      items[i] = batchItemError(item.url, 422, 'URL flagged by content security screening');
      continue;
    }

    // Generate capture ID
    const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '');

    // Write DB record
    try {
      await createCapture(env.DB, captureId, result.url, result.ip, tenantId);
    } catch (err) {
      ctx.waitUntil(log(env, 5, 'capture', {
        event: 'capture.kv_create_fail',
        captureId,
        tenantId,
        keyName,
        keyHashPrefix,
        authMethod,
        responseStatus: 500,
        cip,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      }) ?? Promise.resolve());
      items[i] = batchItemError(item.url, 500, 'Could not create capture record');
      continue;
    }

    // Store pre-capture threat check result
    ctx.waitUntil(
      setCaptureThreatCheck(env.DB, captureId, threat.degraded ? 'unavailable' : 'pass')
        .catch(err => console.warn('threat check storage failed', err))
    );

    // Log accepted and stage for queue dispatch
    ctx.waitUntil(log(env, 3, 'capture', {
      event: 'capture.accepted',
      captureId,
      tenantId,
      keyName,
      keyHashPrefix,
      authMethod,
      responseStatus: 202,
      url: result.url,
      cip,
    }) ?? Promise.resolve());

    queueMessages.push({
      body: { captureId, url: result.url, ip: result.ip, tenantId, cip, enqueuedAt: Date.now() },
    });

    const statusUrl = new URL(`/v1/captures/${captureId}/status`, request.url).href;
    items[i] = batchItemSuccess(result.url, captureId, statusUrl);
  }

  // Enqueue all accepted captures
  if (queueMessages.length > 0) {
    try {
      await env.CAPTURE_QUEUE.sendBatch(queueMessages);
    } catch (err) {
      for (const qm of queueMessages) {
        await failCapture(env.DB, qm.body.captureId, 'Queue dispatch failed', true);
      }
      ctx.waitUntil(log(env, 5, 'capture', {
        event: 'capture.batch_enqueue_fail', tenantId, cip,
        count: queueMessages.length,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      }) ?? Promise.resolve());
      return problemResponse(500, 'Could not dispatch captures');
    }
  }

  // Step 8: Build summary
  const accepted = items.filter(it => it.status === 202).length;
  const failed = items.length - accepted;

  // Step 9: Log batch event
  ctx.waitUntil(log(env, 3, 'capture', {
    event: 'capture.batch',
    tenantId,
    keyName,
    keyHashPrefix,
    authMethod,
    total: items.length,
    accepted,
    failed,
    cip,
  }) ?? Promise.resolve());

  // Step 10: Return 207
  return jsonResponse({ items, summary: { total: items.length, accepted, failed } }, 207, { ...rlHeaders, ...buildQuotaHeaders(quotaCheck) });
}

async function handleListCaptures(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Auth -- provided by the capture GET auth gate in fetch().
  // List endpoint requires tenant auth; gate sets env._captureAuth before reaching here.
  const captureAuth = env._captureAuth;
  const { tenantId, authMethod } = captureAuth;
  const keyName = null;
  const keyHashPrefix = null;
  // Re-assemble auth-like shape for checkCaptureRateLimit compatibility
  const auth = { ok: true, tenantId, authMethod, keyName, keyHashPrefix, scopes: ['read'] };

  ctx.waitUntil(
    incrementUsage(env.DB, tenantId, { apiCalls: 1 })
      .catch((err) => {
        console.warn('wrl:usage_increment_fail', { tenantId, errorMessage: String(err?.message ?? '').slice(0, 128) });
      })
  );

  // Step 2: Per-tenant rate limit (dual-layer for KV auth, IP-only for legacy)
  const rl = await checkCaptureRateLimit(env, auth, clientIp, 'capture');
  if (rl.exceeded) {
    const limiter = rl.type === 'ip_guard' ? 'capture_per_ip_guard' : rl.type === 'ip' ? 'capture_per_ip' : 'capture_per_tenant';
    ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter, tenantId: auth.tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
    if (rl.writePromise) ctx.waitUntil(rl.writePromise);
    const retryAfter = String(rl.resetIn || 60);
    const headers = { 'Retry-After': retryAfter };
    if (rl.limit !== undefined) {
      headers['X-RateLimit-Limit'] = String(rl.limit);
      headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = retryAfter;
    }
    if (rl.type === 'tenant') {
      return problemResponse(429, 'Per-tenant rate limit exceeded.', headers, { limitType: 'tenant' });
    }
    return problemResponse(429, 'Rate limit exceeded. Try again later.', headers);
  }
  if (rl.writePromise) ctx.waitUntil(rl.writePromise);
  const rlHeaders = {};
  if (rl.limit !== undefined) {
    rlHeaders['X-RateLimit-Limit'] = String(rl.limit);
    rlHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
    rlHeaders['X-RateLimit-Reset'] = String(rl.resetIn);
  }
  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId: auth.tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
  }

  // Step 3: Parse query params
  const params = new URL(request.url).searchParams;

  // limit: default 20, clamp >100, reject <1 / NaN / non-integer
  let limit = 20;
  const limitParam = params.get('limit');
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return problemResponse(400, "Query parameter 'limit' must be a positive integer.");
    }
    limit = Math.min(parsed, 100);
  }

  // offset: default 0, reject negative / NaN / non-integer
  let offset = 0;
  const offsetParam = params.get('offset');
  if (offsetParam !== null) {
    const parsed = Number(offsetParam);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return problemResponse(400, "Query parameter 'offset' must be a non-negative integer.");
    }
    offset = parsed;
  }

  const statusParam = params.get('status') || undefined;
  if (statusParam !== undefined && !['pending', 'complete', 'failed'].includes(statusParam)) {
    return problemResponse(400, "Query parameter 'status' must be 'pending', 'complete', or 'failed'.");
  }

  // url: optional prefix filter, min 4 chars, max 200, no % or _ wildcards
  let urlParam;
  const urlRaw = params.get('url');
  if (urlRaw !== null) {
    if (urlRaw.length < 4) {
      return problemResponse(400, "Query parameter 'url' must be at least 4 characters.");
    }
    if (urlRaw.length > 200) {
      return problemResponse(400, "Query parameter 'url' must be 200 characters or fewer.");
    }
    if (urlRaw.indexOf('%') !== -1 || urlRaw.indexOf('_') !== -1) {
      return problemResponse(400, "Query parameter 'url' must not contain '%' or '_' characters.");
    }
    urlParam = urlRaw;
  }

  // created_after / created_before: ISO 8601 strings
  const createdAfter = params.get('created_after') || undefined;
  const createdBefore = params.get('created_before') || undefined;
  if (createdAfter && isNaN(Date.parse(createdAfter))) {
    return problemResponse(400, "Query parameter 'created_after' must be a valid ISO 8601 date.");
  }
  if (createdBefore && isNaN(Date.parse(createdBefore))) {
    return problemResponse(400, "Query parameter 'created_before' must be a valid ISO 8601 date.");
  }
  if (createdAfter && createdBefore && createdBefore <= createdAfter) {
    return problemResponse(400, "Query parameter 'created_before' must be after 'created_after'.");
  }

  // sort: enum
  const sortRaw = params.get('sort');
  let sort = '-created_at';
  if (sortRaw !== null) {
    if (sortRaw !== 'created_at' && sortRaw !== '-created_at') {
      return problemResponse(400, "Query parameter 'sort' must be 'created_at' or '-created_at'.");
    }
    sort = sortRaw;
  }

  // schedule_id: optional exact filter; validated against SCHEDULE_ID_RE before use
  let scheduleIdParam;
  const scheduleIdRaw = params.get('schedule_id');
  if (scheduleIdRaw !== null) {
    if (!SCHEDULE_ID_RE.test(scheduleIdRaw)) {
      return problemResponse(400, "Query parameter 'schedule_id' must be a valid schedule ID (sch_ followed by 32 hex characters).");
    }
    scheduleIdParam = scheduleIdRaw;
  }

  // Step 4: Start timer
  const start = Date.now();

  // Step 5: List captures
  let result;
  try {
    result = await listCaptures(env.DB, auth.tenantId, {
      offset,
      limit,
      status: statusParam,
      url: urlParam,
      created_after: createdAfter,
      created_before: createdBefore,
      sort,
      schedule_id: scheduleIdParam,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    ctx.waitUntil(log(env, 5, 'capture', { event: 'capture.list_fail', tenantId: auth.tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 500, errorClass: err.constructor.name, durationMs, cip }) ?? Promise.resolve());
    return problemResponse(500, 'Could not list captures');
  }

  // Step 6: Build CaptureSummary projection (exclude ip, artifacts.*, wacz.key)
  const data = result.data.map(r => {
    const summary = {
      id: r.captureId,
      status: r.status,
      url: r.url,
      createdAt: r.createdAt,
    };
    if (r.status === 'complete') {
      summary.completedAt = r.completedAt;
      summary.renderQuality = r.renderQuality ?? 'full';
      if (r.wacz) {
        summary.timestamps = {
          standard: r.wacz.timestampStatus === 'present',
          qualified: r.wacz.qualifiedTimestampStatus === 'present',
        };
      }
    } else if (r.status === 'failed') {
      summary.failedAt = r.failedAt;
      summary.error = r.error;
      summary.retryable = r.retryable;
    } else if (r.status === 'quarantined') {
      summary.quarantineReason = r.quarantineReason;
      summary.quarantinedAt = r.quarantinedAt;
    }
    return summary;
  });

  // Step 7: Log success
  const durationMs = Date.now() - start;
  ctx.waitUntil(log(env, 6, 'capture', {
    event: 'capture.list',
    tenantId: auth.tenantId,
    keyName,
    keyHashPrefix,
    authMethod,
    responseStatus: 200,
    resultCount: data.length,
    status: statusParam || 'all',
    offset,
    durationMs,
    cip,
  }) ?? Promise.resolve());

  // Step 8: Return response
  return jsonResponse({ data, pagination: result.pagination }, 200, {
    'Cache-Control': 'private, no-store',
    ...rlHeaders,
  });
}

// ---------------------------------------------------------------------------
// Admin: tenant config
// ---------------------------------------------------------------------------

async function handleGetTenantConfig(request, env, ctx, match) {
  const tenantId = match[1];
  const config = await getTenantConfig(env.DB, tenantId);
  if (!config) {
    return problemResponse(404, 'Tenant configuration not found.');
  }
  return jsonResponse(config);
}

async function handlePutTenantConfig(request, env, ctx, match) {
  const tenantId = match[1];

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return problemResponse(415, 'Content-Type must be application/json');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return problemResponse(400, 'Request body must be valid JSON');
  }

  if (!body || typeof body !== 'object') {
    return problemResponse(400, 'Request body must be a JSON object');
  }

  let saved;
  try {
    saved = await setTenantConfig(env.DB, tenantId, body, 'admin_key');
  } catch (err) {
    if (err.message && (err.message.startsWith('rateLimit.') || err.message.startsWith('quotas.') || err.message.startsWith('Invalid tenantId'))) {
      return problemResponse(400, err.message);
    }
    throw err;
  }
  ctx.waitUntil(log(env, 3, 'admin', {
    event: 'admin.tenant_config_updated',
    tenantId,
    updatedBy: 'admin_key',
  }) ?? Promise.resolve());
  return jsonResponse(saved);
}

// Public endpoint -- no authentication required for individual captures (#169).
// Response MUST NOT include: ip, raw R2 keys (artifacts.* values, wacz.key).
// Static 404 message for all non-200 cases -- no enumeration of ID existence.
// If env._captureAuth is set (authenticated request), enforce tenant isolation so
// authenticated tenants only see their own captures.
async function handleGetCapture(request, env, ctx, match) {
  const captureId = match[1];
  const captureAuth = env._captureAuth;

  const record = await getCapture(env.DB, captureId);

  if (!record) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Tenant isolation: only enforced when the request is authenticated.
  // Public (unauthenticated) requests can access any capture by ID.
  // SECURITY: Return identical 404 for cross-tenant (not 403) to prevent enumeration.
  if (captureAuth && record.tenantId !== captureAuth.tenantId) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  if (record.status !== 'complete' && record.status !== 'quarantined') {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Quarantined captures: return metadata without artifact URLs
  if (record.status === 'quarantined') {
    const body = {
      id: record.captureId,
      status: 'quarantined',
      url: record.url,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      quarantineReason: record.quarantineReason,
      quarantinedAt: record.quarantinedAt,
      // threatCheck reflects the pre-capture result; re-scan verdict triggered quarantine
      threatCheck: record.threatCheck,
    };
    if (record.captureSettings) body.captureSettings = record.captureSettings;
    return jsonResponse(body, 200, {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
  }

  const base = new URL(request.url).origin;
  const artifactBase = `${base}/v1/captures/${captureId}/artifacts`;

  const artifacts = {
    screenshot: `${artifactBase}/screenshot`,
    html: `${artifactBase}/html`,
  };
  if (record.artifacts?.headers) {
    artifacts.headers = `${artifactBase}/headers`;
  }
  if (record.artifacts?.screenshotBefore) {
    artifacts.screenshotBefore = `${artifactBase}/screenshot-before`;
  }

  const body = {
    id: record.captureId,
    status: 'complete',
    url: record.url,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    renderQuality: record.renderQuality ?? 'full',
    artifacts,
  };

  if (record.threatCheck) {
    body.threatCheck = record.threatCheck;
  }

  if (record.render) {
    body.render = record.render;
  }

  if (record.captureSettings) {
    body.captureSettings = record.captureSettings;
  }

  if (record.wacz) {
    body.wacz = {
      url: `${artifactBase}/wacz`,
      size: record.wacz.size,
      bundleHash: record.wacz.bundleHash,
    };
    body.verifyUrl = `${base}/v1/verify/${captureId}`;
    body.certificateUrl = `${base}/v1/captures/${captureId}/certificate`;
    body.timestamps = {
      standard: record.wacz.timestampStatus === 'present',
      qualified: record.wacz.qualifiedTimestampStatus === 'present',
    };
  }

  return jsonResponse(body, 200, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleGetCaptureArtifact(request, env, ctx, match) {
  const captureId = match[1];
  const artifactName = match[2];
  const captureAuth = env._captureAuth;

  // All artifact types are now public (#169).
  // Rate-limit unauthenticated requests per IP using the verify limiter.
  if (!captureAuth && env.VERIFY_RATE_LIMITER) {
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      const cip = await computeCip(env, clientIp);
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'artifact_public', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const record = await getCapture(env.DB, captureId);

  if (!record) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Tenant isolation: only enforce when authenticated.
  // Public requests can access any capture's artifacts by capture ID.
  // SECURITY: Return identical 404 for cross-tenant (not 403) to prevent enumeration.
  if (captureAuth && record.tenantId !== captureAuth.tenantId) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Quarantined captures: return 451 before the generic status check
  if (record.status === 'quarantined') {
    return problemResponse(451, 'Capture artifacts restricted due to content security policy', {
      'Cache-Control': 'no-store',
    }, {
      quarantineReason: record.quarantineReason,
      quarantinedAt: record.quarantinedAt,
    });
  }

  // SECURITY ADVISORY: check status === 'complete' same as metadata endpoint
  if (record.status !== 'complete') {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Map kebab artifact names to camelCase KV keys
  const artifactKey = artifactName === 'screenshot-before' ? 'screenshotBefore' : artifactName;

  const r2Key = artifactName === 'wacz'
    ? record.wacz?.key
    : record.artifacts?.[artifactKey];

  if (!r2Key) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const obj = await env.BUCKET.get(r2Key);

  if (obj === null) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  const contentTypes = {
    'screenshot-before': 'image/png',
    screenshot: 'image/png',
    html:       'text/plain',       // CRITICAL: never text/html (XSS)
    headers:    'application/json',
    wacz:       'application/wacz+zip',
  };

  const filenames = {
    'screenshot-before': 'screenshot-before.png',
    screenshot: 'screenshot.png',
    html:       'rendered.html',
    headers:    'headers.json',
    wacz:       'bundle.wacz',
  };

  const buffer = await obj.arrayBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentTypes[artifactName],
      'Content-Disposition': `attachment; filename="${filenames[artifactName]}"`,
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Public endpoint -- no authentication required (#169).
// Rate-limited per IP using the verify limiter (same as artifact endpoint).
// Returns a deterministic, signed PDF certificate for FRE 902(13) use.
async function handleGetCertificate(request, env, ctx, match) {
  const captureId  = match[1];
  const captureAuth = env._captureAuth;

  // Rate-limit unauthenticated requests per IP.
  if (!captureAuth && env.VERIFY_RATE_LIMITER) {
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      const cip = await computeCip(env, clientIp);
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'certificate_public', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const record = await getCapture(env.DB, captureId);

  if (!record) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // Tenant isolation: only enforced when authenticated.
  if (captureAuth && record.tenantId !== captureAuth.tenantId) {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  // 451 for quarantined (before generic status check)
  if (record.status === 'quarantined') {
    return problemResponse(451, 'Capture artifacts restricted due to content security policy', {
      'Cache-Control': 'no-store',
    }, {
      quarantineReason: record.quarantineReason,
      quarantinedAt: record.quarantinedAt,
    });
  }

  if (record.status !== 'complete') {
    return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
  }

  if (!record.wacz) {
    return problemResponse(404, 'Certificate not available for this capture', { 'Cache-Control': 'no-store' });
  }

  const signingKeys = await getSigningKeys(env);
  if (!signingKeys) {
    return problemResponse(503, 'Certificate generation unavailable: signing key not configured', {
      'Cache-Control': 'no-store',
    });
  }

  const origin = new URL(request.url).origin;
  const { pdfBytes, signature } = await generateCertificate(record, signingKeys, origin);

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${captureId}.pdf"`,
      'Content-Length': String(pdfBytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Signature-Ed25519, X-Signature-Key-Id',
      'X-Signature-Ed25519': signature,
      'X-Signature-Key-Id': signingKeys.keyId,
    },
  });
}

// Authenticated endpoint -- requires read scope.
// Compares two captures owned by the authenticated tenant and returns a
// structured diff across HTML, screenshot, and headers.
// Returns 404 (not 403) for cross-tenant or missing captures (no enumeration).
// Returns 451 if either capture is quarantined.
async function handleDiffCaptures(request, env, ctx, match) {
  const start = Date.now();
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Auth -- required, read scope.
  // The fetch() gate runs optional auth for all /v1/captures/* GET routes.
  // If credentials were absent, env._captureAuth is unset → enforce 401 here.
  // If credentials were present but invalid, fetch() already returned 401.
  const captureAuth = env._captureAuth;
  if (!captureAuth) {
    ctx.waitUntil(log(env, 5, 'security', { event: 'security.auth_fail', reason: 'missing_credentials', responseStatus: 401, cip }) ?? Promise.resolve());
    return problemResponse(401, 'Authentication required.');
  }
  const { tenantId, authMethod } = captureAuth;
  const keyName = null;
  const keyHashPrefix = null;
  // Re-assemble auth-like shape for checkCaptureRateLimit compatibility
  const auth = { ok: true, tenantId, authMethod, keyName, keyHashPrefix, scopes: ['read'] };

  ctx.waitUntil(
    incrementUsage(env.DB, tenantId, { apiCalls: 1 })
      .catch((err) => {
        console.warn('wrl:usage_increment_fail', { tenantId, errorMessage: String(err?.message ?? '').slice(0, 128) });
      })
  );

  // Step 2: Per-tenant rate limit (dual-layer for KV auth, IP-only for legacy)
  const rl = await checkCaptureRateLimit(env, auth, clientIp, 'capture');
  if (rl.exceeded) {
    const limiter = rl.type === 'ip_guard' ? 'capture_per_ip_guard' : rl.type === 'ip' ? 'capture_per_ip' : 'capture_per_tenant';
    ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter, tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 429, cip }) ?? Promise.resolve());
    if (rl.writePromise) ctx.waitUntil(rl.writePromise);
    const retryAfter = String(rl.resetIn || 60);
    const headers = { 'Retry-After': retryAfter };
    if (rl.limit !== undefined) {
      headers['X-RateLimit-Limit'] = String(rl.limit);
      headers['X-RateLimit-Remaining'] = '0';
      headers['X-RateLimit-Reset'] = retryAfter;
    }
    if (rl.type === 'tenant') {
      return problemResponse(429, 'Per-tenant rate limit exceeded.', headers, { limitType: 'tenant' });
    }
    return problemResponse(429, 'Rate limit exceeded. Try again later.', headers);
  }
  if (rl.writePromise) ctx.waitUntil(rl.writePromise);

  if (env.GLOBAL_CAPTURE_LIMITER) {
    const { success } = await env.GLOBAL_CAPTURE_LIMITER.limit({ key: 'global' });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.capacity_limit', tenantId, keyName, keyHashPrefix, authMethod, responseStatus: 503, cip }) ?? Promise.resolve());
      return problemResponse(503, 'Service is at capacity. Retry in 10 seconds.', { 'Retry-After': '10' });
    }
  }

  // Step 3: Extract and validate capture IDs from route match
  const id1 = match[1]; // base
  const id2 = match[2]; // target

  if (id1 === id2) {
    return problemResponse(400, 'Cannot diff a capture with itself.');
  }

  // Step 4: Parse ?include query param
  const url = new URL(request.url);
  const VALID_SECTIONS = new Set(['summary', 'html', 'screenshot', 'headers']);
  const rawInclude = url.searchParams.get('include') || 'summary,html,screenshot,headers';
  const include = new Set(rawInclude.split(',').map((s) => s.trim()).filter(Boolean));

  for (const section of include) {
    if (!VALID_SECTIONS.has(section)) {
      return problemResponse(400, `Unknown section: '${section}'. Valid values: summary, html, screenshot, headers.`);
    }
  }
  // summary is always included
  include.add('summary');

  // Step 5: Fetch both capture records
  const [base, target] = await Promise.all([
    getCapture(env.DB, id1),
    getCapture(env.DB, id2),
  ]);

  // Tenant isolation + existence + status checks -- identical 404 for all failure cases (no enumeration)
  const notFound = problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });

  if (!base || base.tenantId !== tenantId) return notFound;
  if (!target || target.tenantId !== tenantId) return notFound;

  // Check for quarantine before status check (451 takes precedence over 404)
  if (base.status === 'quarantined' || target.status === 'quarantined') {
    return problemResponse(451, 'Capture artifacts restricted due to content security policy', {
      'Cache-Control': 'no-store',
    });
  }

  if (base.status !== 'complete') return notFound;
  if (target.status !== 'complete') return notFound;

  // Step 6: Fetch artifacts from R2 for requested sections
  let baseHtml = null;
  let targetHtml = null;
  let htmlTruncated = false;
  let baseHeadersRaw = null;
  let targetHeadersRaw = null;
  let baseScreenshotHash = null;
  let targetScreenshotHash = null;

  const SIZE_GUARD = 2 * 1024 * 1024; // 2 MB

  if (include.has('html')) {
    const baseHtmlKey = base.artifacts?.html;
    const targetHtmlKey = target.artifacts?.html;

    if (baseHtmlKey && targetHtmlKey) {
      // Size guard: use head() to avoid fetching large bodies unnecessarily
      const [baseMeta, targetMeta] = await Promise.all([
        env.BUCKET.head(baseHtmlKey),
        env.BUCKET.head(targetHtmlKey),
      ]);

      if ((baseMeta?.size ?? 0) > SIZE_GUARD || (targetMeta?.size ?? 0) > SIZE_GUARD) {
        htmlTruncated = true;
      } else {
        const [baseObj, targetObj] = await Promise.all([
          env.BUCKET.get(baseHtmlKey),
          env.BUCKET.get(targetHtmlKey),
        ]);
        if (baseObj) baseHtml = await baseObj.text();
        if (targetObj) targetHtml = await targetObj.text();
      }
    }
  }

  if (include.has('headers')) {
    const baseHeadersKey = base.artifacts?.headers;
    const targetHeadersKey = target.artifacts?.headers;

    const [baseHeadersObj, targetHeadersObj] = await Promise.all([
      baseHeadersKey ? env.BUCKET.get(baseHeadersKey) : Promise.resolve(null),
      targetHeadersKey ? env.BUCKET.get(targetHeadersKey) : Promise.resolve(null),
    ]);

    if (baseHeadersObj) {
      try { baseHeadersRaw = JSON.parse(await baseHeadersObj.text()); } catch (err) {
        console.warn('wrl:diff_headers_parse_fail', { captureId: id1, errorMessage: String(err?.message ?? '').slice(0, 128) });
      }
    }
    if (targetHeadersObj) {
      try { targetHeadersRaw = JSON.parse(await targetHeadersObj.text()); } catch (err) {
        console.warn('wrl:diff_headers_parse_fail', { captureId: id2, errorMessage: String(err?.message ?? '').slice(0, 128) });
      }
    }
  }

  if (include.has('screenshot')) {
    const baseScreenshotKey = base.artifacts?.screenshot;
    const targetScreenshotKey = target.artifacts?.screenshot;

    // Hash-only comparison via head() -- never fetch full screenshot bodies
    const [baseMeta, targetMeta] = await Promise.all([
      baseScreenshotKey ? env.BUCKET.head(baseScreenshotKey) : Promise.resolve(null),
      targetScreenshotKey ? env.BUCKET.head(targetScreenshotKey) : Promise.resolve(null),
    ]);

    // Use etag as the hash; R2 returns etag for all objects
    baseScreenshotHash = baseMeta?.etag ?? null;
    targetScreenshotHash = targetMeta?.etag ?? null;
  }

  // Step 7: Compute diffs
  const htmlDiff = include.has('html')
    ? (htmlTruncated
        ? { changed: true, truncated: true, stats: { additions: 0, deletions: 0 }, hunks: [] }
        : diffHtml(baseHtml ?? '', targetHtml ?? ''))
    : null;

  const headersDiff = include.has('headers')
    ? diffHeaders(baseHeadersRaw, targetHeadersRaw)
    : null;

  const screenshotDiff = include.has('screenshot')
    ? diffScreenshot(baseScreenshotHash, targetScreenshotHash)
    : null;

  // Step 8: Build summary using effective diffs for all sections (null = not included)
  const summaryHtmlDiff = htmlDiff ?? { changed: false, stats: { additions: 0, deletions: 0 } };
  const summaryHeadersDiff = headersDiff ?? { changed: false, added: [], removed: [], modified: [] };
  const summaryScreenshotDiff = screenshotDiff ?? { changed: false };
  const changeSummary = computeChangeSummary(summaryHtmlDiff, summaryHeadersDiff, summaryScreenshotDiff);

  // Step 9: Assemble response
  const responseBody = {
    base: {
      id: base.captureId,
      url: base.url,
      createdAt: base.createdAt,
    },
    target: {
      id: target.captureId,
      url: target.url,
      createdAt: target.createdAt,
    },
    summary: {
      changed: changeSummary.changed,
      sections: {
        html: changeSummary.html,
        screenshot: changeSummary.screenshot,
        headers: changeSummary.headers,
      },
    },
  };

  if (include.has('html') && htmlDiff !== null) {
    responseBody.html = htmlDiff;
  }
  if (include.has('screenshot') && screenshotDiff !== null) {
    responseBody.screenshot = screenshotDiff;
  }
  if (include.has('headers') && headersDiff !== null) {
    responseBody.headers = headersDiff;
  }

  ctx.waitUntil(log(env, 3, 'diff', {
    event: 'diff.computed',
    tenantId,
    captureId1: id1,
    captureId2: id2,
    durationMs: Date.now() - start,
    sections: Array.from(include),
    changed: changeSummary.changed,
  }) ?? Promise.resolve());

  return jsonResponse(responseBody, 200, { 'Cache-Control': 'no-store' });
}

// Public endpoint -- no authentication. Rate-limited per IP.
// Caches verified results publicly; non-verified results are not cached.
async function handleVerifyCapture(request, env, ctx, match) {
  const captureId = match[1];
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);

  // Step 1: Rate limit check
  // CF-Connecting-IP is always present in production Workers; 'unknown' fallback
  // applies only in local dev, where all requests share one bucket.
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'verify', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  // Step 1b: Quarantine check -- must happen before performVerification (which returns not_found for quarantined)
  const qRecord = await getCapture(env.DB, captureId);
  if (qRecord && qRecord.status === 'quarantined') {
    return problemResponse(451, 'Capture artifacts restricted due to content security policy', {
      'Cache-Control': 'no-store',
    }, {
      quarantineReason: qRecord.quarantineReason,
      quarantinedAt: qRecord.quarantinedAt,
    });
  }

  // Steps 2-6: Delegate to shared orchestrator (KV lookup, key resolution, R2, verify)
  const verification = await performVerification({ DB: env.DB, BUCKET: env.BUCKET, SIGNING_KEY: env.SIGNING_KEY }, captureId);

  if (!verification.ok) {
    if (verification.reason === 'not_found') {
      return problemResponse(404, 'Capture not found', { 'Cache-Control': 'no-store' });
    }
    if (verification.reason === 'key_unavailable') {
      ctx.waitUntil(log(env, 5, 'security', {
        event: 'signing.key_unavailable',
        reason: verification.detail,
        captureId,
        cip,
      }) ?? Promise.resolve());
      return problemResponse(503, 'Verification service is not configured');
    }
    if (verification.reason === 'r2_missing') {
      // Data loss: WACZ key recorded in KV but object missing from R2.
      // Return a verification result (not 500) -- this is an observable fact.
      const { record } = verification;
      return jsonResponse({
        verified: false,
        capture: { id: record.captureId, url: record.url, createdAt: record.createdAt, completedAt: record.completedAt, renderQuality: record.renderQuality ?? 'full' },
        signing: null,
        checks: [
          { name: 'artifactHashes', status: 'fail', detail: 'WACZ bundle not found in storage' },
          { name: 'bundleHash',     status: 'fail', detail: 'WACZ bundle not found in storage' },
          { name: 'signature',      status: 'fail', detail: 'WACZ bundle not found in storage' },
        ],
      }, 200, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    }
    if (verification.reason === 'too_large') {
      return problemResponse(422, 'WACZ bundle exceeds maximum verifiable size');
    }
    return problemResponse(500, 'Verification error');
  }

  const { record, result } = verification;

  // Step 7: Build response body
  const body = {
    verified: result.verified,
    capture: {
      id: record.captureId,
      url: record.url,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      renderQuality: record.renderQuality ?? 'full',
    },
    signing: result.capture || null,
    checks: result.checks,
  };

  if (record.captureSettings) {
    body.captureSettings = record.captureSettings;
  }

  // Step 8: Cache-Control -- only cache verified results
  const cacheControl = result.verified
    ? 'public, max-age=86400, stale-while-revalidate=604800'
    : 'no-store';

  // Step 9: Content negotiation -- serve HTML to browsers
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/html')) {
    return htmlVerifyResponse(captureId, new URL(request.url).origin, cacheControl);
  }

  return jsonResponse(body, 200, {
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
    'Vary': 'Accept',
  });
}

async function handleGetSigningKey(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'signing_key', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const keys = await getSigningKeys(env);
  if (!keys) {
    ctx.waitUntil(log(env, 5, 'security', {
      event: 'signing.key_unavailable',
      reason: env.SIGNING_KEY ? 'key_invalid' : 'key_absent',
      cip,
    }) ?? Promise.resolve());
    return problemResponse(503, 'Signing is not configured');
  }

  // Use Array.from to avoid spread operator RangeError on large arrays
  const publicKeyBase64 = btoa(Array.from(keys.publicKeyBytes.slice()).map(b => String.fromCharCode(b)).join(''));

  return jsonResponse({ algorithm: 'Ed25519', publicKey: publicKeyBase64, keyId: keys.keyId }, 200, {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleGetSigningKeys(request, env, ctx) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const cip = await computeCip(env, clientIp);
  if (env.VERIFY_RATE_LIMITER) {
    const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      ctx.waitUntil(log(env, 4, 'security', { event: 'security.rate_limit', limiter: 'signing_keys', cip }) ?? Promise.resolve());
      return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
  }

  const archived = await listArchivedSigningKeys(env.DB);

  return jsonResponse({ keys: archived }, 200, {
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
  });
}

async function handleCaptureStatus(request, env, ctx, match) {
  // match[1] is validated by regex: cap_[a-f0-9]{32}
  const captureId = match[1];
  const captureAuth = env._captureAuth;

  const record = await getCapture(env.DB, captureId);

  // Public endpoint (#169): no auth required for individual captures.
  // If env._captureAuth is set (authenticated request), enforce tenant isolation.
  // SECURITY: Return identical 404 for cross-tenant (not 403) to prevent enumeration.
  if (!record) return problemResponse(404, 'Capture not found');
  if (captureAuth && record.tenantId !== captureAuth.tenantId) {
    return problemResponse(404, 'Capture not found');
  }

  const headers = { 'Cache-Control': 'no-store' };

  if (record.status === 'pending') {
    return jsonResponse({ id: captureId, status: 'pending' }, 200, {
      ...headers,
      'Retry-After': '10',
    });
  }

  if (record.status === 'quarantined') {
    return jsonResponse({
      id: captureId,
      status: 'quarantined',
      quarantineReason: record.quarantineReason,
      quarantinedAt: record.quarantinedAt,
    }, 200, headers);
  }

  if (record.status === 'complete') {
    const captureUrl = new URL(`/v1/captures/${captureId}`, request.url).href;
    return jsonResponse({ id: captureId, status: 'complete', captureUrl }, 200, headers);
  }

  // failed
  return jsonResponse({
    id: captureId,
    status: 'failed',
    error: record.error,
    retryable: record.retryable,
  }, 200, headers);
}

