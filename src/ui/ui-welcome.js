// tva
// First-key display screen shown after GitHub OAuth sign-up.
// Exports a JS string constant for inline use in the HTML shell.

export const WELCOME_JS = `
// ---------------------------------------------------------------------------
// Copy-to-clipboard helper (shared by welcome + settings)
// ---------------------------------------------------------------------------

function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(function() {
    var original = button.textContent;
    button.textContent = 'Copied!';
    button.setAttribute('aria-label', 'Copied to clipboard');
    setTimeout(function() {
      button.textContent = original;
      button.setAttribute('aria-label', 'Copy API key');
    }, 2000);
  }).catch(function() {
    var input = button.previousElementSibling;
    if (input && input.select) { input.select(); }
  });
}

// ---------------------------------------------------------------------------
// renderWelcome() -- builds DOM for the first-key screen
// ---------------------------------------------------------------------------

function renderWelcome() {
  document.title = 'Your API Key \u2014 WRL';

  var app = document.getElementById('app');
  // Safe: clearing the mount point, not inserting user-supplied content
  app.innerHTML = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'auth-gate';

  var card = document.createElement('div');
  card.className = 'card auth-card welcome-card';

  var heading = document.createElement('h1');
  heading.className = 'auth-wordmark';
  heading.tabIndex = -1;
  heading.textContent = 'Your API Key';
  card.appendChild(heading);

  var intro = document.createElement('p');
  intro.className = 'auth-tagline';
  intro.textContent = 'Your account is ready. Save your API key now.';
  card.appendChild(intro);

  // Warning banner
  var warning = document.createElement('div');
  warning.className = 'alert alert--warning welcome-warning';
  warning.setAttribute('role', 'alert');
  warning.textContent = 'Your API key will only be shown once. Copy it now.';
  card.appendChild(warning);

  // Key display area (populated on mount after API call)
  var keySection = document.createElement('div');
  keySection.className = 'welcome-key-section';
  keySection.id = 'welcome-key-section';

  // Loading state shown until API responds
  var loadingEl = document.createElement('p');
  loadingEl.id = 'welcome-loading';
  loadingEl.className = 'welcome-loading';
  loadingEl.textContent = 'Loading your API key...';
  keySection.appendChild(loadingEl);

  card.appendChild(keySection);

  // aria-live region for copy feedback (screen readers)
  var liveEl = document.createElement('div');
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  liveEl.className = 'sr-only';
  liveEl.id = 'welcome-live';
  card.appendChild(liveEl);

  // Continue button (disabled until key is acknowledged)
  var continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.id = 'welcome-continue-btn';
  continueBtn.className = 'btn btn--primary';
  continueBtn.textContent = 'Continue to Dashboard';
  continueBtn.setAttribute('aria-disabled', 'true');
  continueBtn.tabIndex = 0;
  card.appendChild(continueBtn);

  wrapper.appendChild(card);
  app.appendChild(wrapper);

  heading.focus();
}

// ---------------------------------------------------------------------------
// mountWelcome() -- fetches key, wires events
// ---------------------------------------------------------------------------

function mountWelcome() {
  var keySection = document.getElementById('welcome-key-section');
  var loadingEl = document.getElementById('welcome-loading');
  var continueBtn = document.getElementById('welcome-continue-btn');
  var liveEl = document.getElementById('welcome-live');
  if (!keySection || !continueBtn) return;

  apiFetch('/v1/account/first-key', { credentials: 'same-origin' }).then(function(res) {
    if (!res) return; // 401 handled by apiFetch

    if (res.status === 404) {
      if (loadingEl) loadingEl.remove();

      var notFound = document.createElement('div');
      notFound.className = 'alert alert--warning';
      notFound.setAttribute('role', 'alert');
      notFound.textContent = 'API key not found. ';

      var settingsLink = document.createElement('a');
      settingsLink.href = '#/settings';
      settingsLink.textContent = 'Visit Settings to create one.';
      notFound.appendChild(settingsLink);

      keySection.appendChild(notFound);

      // Enable continue with settings redirect
      continueBtn.setAttribute('aria-disabled', 'false');
      continueBtn.addEventListener('click', function() {
        if (continueBtn.getAttribute('aria-disabled') === 'true') return;
        renderAppShell();
      });
      return;
    }

    if (!res.ok) {
      if (loadingEl) loadingEl.remove();
      var errEl = document.createElement('div');
      errEl.className = 'alert alert--error';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = 'Could not load your API key. Please try refreshing.';
      keySection.appendChild(errEl);
      return;
    }

    res.json().then(function(data) {
      if (loadingEl) loadingEl.remove();
      var apiKey = (data && data.key) ? data.key : '';

      // Key input + copy button row
      var keyRow = document.createElement('div');
      keyRow.className = 'welcome-key-row';

      var keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.readOnly = true;
      keyInput.className = 'input welcome-key-input';
      keyInput.value = apiKey;
      keyInput.setAttribute('aria-label', 'Your API key');
      keyInput.setAttribute('autocomplete', 'off');
      keyRow.appendChild(keyInput);

      var copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn--ghost btn--sm';
      copyBtn.textContent = 'Copy';
      copyBtn.setAttribute('aria-label', 'Copy API key');
      copyBtn.addEventListener('click', function() {
        copyToClipboard(apiKey, copyBtn);
        if (liveEl) {
          liveEl.textContent = '';
          setTimeout(function() { liveEl.textContent = 'API key copied to clipboard.'; }, 50);
        }
      });
      keyRow.appendChild(copyBtn);

      keySection.appendChild(keyRow);

      // Enable the continue button
      continueBtn.setAttribute('aria-disabled', 'false');
      continueBtn.addEventListener('click', function() {
        if (continueBtn.getAttribute('aria-disabled') === 'true') return;
        continueBtn.setAttribute('aria-disabled', 'true');
        continueBtn.textContent = 'Continuing...';

        apiFetch('/v1/account/first-key/ack', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-WRL-CSRF': '1' }
        }).then(function() {
          renderAppShell();
        }).catch(function() {
          // Non-fatal: navigate even if ack fails
          renderAppShell();
        });
      });

      // Focus the copy button so users can immediately copy
      copyBtn.focus();
    }).catch(function() {
      if (loadingEl) loadingEl.remove();
      var parseErrEl = document.createElement('div');
      parseErrEl.className = 'alert alert--error';
      parseErrEl.setAttribute('role', 'alert');
      parseErrEl.textContent = 'Could not parse API key response. Please try refreshing.';
      keySection.appendChild(parseErrEl);
    });
  }).catch(function() {
    if (loadingEl) loadingEl.remove();
    var netErrEl = document.createElement('div');
    netErrEl.className = 'alert alert--error';
    netErrEl.setAttribute('role', 'alert');
    netErrEl.textContent = 'Connection failed loading your API key. Check your network.';
    keySection.appendChild(netErrEl);
  });
}
`;
