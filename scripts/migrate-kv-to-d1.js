#!/usr/bin/env node
// tva
/**
 * migrate-kv-to-d1.js -- One-time KV-to-D1 data migration script
 *
 * Reads all metadata from Cloudflare KV and inserts it into the D1 database.
 * Skips rate limit keys (rl:*) and time-series secondary index keys (tenant:*:ts:*).
 * Uses INSERT OR IGNORE for idempotency -- safe to run multiple times.
 *
 * Usage:
 *   node scripts/migrate-kv-to-d1.js --env production
 *   node scripts/migrate-kv-to-d1.js --env staging --dry-run
 *
 * Prerequisites:
 *   - wrangler login (OAuth token in ~/.wrangler)
 *   - unset CLOUDFLARE_API_TOKEN (conflicts with wrangler OAuth)
 *   - D1 migrations already applied (wrangler d1 migrations apply WRL-DB --env production)
 */

import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    env:     { type: 'string',  default: 'production' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const ENV = args.env;
const DRY_RUN = args['dry-run'];

if (ENV !== 'production' && ENV !== 'staging') {
  console.error('Error: --env must be production or staging');
  process.exit(1);
}

const WRANGLER_ENV_FLAG = ENV === 'production' ? '--env production' : '--env staging';

// Wrangler resource names (must match wrangler.toml bindings)
const KV_BINDING  = 'KV';
const D1_BINDING  = 'DB';
const D1_DATABASE = ENV === 'production' ? 'WRL-DB' : 'WRL-DB-staging';

console.log(`Migration: KV → D1`);
console.log(`  Environment : ${ENV}`);
console.log(`  KV binding  : ${KV_BINDING}`);
console.log(`  D1 database : ${D1_DATABASE}`);
console.log(`  Dry run     : ${DRY_RUN}`);
console.log('');

// ---------------------------------------------------------------------------
// Wrangler helpers
// ---------------------------------------------------------------------------

/**
 * Run wrangler KV list for a given prefix, returning all keys (handles pagination).
 * @param {string} prefix  KV key prefix
 * @returns {Array<{name: string, expiration?: number, metadata?: object}>}
 */
function kvListAll(prefix) {
  let cursor = null;
  const keys = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cursorFlag = cursor ? `--cursor "${cursor}"` : '';
    const cmd = `npx wrangler kv key list --binding ${KV_BINDING} --prefix "${prefix}" ${cursorFlag} ${WRANGLER_ENV_FLAG} --format json`;
    const raw = execSync(cmd, { encoding: 'utf8' });
    const result = JSON.parse(raw);

    if (Array.isArray(result)) {
      // Older wrangler: plain array
      keys.push(...result);
      break;
    } else {
      // Newer wrangler: { result, result_info }
      keys.push(...(result.result ?? []));
      if (result.result_info?.cursor) {
        cursor = result.result_info.cursor;
      } else {
        break;
      }
    }
  }

  return keys;
}

/**
 * Fetch a single KV value as parsed JSON.
 * @param {string} key
 * @returns {object|null}
 */
