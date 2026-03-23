// tva
/**
 * Graduated volume pricing tiers for WRL captures.
 *
 * Tier definitions mirror the Stripe Dashboard capture_volume_monthly
 * graduated pricing config. Any change here must be reflected in Stripe
 * and vice versa.
 */

/**
 * @typedef {Object} VolumeTier
 * @property {string} id          - Stable identifier used in responses.
 * @property {string} name        - Human-readable label.
 * @property {number} unitPrice   - Price per capture in EUR.
 * @property {number} from        - First capture count in this bracket (inclusive).
 * @property {number|null} to     - Last capture count in this bracket (inclusive), null = unbounded.
 */

/** @type {VolumeTier[]} */
export const VOLUME_TIERS = [
  { id: 'tier_0', name: 'Free',        unitPrice: 0,     from: 1,      to: 200    },
  { id: 'tier_1', name: 'Standard',    unitPrice: 0.05,  from: 201,    to: 10000  },
  { id: 'tier_2', name: 'Volume',      unitPrice: 0.035, from: 10001,  to: 100000 },
  { id: 'tier_3', name: 'High Volume', unitPrice: 0.015, from: 100001, to: null   },
];

/**
 * Minimum billable amount (EUR) before an invoice is issued.
 * Invoices below this threshold are deferred to the next billing cycle.
 */
export const INVOICE_THRESHOLD_EUR = 5.00;

/** eIDAS qualified timestamp add-on: flat rate per capture after free tier */
export const EIDAS_UNIT_PRICE_EUR = 0.10;

/** Free eIDAS timestamp allowance (matches Stripe graduated pricing: first 50 free) */
export const EIDAS_FREE_LIMIT = 50;

/**
 * @typedef {Object} ChargeResult
 * @property {number} amount       - Total charge in EUR, rounded to 2 decimal places.
 * @property {string} currency     - Always 'EUR'.
 * @property {VolumeTier} currentTier - The tier the final capture falls into.
 * @property {VolumeTier[]} tiers  - Full tier table (reference).
 */

/**
 * Compute graduated charges for a given capture count.
 *
 * Each capture is priced at the rate of the bracket it falls in, not the
 * highest bracket reached. The function walks each tier in order, accumulating
 * the charge for captures that fall within that bracket.
 *
 * @param {number} captureCount - Total captures in the billing period.
 * @returns {ChargeResult}
 */
export function calculateCharges(captureCount) {
  let amount = 0;
  let currentTier = VOLUME_TIERS[0];

  for (const tier of VOLUME_TIERS) {
    if (captureCount < tier.from) break;

    // Captures that fall within this bracket
    const bracketEnd = tier.to !== null ? tier.to : captureCount;
    const unitsInBracket = Math.min(captureCount, bracketEnd) - (tier.from - 1);

    amount += unitsInBracket * tier.unitPrice;
    currentTier = tier;

    if (tier.to === null || captureCount <= tier.to) break;
  }

  return {
    amount: Math.round(amount * 100) / 100,
    currency: 'EUR',
    currentTier,
    tiers: VOLUME_TIERS,
  };
}

/**
 * Compute the number of captures that have not yet been reported to Stripe.
 *
 * @param {number} captureCount         - Current total captures this period.
 * @param {number} reportedCaptureCount - Capture count at last successful Stripe report.
 * @returns {number} Delta to send to Stripe (never negative).
 */
export function computeBillableDelta(captureCount, reportedCaptureCount) {
  return Math.max(0, captureCount - reportedCaptureCount);
}
