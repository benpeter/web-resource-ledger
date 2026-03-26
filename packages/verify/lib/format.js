/**
 * format.js -- Human-readable and JSON output formatters for wrl-verify.
 *
 * Human output is designed for terminal consumption with ANSI color.
 * Color is suppressed when:
 *   - stdout is not a TTY
 *   - --no-color flag was passed
 *   - NO_COLOR env var is set
 *
 * JSON output is a single machine-readable object to stdout.
 * All human messages in JSON mode go to stderr.
 */ // tva

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const ANSI_GREEN  = '\x1b[32m';
const ANSI_RED    = '\x1b[31m';
const ANSI_DIM    = '\x1b[2m';
const ANSI_BOLD   = '\x1b[1m';
const ANSI_RESET  = '\x1b[0m';

/**
 * Returns true when color output should be used.
 *
 * @param {{ noColor?: boolean }} opts
 * @returns {boolean}
 */
function shouldColor(opts = {}) {
  if (opts.noColor) return false;
  if (process.env.NO_COLOR !== undefined) return false;
  return process.stdout.isTTY === true;
}

function green(text, color)  { return color ? `${ANSI_GREEN}${text}${ANSI_RESET}` : text; }
function red(text, color)    { return color ? `${ANSI_RED}${text}${ANSI_RESET}` : text; }
function dim(text, color)    { return color ? `${ANSI_DIM}${text}${ANSI_RESET}` : text; }
function bold(text, color)   { return color ? `${ANSI_BOLD}${text}${ANSI_RESET}` : text; }

// ---------------------------------------------------------------------------
// Check label mapping
// ---------------------------------------------------------------------------

const CHECK_LABELS = {
  artifactHashes:       'File integrity',
  bundleHash:           'Bundle integrity',
  signature:            'Digital signature',
  timestamp:            'Timestamp imprint',
  qualifiedTimestamp:   'Qualified timestamp',
  timeVerification:     'Time verification',
  timestampChain:       'Timestamp chain',
};

// Fixed display order
const CHECK_ORDER = [
  'artifactHashes',
  'bundleHash',
  'signature',
  'timeVerification',
  'timestampChain',
];

/**
 * Returns the human-readable label for a check name.
 *
 * @param {string} name
 * @returns {string}
 */
export function checkLabel(name) {
  return CHECK_LABELS[name] ?? name;
}

export { CHECK_LABELS };

// ---------------------------------------------------------------------------
// Timestamp check merging
// ---------------------------------------------------------------------------

/**
 * Merges `timestamp` and `qualifiedTimestamp` checks into a single
 * `timeVerification` check. The merged entry replaces the first removed entry
 * in the array, preserving display order. Used only by the human formatter --
 * JSON output is not affected.
 *
 * Status priority: fail > pass > skip.
 *
 * @param {Array<{ name: string, status: string, detail?: string }>} checks
 * @returns {Array<{ name: string, status: string, detail?: string }>}
 */