function kvGet(key) {
  try {
    const cmd = `npx wrangler kv key get --binding ${KV_BINDING} "${key}" ${WRANGLER_ENV_FLAG} --format json`;
    const raw = execSync(cmd, { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Execute a SQL statement on D1 via wrangler.
 * @param {string} sql
 */
function d1Execute(sql) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] SQL: ${sql.slice(0, 120)}...`);
    return;
  }
  const cmd = `npx wrangler d1 execute ${D1_DATABASE} ${WRANGLER_ENV_FLAG} --command ${JSON.stringify(sql)} --format json`;
  execSync(cmd, { encoding: 'utf8' });
}

/**
 * Execute a batch of INSERT statements via a semicolon-joined SQL string.
 * D1 execute accepts multiple statements separated by semicolons.
 * @param {string[]} statements
 */
function d1ExecuteBatch(statements) {
  if (statements.length === 0) return;
  d1Execute(statements.join(';\n'));
}

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildTenantInsert(id, config, updatedAt, updatedBy) {
  return [
    `INSERT OR IGNORE INTO tenants (id, config, updated_at, updated_by)`,
    `VALUES (${escapeSql(id)}, ${escapeSql(config ? JSON.stringify(config) : null)}, ${escapeSql(updatedAt)}, ${escapeSql(updatedBy)})`,
  ].join(' ');
}

function buildApiKeyInsert(keyHash, record) {
  return [
    `INSERT OR IGNORE INTO api_keys (key_hash, tenant_id, scopes, name, created_at, created_by, revoked, revoked_at)`,
    `VALUES (${escapeSql(keyHash)}, ${escapeSql(record.tenantId)}, ${escapeSql(JSON.stringify(record.scopes))},`,
    `${escapeSql(record.name)}, ${escapeSql(record.createdAt)}, ${escapeSql(record.createdBy)},`,
    `${record.revoked ? 1 : 0}, ${escapeSql(record.revokedAt ?? null)})`,
  ].join(' ');
}

function buildCaptureInsert(record) {
  const id = record.captureId ?? record.id;
  return [
    `INSERT OR IGNORE INTO captures (id, tenant_id, status, url, ip, created_at, completed_at, failed_at,`,
    `error, retryable, render_quality, artifacts, wacz, render, capture_settings)`,
    `VALUES (${escapeSql(id)}, ${escapeSql(record.tenantId)}, ${escapeSql(record.status)},`,
    `${escapeSql(record.url)}, ${escapeSql(record.ip ?? null)}, ${escapeSql(record.createdAt)},`,
    `${escapeSql(record.completedAt ?? null)}, ${escapeSql(record.failedAt ?? null)},`,
    `${escapeSql(record.error ?? null)}, ${record.retryable ? 1 : 0},`,
    `${escapeSql(record.renderQuality ?? null)},`,
    `${escapeSql(record.artifacts ? JSON.stringify(record.artifacts) : null)},`,
    `${escapeSql(record.wacz ? JSON.stringify(record.wacz) : null)},`,
    `${escapeSql(record.render ? JSON.stringify(record.render) : null)},`,
    `${escapeSql(record.captureSettings ? JSON.stringify(record.captureSettings) : null)})`,
  ].join(' ');
}

function buildSigningKeyInsert(keyId, record) {
  return [
    `INSERT OR IGNORE INTO signing_keys (id, algorithm, public_key, archived_at)`,
    `VALUES (${escapeSql(keyId)}, ${escapeSql(record.algorithm ?? 'Ed25519')},`,
    `${escapeSql(record.publicKey)}, ${escapeSql(record.archivedAt)})`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Migration routines
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;
const stats = { tenants: 0, apiKeys: 0, captures: 0, signingKeys: 0, skipped: 0, errors: 0 };

/**
 * Process tenant config keys (tenant:*:config).
 */
async function migrateTenants() {
  console.log('Migrating tenants...');
  const keys = kvListAll('tenant:');
  const configKeys = keys.filter(k => k.name.endsWith(':config'));
  console.log(`  Found ${configKeys.length} tenant config keys`);

  const inserts = [];
  for (const { name } of configKeys) {
    const tenantId = name.replace(/^tenant:/, '').replace(/:config$/, '');
    const config = kvGet(name);
    if (!config) {
      console.warn(`  Warning: could not fetch ${name}, skipping`);
      stats.skipped++;
      continue;
    }
    const updatedAt = config.updatedAt ?? null;
    const updatedBy = config.updatedBy ?? null;
    // Remove meta fields before storing config blob
    const { updatedAt: _ua, updatedBy: _ub, ...configBlob } = config;
    inserts.push(buildTenantInsert(tenantId, Object.keys(configBlob).length > 0 ? configBlob : null, updatedAt, updatedBy));

    if (inserts.length >= BATCH_SIZE) {
      d1ExecuteBatch(inserts.splice(0, BATCH_SIZE));
      stats.tenants += BATCH_SIZE;
    }
  }
  if (inserts.length > 0) {
    d1ExecuteBatch(inserts);
    stats.tenants += inserts.length;
  }
  console.log(`  Migrated ${stats.tenants} tenant records`);
}

/**
 * Process API key records (apikey:*).
 */
async function migrateApiKeys() {
  console.log('Migrating API keys...');
  const keys = kvListAll('apikey:');
  console.log(`  Found ${keys.length} API key records`);

  const inserts = [];
  for (const { name } of keys) {
    const keyHash = name.replace(/^apikey:/, '');
    const record = kvGet(name);
    if (!record) {
      console.warn(`  Warning: could not fetch ${name}, skipping`);
      stats.skipped++;
      continue;
    }
    // Ensure tenant row exists first
    d1Execute(`INSERT OR IGNORE INTO tenants (id) VALUES (${escapeSql(record.tenantId)})`);
    inserts.push(buildApiKeyInsert(keyHash, record));

    if (inserts.length >= BATCH_SIZE) {
      d1ExecuteBatch(inserts.splice(0, BATCH_SIZE));
      stats.apiKeys += BATCH_SIZE;
    }
  }
  if (inserts.length > 0) {
    d1ExecuteBatch(inserts);
    stats.apiKeys += inserts.length;
  }
  console.log(`  Migrated ${stats.apiKeys} API key records`);
}

/**
 * Process capture records (capture:*).
 */
async function migrateCaptures() {
  console.log('Migrating captures...');
  const keys = kvListAll('capture:');
  console.log(`  Found ${keys.length} capture records`);

  const inserts = [];
  for (const { name } of keys) {
    const captureId = name.replace(/^capture:/, '');
    const record = kvGet(name);
    if (!record) {
      console.warn(`  Warning: could not fetch ${name}, skipping`);
      stats.skipped++;
      continue;
    }

    // Normalize: KV records may use captureId or id
    const id = record.captureId ?? record.id ?? captureId;

    // Validate ID format before inserting (cap_ + 32 hex)
    if (!/^cap_[a-f0-9]{32}$/.test(id)) {
      console.warn(`  Warning: invalid captureId format "${id}", skipping`);
      stats.skipped++;
      continue;
    }

    // Ensure tenant row exists
    const tenantId = record.tenantId ?? 'default';
    d1Execute(`INSERT OR IGNORE INTO tenants (id) VALUES (${escapeSql(tenantId)})`);

    inserts.push(buildCaptureInsert({ ...record, captureId: id, tenantId }));

    if (inserts.length >= BATCH_SIZE) {
      d1ExecuteBatch(inserts.splice(0, BATCH_SIZE));
      stats.captures += BATCH_SIZE;
    }
  }
  if (inserts.length > 0) {
    d1ExecuteBatch(inserts);
    stats.captures += inserts.length;
  }
  console.log(`  Migrated ${stats.captures} capture records`);
}

/**
 * Process signing key archive records (signing-key:*).
 */
async function migrateSigningKeys() {
  console.log('Migrating signing keys...');
  const keys = kvListAll('signing-key:');
  console.log(`  Found ${keys.length} signing key records`);

  const inserts = [];
  for (const { name } of keys) {
    const keyId = name.replace(/^signing-key:/, '');
    const record = kvGet(name);
    if (!record) {
      console.warn(`  Warning: could not fetch ${name}, skipping`);
      stats.skipped++;
      continue;
    }
    inserts.push(buildSigningKeyInsert(keyId, record));

    if (inserts.length >= BATCH_SIZE) {
      d1ExecuteBatch(inserts.splice(0, BATCH_SIZE));
      stats.signingKeys += BATCH_SIZE;
    }
  }
  if (inserts.length > 0) {
    d1ExecuteBatch(inserts);
    stats.signingKeys += inserts.length;
  }
  console.log(`  Migrated ${stats.signingKeys} signing key records`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Checking wrangler auth...');
execSync('npx wrangler whoami', { encoding: 'utf8', stdio: 'pipe' });
console.log('Auth OK\n');

try {
  await migrateTenants();
  await migrateApiKeys();
  await migrateCaptures();
  await migrateSigningKeys();

  console.log('');
  console.log('Migration complete:');
  console.log(`  tenants    : ${stats.tenants}`);
  console.log(`  api_keys   : ${stats.apiKeys}`);
  console.log(`  captures   : ${stats.captures}`);
  console.log(`  signing_keys: ${stats.signingKeys}`);
  if (stats.skipped > 0) console.log(`  skipped    : ${stats.skipped}`);
  if (stats.errors > 0) console.log(`  errors     : ${stats.errors}`);
  if (DRY_RUN) console.log('\n[DRY RUN] No data was written to D1.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}
