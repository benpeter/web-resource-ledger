// tva
/**
 * Consent walls autoconsent has no rule for (backlog #104, #47).
 *
 * Autoconsent declines every banner it has a hand-written rule for. Some
 * sites (Le Monde, Corriere, nu.nl, kleinanzeigen, CNN) build their own wall,
 * which autoconsent doesn't know, and the capture then shows the wall instead
 * of the page. When a wall is still showing after autoconsent, WRL reads its
 * buttons and, in this order:
 *
 *   1. clicks a decline button;
 *   2. opens the settings, unticks every choice and saves;
 *   3. accepts, when the wall offers nothing else.
 *
 * It never clicks a button that declines by taking out a subscription
 * ("Rifiuta e abbonati", "S'abonner"). An accept is recorded as
 * `result: 'accepted'` in captureSettings.consent and shown on the verify
 * page, so nobody reads the capture as a page seen without consent.
 *
 * Only buttons inside an overlay count: an element with position fixed or
 * sticky, a dialog, or an aria-modal element, whose text talks about cookies,
 * consent, privacy or partners. A "Subscribe" link in the page itself is
 * never read.
 */

/** Longest button text that is read as a button label. */
const MAX_LABEL_CHARS = 80;

/** How long the whole wall step may take. */
export const WALL_MAX_MS = 10000;

/** How long the page gets to react to a click. */
const AFTER_CLICK_MS = 1000;

// A decline that costs money. Checked first: "Rifiuta e abbonati" is not a decline.
const PAY = /abonn|abbonat|subscri|suscri|\babo\b|\bpur\b|werbefrei|ad-free|\bzahlen\b/i;
const DECLINE = /\b(reject|decline|refuse|deny)\b|ablehnen|nicht (akzeptieren|zustimmen)|nur (notwendige|erforderliche|essenzielle|technisch)|only (necessary|essential|required)|(necessary|essential) only|rifiut|refuser|sans accepter|ne pas accepter|weiger|rechaz|continue without|weiter ohne|continua senza|do not accept|don['’]t accept/i;
const ACCEPT = /\baccept|akzept|accett|akkoord|\bagree|\ballow all\b|zustimm|einverstanden|acept|\bok\b|got it|alle(s)? (zulassen|erlauben|toestaan)|tout autoriser/i;
const SAVE = /speichern|\bsave\b|salva|enregistr|opslaan|confirm|bestätigen|guardar|conferma|übernehmen/i;
const SETTINGS = /settings|einstellungen|preferen|instellen|instellingen|gérer|gestion|gestisci|beheer|manage|option|personaliz|anpassen|customi|configur|paramètres|parametr|impostazioni/i;

/**
 * Reads what a consent button does from its label.
 *
 * @param {string} text Visible label of the button
 * @returns {'decline'|'pay'|'settings'|'save'|'accept'|null}
 */
export function classifyConsentButton(text) {
  const label = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!label || label.length > MAX_LABEL_CHARS) return null;
  if (PAY.test(label)) return 'pay';
  if (DECLINE.test(label)) return 'decline';
  if (ACCEPT.test(label)) return 'accept';
  if (SAVE.test(label)) return 'save';
  if (SETTINGS.test(label)) return 'settings';
  return null;
}

/**
 * captureSettings.consent for a wall WRL handled itself.
 *
 * @param {'decline'|'settings'|'accept'} route How the wall went away
 * @returns {{ library: string, action: string, route: string, result: string }}
 */
export function wallConsentSettings(route) {
  if (route === 'accept') {
    return { library: 'wrl-consent-wall', action: 'acceptAll', route: 'accept', result: 'accepted' };
  }
  return { library: 'wrl-consent-wall', action: 'optOut', route, result: 'success' };
}

/**
 * Runs in the page: finds the visible buttons of consent overlays, marks each
 * with data-wrl-wall="<n>" and returns their labels. With `untick`, it first
 * unticks every checked choice inside those overlays.
 *
 * Kept free of outside references, since Playwright sends its source to the page.
 */
