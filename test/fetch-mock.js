// tva
// Stand-in for the fetchMock that cloudflare:test exported until
// @cloudflare/vitest-pool-workers 0.13 (Vitest 4) removed it. It keeps the
// undici MockAgent calls the tests use -- get(origin).intercept({ path, method })
// .reply()/.replyWithError(), .persist(), .times(n) -- by replacing
// globalThis.fetch, which tests and the Worker share in the same isolate.

const interceptors = [];
let realFetch = null;
let netConnect = true;

function matches(matcher, value) {
  if (matcher === undefined) return true;
  if (typeof matcher === 'function') return matcher(value);
  if (matcher instanceof RegExp) return matcher.test(value);
  return matcher === value;
}

async function mockedFetch(input, init) {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const method = request.method;
  const interceptor = interceptors.find((i) => i.remaining > 0
    && i.origin === url.origin
    && matches(i.path, path)
    && matches(i.method ?? 'GET', method));
  if (!interceptor) {
    if (netConnect) return realFetch(request);
    throw new Error(`fetch-mock: no interceptor for ${method} ${url.origin}${path}, and net connect is disabled`);
  }
  if (!interceptor.persistent) interceptor.remaining -= 1;
  if (interceptor.error) throw interceptor.error;
  const body = request.body ? await request.text() : '';
  let replyBody = typeof interceptor.body === 'function'
    ? await interceptor.body({ origin: url.origin, path, method, body, headers: Object.fromEntries(request.headers) })
    : interceptor.body;
  const headers = new Headers(interceptor.options?.headers);
  if (replyBody !== null && typeof replyBody === 'object' && !(replyBody instanceof ArrayBuffer) && !ArrayBuffer.isView(replyBody)) {
    replyBody = JSON.stringify(replyBody);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  const status = interceptor.status;
  const nullBody = [101, 204, 205, 304].includes(status);
  return new Response(nullBody ? null : replyBody ?? '', { status, headers });
}

function scope(interceptor) {
  return {
    persist() { interceptor.persistent = true; return this; },
    times(count) { interceptor.remaining = count; return this; },
  };
}

export const fetchMock = {
  activate() {
    if (!realFetch) realFetch = globalThis.fetch;
    globalThis.fetch = mockedFetch;
  },
  deactivate() {
    if (realFetch) globalThis.fetch = realFetch;
    realFetch = null;
    netConnect = true;
    interceptors.length = 0;
  },
  disableNetConnect() { netConnect = false; },
  enableNetConnect() { netConnect = true; },
  get(origin) {
    return {
      intercept({ path, method } = {}) {
        const interceptor = { origin: new URL(origin).origin, path, method, remaining: 1, persistent: false };
        interceptors.push(interceptor);
        return {
          reply(status, body, options) {
            Object.assign(interceptor, { status, body, options });
            return scope(interceptor);
          },
          replyWithError(error) {
            interceptor.error = error;
            return scope(interceptor);
          },
        };
      },
    };
  },
  assertNoPendingInterceptors() {
    const pending = interceptors.filter((i) => !i.persistent && i.remaining > 0);
    if (pending.length > 0) {
      const list = pending.map((i) => `${i.method ?? 'GET'} ${i.origin}${typeof i.path === 'string' ? i.path : ''}`).join(', ');
      throw new Error(`fetch-mock: ${pending.length} interceptor(s) not used: ${list}`);
    }
  },
};
