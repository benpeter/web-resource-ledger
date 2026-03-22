// Stub: combined submit + capture list view.
// Placeholder until the full view is implemented.

export const SUBMIT_VIEW_JS = `
// ---------------------------------------------------------------------------
// Captures view (stub)
// ---------------------------------------------------------------------------

function renderCaptures() {
  var view = document.getElementById('view');
  // Safe: clearing the view container
  view.innerHTML = '';

  var h1 = document.createElement('h1');
  h1.tabIndex = -1;
  h1.textContent = 'Captures';
  view.appendChild(h1);

  var p = document.createElement('p');
  p.className = 'view-placeholder';
  p.textContent = 'Captures view coming soon.';
  view.appendChild(p);

  document.title = 'Captures - Web Resource Ledger';
  h1.focus();
}

function mountCaptures() {
  // No interactive elements to wire yet.
}
`;
