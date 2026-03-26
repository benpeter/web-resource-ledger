/**
 * format-legal.js -- Legal verification report formatters for wrl-verify.
 *
 * Produces comprehensive, plain-language verification reports suitable for
 * submission in legal proceedings. No ANSI codes. All values untruncated.
 * Timestamps shown separately (not merged like formatHuman).
 *
 * Two output modes:
 *   formatLegal()     -- structured plain text for terminal/file
 *   formatLegalJson() -- machine-readable JSON for document assembly
 */ // tva

import { checkLabel } from './format.js';

// ---------------------------------------------------------------------------
// Report format version -- bumped when report structure changes
// ---------------------------------------------------------------------------

const REPORT_FORMAT = 'WRL-LEGAL-1.0';

// ---------------------------------------------------------------------------
// Explanatory content constants
// ---------------------------------------------------------------------------

const EXPLANATIONS = {
  artifactHashes: {
    what: 'Each file within the web archive was independently verified by ' +
      'recomputing its SHA-256 hash (a cryptographic fingerprint standardized ' +
      'by NIST in FIPS 180-4) and comparing it to the hash recorded in the ' +
      'archive manifest.',
    pass: 'All files within the archive match their recorded hashes. No ' +
      'file has been added, removed, or modified since the archive was created.',
    fail: 'One or more files within the archive do not match their recorded ' +
      'hashes. The archive contents may have been modified after creation.',
    skip: 'File integrity verification was not applicable for this archive.',
    significance: 'Establishes that the individual captured resources ' +
      '(HTML pages, images, scripts) are identical to those recorded at ' +
      'capture time.',
  },
  bundleHash: {
    what: 'The archive manifest (a JSON document listing all captured ' +
      'resources and their properties) was re-serialized using canonical ' +
      'JSON encoding, and its SHA-256 hash was compared to the hash ' +
      'recorded in the signed digest.',
    pass: 'The manifest hash matches. The list of captured resources and ' +
      'their metadata have not been altered.',
    fail: 'The manifest hash does not match. The archive metadata may ' +
      'have been modified after signing.',
    skip: 'Bundle integrity verification was not applicable.',
    significance: 'Establishes that the archive metadata (resource list, ' +
      'file sizes, individual hashes) is identical to what was originally signed.',
  },
  signature: {
    what: 'The digital signature on the archive was verified using Ed25519 ' +
      '(an elliptic-curve signature algorithm standardized in RFC 8032). ' +
      'The signature covers the bundle hash, binding the archive contents ' +
      'to the signing key.',
    pass: 'The digital signature is valid. The archive was signed by the ' +
      'holder of the corresponding private key, and the signed content has ' +
      'not been modified.',
    fail: 'The digital signature is invalid. Either the archive contents ' +
      'have been modified after signing, or the wrong verification key was used.',
    skip: 'Digital signature verification was not applicable.',
    significance: 'Establishes that a specific party (identified by their ' +
      'signing key) attested to the archive contents at the time of signing.',
  },
  timestamp: {
    what: 'An independent timestamp was obtained from a Time Stamping ' +
      'Authority (TSA) at the time of capture, using the RFC 3161 protocol. ' +
      'The TSA signed a timestamp token containing the bundle hash and the ' +
      'current time, providing independent evidence of when the archive existed.',
    pass: 'The RFC 3161 timestamp is valid. The bundle hash embedded in ' +
      'the timestamp token matches the archive, confirming the archive ' +
      'existed at the recorded time.',
    fail: 'The RFC 3161 timestamp verification failed. The timestamp may ' +
      'be corrupt or may not correspond to this archive.',
    skip: 'No independent timestamp was obtained for this capture. The ' +
      'TSA may have been unreachable at capture time.',
    significance: 'Provides independent, third-party evidence of the date ' +
      'and time at which the archive existed in its current form. Unlike the ' +
      'capture service\'s self-asserted creation time, this timestamp comes ' +
      'from an independent authority.',
  },
  qualifiedTimestamp: {
    what: 'A qualified electronic timestamp was obtained from a Qualified ' +
      'Trust Service Provider (QTSP) under the eIDAS Regulation (EU) ' +
      'No 910/2014. Qualified timestamps carry additional legal significance ' +
      'beyond standard RFC 3161 timestamps.',
    pass: 'The qualified timestamp is valid. The bundle hash embedded in ' +
      'the timestamp token matches the archive.',
    fail: 'The qualified timestamp verification failed structurally.',
    skip: 'No qualified timestamp was requested or obtained for this capture.',
    significance: 'Under eIDAS Regulation (EU) No 910/2014, Article 41(2), ' +
      'a qualified electronic timestamp enjoys a presumption of accuracy of ' +
      'the date and time it indicates, and of the integrity of the data to ' +
      'which the date and time are bound. This presumption is rebuttable but ' +
      'shifts the burden of proof.',
  },
  timestampChain: {
    what: 'The TSA certificate chain was validated against trusted root ' +
      'certificates using CMS/PKCS#7 (RFC 5652) signature verification. ' +
      'This confirms the timestamp was issued by a legitimate TSA whose ' +
      'identity can be traced to a known certificate authority.',
    pass: 'The TSA certificate chain is valid. The timestamp was issued ' +
      'by a TSA whose certificate chains to a trusted root.',
    fail: 'The TSA certificate chain could not be validated.',
    skip: 'Certificate chain verification was not performed. No trusted ' +
      'root certificates were provided for chain validation.',
    significance: 'Establishes the identity and legitimacy of the Time ' +
      'Stamping Authority that issued the timestamp.',
  },
};

