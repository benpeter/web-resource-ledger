// tva
// Auth gate, apiFetch wrapper, and disconnect logic.
// All functions are bundled as a JS string constant for inline use in the HTML shell.

export const AUTH_JS = `
// ---------------------------------------------------------------------------
// Auth constants
// ---------------------------------------------------------------------------

var AUTH_KEY = 'wrl_api_key';
var FETCH_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// apiFetch: adds auth header, timeout, and handles 401/429
// ---------------------------------------------------------------------------

function apiFetch(path, options) {
  var key = sessionStorage.getItem(AUTH_KEY);
  var opts = Object.assign({}, options);
  opts.headers = Object.assign({}, opts.headers, {
    'Authorization': 'Bearer ' + key
  });

  var fetchPromise = fetch(path, opts);
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new TypeError('fetch_timeout'));
    }, FETCH_TIMEOUT_MS);
  });

  return Promise.race([fetchPromise, timeoutPromise]).then(function(res) {
    if (res.status === 401) {
      sessionStorage.removeItem(AUTH_KEY);
      renderAuthGate();
      return res;
    }
    if (res.status === 429) {
      var retryAfter = res.headers.get('Retry-After') || '60';
      var secs = parseInt(retryAfter, 10) || 60;
      showGlobalError('Too many requests. Please wait ' + secs + ' second' + (secs !== 1 ? 's' : '') + ' and try again.');
      return res;
    }
    return res;
  });
}

// ---------------------------------------------------------------------------
// Auth gate rendering
// ---------------------------------------------------------------------------

function renderAuthGate() {
  var app = document.getElementById('app');
  // Safe: clearing the mount point, not inserting user-supplied content
  app.innerHTML = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'auth-gate';

  var card = document.createElement('div');
  card.className = 'card auth-card';

  var heading = document.createElement('h1');
  heading.className = 'auth-wordmark';
  heading.tabIndex = -1;
  heading.textContent = 'Web Resource Ledger';
  card.appendChild(heading);

  var tagline = document.createElement('p');
  tagline.className = 'auth-tagline';
  tagline.textContent = 'Enter your API key to get started';
  card.appendChild(tagline);

  var form = document.createElement('form');
  form.id = 'auth-form';
  form.noValidate = true;

  var input = document.createElement('input');
  input.type = 'password';
  input.id = 'auth-key-input';
  input.className = 'input';
  input.autocomplete = 'current-password';
  input.placeholder = 'wrl_live_...';
  input.required = true;
  input.setAttribute('aria-label', 'API key');
  form.appendChild(input);

  var errorEl = document.createElement('div');
  errorEl.id = 'auth-error';
  errorEl.className = 'alert alert--error';
  errorEl.setAttribute('role', 'alert');
  errorEl.setAttribute('aria-live', 'polite');
  errorEl.style.display = 'none';
  form.appendChild(errorEl);

  var btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn--primary';
  btn.textContent = 'Connect';
  form.appendChild(btn);

  card.appendChild(form);
  wrapper.appendChild(card);
  app.appendChild(wrapper);

  heading.focus();

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    handleAuthSubmit(input, btn, errorEl);
  });
}

function showAuthError(errorEl, message) {
  errorEl.textContent = message;
  errorEl.style.display = '';
  errorEl.focus();
}

function handleAuthSubmit(input, btn, errorEl) {
  var key = input.value.trim();
  if (!key) {
    showAuthError(errorEl, 'API key is required.');
    return;
  }

  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Connecting...';

  var fetchPromise = fetch('/v1/captures?limit=1', {
    headers: { 'Authorization': 'Bearer ' + key }
  });
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new TypeError('fetch_timeout'));
    }, FETCH_TIMEOUT_MS);
  });

  Promise.race([fetchPromise, timeoutPromise]).then(function(res) {
    btn.disabled = false;
    btn.textContent = 'Connect';
    if (res.ok) {
      sessionStorage.setItem(AUTH_KEY, key);
      renderAppShell();
    } else if (res.status === 401 || res.status === 403) {
      showAuthError(errorEl, 'Invalid API key. Check your key and try again.');
    } else {
      showAuthError(errorEl, 'Connection failed (HTTP ' + res.status + '). Try again.');
    }
  }).catch(function(err) {
    btn.disabled = false;
    btn.textContent = 'Connect';
    if (err && err.message === 'fetch_timeout') {
      showAuthError(errorEl, 'Connection timed out. Check your network and try again.');
    } else {
      showAuthError(errorEl, 'Connection failed. Check your network and try again.');
    }
  });
}

// ---------------------------------------------------------------------------
// App shell (post-auth layout)
// ---------------------------------------------------------------------------

function renderAppShell() {
  var app = document.getElementById('app');
  // Safe: clearing the mount point, not inserting user-supplied content
  app.innerHTML = '';

  var nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Main navigation');

  var navLinks = document.createElement('div');
  navLinks.className = 'nav-links';
  var capturesLink = document.createElement('a');
  capturesLink.href = '#/captures';
  capturesLink.className = 'nav-link';
  capturesLink.textContent = 'Captures';
  navLinks.appendChild(capturesLink);
  nav.appendChild(navLinks);

  var navActions = document.createElement('div');
  navActions.className = 'nav-actions';
  var disconnectBtn = document.createElement('button');
  disconnectBtn.type = 'button';
  disconnectBtn.className = 'btn btn--ghost btn--sm';
  disconnectBtn.textContent = 'Disconnect';
  disconnectBtn.addEventListener('click', function() {
    sessionStorage.removeItem(AUTH_KEY);
    renderAuthGate();
  });
  navActions.appendChild(disconnectBtn);
  nav.appendChild(navActions);

  var main = document.createElement('main');
  main.id = 'view';
  main.className = 'view-container';

  app.appendChild(nav);
  app.appendChild(main);

  // Navigate to current hash or default
  route();
}

// ---------------------------------------------------------------------------
// Global error display (for apiFetch 429 etc.)
// ---------------------------------------------------------------------------

function showGlobalError(message) {
  var existing = document.getElementById('global-error');
  if (existing) existing.remove();

  var el = document.createElement('div');
  el.id = 'global-error';
  el.className = 'alert alert--warning global-error';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;

  var view = document.getElementById('view');
  if (view) {
    view.insertBefore(el, view.firstChild);
  } else {
    document.getElementById('app').insertBefore(el, document.getElementById('app').firstChild);
  }
}

// ---------------------------------------------------------------------------
// App boot
// ---------------------------------------------------------------------------

function bootApp() {
  var key = sessionStorage.getItem(AUTH_KEY);
  if (key) {
    renderAppShell();
  } else {
    renderAuthGate();
  }
}
`;
