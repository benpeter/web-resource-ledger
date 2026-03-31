// tva
// Last reviewed: 2026-03-23
export const STRIPE_API_VERSION = '2025-04-30.basil';

const STRIPE_BASE = 'https://api.stripe.com';

/**
 * Recursively flatten a nested object into Stripe bracket-notation keys.
 *
 * Example:
 *   { items: [{ price: 'price_xxx', quantity: 1 }], metadata: { tenantId: 'abc' } }
 *   =>
 *   { 'items[0][price]': 'price_xxx', 'items[0][quantity]': '1', 'metadata[tenantId]': 'abc' }
 *
 * @param {object} obj
 * @param {string} [prefix]
 * @returns {Record<string, string>}
 */
export function flattenParams(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenParams(value, fullKey));
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const itemKey = `${fullKey}[${i}]`;
        if (value[i] !== null && typeof value[i] === 'object') {
          Object.assign(result, flattenParams(value[i], itemKey));
        } else {
          result[itemKey] = String(value[i]);
        }
      }
    } else if (value !== undefined) {
      result[fullKey] = String(value);
    }
  }
  return result;
}

/**
 * Make a request to the Stripe API.
 *
 * Params are form-encoded (application/x-www-form-urlencoded) with bracket
 * notation for nested objects. On non-2xx, throws an Error with Stripe's
 * error message. The API key is never included in thrown errors.
 *
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {'GET'|'POST'|'DELETE'} method
 * @param {string} path  e.g. '/v1/customers'
 * @param {object} [params]
 * @returns {Promise<object>}
 */
export async function stripeRequest(env, method, path, params) {
  let url = `${STRIPE_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Stripe-Version': STRIPE_API_VERSION,
  };

  let body;
  if (params && Object.keys(params).length > 0) {
    const encoded = new URLSearchParams(flattenParams(params)).toString();
    if (method === 'GET') {
      url += `?${encoded}`;
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = encoded;
    }
  }

  const response = await fetch(url, { method, headers, body });
  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error?.message ?? `Stripe API error ${response.status}`;
    const type = data?.error?.type ?? 'api_error';
    throw Object.assign(new Error(msg), { stripeErrorType: type, status: response.status });
  }

  return data;
}

/**
 * POST /v1/checkout/sessions
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {object} params
 */
export function createCheckoutSession(env, params) {
  return stripeRequest(env, 'POST', '/v1/checkout/sessions', params);
}

/**
 * POST /v1/billing_portal/sessions
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {object} params
 */
export function createPortalSession(env, params) {
  return stripeRequest(env, 'POST', '/v1/billing_portal/sessions', params);
}

/**
 * POST /v1/customers
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {object} params
 */
export function createCustomer(env, params) {
  return stripeRequest(env, 'POST', '/v1/customers', params);
}

/**
 * POST /v1/subscriptions
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {object} params
 */
export function createSubscription(env, params) {
  return stripeRequest(env, 'POST', '/v1/subscriptions', params);
}

/**
 * POST /v1/invoices/:id
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {string} invoiceId
 * @param {object} params
 */
export function updateInvoice(env, invoiceId, params) {
  return stripeRequest(env, 'POST', `/v1/invoices/${invoiceId}`, params);
}

/**
 * POST /v1/billing/meter_events
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {object} params
 */
export function reportMeterEvent(env, params) {
  return stripeRequest(env, 'POST', '/v1/billing/meter_events', params);
}

/**
 * GET /v1/invoices/upcoming
 * Returns the upcoming invoice for a customer, or null if no active subscription.
 *
 * @param {{ STRIPE_SECRET_KEY: string }} env
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
export async function getUpcomingInvoice(env, customerId) {
  try {
    return await stripeRequest(env, 'GET', '/v1/invoices/upcoming', {
      customer: customerId,
    });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}
