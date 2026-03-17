/**
 * cli.js -- Argument parsing and orchestration for wrl-verify.
 *
 * Parses process.argv manually (no dependencies).
 * Loads the WACZ, resolves the signing key, runs verification,
 * and formats output.
 *
 * Exit codes:
 *   0  -- All checks passed (verified)
 *   1  -- One or more checks failed (not verified)
 *   2  -- Usage error (bad arguments, missing file, network error)
 */ // tva

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verifyWacz } from './verify.js';
import { loadTrustedRoots } from './cms-verify.js';
import { formatHuman, formatJson, formatJsonError } from './format.js';
import {
  resolveKey,
  isWrlCaptureUrl,
  originFromUrl,
  fetchWaczFromCaptureUrl,
  fetchWaczFromUrl,
} from './key-resolver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
USAGE
  $ wrl-verify <file-or-url> [options]

  Verify the cryptographic integrity of a WRL WACZ capture.

ARGUMENTS
  <file-or-url>    Path to a .wacz file, or a WRL capture URL

OPTIONS
  --origin <url>       WRL instance URL for key resolution
  --key <base64>       Ed25519 public key (base64)
  --key-file <path>    Read public key from file
  --trust-embedded     Use the embedded key (insecure, see below)
  --trust-root <path>  Additional trusted root certificate (PEM)
  --json               Output machine-readable JSON to stdout
  --no-color           Disable colored output
  -h, --help           Show this help message
  --version            Show version number

EXIT CODES
  0    All checks passed (verified)
  1    One or more checks failed (not verified)
  2    Usage error (bad arguments, missing file, network error)

TRUST MODEL
  Remote URLs: key is fetched automatically from the server origin.
  Local files: you must specify --origin, --key, or --key-file.
  --trust-embedded uses the key embedded in the WACZ (proves internal
  consistency only, not that the capture came from a trusted operator).
`.trimStart();

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

/**
 * Parses the argv array (process.argv.slice(2)) into a structured options
 * object.
 *
 * @param {string[]} argv
 * @returns {{
 *   target: string|null,
 *   origin: string|null,
 *   key: string|null,
 *   keyFile: string|null,
 *   trustEmbedded: boolean,
 *   trustRoots: string[],
 *   json: boolean,
 *   noColor: boolean,
 *   help: boolean,
 *   version: boolean,
 * }}
 * @throws {Error} on unknown or malformed flags
 */
export function parseArgs(argv) {
  const opts = {
    target:        null,
    origin:        null,
    key:           null,
    keyFile:       null,
    trustEmbedded: false,
    trustRoots:    [],
    json:          false,
    noColor:       false,
    help:          false,
    version:       false,
  };

  const VALUE_FLAGS = new Set(['--origin', '--key', '--key-file', '--trust-root']);
  const BOOL_FLAGS  = new Set(['--trust-embedded', '--json', '--no-color', '-h', '--help', '--version']);

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      i++;
      continue;
    }

    if (arg === '--version') {
      opts.version = true;
      i++;
      continue;
    }

    if (arg === '--trust-embedded') {
      opts.trustEmbedded = true;
      i++;
      continue;
    }

    if (arg === '--json') {
      opts.json = true;
      i++;
      continue;
    }

    if (arg === '--no-color') {
      opts.noColor = true;
      i++;
      continue;
    }

    if (arg === '--origin') {
      if (i + 1 >= argv.length) throw new Error('--origin requires a value');
      opts.origin = argv[++i];
      i++;
      continue;
    }

    if (arg === '--key') {
      if (i + 1 >= argv.length) throw new Error('--key requires a value');
      opts.key = argv[++i];
      i++;
      continue;
    }

    if (arg === '--key-file') {
      if (i + 1 >= argv.length) throw new Error('--key-file requires a value');
      opts.keyFile = argv[++i];
      i++;
      continue;
    }

    if (arg === '--trust-root') {
      if (i + 1 >= argv.length) throw new Error('--trust-root requires a value');
      opts.trustRoots.push(argv[++i]);
      i++;
      continue;
    }

    // Reject any other flags
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    // Positional argument
    if (opts.target === null) {
      opts.target = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    i++;
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Version helper
// ---------------------------------------------------------------------------

function getVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ---------------------------------------------------------------------------
// WACZ digest extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the signedData object from WACZ bytes by reading
 * datapackage-digest.json from the ZIP.
 *
 * @param {Uint8Array} waczBytes
 * @returns {object|null}  signedData or null on failure
 */
function extractSignedData(waczBytes) {
  try {
    const files = unzipSync(waczBytes);
    const digestRaw = files['datapackage-digest.json'];
    if (!digestRaw) return null;
    const digest = JSON.parse(new TextDecoder().decode(digestRaw));
    return digest?.signedData ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Key source mutual exclusivity check
// ---------------------------------------------------------------------------

/**
 * Returns an error message if more than one key source is specified.
 *
 * @param {{ origin, key, keyFile, trustEmbedded }} opts
 * @returns {string|null}
 */
function checkKeySourceExclusion(opts) {
  const sources = [
    opts.origin        && '--origin',
    opts.key           && '--key',
    opts.keyFile       && '--key-file',
    opts.trustEmbedded && '--trust-embedded',
  ].filter(Boolean);

  if (sources.length > 1) {
    return `These key source options are mutually exclusive: ${sources.join(', ')}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * CLI entry point. Parses arguments and runs the full verification pipeline.
 *
 * @param {string[]} argv  process.argv.slice(2)
 */
