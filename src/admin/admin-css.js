// Admin dashboard CSS additions.
// Only admin-specific overrides -- the design system handles everything else.
// All values use design system custom properties exclusively.

export const ADMIN_CSS = `
/* ---------------------------------------------------------------------------
   Admin app layout
--------------------------------------------------------------------------- */

#admin-app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Admin-specific view container: wider than tenant views (860px) */
.view-container--admin {
  flex: 1;
  padding: var(--space-8) var(--space-4);
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
}

/* ---------------------------------------------------------------------------
   Admin stat cards
--------------------------------------------------------------------------- */

.admin-stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.admin-stat {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
}

.admin-stat-value {
  display: block;
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  color: var(--color-text);
  margin-bottom: var(--space-1);
}

.admin-stat-label {
  display: block;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

/* ---------------------------------------------------------------------------
   Admin table
--------------------------------------------------------------------------- */

.admin-table-wrap {
  overflow-x: auto;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-base);
}

.admin-table th {
  background: var(--color-surface-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--space-2) var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

/* Sortable column header buttons */
.admin-table th button {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.admin-table th button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Sort indicator via ::after pseudo-element */
.admin-table th button[data-sort="asc"]::after  { content: " ↑"; }
.admin-table th button[data-sort="desc"]::after { content: " ↓"; }

.admin-table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
  vertical-align: middle;
}

.admin-table tbody tr {
  cursor: pointer;
  background: var(--color-surface);
  transition: background 0.1s;
}

.admin-table tbody tr:hover {
  background: var(--color-surface-muted);
}

.admin-table tbody tr:last-child td {
  border-bottom: none;
}

/* Numeric cells: right-aligned with tabular figures */
.admin-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-sm);
}

/* ---------------------------------------------------------------------------
   Tenant ID link
--------------------------------------------------------------------------- */

.admin-tenant-link {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-primary);
  text-decoration: none;
}

.admin-tenant-link:hover {
  color: var(--color-accent);
  text-decoration: underline;
}

.admin-tenant-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* ---------------------------------------------------------------------------
   Refresh button (mirrors .usage-refresh-btn)
--------------------------------------------------------------------------- */

.admin-refresh-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 8px;
  font-size: var(--text-sm);
}

.admin-refresh-btn:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

.admin-refresh-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.admin-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---------------------------------------------------------------------------
   Admin detail sections
--------------------------------------------------------------------------- */

.admin-detail-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-6);
}

.admin-back-link {
  display: inline-block;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  margin-bottom: var(--space-4);
}

.admin-back-link:hover {
  color: var(--color-primary);
}

.admin-back-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.admin-section {
  border-top: 1px solid var(--color-border);
  padding: var(--space-6) 0;
}

.admin-section h2 {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin: 0 0 var(--space-4);
}

/* Config pre/code block */
.admin-config-block {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  overflow-x: auto;
  white-space: pre;
  max-height: 320px;
  overflow-y: auto;
}

/* Table within detail sections */
.admin-detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.admin-detail-table th {
  text-align: left;
  font-weight: var(--weight-medium);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.admin-detail-table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}

.admin-detail-table tbody tr:last-child td {
  border-bottom: none;
}

/* Toolbar row between stats and table */
.admin-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: var(--space-3);
}
`;
