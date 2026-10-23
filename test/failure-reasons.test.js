/**
 * Failure reasons users can act on (phase 0121).
 *
 * - A capture keeps the reason of its last failed attempt, so a capture that
 *   runs out of retries says why instead of "permanently failed after all
 *   retry attempts".
 * - A Cloudflare challenge page fails the capture instead of being signed and
 *   stored as if it were the page (GH #317).
 * - Network and screenshot errors get plain messages.
 * - The dashboard shows the reason in the capture list.
 */
import { env, createExecutionContext, createMessageBatch, getQueueResult, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from '../src/index.js';
import { performCapture, categorizeError, classifyBotCheck, CAPTURE_MAX_ATTEMPTS } from '../src/capture.js';
import { createCapture, getCapture, recordAttemptError, completeCapture } from '../src/db.js';
import { SUBMIT_VIEW_JS } from '../src/ui/ui-submit.js';
import { TEST_URL, TEST_IP } from './fixtures.js';

const BOT_CHECK_MESSAGE =
  'The site showed a Cloudflare bot check instead of the page, so WRL did not capture it. Failed captures are not counted or billed.';

function capId() {
  return 'cap_' + crypto.randomUUID().replace(/-/g, '');
}

async function rawError(captureId) {
  const row = await env.DB.prepare('SELECT status, error FROM captures WHERE id = ?').bind(captureId).first();
  return row;
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM captures').run();
  fetchMock.activate();
  fetchMock.disableNetConnect();
  // Header fetch runs alongside rendering; answer it so it never hits the network.
  fetchMock.get(new URL(TEST_URL).origin).intercept({ path: () => true, method: () => true }).reply(200, '').persist();
});

