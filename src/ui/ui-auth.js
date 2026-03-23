// tva
// Auth gate, apiFetch wrapper, dual-auth boot, and session management.
// All functions are bundled as a JS string constant for inline use in the HTML shell.
//
// innerHTML usage note: innerHTML is used ONLY to clear the #app mount point
// (app.innerHTML = ''). No user-supplied or external content is ever inserted
// via innerHTML -- all dynamic content uses textContent and DOM construction.

export const AUTH_JS = `
// ---------------------------------------------------------------------------
// Auth constants
// ---------------------------------------------------------------------------

var AUTH_KEY = 'wrl_api_key';
var FETCH_TIMEOUT_MS = 10000;

// Auth state -- set during boot
var _authMethod = null; // 'session' | 'apikey'
var _wrlUser = null;    // { githubLogin, tenantId, tosAcceptedAt, githubId }

// ---------------------------------------------------------------------------
// apiFetch: dual-mode auth, timeout, 401/429 handling
// ---------------------------------------------------------------------------

function apiFetch(path, options) {
  var opts = Object.assign({}, options);
  opts.headers = Object.assign({}, opts.headers);

  if (_authMethod === 'session') {
    opts.credentials = 'same-origin';
    // CSRF header for mutations
    if (opts.method === 'POST' || opts.method === 'DELETE') {
      opts.headers['X-WRL-CSRF'] = '1';
    }
    // No Authorization header -- cookie sent automatically
  } else {
    var key = sessionStorage.getItem(AUTH_KEY);
    if (key) {
      opts.headers['Authorization'] = 'Bearer ' + key;
    }
  }

  var fetchPromise = fetch(path, opts);
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new TypeError('fetch_timeout'));
    }, FETCH_TIMEOUT_MS);
  });

  return Promise.race([fetchPromise, timeoutPromise]).then(function(res) {
    if (res.status === 401) {
      if (_authMethod === 'session') {
        _authMethod = null;
        _wrlUser = null;
        renderLogin();
        mountLogin();
      } else {
        sessionStorage.removeItem(AUTH_KEY);
        renderLogin();
        mountLogin();
      }
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
// Auth gate rendering (API key path -- kept for backward compat)
// ---------------------------------------------------------------------------

function renderAuthGate() {
  renderLogin();
  mountLogin();
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
      _authMethod = 'apikey';
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
  // Safe: clearing mount point only -- no user content inserted via innerHTML
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

  if (_authMethod === 'session') {
    var schedulesLink = document.createElement('a');
    schedulesLink.href = '#/schedules';
    schedulesLink.className = 'nav-link';
    schedulesLink.textContent = 'Schedules';
    navLinks.appendChild(schedulesLink);

    var settingsLink = document.createElement('a');
    settingsLink.href = '#/settings';
    settingsLink.className = 'nav-link';
    settingsLink.textContent = 'Settings';
    navLinks.appendChild(settingsLink);
  }

  nav.appendChild(navLinks);

  var navActions = document.createElement('div');
  navActions.className = 'nav-actions';

  if (_authMethod === 'session' && _wrlUser) {
    var username = document.createElement('span');
    username.className = 'nav-username text-muted';
    username.textContent = _wrlUser.githubLogin;
    navActions.appendChild(username);

    var signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'btn btn--ghost btn--sm';
    signOutBtn.textContent = 'Sign out';
    signOutBtn.addEventListener('click', function() {
      signOutBtn.disabled = true;
      signOutBtn.textContent = 'Signing out...';
      fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-WRL-CSRF': '1' }
      }).then(function() {
        _authMethod = null;
        _wrlUser = null;
        renderLogin();
        mountLogin();
      }).catch(function() {
        _authMethod = null;
        _wrlUser = null;
        renderLogin();
        mountLogin();
      });
    });
    navActions.appendChild(signOutBtn);
  } else {
    var disconnectBtn = document.createElement('button');
    disconnectBtn.type = 'button';
    disconnectBtn.className = 'btn btn--ghost btn--sm';
    disconnectBtn.textContent = 'Sign out';
    disconnectBtn.addEventListener('click', function() {
      sessionStorage.removeItem(AUTH_KEY);
      _authMethod = null;
      renderLogin();
      mountLogin();
    });
    navActions.appendChild(disconnectBtn);
  }

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
// App boot -- dual-auth: session cookie first, API key fallback
// ---------------------------------------------------------------------------

function bootApp() {
  var app = document.getElementById('app');

  // Show loading indicator -- safe: clearing mount point only
  app.innerHTML = '';
  var loadingEl = document.createElement('div');
  loadingEl.className = 'auth-gate';
  var spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.setAttribute('aria-label', 'Loading');
  loadingEl.appendChild(spinner);
  app.appendChild(loadingEl);

  // Check for OAuth error params
  var params = new URLSearchParams(location.search);

  // Try session auth first
  fetch('/auth/session', { credentials: 'same-origin' }).then(function(res) {
    if (!res.ok) throw new Error('session_check_failed');
    return res.json();
  }).then(function(data) {
    if (data.authenticated && data.user) {
      _authMethod = 'session';
      _wrlUser = data.user;

      // ToS gate
      if (!data.user.tosAcceptedAt) {
        renderTos();
        mountTos();
        return;
      }

      // Welcome flow (first sign-up)
      if (params.get('flow') === 'welcome') {
        // Clean URL
        history.replaceState(null, '', location.pathname + location.hash);
        renderWelcome();
        mountWelcome();
        return;
      }

      renderAppShell();
      return;
    }

    // Not session-authenticated -- try API key
    fallbackToApiKey(params);
  }).catch(function() {
    // Session check failed (network, server error) -- try API key
    fallbackToApiKey(params);
  });
}

function fallbackToApiKey(params) {
  var key = sessionStorage.getItem(AUTH_KEY);
  if (key) {
    _authMethod = 'apikey';
    renderAppShell();
  } else {
    // Show login screen (with any OAuth error)
    renderLogin();
    mountLogin();
  }
}
`;
