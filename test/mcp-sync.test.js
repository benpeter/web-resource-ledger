// tva
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, '../openapi.yaml');

function extractOperationIds(spec) {
  const ids = [];
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const op = pathItem[method];
      if (op?.operationId) {
        ids.push(op.operationId);
      }
    }
  }
  return ids;
}

// Map of MCP tool name -> OpenAPI operationId it covers
const TOOL_TO_OPERATION = {
  capture_url: 'createCapture',
  batch_capture: 'batchCapture',
  get_capture: 'getCapture',
  list_captures: 'listCaptures',
  verify_capture: 'verifyCapture',
  diff_captures: 'diffCaptures',
  get_usage: 'getAccountUsage',
  list_schedules: 'listSchedules',
  create_schedule: 'createSchedule',
  delete_schedule: 'deleteSchedule',
  get_certificate: 'getCaptureCertificate',
};

// OperationIds intentionally not exposed as MCP tools, with the reason why.
// If you add a new operationId to openapi.yaml and it should not become an MCP
// tool, add it here. If it should become a tool, add it to TOOL_TO_OPERATION
// above and create the tool in src/mcp.js.
const EXCLUDED_OPERATIONS = {
  // Admin auth boundary -- these require an ADMIN_KEY, not a tenant API key,
  // and are not appropriate for AI agent use via MCP.
  adminCreateKey: 'admin auth boundary',
  adminListKeys: 'admin auth boundary',
  adminRevokeKey: 'admin auth boundary',
  adminGetUsage: 'admin auth boundary',
  adminCachePurge: 'admin auth boundary',

  // Infrastructure / health -- not meaningful as an MCP tool action
  getHealth: 'infrastructure/health',
  preflightCaptures: 'infrastructure/health (CORS preflight)',

  // Subset / redundant -- getCapture already returns status; a separate
  // status-only endpoint adds no additional MCP surface.
  getCaptureStatus: 'subset/redundant (getCapture returns full object including status)',

  // Binary content -- MCP tool responses are text; returning raw binary
  // artifact bytes over MCP is not practical.
  getCaptureArtifact: 'binary content (not suitable for MCP text response)',

  // Public key infrastructure -- signing key lookup is internal
  // infrastructure, not an AI agent workflow.
  getSigningKey: 'public key infrastructure (internal, not an agent workflow)',
  getSigningKeys: 'public key infrastructure (internal, not an agent workflow)',

  // Deferred -- webhook support is on the roadmap but not yet prioritised.
  createWebhook: 'deferred (webhook support not yet implemented)',
  listWebhooks: 'deferred (webhook support not yet implemented)',
  deleteWebhook: 'deferred (webhook support not yet implemented)',
  pingWebhook: 'deferred (webhook support not yet implemented)',

  // UI / settings concern -- notification preferences and unsubscribe are
  // user-facing web UI flows, not AI agent actions.
  getNotificationPreferences: 'UI/settings concern (user-facing web flow)',
  updateNotificationPreferences: 'UI/settings concern (user-facing web flow)',
  getUnsubscribePage: 'UI/settings concern (user-facing web flow)',
  processUnsubscribe: 'UI/settings concern (user-facing web flow)',

  // Other -- list_schedules already returns full schedule objects, so a
  // separate single-schedule getter is redundant in the MCP surface.
  getSchedule: 'redundant (list_schedules returns full objects; single getter adds no agent value)',
};

describe('MCP tool surface / OpenAPI spec sync', () => {
  const raw = readFileSync(specPath, 'utf8');
  const spec = parse(raw);
  const specOperationIds = extractOperationIds(spec);
  const mappedOperationIds = new Set(Object.values(TOOL_TO_OPERATION));
  const excludedOperationIds = new Set(Object.keys(EXCLUDED_OPERATIONS));

  it('every operationId in the spec is either mapped to a tool or explicitly excluded', () => {
    const unaccounted = specOperationIds.filter(
      (id) => !mappedOperationIds.has(id) && !excludedOperationIds.has(id),
    );
    expect(unaccounted).toEqual(
      [],
      `New operationId(s) found in openapi.yaml that are not mapped to an MCP tool ` +
        `and not in EXCLUDED_OPERATIONS. Add each to TOOL_TO_OPERATION (and implement ` +
        `the tool in src/mcp.js) or add it to EXCLUDED_OPERATIONS with a reason: ` +
        unaccounted.join(', '),
    );
  });

  it('no operationId is both mapped to a tool and listed as excluded', () => {
    const overlap = [...mappedOperationIds].filter((id) => excludedOperationIds.has(id));
    expect(overlap).toEqual(
      [],
      `These operationIds appear in both TOOL_TO_OPERATION and EXCLUDED_OPERATIONS: ` +
        overlap.join(', '),
    );
  });

  it('no stale exclusions (every excluded operationId still exists in the spec)', () => {
    const specSet = new Set(specOperationIds);
    const stale = Object.keys(EXCLUDED_OPERATIONS).filter((id) => !specSet.has(id));
    expect(stale).toEqual(
      [],
      `These operationIds are listed in EXCLUDED_OPERATIONS but no longer exist in ` +
        `openapi.yaml. Remove them from the exclusion list: ` +
        stale.join(', '),
    );
  });
});
