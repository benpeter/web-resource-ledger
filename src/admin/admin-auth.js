// Admin dashboard auth gate and fetch wrapper.
// Exports a JS string constant for inline use in the admin HTML shell.

export const ADMIN_AUTH_JS = `
// ---------------------------------------------------------------------------
// Admin auth constants
// ---------------------------------------------------------------------------

// sessionStorage chosen for single-operator admin tool -- tab-scoped, clears on close.
// If admin UI ever shares an origin with user content, reassess.
var ADMIN_KEY_STORAGE = 'wrl_admin_key';
var ADMIN_FETCH_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// adminFetch: wraps fetch() with Authorization header from sessionStorage.
// On 401, clears sessionStorage and reloads (session expired or key changed).
// ---------------------------------------------------------------------------

function adminFetch(path, options) {
  var key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  var opts = Object.assign({}, options);
  opts.headers = Object.assign({}, opts.headers);
  if (key) {
    opts.headers['Authorization'] = 'Bearer ' + key;
  }

  var fetchPromise = fetch(path, opts);
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new TypeError('fetch_timeout'));
    }, ADMIN_FETCH_TIMEOUT_MS);
  });

  return Promise.race([fetchPromise, timeoutPromise]).then(function(res) {
    if (res.status === 401) {
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      location.reload();
      return res;
    }
    return res;
  });
}

// ---------------------------------------------------------------------------
// Login throttle state
// ---------------------------------------------------------------------------

var _adminConsecutive401s = 0;
var _adminThrottleUntil = 0;
var _adminCountdownTimer = null;

function isAdminThrottled() {
  return Date.now() < _adminThrottleUntil;
}

function startAdminThrottle(btn, errorEl) {
  _adminThrottleUntil = Date.now() + 30000;
  btn.disabled = true;

  function tick() {
    var remaining = Math.ceil((_adminThrottleUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      errorEl.textContent = 'Too many failed attempts. Try again.';
      return;
    }
    btn.textContent = 'Try again in ' + remaining + 's';
    _adminCountdownTimer = setTimeout(tick, 1000);
  }

  tick();
}

// ---------------------------------------------------------------------------
// Login form rendering
// ---------------------------------------------------------------------------

function renderAdminLogin() {
  var app = document.getElementById('admin-app');
  // Safe: clearing mount point only
  app.textContent = '';

  var gate = document.createElement('div');
  gate.className = 'auth-gate';

  var card = document.createElement('div');
  card.className = 'auth-card card';

  var wordmark = document.createElement('div');
  wordmark.className = 'auth-wordmark';
  wordmark.textContent = 'WRL Admin';
  card.appendChild(wordmark);

  var tagline = document.createElement('p');
  tagline.className = 'auth-tagline';
  tagline.textContent = 'Enter your admin key to continue.';
  card.appendChild(tagline);

  var form = document.createElement('form');
  form.id = 'admin-login-form';

  var label = document.createElement('label');
  label.setAttribute('for', 'admin-key-input');
  label.className = 'sr-only';
  label.textContent = 'Admin key';
  form.appendChild(label);

  var input = document.createElement('input');
  input.type = 'password';
  input.id = 'admin-key-input';
  input.className = 'input';
  input.placeholder = 'Admin key';
  input.autocomplete = 'off';
  // Do NOT disable paste -- paste-friendly for long keys
  form.appendChild(input);

  var errorEl = document.createElement('div');
  errorEl.id = 'admin-login-error';
  errorEl.className = 'alert alert--error';
  errorEl.setAttribute('role', 'alert');
  errorEl.style.display = 'none';
  form.appendChild(errorEl);

  var btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'btn btn--primary';
  btn.textContent = 'Sign in';
  form.appendChild(btn);

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    handleAdminLoginSubmit(input, btn, errorEl);
  });

  card.appendChild(form);
  gate.appendChild(card);
  app.appendChild(gate);

  input.focus();
}

function handleAdminLoginSubmit(input, btn, errorEl) {
  if (isAdminThrottled()) return;

  var key = input.value.trim();
  if (!key) {
    errorEl.textContent = 'Admin key is required.';
    errorEl.style.display = '';
    errorEl.focus();
    return;
  }

  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  var fetchPromise = fetch('/v1/admin/overview', {
    headers: { 'Authorization': 'Bearer ' + key }
  });
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new TypeError('fetch_timeout'));
    }, ADMIN_FETCH_TIMEOUT_MS);
  });

  Promise.race([fetchPromise, timeoutPromise]).then(function(res) {
    if (res.ok) {
      _adminConsecutive401s = 0;
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      renderAdminShell();
      adminRoute();
    } else if (res.status === 401 || res.status === 403) {
      _adminConsecutive401s++;
      input.value = '';
      if (_adminConsecutive401s >= 3) {
        errorEl.textContent = 'Invalid key.';
        errorEl.style.display = '';
        startAdminThrottle(btn, errorEl);
      } else {
        btn.disabled = false;
        btn.textContent = 'Sign in';
        errorEl.textContent = 'Invalid admin key. Check your key and try again.';
        errorEl.style.display = '';
        errorEl.focus();
      }
    } else {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      errorEl.textContent = 'Connection failed (HTTP ' + res.status + '). Try again.';
      errorEl.style.display = '';
      errorEl.focus();
    }
  }).catch(function(err) {
    btn.disabled = false;
    btn.textContent = 'Sign in';
    if (err && err.message === 'fetch_timeout') {
      errorEl.textContent = 'Connection timed out. Check your network and try again.';
    } else {
      errorEl.textContent = 'Connection failed. Check your network and try again.';
    }
    errorEl.style.display = '';
    errorEl.focus();
  });
}

// ---------------------------------------------------------------------------
// Admin shell (post-auth nav + content area)
// ---------------------------------------------------------------------------

function renderAdminShell() {
  var app = document.getElementById('admin-app');
  // Safe: clearing mount point only
  app.textContent = '';

  var nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Admin navigation');

  var navLinks = document.createElement('div');
  navLinks.className = 'nav-links';

  var tenantsLink = document.createElement('a');
  tenantsLink.href = '#/tenants';
  tenantsLink.className = 'nav-link';
  tenantsLink.textContent = 'Tenants';
  navLinks.appendChild(tenantsLink);

  nav.appendChild(navLinks);

  var navActions = document.createElement('div');
  navActions.className = 'nav-actions';

  var wordmark = document.createElement('span');
  wordmark.className = 'nav-link text-muted';
  wordmark.style.cursor = 'default';
  wordmark.textContent = 'WRL Admin';
  navActions.appendChild(wordmark);

  var logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'btn btn--ghost btn--sm';
  logoutBtn.textContent = 'Logout';
  logoutBtn.addEventListener('click', function() {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    location.reload();
  });
  navActions.appendChild(logoutBtn);

  nav.appendChild(navActions);

  var main = document.createElement('main');
  main.id = 'admin-view';
  main.className = 'view-container view-container--admin';

  // aria-live region for announcements (screen readers)
  var liveEl = document.createElement('div');
  liveEl.id = 'admin-live';
  liveEl.className = 'sr-only';
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');
  main.appendChild(liveEl);

  app.appendChild(nav);
  app.appendChild(main);
}

// ---------------------------------------------------------------------------
// Announce helper (used by views)
// ---------------------------------------------------------------------------

function adminAnnounce(message) {
  var el = document.getElementById('admin-live');
  if (!el) return;
  el.textContent = '';
  setTimeout(function() { el.textContent = message; }, 50);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function bootAdminApp() {
  var key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  if (key) {
    renderAdminShell();
    adminRoute();
  } else {
    renderAdminLogin();
  }
}
`;
