// tva
/**
 * viewport.js -- the browser viewport a caller may ask for (backlog #66).
 *
 * Captures render at 1280x720 unless POST /v1/captures names another size.
 * The screenshot height cap scales with the width (screenshotHeightCap in
 * capture.js), so a wider viewport doesn't make the screenshot larger.
 */

export const DEFAULT_VIEWPORT = Object.freeze({ width: 1280, height: 720 });
export const VIEWPORT_MIN = 320;
export const VIEWPORT_MAX_WIDTH = 1920;
export const VIEWPORT_MAX_HEIGHT = 1440;

const LIMITS_TEXT = `Field 'viewport' must be { "width", "height" } in whole CSS pixels, width ${VIEWPORT_MIN}-${VIEWPORT_MAX_WIDTH} and height ${VIEWPORT_MIN}-${VIEWPORT_MAX_HEIGHT}`;

/**
 * Validates the optional viewport field of a capture request.
 *
 * @param {unknown} value  body.viewport as sent
 * @returns {{ ok: true, viewport: { width: number, height: number } } | { ok: false, detail: string }}
 */
export function parseViewport(value) {
  if (value === undefined) return { ok: true, viewport: { ...DEFAULT_VIEWPORT } };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, detail: LIMITS_TEXT };
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('width') || !keys.includes('height')) return { ok: false, detail: LIMITS_TEXT };
  const { width, height } = value;
  if (!Number.isInteger(width) || width < VIEWPORT_MIN || width > VIEWPORT_MAX_WIDTH) return { ok: false, detail: LIMITS_TEXT };
  if (!Number.isInteger(height) || height < VIEWPORT_MIN || height > VIEWPORT_MAX_HEIGHT) return { ok: false, detail: LIMITS_TEXT };
  return { ok: true, viewport: { width, height } };
}

/**
 * The viewport as a line of text ("390 x 844 CSS pixels"), or null for
 * anything that isn't two whole numbers: a capture made before backlog #66
 * records none.
 *
 * @param {unknown} viewport  captureSettings.viewport
 * @returns {string|null}
 */
export function viewportText(viewport) {
  if (!viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)) return null;
  return `${viewport.width} x ${viewport.height} CSS pixels`;
}