function mergeTimestampChecks(checks) {
  const ts  = checks.find(c => c.name === 'timestamp');
  const qts = checks.find(c => c.name === 'qualifiedTimestamp');

  if (!ts && !qts) return checks;

  // Determine merged status: fail > pass > skip
  let mergedStatus = 'skip';
  let mergedDetail;
  if ((ts && ts.status === 'fail') || (qts && qts.status === 'fail')) {
    mergedStatus = 'fail';
    mergedDetail = (ts && ts.status === 'fail') ? ts.detail : qts.detail;
  } else if ((ts && ts.status === 'pass') || (qts && qts.status === 'pass')) {
    mergedStatus = 'pass';
  }

  // Determine detail text for the merged check
  if (mergedStatus !== 'fail') {
    if (qts && qts.status === 'pass') {
      mergedDetail = 'Qualified electronic timestamp (eIDAS Art. 41)';
    } else if (!qts && ts && ts.status === 'pass') {
      mergedDetail = 'Independent RFC 3161 timestamp';
    } else if (!qts && ts && ts.status === 'skip') {
      mergedDetail = 'No independent timestamp obtained';
    }
  }

  const merged = { name: 'timeVerification', status: mergedStatus };
  if (mergedDetail !== undefined) merged.detail = mergedDetail;

  // Replace at position of first removed entry
  const firstIdx = checks.findIndex(c => c.name === 'timestamp' || c.name === 'qualifiedTimestamp');
  const result = [];
  const removed = new Set(['timestamp', 'qualifiedTimestamp']);
  let inserted = false;
  for (let i = 0; i < checks.length; i++) {
    if (removed.has(checks[i].name)) {
      if (!inserted) {
        result.push(merged);
        inserted = true;
      }
    } else {
      result.push(checks[i]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Human-readable formatter
// ---------------------------------------------------------------------------

/**
 * Formats a verification result as human-readable text and writes to stdout.
 *
 * @param {{
 *   verified: boolean,
 *   checks: Array<{ name: string, status: string, detail?: string }>,
 *   capture?: {
 *     bundleHash?: string,
 *     signature?: string,
 *     publicKey?: string,
 *     signedAt?: string,
 *     timestamp?: { genTime: string, tsa: string },
 *     qualifiedTimestamp?: { genTime: string, tsa: string }
 *   },
 *   keyResolution?: {
 *     keyId: string,
 *     source: string,
 *     origin?: string,
 *     endpoint?: string,
 *   },
 *   source: string,
 * }} result
 * @param {{ noColor?: boolean }} [opts]
 */
export function formatHuman(result, opts = {}) {
  const color = shouldColor(opts);

  // Merge timestamp checks before ordering
  const merged = mergeTimestampChecks(result.checks);

  // Sort checks into fixed display order, preserving any extras at the end
  const orderedChecks = [];
  for (const name of CHECK_ORDER) {
    const c = merged.find(ch => ch.name === name);
    if (c) orderedChecks.push(c);
  }
  for (const c of merged) {
    if (!CHECK_ORDER.includes(c.name)) orderedChecks.push(c);
  }

  // Line 1: verdict header
  const headerLabel = result.verified
    ? bold(green('Verified', color), color)
    : bold(red('FAILED', color), color);
  process.stdout.write(`${headerLabel}  ${result.source}\n\n`);

  // Check table
  const COL_WIDTH = 22; // label column width (padded to align status)
  for (const check of orderedChecks) {
    const label = checkLabel(check.name);
    const padded = label.padEnd(COL_WIDTH);

    let statusStr;
    if (check.status === 'pass') {
      statusStr = green('pass', color);
    } else if (check.status === 'fail') {
      statusStr = red('FAIL', color);
    } else {
      statusStr = dim('skip', color);
    }

    const detail = (check.status !== 'pass' && check.detail)
      ? `  ${dim(check.detail, color)}`
      : '';

    process.stdout.write(`  ${padded}${statusStr}${detail}\n`);
  }

  // Metadata block
  process.stdout.write('\n');

  const signedAt = result.capture?.signedAt;
  if (signedAt) {
    process.stdout.write(`  Signed    ${signedAt}\n`);
  }

  const tsa = result.capture?.timestamp?.tsa;
  if (tsa) {
    process.stdout.write(`  TSA       ${tsa}\n`);
  }

  const qtsa = result.capture?.qualifiedTimestamp?.tsa;
  if (qtsa) {
    process.stdout.write(`  QTSA      ${qtsa} (eIDAS)\n`);
  }

  const kr = result.keyResolution;
  if (kr?.keyId) {
    let keySource;
    if (kr.source === 'origin' && kr.origin) {
      const host = (() => {
        try { return new URL(kr.origin).host; }
        catch { return kr.origin; }
      })();
      keySource = `(from ${host})`;
    } else if (kr.source === 'embedded') {
      keySource = dim('(EMBEDDED -- self-asserted only)', color);
    } else {
      keySource = '(user-provided)';
    }
    process.stdout.write(`  Key       ${kr.keyId} ${keySource}\n`);
  }

  const bundleHash = result.capture?.bundleHash;
  if (bundleHash) {
    // Truncate to first 16 hex chars after the "sha256:" prefix
    const prefix = bundleHash.startsWith('sha256:') ? 'sha256:' : '';
    const hex = bundleHash.startsWith('sha256:') ? bundleHash.slice(7) : bundleHash;
    const truncated = `${prefix}${hex.slice(0, 16)}...`;
    process.stdout.write(`  Hash      ${truncated}\n`);
  }

  // Verdict line
  process.stdout.write('\n');
  const verdict = buildVerdict(orderedChecks);
  process.stdout.write(`Verdict: ${verdict}\n`);
}

/**
 * Builds the verdict sentence from the checks array.
 *
 * @param {Array<{ name: string, status: string, detail?: string }>} checks
 * @returns {string}
 */
function buildVerdict(checks) {
  const applicable = checks.filter(c => c.status !== 'skip');
  const passed     = applicable.filter(c => c.status === 'pass');
  const failed     = applicable.filter(c => c.status === 'fail');
  const skipped    = checks.filter(c => c.status === 'skip');

  const allPass = failed.length === 0;

  if (allPass && skipped.length === 0) {
    return (
      `All ${applicable.length} cryptographic checks passed. ` +
      `This capture has not been modified since it was signed by the capture service.`
    );
  }

  if (allPass && skipped.length > 0) {
    return (
      `${passed.length} of ${applicable.length} applicable checks passed. ` +
      `${skipped.length} check${skipped.length === 1 ? '' : 's'} were not applicable (no timestamp data).`
    );
  }

  const failedLabels = failed.map(c => checkLabel(c.name)).join(', ');
  return (
    `${failed.length} of ${applicable.length} applicable check${applicable.length === 1 ? '' : 's'} failed. ` +
    `This capture cannot be verified as authentic. ` +
    `Failed: ${failedLabels}.`
  );
}

// ---------------------------------------------------------------------------
// JSON formatter
// ---------------------------------------------------------------------------

/**
 * Formats a verification result as a JSON object and writes to stdout.
 * All human messages go to stderr in JSON mode.
 *
 * @param {{
 *   verified: boolean|null,
 *   checks: Array<{ name: string, status: string, detail?: string }>,
 *   capture?: object,
 *   keyResolution?: object,
 *   source: string,
 *   error?: string,
 * }} result
 */
export function formatJson(result) {
  const checks = (result.checks ?? []).map(c => ({
    name:   c.name,
    label:  checkLabel(c.name),
    status: c.status,
    detail: c.detail ?? null,
  }));

  // Remap capture: rename publicKey -> embeddedPublicKey per spec
  let capture = null;
  if (result.capture) {
    const { publicKey, ...rest } = result.capture;
    capture = { ...rest };
    if (publicKey !== undefined) {
      capture.embeddedPublicKey = publicKey;
    }
  }

  const out = {
    verified:      result.verified ?? null,
    checks,
    capture,
    keyResolution: result.keyResolution ?? null,
    source:        result.source,
    verifiedAt:    new Date().toISOString(),
  };

  if (result.error) {
    out.error = result.error;
  }

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

/**
 * Formats an error as JSON to stdout (for --json mode errors).
 *
 * @param {string} message
 * @param {string} source
 */
export function formatJsonError(message, source) {
  const out = {
    verified:      null,
    checks:        [],
    capture:       null,
    keyResolution: null,
    source:        source ?? '',
    verifiedAt:    new Date().toISOString(),
    error:         message,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
