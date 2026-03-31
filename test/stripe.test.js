// Unit tests for src/stripe.js
// Tests flattenParams and stripeRequest (with fetch stub).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flattenParams, stripeRequest, STRIPE_API_VERSION } from '../src/stripe.js';

// ---------------------------------------------------------------------------
// flattenParams
// ---------------------------------------------------------------------------

describe('flattenParams', () => {
  it('flattens a simple flat object', () => {
    expect(flattenParams({ customer: 'cus_123', mode: 'setup' }))
      .toEqual({ customer: 'cus_123', mode: 'setup' });
  });

  it('flattens nested objects with bracket notation', () => {
    expect(flattenParams({ metadata: { tenantId: 'abc', wrl: '1' } }))
      .toEqual({ 'metadata[tenantId]': 'abc', 'metadata[wrl]': '1' });
  });

  it('flattens arrays with indexed bracket notation', () => {
    expect(flattenParams({ items: ['a', 'b'] }))
      .toEqual({ 'items[0]': 'a', 'items[1]': 'b' });
  });

  it('flattens arrays of objects', () => {
    const result = flattenParams({
      items: [{ price: 'price_xxx', quantity: 1 }],
    });
    expect(result).toEqual({
      'items[0][price]': 'price_xxx',
      'items[0][quantity]': '1',
    });
  });

  it('converts numbers to strings', () => {
    expect(flattenParams({ amount: 100 })).toEqual({ amount: '100' });
  });

  it('skips undefined values', () => {
    expect(flattenParams({ a: 'yes', b: undefined })).toEqual({ a: 'yes' });
  });

  it('handles deeply nested objects', () => {
    const result = flattenParams({ a: { b: { c: 'deep' } } });
    expect(result).toEqual({ 'a[b][c]': 'deep' });
  });

  it('returns empty object for empty input', () => {
    expect(flattenParams({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// stripeRequest
// ---------------------------------------------------------------------------

describe('stripeRequest', () => {
  const env = { STRIPE_SECRET_KEY: 'sk_test_fake' };

  afterEach(() => vi.restoreAllMocks());

  it('sends correct headers and returns parsed JSON on success', async () => {
    const mockResponse = { id: 'cus_abc', object: 'customer' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    ));

    const result = await stripeRequest(env, 'POST', '/v1/customers', { email: 'a@b.com' });
    expect(result).toEqual(mockResponse);

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/customers');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer sk_test_fake');
    expect(opts.headers['Stripe-Version']).toBe(STRIPE_API_VERSION);
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(opts.body).toContain('email=a%40b.com');
  });

  it('sends no body when params are empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'x' }), { status: 200 }),
    ));

    await stripeRequest(env, 'GET', '/v1/customers/cus_abc');
    const [, opts] = fetch.mock.calls[0];
    expect(opts.body).toBeUndefined();
  });

  it('puts params in query string for GET requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'inv_upcoming' }), { status: 200 }),
    ));

    await stripeRequest(env, 'GET', '/v1/invoices/upcoming', { customer: 'cus_123' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain('/v1/invoices/upcoming?customer=cus_123');
    expect(opts.body).toBeUndefined();
    expect(opts.headers['Content-Type']).toBeUndefined();
  });

  it('puts params in body for POST requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'cus_new' }), { status: 200 }),
    ));

    await stripeRequest(env, 'POST', '/v1/customers', { email: 'a@b.com' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).not.toContain('?');
    expect(opts.body).toContain('email=a%40b.com');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('throws on non-2xx with Stripe error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: { type: 'invalid_request_error', message: 'No such customer' },
      }), { status: 404 }),
    ));

    await expect(stripeRequest(env, 'GET', '/v1/customers/cus_bad'))
      .rejects.toThrow('No such customer');
  });

  it('thrown error includes stripeErrorType and status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: { type: 'card_error', message: 'Card declined' },
      }), { status: 402 }),
    ));

    try {
      await stripeRequest(env, 'POST', '/v1/charges', { amount: 100 });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err.stripeErrorType).toBe('card_error');
      expect(err.status).toBe(402);
    }
  });

  it('handles Stripe error response without message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 500 }),
    ));

    await expect(stripeRequest(env, 'POST', '/v1/charges', {}))
      .rejects.toThrow('Stripe API error 500');
  });
});

// ---------------------------------------------------------------------------
// STRIPE_API_VERSION
// ---------------------------------------------------------------------------

describe('STRIPE_API_VERSION', () => {
  it('is a pinned version string', () => {
    expect(typeof STRIPE_API_VERSION).toBe('string');
    expect(STRIPE_API_VERSION.length).toBeGreaterThan(0);
  });
});
