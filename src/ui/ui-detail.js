// Stub: capture detail view.
// Placeholder until the full view is implemented.

export const DETAIL_VIEW_JS = `
// ---------------------------------------------------------------------------
// Detail view (stub)
// ---------------------------------------------------------------------------

function renderDetail(id) {
  var view = document.getElementById('view');
  // Safe: clearing the view container
  view.innerHTML = '';

  var h1 = document.createElement('h1');
  h1.tabIndex = -1;
  h1.textContent = 'Capture Detail';
  view.appendChild(h1);

  var p = document.createElement('p');
  p.className = 'view-placeholder';
  p.textContent = 'Capture detail view coming soon.';
  view.appendChild(p);

  document.title = 'Capture Detail - Web Resource Ledger';
  h1.focus();
}

function mountDetail(id) {
  // No interactive elements to wire yet.
}
`;
