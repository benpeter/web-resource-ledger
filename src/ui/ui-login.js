// tva
// Login screen for WRL OAuth flow.
// Exports a JS string constant for inline use in the HTML shell.

export const LOGIN_JS = `
// ---------------------------------------------------------------------------
// OAuth error messages -- closed allowlist, never display raw params
// ---------------------------------------------------------------------------

var ERROR_MESSAGES = {
  denied: 'GitHub authorization was cancelled.',
  missing_params: 'Sign-in failed. Please try again.',
  invalid_state: 'Sign-in failed. Please try again.',
  token_exchange_failed: 'Sign-in failed. Please try again.',
  github_api_error: 'Connection to GitHub failed. Please try again.'
};

var ERROR_DEFAULT = 'Sign-in failed. Please try again.';

function getOAuthErrorMessage(code) {
  return ERROR_MESSAGES[code] || ERROR_DEFAULT;
}

// ---------------------------------------------------------------------------
// renderLogin() -- builds DOM for the login screen
// ---------------------------------------------------------------------------

function renderLogin() {
  document.title = 'Sign In \u2014 Web Resource Ledger';

  var app = document.getElementById('app');
  // Safe: clearing the mount point, not inserting user-supplied content
  app.innerHTML = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'auth-gate';

  var card = document.createElement('div');
  card.className = 'card auth-card';

  // Wordmark / heading
  var heading = document.createElement('h1');
  heading.className = 'auth-wordmark';
  heading.tabIndex = -1;
  heading.textContent = 'Web Resource Ledger';
  card.appendChild(heading);

  var tagline = document.createElement('p');
  tagline.className = 'auth-tagline';
  tagline.textContent = 'Capture and verify web resources';
  card.appendChild(tagline);

  // OAuth error banner (shown when ?error= is present)
  var params = new URLSearchParams(location.search);
  var errorCode = params.get('error');
  if (errorCode) {
    var errorBanner = document.createElement('div');
    errorBanner.className = 'alert alert--error';
    errorBanner.setAttribute('role', 'alert');
    // textContent -- never innerHTML -- so raw param values cannot inject markup
    errorBanner.textContent = getOAuthErrorMessage(errorCode);
    card.appendChild(errorBanner);
  }

  // GitHub sign-in button (anchor, not button -- navigates to /auth/login)
  var githubSection = document.createElement('div');
  githubSection.className = 'login-github-section';

  var githubLink = document.createElement('a');
  githubLink.href = '/auth/login';
  githubLink.className = 'btn btn--github';
  githubLink.setAttribute('aria-label', 'Sign in with GitHub');

  // GitHub Octicon mark SVG (inline, decorative -- aria-hidden)
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'currentColor');
  var path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('d', 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z');
  svg.appendChild(path);
  githubLink.appendChild(svg);

  var githubText = document.createElement('span');
  githubText.textContent = 'Sign in with GitHub';
  githubLink.appendChild(githubText);

  githubSection.appendChild(githubLink);
  card.appendChild(githubSection);

  // Divider
  var divider = document.createElement('div');
  divider.className = 'login-divider';
  divider.setAttribute('aria-hidden', 'true');

  var dividerLine = document.createElement('div');
  dividerLine.className = 'login-divider-line';
  var dividerText = document.createElement('span');
  dividerText.className = 'login-divider-text';
  dividerText.textContent = 'or';
  divider.appendChild(dividerLine);
  divider.appendChild(dividerText);
  card.appendChild(divider);

  // API key section (visually subordinate)
  var apiKeySection = document.createElement('div');
  apiKeySection.className = 'login-apikey-section';

  var apiKeyHeading = document.createElement('p');
  apiKeyHeading.className = 'login-apikey-label';
  apiKeyHeading.textContent = 'Already have an API key?';
  apiKeySection.appendChild(apiKeyHeading);

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

  var formErrorEl = document.createElement('div');
  formErrorEl.id = 'auth-error';
  formErrorEl.className = 'alert alert--error';
  formErrorEl.setAttribute('role', 'alert');
  formErrorEl.setAttribute('aria-live', 'polite');
  formErrorEl.style.display = 'none';
  form.appendChild(formErrorEl);

  var connectBtn = document.createElement('button');
  connectBtn.type = 'submit';
  connectBtn.className = 'btn btn--ghost';
  connectBtn.textContent = 'Connect';
  form.appendChild(connectBtn);

  apiKeySection.appendChild(form);
  card.appendChild(apiKeySection);

  wrapper.appendChild(card);
  app.appendChild(wrapper);

  heading.focus();

  // Stash refs for mountLogin
  form._input = input;
  form._connectBtn = connectBtn;
  form._formErrorEl = formErrorEl;
}

// ---------------------------------------------------------------------------
// mountLogin() -- wire event listeners
// ---------------------------------------------------------------------------

function mountLogin() {
  var form = document.getElementById('auth-form');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    handleAuthSubmit(form._input, form._connectBtn, form._formErrorEl);
  });
}
`;