function scanWall(untick) {
  const CONSENT_TEXT = /cookie|consent|privacy|privacidad|privée|datenschutz|données|dati personali|gegevens|partner|tracking|traceurs|tracciament/i;
  const isOverlay = (el) => {
    if (el.matches('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return true;
    const position = getComputedStyle(el).position;
    return position === 'fixed' || position === 'sticky';
  };
  const overlayOf = (el) => {
    for (let node = el; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (isOverlay(node)) return node;
    }
    return null;
  };
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const consentOverlays = new Map();
  const isConsentOverlay = (overlay) => {
    if (!consentOverlays.has(overlay)) {
      consentOverlays.set(overlay, CONSENT_TEXT.test((overlay.innerText || '').slice(0, 5000)));
    }
    return consentOverlays.get(overlay);
  };

  document.querySelectorAll('[data-wrl-wall]').forEach((el) => el.removeAttribute('data-wrl-wall'));
  const selector = 'button, [role="button"], a, input[type="button"], input[type="submit"]';
  const found = [];
  let unticked = 0;
  for (const el of document.querySelectorAll(selector)) {
    if (!visible(el)) continue;
    const overlay = overlayOf(el);
    if (!overlay || !isConsentOverlay(overlay)) continue;
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    el.setAttribute('data-wrl-wall', String(found.length));
    found.push(text.slice(0, 100));
  }
  if (untick) {
    for (const overlay of consentOverlays.keys()) {
      if (!consentOverlays.get(overlay)) continue;
      for (const box of overlay.querySelectorAll('input[type="checkbox"]:checked:not(:disabled), [role="switch"][aria-checked="true"], [role="checkbox"][aria-checked="true"]')) {
        if (box.getAttribute('aria-disabled') === 'true') continue;
        box.click();
        unticked++;
      }
    }
  }
  return { buttons: found, unticked };
}

/**
 * Handles a consent wall still showing after autoconsent.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @param {{ wait?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<null | { status: 'dismissed'|'failed', route: string|null, button: string|null, durationMs: number }>}
 *   null when no wall is showing
 */
export async function dismissConsentWall(page, { wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const start = Date.now();
  // A click may reload the page; the scan then runs again on the new document
  const evaluateScan = async (untick) => {
    try {
      return await page.evaluate(scanWall, untick);
    } catch (err) {
      if (!/context was destroyed|navigat/i.test(String(err?.message ?? ''))) throw err;
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      return page.evaluate(scanWall, untick);
    }
  };
  const scan = async (untick = false) => {
    const result = await evaluateScan(untick);
    if (!result || !Array.isArray(result.buttons)) return [];
    return result.buttons.map((text, index) => ({ text, index, kind: classifyConsentButton(text) }));
  };
  const click = async (button) => {
    const target = `[data-wrl-wall="${button.index}"]`;
    try {
      await page.locator(target).first().click({ timeout: 2000 });
    } catch {
      // Something covers the button or it moves: click it from inside the page
      await page.evaluate((sel) => document.querySelector(sel)?.click(), target);
    }
    await wait(AFTER_CLICK_MS);
  };
  // Gone when no button that answers the wall is left. A "Cookie settings"
  // link that some sites keep on screen afterwards doesn't count.
  const gone = async () => !(await scan()).some((b) => b.kind === 'decline' || b.kind === 'accept' || b.kind === 'save');
  const pick = (buttons, kind) => buttons.find((b) => b.kind === kind);
  const done = (status, route, button) => ({ status, route, button: button?.text?.slice(0, MAX_LABEL_CHARS) ?? null, durationMs: Date.now() - start });
  const inTime = () => Date.now() - start < WALL_MAX_MS;

  let buttons = await scan();
  if (!buttons.some((b) => b.kind === 'decline' || b.kind === 'accept')) return null;

  const decline = pick(buttons, 'decline');
  if (decline) {
    await click(decline);
    if (await gone()) return done('dismissed', 'decline', decline);
    buttons = await scan();
  }

  const settings = pick(buttons, 'settings');
  if (settings && inTime()) {
    await click(settings);
    const inSettings = await scan(true);
    const answer = pick(inSettings, 'decline') ?? pick(inSettings, 'save');
    if (answer) {
      await click(answer);
      if (await gone()) return done('dismissed', 'settings', answer);
    }
    buttons = await scan();
  }

  const accept = pick(buttons, 'accept');
  if (accept && inTime()) {
    await click(accept);
    if (await gone()) return done('dismissed', 'accept', accept);
  }
  return done('failed', null, null);
}
