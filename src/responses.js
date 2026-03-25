// Detail message convention:
// - Name the specific resource: "Capture cap_abc123 not found"
// - State what is wrong and what to do: "URL scheme 'ftp' is not allowed; use http or https"
// - Human-readable, not machine-parseable (clients should switch on `status`)
// - Never leak internals (no stack traces, no storage keys, no reflected user input)

const titles = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export function problemResponse(status, detail, headers = {}, extra = {}) {
  const body = {
    type: 'about:blank',
    status,
    title: titles[status] || 'Error',  // Fallback 'Error' signals a missing entry in the titles map
    detail,
    ...extra,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function batchItemSuccess(url, captureId, statusUrl) {
  return { status: 202, url, id: captureId, statusUrl };
}

export function batchItemError(url, status, detail) {
  return {
    status,
    url,
    error: { type: 'about:blank', status, title: titles[status] || 'Error', detail },
  };
}