export async function run(argv) {
  let opts;
  let jsonMode = argv.includes('--json');
  const noColor = argv.includes('--no-color');

  // Parse arguments -- handle parse errors immediately
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (jsonMode) {
      formatJsonError(err.message, '');
    } else {
      process.stderr.write(`Error: ${err.message}\n\nRun with --help for usage.\n`);
    }
    process.exit(2);
  }

  jsonMode = opts.json;

  // Early exits: --help and --version
  if (opts.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  if (opts.version) {
    process.stdout.write(`${getVersion()}\n`);
    process.exit(0);
  }

  // Node.js version check
  const nodeVersion = process.versions.node;
  const nodeMajor   = parseInt(nodeVersion.split('.')[0], 10);
  if (nodeMajor < 20) {
    const msg = `@w-r-l/verify requires Node.js 20 or later.\nYou are running Node.js ${nodeVersion}.`;
    if (jsonMode) {
      formatJsonError(msg, opts.target ?? '');
    } else {
      process.stderr.write(`Error: ${msg}\n`);
    }
    process.exit(2);
  }

  // Require target
  if (!opts.target) {
    const msg = 'Missing required argument: <file-or-url>';
    if (jsonMode) {
      formatJsonError(msg, '');
    } else {
      process.stderr.write(`Error: ${msg}\n\nRun with --help for usage.\n`);
    }
    process.exit(2);
  }

  // Mutually exclusive key sources
  const keyConflict = checkKeySourceExclusion(opts);
  if (keyConflict) {
    if (jsonMode) {
      formatJsonError(keyConflict, opts.target);
    } else {
      process.stderr.write(`Error: ${keyConflict}\n\nRun with --help for usage.\n`);
    }
    process.exit(2);
  }

  // From here on, all errors are caught and formatted consistently
  let waczBytes;
  let origin      = opts.origin;
  let sourceName  = opts.target;

  try {
    // -----------------------------------------------------------------------
    // Load / fetch WACZ bytes
    // -----------------------------------------------------------------------
    if (isWrlCaptureUrl(opts.target)) {
      // WRL capture URL: auto-derive origin (unless --origin overrides)
      if (!origin) {
        origin = originFromUrl(opts.target);
      }
      const result = await fetchWaczFromCaptureUrl(opts.target);
      waczBytes  = result.waczBytes;
      sourceName = opts.target;
    } else {
      let isUrl = false;
      try { new URL(opts.target); isUrl = true; } catch { /* not a URL */ }

      if (isUrl) {
        // Arbitrary HTTPS URL -- no auto-origin derivation
        waczBytes  = await fetchWaczFromUrl(opts.target);
        sourceName = opts.target;
      } else {
        // Local file
        try {
          waczBytes = await readFile(opts.target);
        } catch (err) {
          throw new Error(`Cannot read file ${opts.target}: ${err.message}`);
        }
        // Extract filename for display
        sourceName = opts.target.split('/').pop() ?? opts.target;
      }
    }

    // -----------------------------------------------------------------------
    // Extract signedData for key resolution
    // -----------------------------------------------------------------------
    const signedData = extractSignedData(waczBytes);

    // -----------------------------------------------------------------------
    // Resolve signing key
    // -----------------------------------------------------------------------
    const keyResolution = await resolveKey({
      origin,
      key:           opts.key,
      keyFile:       opts.keyFile,
      trustEmbedded: opts.trustEmbedded,
      signedData,
    });

    // -----------------------------------------------------------------------
    // Load trusted roots
    // -----------------------------------------------------------------------
    const trustedRoots = loadTrustedRoots(opts.trustRoots);

    // -----------------------------------------------------------------------
    // Run verification
    // -----------------------------------------------------------------------
    const result = await verifyWacz(waczBytes, keyResolution.publicKeyBytes, { trustedRoots });

    // Attach resolution metadata for output
    result.source = sourceName;
    result.keyResolution = {
      keyId:    keyResolution.keyId,
      source:   keyResolution.source,
      origin:   keyResolution.origin ?? null,
      endpoint: keyResolution.endpoint ?? null,
    };

    // -----------------------------------------------------------------------
    // Format and output
    // -----------------------------------------------------------------------
    if (opts.json) {
      formatJson(result);
    } else {
      formatHuman(result, { noColor: opts.noColor });
    }

    process.exit(result.verified ? 0 : 1);

  } catch (err) {
    const msg = err.message ?? String(err);
    if (opts.json) {
      formatJsonError(msg, sourceName);
    } else {
      process.stderr.write(`Error: ${msg}\n`);
    }
    process.exit(2);
  }
}
