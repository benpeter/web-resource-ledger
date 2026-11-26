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

/** Most words a button label has. */
const MAX_LABEL_WORDS = 6;

/** Most clicks the wall step makes. */
const MAX_CLICKS = 5;

/** How long the wall step may go on clicking. */
export const WALL_MAX_MS = 15000;

/** How long a page a click opened gets to load. */
const PAGE_LOAD_MS = 8000;

/** How long the page gets to react to a click. */
const AFTER_CLICK_MS = 1000;

// A decline that costs money. Checked first: "Rifiuta e abbonati" is not a decline.
const PAY = /abonn|abbonat|subscri|suscri|\babo\b|\bpur\b|werbefrei|ad-free|\bzahlen\b|acquist|kaufen|\bbuy\b|purchase|offert|€/i;
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
  // Before anything else: a pay label is never clicked, whatever it is
  if (PAY.test(label)) return 'pay';
  // A comma or a long run of words is a sentence with a link in it ("Sie
  // können ablehnen, ändern oder widerrufen"), not a button
  if (label.includes(',') || label.split(' ').length > MAX_LABEL_WORDS) return null;
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
 * with data-wrl-wall="<n>" and returns their labels. With `untick`, it also
 * unticks every checked choice inside those overlays. With `wholePage`, on a
 * settings page a click led to (kleinanzeigen.de/gdpr), every visible button
 * of the page counts.
 *
 * Kept free of outside references, since Playwright sends its source to the page.
 */
function scanWall({ untick, wholePage }) {
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
    // Below the screen still counts: the save button of a long settings
    // panel is often further down. Off to the side or above is hidden.
    if (rect.bottom < 0 || rect.right < 0 || rect.left > innerWidth) return false;
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
    if (!wholePage) {
      const overlay = overlayOf(el);
      if (!overlay || !isConsentOverlay(overlay)) continue;
    }
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
 * @returns {Promise<null | { status: 'dismissed'|'failed', route: string|null, button: string|null, clicks: string[], durationMs: number }>}
 *   null when no wall is showing
 */
export async function dismissConsentWall(page) {
  const start = Date.now();
  const pageUrl = () => page.url().split('#')[0];
  const startUrl = pageUrl();
  // A click may reload the page; the scan then runs again on the new document
  const evaluateScan = async (options) => {
    try {
      return await page.evaluate(scanWall, options);
    } catch (err) {
      if (!/context was destroyed|navigat/i.test(String(err?.message ?? ''))) throw err;
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      return page.evaluate(scanWall, options);
    }
  };
  const scan = async (untick = false) => {
    const result = await evaluateScan({ untick, wholePage: pageUrl() !== startUrl });
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
    // The click may open another page (settings of their own) or reload this one
    const navigated = await page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame(), timeout: AFTER_CLICK_MS })
      .then(() => true, () => false);
    if (navigated) await page.waitForLoadState('load', { timeout: PAGE_LOAD_MS }).catch(() => {});
  };
  // A settings page of its own usually sends the visitor back once they
  // chose; when it doesn't, WRL goes back itself, so the capture is of the
  // page that was asked for
  const backToStart = async () => {
    if (pageUrl() === startUrl) return;
    await page.goto(startUrl, { waitUntil: 'load', timeout: PAGE_LOAD_MS }).catch(() => {});
  };
  const answers = (buttons) => buttons.some((b) => b.kind === 'decline' || b.kind === 'accept' || b.kind === 'save');
  const done = (status, route, button, clicks) => ({ status, route, button: button?.text?.slice(0, MAX_LABEL_CHARS) ?? null, clicks, durationMs: Date.now() - start });

  // Each round reads the buttons again, since a click can open the settings
  // in place of the wall. A decline that leaves the wall standing has
  // usually opened them too.
  const clicked = new Set();
  const clicks = [];
  let inSettings = false;
  let declined = false;
  let route = null;
  let last = null;
  for (let round = 0; round <= MAX_CLICKS; round++) {
    // Gone when no button that answers the wall is left. A "Cookie
    // settings" link that some sites keep on screen afterwards doesn't count.
    const buttons = await scan(inSettings);
    if (!answers(buttons)) {
      if (round === 0) return null;
      await backToStart();
      return done('dismissed', route, last, clicks);
    }
    if (round === MAX_CLICKS || Date.now() - start >= WALL_MAX_MS) break;
    // "Preferenze" and "PREFERENZE" are the same button on two screens
    const fresh = (kind) => buttons.find((b) => b.kind === kind && !clicked.has(b.text.toLowerCase()));
    let next;
    if (route === 'accept') {
      // After an accept, only a second accept (some walls ask twice) is tried
      next = fresh('accept');
    } else if (declined) {
      // Declined: save that, and when the wall still stands (a site that
      // wants a subscription instead), accept
      next = fresh('save') ?? fresh('accept');
    } else {
      next = fresh('decline') ?? (inSettings ? fresh('save') : null) ?? fresh('settings') ?? fresh('accept');
    }
    if (!next) break;
    clicked.add(next.text.toLowerCase());
    clicks.push(`${next.kind}:${next.text.slice(0, 40)}`);
    if (next.kind === 'accept') route = 'accept';
    else if (next.kind === 'decline') route = inSettings ? 'settings' : 'decline';
    else route = 'settings';
    last = next;
    await click(next);
    if (next.kind === 'settings' || next.kind === 'decline') inSettings = true;
    if (next.kind === 'decline') declined = true;
  }
  await backToStart();
  return done('failed', null, null, clicks);
}