const TRUST_MODELS = {
  embedded:
    'TRUST LEVEL: SELF-ASSERTED (LIMITED)\n\n' +
    'This verification used the signing key embedded within the archive\n' +
    'itself. This confirms the archive\'s contents have not been modified\n' +
    'since they were last signed, but it does not establish who performed\n' +
    'the signing or whether the archive originated from a trusted source.\n' +
    'A party who modifies the archive could also replace the embedded key\n' +
    'and re-sign it.',
  origin:
    'The signing key was retrieved from the capture service operator\'s\n' +
    'HTTPS endpoint. This establishes that the operator published this\n' +
    'key as their signing key at the time of verification. The trust in\n' +
    'this verification depends on the authenticity of the operator\'s\n' +
    'HTTPS endpoint and the integrity of the TLS connection used to\n' +
    'retrieve the key.',
  pinned:
    'The signing key was provided directly by the verifier. The trust\n' +
    'in this verification depends on the verifier\'s confidence that\n' +
    'this key belongs to the expected signing party.',
};

const LEGAL_DISCLAIMER =
  'This report is a technical verification document. It does not\n' +
  'constitute legal advice. The admissibility of this evidence and\n' +
  'the legal weight of the verification results are matters for\n' +
  'determination by the relevant court or tribunal.';

const LIMITATIONS = [
  'This tool verifies cryptographic integrity only. It does not ' +
    'verify the accuracy, legality, or completeness of the captured ' +
    'web content itself.',
  'CRL/OCSP certificate revocation checking is not performed. This ' +
    'tool is designed for offline verification where network access to ' +
    'revocation services may be unavailable.',
  'This tool does not independently verify a TSA\'s eIDAS ' +
    'qualification status against the EU Trusted List. The ' +
    'qualification of a timestamp service provider should be ' +
    'confirmed through official channels.',
  'Cryptographic verification is deterministic: the same archive ' +
    'and signing key will always produce the same verification result.',
];

