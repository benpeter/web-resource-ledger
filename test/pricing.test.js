// Unit tests for src/pricing.js

import { describe, it, expect } from 'vitest';
import { calculateCharges, computeBillableDelta } from '../src/pricing.js';

// ---------------------------------------------------------------------------
// calculateCharges -- graduated pricing
// ---------------------------------------------------------------------------

describe('calculateCharges', () => {
  it.each([
    // [captureCount, expectedAmount, expectedTierId]
    [0,      0.00,    'tier_0'],
    [1,      0.00,    'tier_0'],
    [200,    0.00,    'tier_0'],
    [201,    0.05,    'tier_1'],
    [250,    2.50,    'tier_1'],   // 50 billable at 0.05
    [10000,  490.00,  'tier_1'],   // 9800 at 0.05
    [10001,  490.04,  'tier_2'],   // 9800*0.05 + 1*0.035 = 490.035 -> 490.04
    [10500,  507.50,  'tier_2'],   // 9800*0.05 + 500*0.035
    [100000, 3640.00, 'tier_2'],   // 9800*0.05 + 90000*0.035
    [100001, 3640.02, 'tier_3'],   // 9800*0.05 + 90000*0.035 + 1*0.015 = 3640.015 -> 3640.02
    [100500, 3647.50, 'tier_3'],   // 9800*0.05 + 90000*0.035 + 500*0.015
  ])('captureCount=%i -> amount=%f, tier=%s', (captureCount, expectedAmount, expectedTierId) => {
    const result = calculateCharges(captureCount);
    expect(result.amount).toBe(expectedAmount);
    expect(result.currentTier.id).toBe(expectedTierId);
    expect(result.currency).toBe('EUR');
  });

  it('returns the full tiers array on every call', () => {
    const result = calculateCharges(500);
    expect(result.tiers).toHaveLength(4);
    expect(result.tiers[0].id).toBe('tier_0');
    expect(result.tiers[3].id).toBe('tier_3');
  });
});

// ---------------------------------------------------------------------------
// computeBillableDelta
// ---------------------------------------------------------------------------

describe('computeBillableDelta', () => {
  it.each([
    // [captureCount, reportedCaptureCount, expectedDelta]
    [300, 0,   300],
    [300, 300, 0],
    [300, 250, 50],
    [0,   0,   0],
  ])('(%i, %i) -> %i', (captureCount, reportedCaptureCount, expected) => {
    expect(computeBillableDelta(captureCount, reportedCaptureCount)).toBe(expected);
  });
});
