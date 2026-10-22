// Tests for src/analytics.js: which capture events go to Pirsch, with what.
import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { captureSource, isAnalyticsExcluded, trackCaptureEvent } from '../src/analytics.js';

const env = { PIRSCH_ACCESS_KEY: 'test-pirsch-key', ANALYTICS_EXCLUDE_TENANTS: 'gh-398734, default' };

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.deactivate();
});

describe('captureSource', () => {
  it('uses the source the producer set', () => {
    expect(captureSource({ source: 'dashboard' })).toBe('dashboard');
    expect(captureSource({ source: 'api' })).toBe('api');
  });

  it('derives schedule, mcp and api for messages without a source', () => {
    expect(captureSource({ scheduleId: 'sch_1', cip: 'cron' })).toBe('schedule');
    expect(captureSource({ cip: 'mcp' })).toBe('mcp');
    expect(captureSource({ cip: 'a1b2' })).toBe('api');
  });
});

describe('isAnalyticsExcluded', () => {
  it('excludes the tenants listed in ANALYTICS_EXCLUDE_TENANTS', () => {
    expect(isAnalyticsExcluded(env, 'gh-398734')).toBe(true);
    expect(isAnalyticsExcluded(env, 'default')).toBe(true);
    expect(isAnalyticsExcluded(env, 'gh-16527634')).toBe(false);
  });

  it('excludes nobody when the variable is unset', () => {
    expect(isAnalyticsExcluded({}, 'gh-398734')).toBe(false);
  });
});

describe('trackCaptureEvent', () => {
  it('sends the event with the submitter ip and user agent and the source, without tenant or capture ids', async () => {
    let captured;
    fetchMock.get('https://api.pirsch.io')
      .intercept({ path: '/api/v1/event', method: 'POST' })
      .reply(200, (req) => { captured = JSON.parse(req.body); return 'ok'; });

    await trackCaptureEvent(env, 'Capture Completed', {
      captureId: 'cap_' + 'a'.repeat(32), tenantId: 'gh-16527634', ip: '198.51.100.7',
      ua: 'Mozilla/5.0 Test', source: 'dashboard',
    }, { qualified: 'no' });

    expect(captured.event_name).toBe('Capture Completed');
    expect(captured.url).toBe('https://api.webresourceledger.com/v1/captures');
    expect(captured.ip).toBe('198.51.100.7');
    expect(captured.user_agent).toBe('Mozilla/5.0 Test');
    expect(captured.event_meta).toEqual({ source: 'dashboard', qualified: 'no' });
    expect(JSON.stringify(captured)).not.toMatch(/gh-16527634|cap_a/);
  });

  it('sends nothing for an excluded tenant', () => {
    expect(trackCaptureEvent(env, 'Capture Completed', { tenantId: 'gh-398734', ip: '198.51.100.7' })).toBeUndefined();
  });
});
