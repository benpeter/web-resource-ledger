// tva
// Consent walls autoconsent has no rule for (backlog #104, #47). WRL reads
// the buttons of a wall that is still showing: it declines when it can,
// tries the settings when it can't, never takes a "reject and subscribe"
// button, and accepts only when nothing else is left.
import { describe, it, expect } from 'vitest';
import { classifyConsentButton, wallConsentSettings } from '../src/consent-wall.js';

describe('classifyConsentButton', () => {
  it('reads decline buttons in the languages of the sites WRL sees', () => {
    for (const text of ['Reject all', 'Decline', 'Alle ablehnen', 'Nur notwendige Cookies', 'Rifiuta',
      'Tout refuser', 'Continuer sans accepter', 'Alles weigeren', 'Rechazar todo', 'Only necessary cookies']) {
      expect(classifyConsentButton(text), text).toBe('decline');
    }
  });

  it('never takes a decline that is a subscription', () => {
    for (const text of ['Rifiuta e abbonati', 'S’abonner', 'Subscribe', 'Ablehnen und Abo abschließen', 'Mehr erfahren über PUR']) {
      expect(classifyConsentButton(text), text).toBe('pay');
    }
  });

  it('reads settings, save and accept buttons', () => {
    for (const text of ['Cookie settings', 'Datenschutzeinstellungen', 'Preferenze', 'Instellen', 'Gérer mes choix', 'Manage options']) {
      expect(classifyConsentButton(text), text).toBe('settings');
    }
    for (const text of ['Save choices', 'Auswahl speichern', 'Salva e chiudi', 'Enregistrer', 'Opslaan', 'Confirm my choices']) {
      expect(classifyConsentButton(text), text).toBe('save');
    }
    for (const text of ['Accept', 'Alle akzeptieren', 'Accetta e continua', 'Accepter et continuer', 'Akkoord', 'Agree', 'Akzeptieren und speichern']) {
      expect(classifyConsentButton(text), text).toBe('accept');
    }
  });

  it('ignores everything else', () => {
    for (const text of ['Mehr erfahren', 'Menu', 'Login', '', 'What are cookies used for?']) {
      expect(classifyConsentButton(text), text).toBeNull();
    }
  });
});

describe('wallConsentSettings', () => {
  it('records a decline or the settings route as an opt-out that worked', () => {
    expect(wallConsentSettings('decline')).toEqual({ library: 'wrl-consent-wall', action: 'optOut', route: 'decline', result: 'success' });
    expect(wallConsentSettings('settings')).toEqual({ library: 'wrl-consent-wall', action: 'optOut', route: 'settings', result: 'success' });
  });

  it('discloses an accept as accepted, not as a success', () => {
    expect(wallConsentSettings('accept')).toEqual({ library: 'wrl-consent-wall', action: 'acceptAll', route: 'accept', result: 'accepted' });
  });
});
