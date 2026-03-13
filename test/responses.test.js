import { problemResponse, jsonResponse } from '../src/responses.js';
import { describe, it, expect } from 'vitest';

describe('problemResponse', () => {
  it('returns correct RFC 9457 shape', async () => {
    const response = problemResponse(404, 'Test detail');
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await response.json();
    expect(body).toEqual({
      type: 'about:blank',
      status: 404,
      title: 'Not Found',
      detail: 'Test detail',
    });
  });

  it('response status matches body status', async () => {
    const response = problemResponse(422, 'detail');
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.status).toBe(422);
  });

  it('uses fallback title for unknown status codes', async () => {
    const response = problemResponse(418, 'detail');
    const body = await response.json();
    expect(body.title).toBe('Error');
  });

  it('includes additional headers', async () => {
    const response = problemResponse(405, 'detail', { Allow: 'GET' });
    expect(response.headers.get('Allow')).toBe('GET');
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
  });
});

describe('jsonResponse', () => {
  it('returns correct shape', async () => {
    const response = jsonResponse({ status: 'ok' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const body = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('accepts custom status and headers', async () => {
    const response = jsonResponse({ id: '123' }, 201, { 'X-Custom': 'val' });
    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('X-Custom')).toBe('val');
  });
});
