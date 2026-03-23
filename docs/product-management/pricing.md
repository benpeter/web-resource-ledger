# Pricing

## Base Product: Web Captures

Graduated volume pricing (EUR), configured in Stripe as `capture_volume_monthly`:

| Tier | Range | Unit Price |
|------|-------|-----------|
| Free | 1-200 | EUR 0.00 |
| Standard | 201-10,000 | EUR 0.05 |
| Volume | 10,001-100,000 | EUR 0.035 |
| High Volume | 100,001+ | EUR 0.015 |

Minimum invoice threshold: EUR 5.00.

## Add-ons

### eIDAS Qualified Timestamps (Phase 0063)

Account-level opt-in. When enabled, every capture receives a second RFC 3161
timestamp from an EU-qualified TSA, giving it legal presumption of accuracy
under eIDAS Article 41(2).

| Tier | Range | Unit Price |
|------|-------|-----------|
| Free | 1-50 | EUR 0.00 |
| Standard | 51+ | EUR 0.10 |

Stripe meter: `eidas_timestamps`, lookup key: `capture_volume_monthly_eidas`.

**Pricing rationale**: EUR 0.10 per capture reflects the qualified TSA
operational cost plus margin. The 50-capture free tier lets tenants evaluate
the feature without commitment. Stripe graduated pricing handles the free
tier automatically -- the meter reporter sends all eIDAS capture counts and
Stripe applies the pricing.

**Billing model**: Meter-only-on-success. The `eidas_timestamps` meter is
incremented only when `qualifiedTimestampStatus === 'present'`. If the
qualified TSA fails and the capture falls back to standard-only, no eIDAS
charge is incurred. This is a deliberate billing invariant enforced in the
queue consumer.

**Free tier interaction**: The 50 free eIDAS captures are independent of the
200 free base captures. A tenant with eIDAS enabled who makes 100 captures
pays nothing for the first 50 eIDAS timestamps (plus 200 free captures).