const ALGORITHMS = [
  { name: 'SHA-256', standard: 'FIPS 180-4 (NIST)', purpose: 'Hash computation for file and bundle integrity' },
  { name: 'Ed25519', standard: 'RFC 8032', purpose: 'Digital signature verification' },
  { name: 'RFC 3161', standard: 'RFC 3161 (IETF)', purpose: 'Timestamp token verification' },
  { name: 'CMS/PKCS#7', standard: 'RFC 5652', purpose: 'Timestamp certificate chain validation' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINE = '---------------------------------------------------------------------------';
const DOUBLE = '===========================================================================';

function shellQuote(s) {
  return "'" + String(s ?? '').replace(/'/g, "'\\''") + "'";
}

function toolLine(version) {
  return `@w-r-l/verify ${version} (Node.js ${process.versions.node}, ` +
    `${process.platform} ${process.arch})`;
}

function wrap(text, indent = 0, width = 78) {
  const prefix = ' '.repeat(indent);
  const maxLen = width - indent;
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length + 1 + word.length > maxLen && current.length > 0) {
      lines.push(prefix + current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(prefix + current);
  return lines.join('\n');
}

function statusLabel(status) {
  if (status === 'pass') return 'PASSED';
  if (status === 'fail') return 'FAILED';
  return 'NOT APPLICABLE';
}

// ---------------------------------------------------------------------------
// formatLegal -- Plain-text legal report
// ---------------------------------------------------------------------------

/**
 * Formats a verification result as a comprehensive plain-text legal report.
 * No ANSI codes. All values untruncated. Timestamps shown separately.
 *
 * @param {object} result  The verification result from verifyWacz()
 * @param {{ version: string }} opts  Options including tool version
 */
export function formatLegal(result, opts = {}) {
  const out = [];
  const version = opts.version ?? '0.0.0';
  const verifiedAt = new Date().toISOString();

  // Header
  out.push(DOUBLE);
  out.push('VERIFICATION REPORT: WEB RESOURCE CAPTURE');
  out.push(DOUBLE);
  out.push('');
  out.push(`Format:    ${REPORT_FORMAT}`);
  out.push(`Generated: ${verifiedAt}`);
  out.push(`Tool:      ${toolLine(version)}`);
  out.push('');

  // Section 1: Summary
  out.push('1. SUMMARY');
  out.push(LINE);
  out.push('');

  // Trust model warning leads if embedded key
  const kr = result.keyResolution;
  if (kr?.source === 'embedded') {
    out.push(TRUST_MODELS.embedded);
    out.push('');
  }

  const checks = result.checks ?? [];

  // Display order for legal report -- all checks shown individually
  const checkOrder = [
    'artifactHashes',
    'bundleHash',
    'signature',
    'timestamp',
    'qualifiedTimestamp',
    'timestampChain',
  ];

  // Summary counts use only checks that appear in Section 3
  const reportedChecks = checks.filter(c => checkOrder.includes(c.name));
  const applicable = reportedChecks.filter(c => c.status !== 'skip');
  const failed = applicable.filter(c => c.status === 'fail');

  if (failed.length === 0) {
    out.push(wrap(
      `Result: All ${applicable.length} cryptographic checks passed. ` +
      'No evidence of modification was detected.'
    ));
  } else {
    out.push(wrap(
      `Result: ${failed.length} of ${applicable.length} check(s) failed. ` +
      'This capture cannot be verified as unmodified.'
    ));
  }
  out.push('');
  out.push(`Source:    ${result.source ?? 'unknown'}`);
  out.push(`Verified:  ${verifiedAt}`);
  out.push('');

  // Section 2: Subject of Verification
  out.push('2. SUBJECT OF VERIFICATION');
  out.push(LINE);
  out.push('');
  out.push(wrap(
    'A web resource capture is a snapshot of web content (HTML pages, ' +
    'images, stylesheets, and other resources) preserved in a WACZ ' +
    '(Web Archive Collection Zipped) archive format. The archive ' +
    'includes a cryptographic manifest listing each captured resource ' +
    'and its hash, a digital signature binding the manifest to a ' +
    'signing key, and optionally one or more timestamps from ' +
    'independent authorities.'
  ));
  out.push('');

  const capture = result.capture ?? {};
  out.push(`Source:        ${result.source ?? 'unknown'}`);
  if (capture.signedAt) {
    out.push(`Created:       ${capture.signedAt}`);
  }
  if (capture.bundleHash) {
    out.push(`Bundle hash:   ${capture.bundleHash}`);
  }
  out.push('');

  // Section 3: Verification Checks Performed
  out.push('3. VERIFICATION CHECKS PERFORMED');
  out.push(LINE);
  out.push('');

  let subNum = 1;
  for (const name of checkOrder) {
    const check = checks.find(c => c.name === name);
    if (!check) continue;

    const label = checkLabel(name);
    const expl = EXPLANATIONS[name];

    out.push(`3.${subNum} ${label}`);
    out.push('');
    out.push(`Status: ${statusLabel(check.status)}`);
    out.push('');

    if (expl) {
      out.push(wrap(expl.what));
      out.push('');

      if (check.status === 'pass') {
        out.push(wrap(expl.pass));
      } else if (check.status === 'fail') {
        out.push(wrap(expl.fail));
        if (check.detail) {
          out.push('');
          out.push(wrap(`Detail: ${check.detail}`));
        }
      } else {
        out.push(wrap(expl.skip));
        if (check.detail) {
          out.push('');
          out.push(wrap(`Detail: ${check.detail}`));
        }
      }
      out.push('');
      out.push(wrap(`Evidentiary significance: ${expl.significance}`));
    }
    out.push('');

    // Timestamp-specific details
    if (name === 'timestamp' && capture.timestamp) {
      out.push(`  TSA:      ${capture.timestamp.tsa}`);
      out.push(`  Time:     ${capture.timestamp.genTime}`);
      out.push('');
    }
    if (name === 'qualifiedTimestamp' && capture.qualifiedTimestamp) {
      out.push(`  QTSA:     ${capture.qualifiedTimestamp.tsa}`);
      out.push(`  Time:     ${capture.qualifiedTimestamp.genTime}`);
      out.push('');
      out.push(wrap(
        'A standard RFC 3161 timestamp provides cryptographic evidence of ' +
        'time from an independent authority. A qualified electronic ' +
        'timestamp additionally carries a legal presumption under eIDAS ' +
        'Regulation (EU) No 910/2014, Article 41(2), that the date, time, ' +
        'and data integrity are accurate until proven otherwise.'
      ));
      out.push('');
    }

    subNum++;
  }

  // Section 4: Chain of Custody
  out.push('4. CHAIN OF CUSTODY');
  out.push(LINE);
  out.push('');
  out.push(wrap(
    `The archive was obtained from: ${result.source ?? 'unknown'}`
  ));
  out.push('');

  if (kr) {
    if (kr.source === 'origin' && kr.origin) {
      out.push(wrap(
        `The signing key (ID: ${kr.keyId ?? 'unknown'}) was retrieved ` +
        `from the capture service operator's HTTPS endpoint at ` +
        `${kr.origin}. The key retrieval was performed over an ` +
        'encrypted TLS connection.'
      ));
    } else if (kr.source === 'embedded') {
      out.push(wrap(
        `The signing key (ID: ${kr.keyId ?? 'unknown'}) was extracted ` +
        'from the archive itself (embedded key). See the trust level ' +
        'warning in Section 1.'
      ));
    } else if (kr.source === 'pinned') {
      out.push(wrap(
        `The signing key (ID: ${kr.keyId ?? 'unknown'}) was provided ` +
        'directly by the party performing this verification.'
      ));
    }
    out.push('');
  }

  out.push(wrap(
    'Verification was performed locally on the machine identified in ' +
    'the Methodology section. No data was transmitted to external ' +
    'services during verification.'
  ));
  out.push('');
  out.push(wrap(
    'This report is plain text and is not itself digitally signed. ' +
    'The integrity of the verification results can be confirmed by ' +
    're-running the verification using the instructions in the ' +
    'Methodology section.'
  ));
  out.push('');

  // Section 5: Applicable Legal Standards
  out.push('5. APPLICABLE LEGAL STANDARDS');
  out.push(LINE);
  out.push('');
  out.push(wrap(
    'United States -- Federal Rule of Evidence 901(b)(9): This rule ' +
    'provides for authentication of evidence through "evidence ' +
    'describing a process or system and showing that it produces an ' +
    'accurate result." This report is structured to support ' +
    'authentication under this provision by describing the ' +
    'verification process, the cryptographic algorithms employed, ' +
    'and the results obtained.'
  ));
  out.push('');

  // eIDAS section -- always present, but qualified timestamp significance
  // highlighted when one exists
  const hasQualified = checks.some(
    c => c.name === 'qualifiedTimestamp' && c.status === 'pass'
  );
  out.push(wrap(
    'European Union -- eIDAS Regulation (EU) No 910/2014: Article 41(1) ' +
    'provides that an electronic timestamp shall not be denied legal ' +
    'effect and admissibility as evidence in legal proceedings solely ' +
    'on the grounds that it is in electronic form or that it does not ' +
    'meet the requirements of a qualified electronic timestamp.'
  ));
  out.push('');

  if (hasQualified) {
    out.push(wrap(
      'This capture includes a qualified electronic timestamp. Under ' +
      'Article 41(2), a qualified electronic timestamp enjoys a ' +
      'presumption of the accuracy of the date and time it indicates ' +
      'and of the integrity of the data to which the date and time ' +
      'are bound.'
    ));
    out.push('');
  }

  out.push(wrap(LEGAL_DISCLAIMER));
  out.push('');

  // Section 6: Methodology
  out.push('6. METHODOLOGY');
  out.push(LINE);
  out.push('');
  out.push(`Tool:        @w-r-l/verify`);
  out.push(`Version:     ${version}`);
  out.push(`Source:      https://www.npmjs.com/package/@w-r-l/verify`);
  out.push(`Runtime:     Node.js ${process.versions.node}`);
  out.push(`Platform:    ${process.platform} ${process.arch}`);
  out.push('');

  out.push('Cryptographic algorithms:');
  for (const alg of ALGORITHMS) {
    out.push(`  ${alg.name.padEnd(12)} ${alg.standard.padEnd(20)} ${alg.purpose}`);
  }
  out.push('');

  out.push(wrap(
    'All cryptographic operations use the Node.js built-in crypto ' +
    'module (Web Crypto API for Ed25519 signature verification).'
  ));
  out.push('');

  out.push('Limitations:');
  for (const lim of LIMITATIONS) {
    out.push(wrap(`- ${lim}`, 2));
  }
  out.push('');

  // Reproducibility
  out.push('Reproducibility:');
  out.push(wrap(
    'To independently verify this capture, install @w-r-l/verify ' +
    `version ${version} and run:`
  ));
  out.push('');
  // Build command from result, not process.argv (security: avoid leaking paths)
  let cmd = `  npx @w-r-l/verify@${version} ${shellQuote(result.source ?? '<file-or-url>')}`;
  if (kr?.source === 'origin' && kr.origin) {
    cmd += ` --origin ${shellQuote(kr.origin)}`;
  } else if (kr?.source === 'embedded') {
    cmd += ' --trust-embedded';
  }
  cmd += ' --legal';
  out.push(cmd);
  out.push('');
  out.push(wrap(
    'If custom trust root certificates were used during the original ' +
    'verification (via --trust-root), they must be supplied again when ' +
    're-running the command above.'
  ));
  out.push('');

  // Section 7: Full Technical Details
  out.push('7. FULL TECHNICAL DETAILS');
  out.push(LINE);
  out.push('');
  out.push(wrap(
    'The following values are provided untruncated for independent ' +
    'verification and cross-reference with other records.'
  ));
  out.push('');

  if (capture.bundleHash) {
    out.push(`Bundle hash:       ${capture.bundleHash}`);
  }
  if (capture.signature) {
    out.push(`Signature:         ${capture.signature}`);
  }
  if (capture.publicKey) {
    out.push(`Embedded key:      ${capture.publicKey}`);
    // Repeat trust warning inline for embedded key
    if (kr?.source === 'embedded') {
      out.push('                   (SELF-ASSERTED -- see trust warning in');
      out.push('                   Section 1)');
    }
  }
  if (kr?.keyId) {
    out.push(`Key ID:            ${kr.keyId}`);
  }
  if (kr?.source) {
    const sourceLabel = kr.source === 'origin'
      ? `operator (${kr.origin ?? 'unknown'})`
      : kr.source === 'embedded'
        ? 'embedded in archive (self-asserted)'
        : 'user-provided';
    out.push(`Key source:        ${sourceLabel}`);
  }
  out.push('');

  out.push('Timestamps:');
  out.push('');
  if (capture.signedAt) {
    out.push(`  Capture time:      ${capture.signedAt}`);
    out.push('                     (self-asserted by capture service)');
  }
  if (capture.timestamp) {
    out.push(`  TSA time:          ${capture.timestamp.genTime}`);
    out.push(`  TSA identity:      ${capture.timestamp.tsa}`);
    out.push('                     (independent RFC 3161 timestamp)');
  }
  if (capture.qualifiedTimestamp) {
    out.push(`  QTSA time:         ${capture.qualifiedTimestamp.genTime}`);
    out.push(`  QTSA identity:     ${capture.qualifiedTimestamp.tsa}`);
    out.push('                     (qualified timestamp -- eIDAS Art. 41)');
  }
  out.push(`  Verification time: ${verifiedAt}`);
  out.push('                     (time this report was generated)');
  out.push('');

  out.push(DOUBLE);
  out.push('END OF VERIFICATION REPORT');
  out.push(DOUBLE);
  out.push('');

  process.stdout.write(out.join('\n'));
}

// ---------------------------------------------------------------------------
// formatLegalJson -- JSON legal report
// ---------------------------------------------------------------------------

/**
 * Formats a verification result as a JSON legal report.
 * Includes explanatory fields, legal context, and methodology.
 *
 * @param {object} result  The verification result from verifyWacz()
 * @param {{ version: string }} opts  Options including tool version
 */
export function formatLegalJson(result, opts = {}) {
  const version = opts.version ?? '0.0.0';
  const verifiedAt = new Date().toISOString();
  const capture = result.capture ?? {};
  const kr = result.keyResolution ?? {};
  const checks = result.checks ?? [];

  const applicable = checks.filter(c => c.status !== 'skip');
  const failed = applicable.filter(c => c.status === 'fail');

  let summaryStatement;
  if (failed.length === 0) {
    summaryStatement =
      `All ${applicable.length} cryptographic checks passed. ` +
      'No evidence of modification was detected.';
  } else {
    summaryStatement =
      `${failed.length} of ${applicable.length} check(s) failed. ` +
      'This capture cannot be verified as unmodified.';
  }

  const enrichedChecks = checks.map(c => {
    const expl = EXPLANATIONS[c.name] ?? {};
    return {
      name: c.name,
      label: checkLabel(c.name),
      status: c.status,
      detail: c.detail ?? null,
      explanation: expl.what ?? null,
      result: expl[c.status] ?? null,
      significance: expl.significance ?? null,
    };
  });

  // Timestamps -- separate standard and qualified
  const timestamps = {};
  if (capture.timestamp) {
    timestamps.standard = {
      genTime: capture.timestamp.genTime,
      tsa: capture.timestamp.tsa,
      type: 'RFC 3161',
    };
  }
  if (capture.qualifiedTimestamp) {
    timestamps.qualified = {
      genTime: capture.qualifiedTimestamp.genTime,
      tsa: capture.qualifiedTimestamp.tsa,
      type: 'eIDAS qualified (EU No 910/2014, Art. 41)',
    };
  }
  if (capture.signedAt) {
    timestamps.capture = {
      time: capture.signedAt,
      source: 'self-asserted by capture service',
    };
  }
  timestamps.verification = {
    time: verifiedAt,
    source: 'generated by verification tool',
  };

  // Key resolution with trust model
  let trustModel;
  if (kr.source === 'embedded') {
    trustModel = 'Self-asserted (limited). The signing key was embedded ' +
      'in the archive. This proves internal consistency only, not provenance.';
  } else if (kr.source === 'origin') {
    trustModel = `Operator-published. The signing key was retrieved from ` +
      `${kr.origin ?? 'the operator'} over HTTPS.`;
  } else if (kr.source === 'pinned') {
    trustModel = 'User-provided. The signing key was supplied directly ' +
      'by the verifier.';
  } else {
    trustModel = null;
  }

  const out = {
    reportFormat: REPORT_FORMAT,
    verified: result.verified ?? null,
    tool: {
      name: '@w-r-l/verify',
      version,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
    summary: {
      statement: summaryStatement,
      verified: result.verified ?? null,
      source: result.source ?? null,
      captureDate: capture.signedAt ?? null,
    },
    checks: enrichedChecks,
    capture: {
      bundleHash: capture.bundleHash ?? null,
      signature: capture.signature ?? null,
      embeddedPublicKey: capture.publicKey ?? null,
      signedAt: capture.signedAt ?? null,
    },
    timestamps,
    keyResolution: {
      keyId: kr.keyId ?? null,
      source: kr.source ?? null,
      origin: kr.origin ?? null,
      endpoint: kr.endpoint ?? null,
      publicKey: capture.publicKey ?? null,
      trustModel,
    },
    legalContext: {
      disclaimer: LEGAL_DISCLAIMER.replace(/\n/g, ' '),
      applicableFrameworks: [
        {
          jurisdiction: 'United States',
          reference: 'Federal Rule of Evidence 901(b)(9)',
          relevance: 'Authentication of evidence through description of ' +
            'a process or system showing it produces an accurate result.',
        },
        {
          jurisdiction: 'European Union',
          reference: 'eIDAS Regulation (EU) No 910/2014, Article 41',
          relevance: 'Electronic timestamps shall not be denied legal ' +
            'effect solely on the grounds of electronic form.',
        },
      ],
    },
    methodology: {
      algorithms: ALGORITHMS.map(a => ({
        name: a.name,
        standard: a.standard,
        purpose: a.purpose,
      })),
      cryptoLibrary: 'Node.js built-in crypto (Web Crypto API for Ed25519)',
      limitations: LIMITATIONS,
    },
    verifiedAt,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