afterEach(() => {
  fetchMock.deactivate();
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

describe('categorizeError -- messages users can act on', () => {
  it('explains a blank page instead of quoting the internal reason code', () => {
    const r = categorizeError(new Error('Captured page is not target content (blank-page)'));
    expect(r.message).toBe('The page loaded but showed nothing (blank page)');
    expect(r.retryable).toBe(false);
  });

  it('explains a browser error page', () => {
    const r = categorizeError(new Error('Captured page is not target content (chromium-error-page)'));
    expect(r.message).toBe('The browser showed an error page instead of the site');
    expect(r.retryable).toBe(false);
  });

  it('a bot check fails for good with a message that says what happened and what it costs', () => {
    expect(categorizeError(new Error('Bot check: Cloudflare challenge (title, challenge-platform)'))).toEqual({
      message: BOT_CHECK_MESSAGE,
      retryable: false,
    });
  });

  it('a screenshot the browser could not take is named as such and retried', () => {
    expect(
      categorizeError(new Error('page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot')),
    ).toEqual({ message: 'The browser could not take a screenshot of this page', retryable: true });
  });

  it('an address that does not resolve is named', () => {
    expect(categorizeError(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.invalid/'))).toEqual({
      message: "The site's address could not be found (DNS)",
      retryable: true,
    });
  });

  it('a refused connection is named', () => {
    expect(categorizeError(new Error('page.goto: net::ERR_CONNECTION_REFUSED at https://x.example/'))).toEqual({
      message: 'The site refused the connection',
      retryable: true,
    });
  });

  it('an invalid TLS certificate fails for good, since retrying cannot fix it', () => {
    expect(categorizeError(new Error('page.goto: net::ERR_CERT_DATE_INVALID at https://x.example/'))).toEqual({
      message: "The site's TLS certificate is not valid",
      retryable: false,
    });
  });

  it('other navigation errors keep the general message', () => {
    expect(categorizeError(new Error('page.goto: net::ERR_ABORTED at https://x.example/'))).toEqual({
      message: 'Could not navigate to the target URL',
      retryable: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Challenge detection
// ---------------------------------------------------------------------------

describe('classifyBotCheck -- two signals before a page counts as a challenge', () => {
  it('the Cloudflare challenge title plus its script is a challenge', () => {
    const r = classifyBotCheck({ title: 'Just a moment...', hasChallengeOptions: false, hasChallengeScript: true, hasChallengeMarkup: false });
    expect(r.detected).toBe(true);
    expect(r.vendor).toBe('cloudflare');
    expect(r.signals).toEqual(['title', 'challenge-platform']);
  });

  it('the old "Attention Required" title plus challenge options is a challenge', () => {
    const r = classifyBotCheck({ title: 'Attention Required! | Cloudflare', hasChallengeOptions: true, hasChallengeScript: false, hasChallengeMarkup: false });
    expect(r.detected).toBe(true);
  });

  it('script and markup without the title is a challenge (localized titles)', () => {
    const r = classifyBotCheck({ title: 'Un instant…', hasChallengeOptions: false, hasChallengeScript: true, hasChallengeMarkup: true });
    expect(r.detected).toBe(true);
  });

  it('the title alone is not enough (a blog post can be called "Just a moment...")', () => {
    const r = classifyBotCheck({ title: 'Just a moment...', hasChallengeOptions: false, hasChallengeScript: false, hasChallengeMarkup: false });
    expect(r.detected).toBe(false);
  });

  it('a normal page is not a challenge', () => {
    const r = classifyBotCheck({ title: 'Example Domain', hasChallengeOptions: false, hasChallengeScript: false, hasChallengeMarkup: false });
    expect(r.detected).toBe(false);
    expect(r.signals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The reason survives retries
// ---------------------------------------------------------------------------

describe('performCapture -- keeps the reason of a failed attempt', () => {
  it('a retryable failure stays pending and stores the reason for later', async () => {
    const id = capId();
    await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    const screenshotFails = async () => {
      throw new Error('page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot');
    };

    const result = await performCapture(env, TEST_URL, TEST_IP, id, 'default', undefined, screenshotFails);

    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(await rawError(id)).toEqual({ status: 'pending', error: 'The browser could not take a screenshot of this page' });
  });

  it('a pending capture does not show an error to users yet', async () => {
    const id = capId();
    await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    await recordAttemptError(env.DB, id, 'Page did not finish loading within 20 seconds');

    const record = await getCapture(env.DB, id);
    expect(record.status).toBe('pending');
    expect(record.error).toBeNull();
  });

  it('a bot check fails the capture at once with the bot-check message', async () => {
    const id = capId();
    await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    const challenge = async () => {
      throw new Error('Bot check: Cloudflare challenge (title, challenge-platform)');
    };

    const result = await performCapture(env, TEST_URL, TEST_IP, id, 'default', undefined, challenge);

    expect(result).toMatchObject({ ok: false, retryable: false });
    const record = await getCapture(env.DB, id);
    expect(record.status).toBe('failed');
    expect(record.error).toBe(BOT_CHECK_MESSAGE);
    expect(record.retryable).toBe(false);
  });

  it('a capture that completes after a failed attempt carries no stale error', async () => {
    const id = capId();
    await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    await recordAttemptError(env.DB, id, 'Browser session expired');
    await completeCapture(env.DB, id, { screenshot: 'x', html: 'y' });

    expect(await rawError(id)).toEqual({ status: 'complete', error: null });
  });
});

describe('dead-letter queue -- the final failure names the last reason', () => {
  async function runDlq(captureId) {
    const batch = createMessageBatch('wrl-captures-dlq', [{
      id: crypto.randomUUID(),
      timestamp: new Date(),
      attempts: 1,
      body: { captureId, url: TEST_URL, ip: TEST_IP, tenantId: 'default', enqueuedAt: Date.now() },
    }]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env, ctx);
    await getQueueResult(batch, ctx);
  }

  it('uses the last attempt reason and says how often WRL tried', async () => {
    const id = capId();
    await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    await recordAttemptError(env.DB, id, 'The browser could not take a screenshot of this page');

    await runDlq(id);

    const record = await getCapture(env.DB, id);
    expect(record.status).toBe('failed');
    expect(record.error).toBe(`The browser could not take a screenshot of this page. WRL tried ${CAPTURE_MAX_ATTEMPTS} times.`);
  });

  it('falls back to a plain message when no attempt recorded a reason', async () => {
    const id = capId();
    await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');

    await runDlq(id);

    const record = await getCapture(env.DB, id);
    expect(record.status).toBe('failed');
    expect(record.error).toBe(`The capture failed ${CAPTURE_MAX_ATTEMPTS} times without a recorded reason.`);
  });

  it('WRL tries 4 times: one delivery plus max_retries = 3 in wrangler.toml', () => {
    expect(CAPTURE_MAX_ATTEMPTS).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

describe('dashboard capture list -- shows why a capture failed', () => {
  const submit_failReason = (capture) =>
    new Function(SUBMIT_VIEW_JS + '\nreturn submit_failReason;')()(capture);

  it('shows the stored reason for a failed capture', () => {
    expect(submit_failReason({ status: 'failed', error: 'The site refused the connection' })).toBe('The site refused the connection');
  });

  it('says so when a failed capture has no reason', () => {
    expect(submit_failReason({ status: 'failed', error: null })).toBe('No reason was recorded.');
  });

  it('shows nothing for captures that did not fail', () => {
    expect(submit_failReason({ status: 'complete', error: null })).toBeNull();
    expect(submit_failReason({ status: 'pending', error: null })).toBeNull();
  });
});
