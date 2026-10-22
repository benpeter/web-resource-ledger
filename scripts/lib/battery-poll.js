// tva
/**
 * battery-poll.js -- submit and poll battery captures without letting one
 * network error end the run.
 *
 * The first battery run of phase 0111 crashed on a single ECONNRESET while
 * polling 21 captures every 3 seconds: the error escaped Promise.all and
 * killed the script before it wrote any results. Network errors, non-2xx
 * responses and bodies that aren't JSON are now retried until the deadline.
 *
 * Pure apart from the injected fetch and clock. Tested in test/battery-poll.test.js.
 */

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeError(err) {
  const cause = err?.cause?.code || err?.cause?.message;
  return cause ? `${err.message} (${cause})` : String(err?.message ?? err);
}

/**
 * @param {string} siteUrl
 * @param {{ fetchImpl: typeof fetch, baseUrl: string, apiKey: string }} opts
 * @returns {Promise<{ captureId: string } | { error: string }>}
 */
export async function submitCapture(siteUrl, { fetchImpl, baseUrl, apiKey }) {
  try {
    const resp = await fetchImpl(`${baseUrl}/v1/captures`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { error: `POST ${resp.status}: ${body.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { captureId: data.id };
  } catch (err) {
    return { error: `POST failed: ${describeError(err)}` };
  }
}

/**
 * Poll one capture until it is complete or failed, or the deadline passes.
 *
 * @param {string} captureId
 * @param {{ fetchImpl: typeof fetch, baseUrl: string, apiKey: string, timeoutMs: number,
 *           intervalMs: number, sleep?: (ms: number) => Promise<void>, now?: () => number }} opts
 * @returns {Promise<object>} the capture record plus captureId, or { captureId, error }
 */
export async function pollCapture(captureId, { fetchImpl, baseUrl, apiKey, timeoutMs, intervalMs, sleep = defaultSleep, now = Date.now }) {
  const deadline = now() + timeoutMs;
  let lastProblem = null;
  while (now() < deadline) {
    await sleep(intervalMs);
    try {
      const resp = await fetchImpl(`${baseUrl}/v1/captures/${captureId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) {
        lastProblem = `HTTP ${resp.status}`;
        continue;
      }
      const data = await resp.json();
      if (data.status === 'complete' || data.status === 'failed') {
        return { captureId, ...data };
      }
    } catch (err) {
      lastProblem = describeError(err);
    }
  }
  return { captureId, error: lastProblem ? `poll timeout (last problem: ${lastProblem})` : 'poll timeout' };
}
