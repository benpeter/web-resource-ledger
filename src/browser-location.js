// tva
/**
 * Where a capture's browser went out to the web (backlog #108), as stored in
 * captureSettings.browserLocation: the Cloudflare data center (IATA code) and
 * the country (ISO 3166-1 alpha-2), both from https://www.cloudflare.com/cdn-cgi/trace.
 * The verify page and the dashboard scripts format it the same way inline.
 */

/**
 * "LAX, US (Cloudflare data center)", or null unless the values are a
 * three-letter data center code and a two-letter country code.
 *
 * @param {{ colo?: unknown, country?: unknown } | null | undefined} location
 * @returns {string | null}
 */
export function browserLocationText(location) {
  const colo = location?.colo;
  const country = location?.country;
  if (typeof colo !== 'string' || typeof country !== 'string') return null;
  if (!/^[A-Z]{3}$/.test(colo) || !/^[A-Z]{2}$/.test(country)) return null;
  return `${colo}, ${country} (Cloudflare data center)`;
}
