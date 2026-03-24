// tva

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { signBytes } from './signing.js';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PAGE_WIDTH  = 612;   // US Letter
const PAGE_HEIGHT = 792;
const MARGIN      = 72;    // 1 inch
const CONTENT_W   = PAGE_WIDTH - MARGIN * 2;

// ---------------------------------------------------------------------------
// Default operator identity
// ---------------------------------------------------------------------------

const defaultOperator = {
  name: 'Gerhard Benjamin Peter',
  address: 'Weidenhaeuser Str. 73, 35037 Marburg, Germany',
  email: 'bp@ben-peter.com',
  systemName: 'Web Resource Ledger',
  systemUrl: 'https://webresourceledger.com',
  sourceUrl: 'https://github.com/benpeter/web-resource-ledger',
};

// ---------------------------------------------------------------------------
// Text-flow helper (~50 lines)
// Tracks Y cursor, handles word-wrap and automatic page breaks.
// ---------------------------------------------------------------------------

function makeFlow(doc, fonts, pages) {
  const state = { page: pages[0], y: PAGE_HEIGHT - MARGIN };

  /** Ensure at least `needed` pts remain below cursor; add page if not. */
  function ensureSpace(needed) {
    if (state.y - needed < MARGIN + 20) {
      state.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(state.page);
      state.y = PAGE_HEIGHT - MARGIN;
    }
  }

  /** Draw word-wrapped text. Returns height consumed. */
  function drawText(text, { font, size = 10, color, indent = 0, leading = 2 } = {}) {
    const f      = font || fonts.body;
    const col    = color || rgb(0, 0, 0);
    const lineH  = size + leading;
    const maxW   = CONTENT_W - indent;
    const words  = String(text).split(' ');
    const lines  = [];
    let line     = '';

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    let consumed = 0;
    for (const l of lines) {
      ensureSpace(lineH);
      state.page.drawText(l, { x: MARGIN + indent, y: state.y, font: f, size, color: col });
      state.y  -= lineH;
      consumed += lineH;
    }
    return consumed;
  }

  /** Advance cursor by `pts` without drawing. */
  function gap(pts) {
    ensureSpace(pts);
    state.y -= pts;
  }

  /** Draw a light horizontal rule. */
  function rule() {
    ensureSpace(12);
    state.page.drawLine({
      start: { x: MARGIN, y: state.y },
      end:   { x: PAGE_WIDTH - MARGIN, y: state.y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    state.y -= 10;
  }

  /**
   * Draw a two-column key/value row on the same baseline.
   * labelWidth: px width reserved for the label column.
   */
  function drawKV(label, value, { labelWidth = 130, valueFont, valueSize = 10, indent = 0 } = {}) {
    const vf    = valueFont || fonts.body;
    const lineH = valueSize + 4;
    ensureSpace(lineH);
    state.page.drawText(label, {
      x: MARGIN + indent, y: state.y, font: fonts.bold, size: 10, color: rgb(0, 0, 0),
    });
    // Truncate value if too wide to fit
    const maxValW = CONTENT_W - labelWidth - indent - 4;
    let val = String(value);
    while (val.length > 4 && vf.widthOfTextAtSize(val, valueSize) > maxValW) {
      val = val.slice(0, -4) + '...';
    }
    state.page.drawText(val, {
      x: MARGIN + indent + labelWidth, y: state.y, font: vf, size: valueSize, color: rgb(0, 0, 0),
    });
    state.y -= lineH;
  }

  return { drawText, gap, rule, drawKV, state, pages };
}

// ---------------------------------------------------------------------------
// Date formatting (UTC, no Date.now())
// ---------------------------------------------------------------------------

function fmtUtc(isoString) {
  const d   = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic PDF certificate for a capture.
 *
 * Determinism guarantee: given identical inputs, produces byte-identical output.
 * Achieved by:
 *   - PDFDocument.create({ updateMetadata: false })
 *   - CreationDate / ModDate set to capture.completedAt (never Date.now())
 *   - Standard PDF fonts only (no embedding/subsetting)
 *   - doc.save({ useObjectStreams: false }) -- no content stream compression
 *
 * @param {Object} capture       Capture record from D1
 * @param {Object} signingKeys   { privateKey, publicKeyBytes, keyId }
 * @param {string} origin        Request origin for building URLs
 * @param {Object} [operatorInfo] Operator identity (defaults to defaultOperator)
 * @returns {Promise<{ pdfBytes: Uint8Array, signature: string }>}
 */
export async function generateCertificate(capture, signingKeys, origin, operatorInfo = {}) {
  const op = { ...defaultOperator, ...operatorInfo };

  // ----------------------------------------------------------------
  // Create document with deterministic metadata
  // ----------------------------------------------------------------
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle('FRE 902(13) Certificate of Record');
  doc.setProducer('Web Resource Ledger');
  doc.setCreator('Web Resource Ledger');
  doc.setCreationDate(new Date(capture.completedAt));
  doc.setModificationDate(new Date(capture.completedAt));

  const fonts = {
    bold:    await doc.embedFont(StandardFonts.HelveticaBold),
    oblique: await doc.embedFont(StandardFonts.HelveticaOblique),
    regular: await doc.embedFont(StandardFonts.Helvetica),
    courier: await doc.embedFont(StandardFonts.Courier),
  };
  fonts.body = fonts.regular;

  const pages = [doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])];
  const { drawText, gap, rule, drawKV, state } = makeFlow(doc, fonts, pages);

  const captureId = capture.captureId;
  const verifyUrl = `${origin}/v1/verify/${captureId}`;
  const pubKeyUrl = `${origin}/.well-known/signing-key`;
  const certUrl   = `${origin}/v1/captures/${captureId}/certificate`;

  // ----------------------------------------------------------------
  // Title block
  // ----------------------------------------------------------------
  gap(4);
  drawText(
    'CERTIFICATION OF RECORD GENERATED BY ELECTRONIC PROCESS OR SYSTEM',
    { font: fonts.bold, size: 16 },
  );
  gap(6);
  drawText('Pursuant to Federal Rule of Evidence 902(13)', { font: fonts.oblique, size: 11 });
  gap(10);
  rule();

  // ----------------------------------------------------------------
  // Header block
  // ----------------------------------------------------------------
  gap(4);
  drawKV('Capture ID:',        captureId,             { valueFont: fonts.courier, valueSize: 9 });
  gap(2);
  drawKV('Captured URL:',      capture.url,           { valueFont: fonts.courier, valueSize: 9 });
  gap(2);
  drawKV('Capture Date:',      fmtUtc(capture.completedAt));
  gap(2);
  drawKV('Verification URL:',  verifyUrl,             { valueFont: fonts.courier, valueSize: 9 });
  gap(8);
  rule();

  // ----------------------------------------------------------------
  // Section I: Attestation Statement
  // ----------------------------------------------------------------
  gap(6);
  drawText('I. ATTESTATION STATEMENT', { font: fonts.bold, size: 12 });
  gap(6);
  drawText(
    'I, [NAME OF QUALIFIED PERSON], state the following based on my personal knowledge and ' +
    'familiarity with the electronic process described below:',
  );
  gap(6);

  const attestPoints = [
    '1. I am the [TITLE/ROLE] of Web Resource Ledger ("WRL"), the electronic system described in this ' +
      'certification, and am qualified to certify the accuracy of records generated by this system.',
    '2. The record identified below was generated by an electronic process or system that produces an ' +
      'accurate result.',
    '3. The electronic process described in Section II of this document was applied to capture the web ' +
      'page at the URL identified above on the date and time stated above.',
    '4. The integrity evidence described in Section III of this document confirms that the captured ' +
      'record has not been altered since the time of capture.',
  ];
  for (const pt of attestPoints) {
    drawText(pt, { indent: 12 });
    gap(4);
  }

  gap(4);
  drawText(
    'This certification is made pursuant to Federal Rule of Evidence 902(13) and complies with the ' +
    'certification requirements of Rule 902(11).',
  );
  gap(10);
  drawText(
    'I declare under penalty of perjury that the foregoing is true and correct.',
    { font: fonts.oblique },
  );
  gap(18);

  for (const label of ['Name:', 'Title/Role:', 'Date:', 'Signature:']) {
    drawText(`${label}  _________________________________`, { size: 10 });
    gap(8);
  }
  drawText('[SIGNATURE REQUIRED]', { font: fonts.bold, size: 10, color: rgb(0.6, 0, 0) });
  gap(8);
  rule();

  // ----------------------------------------------------------------
  // Section II: Description of the Electronic Process
  // ----------------------------------------------------------------
  gap(6);
  drawText('II. DESCRIPTION OF THE ELECTRONIC PROCESS', { font: fonts.bold, size: 12 });
  gap(6);

  drawText('System Overview', { font: fonts.bold });
  gap(4);
  drawText(
    `Web Resource Ledger (WRL) is an automated web archival system operated by ${op.name}. ` +
    'The system captures web pages using a server-side headless browser, records the rendered content, ' +
    'and seals the resulting archive with cryptographic integrity evidence. All processing occurs on ' +
    'controlled server infrastructure without human intervention in the capture pipeline.',
  );
  gap(8);

  drawText('Capture Process', { font: fonts.bold });
  gap(4);

  const captureSteps = [
    'URL Validation: The submitted URL is validated against a scheme allowlist (http/https) and checked ' +
      'against a threat intelligence feed before capture begins.',
    'Server-Side Browser Rendering: A headless browser (Chromium) is launched in an isolated server-side ' +
      'environment. The browser navigates to the target URL, executes JavaScript, and waits for the page ' +
      'to reach a stable rendered state.',
    'Content Recording: The browser records the fully rendered HTML, a full-page screenshot (PNG), and ' +
      'the HTTP response headers for the initial page request.',
    'WACZ Assembly: The recorded content is assembled into a WACZ (Web Archive Collection Zipped) bundle ' +
      'conforming to the WACZ 1.1 specification. WACZ is a standardized format for web archives.',
    'Hash Computation: A SHA-256 hash of the complete WACZ bundle is computed and recorded. This hash ' +
      'serves as the tamper-evident fingerprint of the capture.',
    'Digital Signing: The bundle hash and capture metadata are signed with an Ed25519 private key held ' +
      'exclusively by the WRL system. The corresponding public key is published at a known endpoint.',
    'Independent Timestamping: An RFC 3161-compliant cryptographic timestamp is requested from a trusted ' +
      'timestamp authority (TSA), binding the capture to a precise point in time as certified by the TSA.',
  ];
  for (let i = 0; i < captureSteps.length; i++) {
    drawText(`${i + 1}. ${captureSteps[i]}`, { indent: 12 });
    gap(5);
  }

  gap(4);
  drawText('Security Controls', { font: fonts.bold });
  gap(4);
  drawText(
    'The capture pipeline operates without user-modifiable inputs after URL submission. ' +
    'Private keys are stored in hardware-backed secrets and are never exposed in logs or API responses. ' +
    'Bundle hashes and signing key identifiers are stored immutably after capture completion. ' +
    'The public key endpoint allows independent verification of any signature produced by the system.',
  );
  gap(8);
  rule();

  // ----------------------------------------------------------------
  // Section III: Integrity Evidence
  // ----------------------------------------------------------------
  gap(6);
  drawText('III. INTEGRITY EVIDENCE', { font: fonts.bold, size: 12 });
  gap(6);

  // 3.1 Capture Identification
  drawText('3.1 Capture Identification', { font: fonts.bold });
  gap(4);
  drawKV('Capture ID:',     captureId,                       { indent: 12, labelWidth: 120, valueFont: fonts.courier, valueSize: 9 });
  gap(2);
  drawKV('URL:',            capture.url,                     { indent: 12, labelWidth: 120, valueFont: fonts.courier, valueSize: 9 });
  gap(2);
  drawKV('Initiated:',      fmtUtc(capture.createdAt),       { indent: 12, labelWidth: 120 });
  gap(2);
  drawKV('Completed:',      fmtUtc(capture.completedAt),     { indent: 12, labelWidth: 120 });
  gap(2);
  drawKV('Render Quality:', capture.renderQuality ?? 'full', { indent: 12, labelWidth: 120 });

  // 3.2 Hash Integrity
  gap(8);
  drawText('3.2 Hash Integrity', { font: fonts.bold });
  gap(4);
  drawText(
    'A SHA-256 hash (digital fingerprint) of the complete capture bundle was computed at the time of ' +
    'capture. Any modification to the bundle after capture would produce a different hash, making ' +
    'tampering detectable.',
  );
  gap(4);
  drawText('Bundle Hash (SHA-256):', { font: fonts.bold, indent: 12 });
  gap(2);
  drawText(capture.wacz.bundleHash, { font: fonts.courier, size: 8, indent: 24 });

  // 3.3 Digital Signature
  gap(8);
  drawText('3.3 Digital Signature', { font: fonts.bold });
  gap(4);
  drawText(
    'The bundle hash was signed using Ed25519, an elliptic-curve digital signature algorithm providing ' +
    '128-bit security. The signature was created at the time of capture using the private key identified below.',
  );
  gap(4);
  drawKV('Algorithm:', 'Ed25519', { labelWidth: 120 });
  gap(2);
  drawText(`Key ID:  ${capture.wacz.keyId}`, { font: fonts.courier, size: 9, indent: 12 });
  gap(2);
  drawText(`Public Key Endpoint:  ${pubKeyUrl}`, { font: fonts.courier, size: 8, indent: 12 });

  // 3.4 Independent Timestamp (RFC 3161)
  gap(8);
  drawText('3.4 Independent Timestamp (RFC 3161)', { font: fonts.bold });
  gap(4);

  const tsStatus = capture.wacz.timestampStatus;
  if (tsStatus === 'present') {
    drawText(
      'An RFC 3161 cryptographic timestamp was obtained from a trusted timestamp authority (TSA) at the ' +
      'time of capture. The timestamp binds the capture bundle to the stated capture time, as certified ' +
      'by an independent third party. The timestamp token is embedded within the WACZ bundle.',
    );
  } else if (tsStatus === 'error') {
    drawText(
      'An independent timestamp was requested but could not be obtained due to a service interruption.',
    );
  } else {
    drawText('No independent timestamp was requested for this capture.');
  }

  // 3.5 Qualified Timestamp (eIDAS) -- only when present
  if (capture.wacz.qualifiedTimestampStatus === 'present') {
    gap(8);
    drawText('3.5 Qualified Timestamp (eIDAS)', { font: fonts.bold });
    gap(4);
    drawText(
      'A qualified electronic timestamp was obtained from a qualified trust service provider (QTSP) in ' +
      'accordance with the EU eIDAS Regulation 910/2014/EU. A qualified timestamp carries the presumption ' +
      'of accuracy of the date and time it indicates under EU law and related national implementing ' +
      'legislation. The qualified timestamp token is embedded within the WACZ bundle.',
    );
  }

  gap(8);
  rule();

  // ----------------------------------------------------------------
  // Section IV: Operator Identity
  // ----------------------------------------------------------------
  gap(6);
  drawText('IV. OPERATOR IDENTITY', { font: fonts.bold, size: 12 });
  gap(6);
  drawKV('System Operator:', op.name);
  gap(4);
  drawKV('Address:',         op.address);
  gap(4);
  drawKV('Contact:',         op.email);
  gap(4);
  drawKV('System:',          `${op.systemName} (${op.systemUrl})`);
  gap(4);
  drawText(`Source Code:  ${op.sourceUrl}`, { font: fonts.courier, size: 9 });
  gap(8);
  rule();

  // ----------------------------------------------------------------
  // Section V: Verification
  // ----------------------------------------------------------------
  gap(6);
  drawText('V. VERIFICATION', { font: fonts.bold, size: 12 });
  gap(6);
  drawText(
    'The integrity of this capture can be independently verified using the following resources:',
  );
  gap(6);

  drawText('1. Verification Page:', { font: fonts.bold, indent: 12 });
  gap(2);
  drawText(verifyUrl, { font: fonts.courier, size: 9, indent: 24 });
  gap(2);
  drawText(
    'The verification page re-computes the SHA-256 hash of the WACZ bundle and verifies the Ed25519 signature.',
    { indent: 24 },
  );
  gap(6);
  drawText('2. Public Key Endpoint:', { font: fonts.bold, indent: 12 });
  gap(2);
  drawText(pubKeyUrl, { font: fonts.courier, size: 9, indent: 24 });
  gap(2);
  drawText(
    'The current Ed25519 public key. The key ID in Section 3.3 identifies which key signed this capture.',
    { indent: 24 },
  );
  gap(6);
  drawText('3. Certificate URL:', { font: fonts.bold, indent: 12 });
  gap(2);
  drawText(certUrl, { font: fonts.courier, size: 9, indent: 24 });
  gap(8);
  rule();

  // ----------------------------------------------------------------
  // Section VI: Document Integrity and Disclaimer
  // ----------------------------------------------------------------
  gap(6);
  drawText('VI. DOCUMENT INTEGRITY AND DISCLAIMER', { font: fonts.bold, size: 12 });
  gap(6);
  drawText(
    'This PDF document is digitally signed with Ed25519 by the Web Resource Ledger system. ' +
    'The signature is transmitted in the X-Signature-Ed25519 HTTP response header when this document ' +
    'is retrieved via the Certificate URL above. The corresponding public key is available at the ' +
    'public key endpoint listed in Section V.',
  );
  gap(8);
  drawText('Disclaimer', { font: fonts.bold });
  gap(4);
  drawText(
    'This document is generated by an automated system. It is not a legal opinion, attorney work product, ' +
    'or notarized document. The applicability of Federal Rule of Evidence 902(13) depends on the ' +
    'jurisdiction, the specific proceeding, and the rules of the tribunal. This document provides a ' +
    'factual description of an electronic process and the integrity evidence for a specific capture. ' +
    'Whether this document satisfies the self-authentication requirements of any rule of evidence is a ' +
    'legal determination that must be made by counsel and the tribunal.',
    { size: 8 },
  );
  gap(6);
  drawText(
    'This document does not substitute for legal advice. Consult an attorney for jurisdiction-specific ' +
    'evidentiary requirements.',
    { font: fonts.oblique, size: 8 },
  );

  // ----------------------------------------------------------------
  // Page footers (after all pages are known)
  // ----------------------------------------------------------------
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const pg = pages[i];
    const footerLeft  = `Page ${i + 1} of ${totalPages}`;
    const footerRight = `Generated by Web Resource Ledger \u2014 ${op.systemUrl}`;
    pg.drawText(footerLeft, {
      x: MARGIN,
      y: MARGIN / 2,
      font: fonts.regular,
      size: 7,
      color: rgb(0.4, 0.4, 0.4),
    });
    const rightW = fonts.regular.widthOfTextAtSize(footerRight, 7);
    pg.drawText(footerRight, {
      x: PAGE_WIDTH - MARGIN - rightW,
      y: MARGIN / 2,
      font: fonts.regular,
      size: 7,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // ----------------------------------------------------------------
  // Save without object stream compression (determinism requirement)
  // ----------------------------------------------------------------
  const pdfBytes = await doc.save({ useObjectStreams: false });

  // ----------------------------------------------------------------
  // Sign the PDF bytes with Ed25519
  // ----------------------------------------------------------------
  const signature = await signBytes(signingKeys.privateKey, pdfBytes);

  return { pdfBytes, signature };
}
