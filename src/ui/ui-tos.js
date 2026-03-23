// tva
// Terms of Service acceptance gate shown after first GitHub OAuth sign-in.
// Exports a JS string constant for inline use in the HTML shell.

export const TOS_JS = `
// ---------------------------------------------------------------------------
// renderTos() -- builds DOM for the ToS acceptance gate
// ---------------------------------------------------------------------------

function renderTos() {
  document.title = 'Terms of Service \u2014 WRL';

  var app = document.getElementById('app');
  // Safe: clearing the mount point, not inserting user-supplied content
  app.innerHTML = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'auth-gate';

  var card = document.createElement('div');
  card.className = 'card auth-card tos-gate';

  var heading = document.createElement('h1');
  heading.className = 'auth-wordmark';
  heading.tabIndex = -1;
  heading.textContent = 'Terms of Service';
  card.appendChild(heading);

  var intro = document.createElement('p');
  intro.className = 'auth-tagline';
  intro.textContent = 'Review and accept the terms to continue.';
  card.appendChild(intro);

  // Checkbox row
  var checkboxRow = document.createElement('div');
  checkboxRow.className = 'tos-checkbox-row';

  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'tos-accept-checkbox';
  checkbox.className = 'tos-checkbox';
  checkboxRow.appendChild(checkbox);

  var label = document.createElement('label');
  label.htmlFor = 'tos-accept-checkbox';
  label.className = 'tos-label';
  label.textContent = 'I agree to the ';

  var tosLink = document.createElement('a');
  tosLink.href = '/terms';
  tosLink.target = '_blank';
  tosLink.rel = 'noopener noreferrer';
  tosLink.textContent = 'Terms of Service';
  label.appendChild(tosLink);

  label.appendChild(document.createTextNode(' and '));

  var policyLink = document.createElement('a');
  policyLink.href = '/content-policy';
  policyLink.target = '_blank';
  policyLink.rel = 'noopener noreferrer';
  policyLink.textContent = 'Content Policy';
  label.appendChild(policyLink);

  checkboxRow.appendChild(label);
  card.appendChild(checkboxRow);

  // Error region
  var tosErrorEl = document.createElement('div');
  tosErrorEl.id = 'tos-error';
  tosErrorEl.className = 'alert alert--error';
  tosErrorEl.setAttribute('role', 'alert');
  tosErrorEl.setAttribute('aria-live', 'polite');
  tosErrorEl.style.display = 'none';
  card.appendChild(tosErrorEl);

  // Action buttons
  var actions = document.createElement('div');
  actions.className = 'tos-actions';

  var acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.id = 'tos-accept-btn';
  acceptBtn.className = 'btn btn--primary';
  acceptBtn.textContent = 'Accept and Continue';
  // Start as aria-disabled; tabindex always 0 for keyboard discoverability
  acceptBtn.setAttribute('aria-disabled', 'true');
  acceptBtn.tabIndex = 0;
  actions.appendChild(acceptBtn);

  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.id = 'tos-cancel-btn';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  card.appendChild(actions);
  wrapper.appendChild(card);
  app.appendChild(wrapper);

  // Move focus to checkbox on mount for keyboard users
  checkbox.focus();
}

// ---------------------------------------------------------------------------
// mountTos() -- wire event listeners
// ---------------------------------------------------------------------------

function mountTos() {
  var checkbox = document.getElementById('tos-accept-checkbox');
  var acceptBtn = document.getElementById('tos-accept-btn');
  var cancelBtn = document.getElementById('tos-cancel-btn');
  var tosErrorEl = document.getElementById('tos-error');
  if (!checkbox || !acceptBtn || !cancelBtn) return;

  // Toggle aria-disabled state as checkbox changes
  checkbox.addEventListener('change', function() {
    if (checkbox.checked) {
      acceptBtn.setAttribute('aria-disabled', 'false');
    } else {
      acceptBtn.setAttribute('aria-disabled', 'true');
    }
  });

  // Accept: call API then proceed
  acceptBtn.addEventListener('click', function() {
    if (acceptBtn.getAttribute('aria-disabled') === 'true') return;

    acceptBtn.setAttribute('aria-disabled', 'true');
    acceptBtn.textContent = 'Accepting...';
    if (tosErrorEl) tosErrorEl.style.display = 'none';

    apiFetch('/v1/account/tos', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WRL-CSRF': '1'
      },
      body: JSON.stringify({ tosVersion: '2026-03-23' })
    }).then(function(res) {
      if (!res) return; // 401 handled upstream

      if (res.ok) {
        // Proceed to welcome screen
        renderWelcome();
        mountWelcome();
        return;
      }

      // Error
      acceptBtn.setAttribute('aria-disabled', checkbox.checked ? 'false' : 'true');
      acceptBtn.textContent = 'Accept and Continue';
      if (tosErrorEl) {
        tosErrorEl.textContent = 'Could not accept terms (HTTP ' + res.status + '). Please try again.';
        tosErrorEl.style.display = '';
        tosErrorEl.focus();
      }
    }).catch(function() {
      acceptBtn.setAttribute('aria-disabled', checkbox.checked ? 'false' : 'true');
      acceptBtn.textContent = 'Accept and Continue';
      if (tosErrorEl) {
        tosErrorEl.textContent = 'Connection failed. Check your network and try again.';
        tosErrorEl.style.display = '';
        tosErrorEl.focus();
      }
    });
  });

  // Cancel: sign out and return to login
  cancelBtn.addEventListener('click', function() {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Signing out...';

    apiFetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-WRL-CSRF': '1' }
    }).then(function() {
      renderLogin();
      mountLogin();
    }).catch(function() {
      // If logout request fails, still return to login screen
      renderLogin();
      mountLogin();
    });
  });
}
`;
