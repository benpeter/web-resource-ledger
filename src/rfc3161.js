/*
 * rfc3161.js -- RFC 3161 timestamp module
 *
 * Minimal DER encoder/decoder for RFC 3161 TimeStampReq/TimeStampResp.
 * Purpose-built for the WRL signing pipeline -- not a general-purpose ASN.1 library.
 *
 * Capture-time: builds TimeStampReq, POSTs to TSA, validates response
 * (status, nonce, messageImprint). Stores raw token for third-party verification.
 *
 * Verification-time: extracts TSTInfo from stored token, verifies
 * messageImprint matches bundleHash. Full CMS certificate chain validation
 * is deferred (not feasible in Cloudflare Workers).
 *
 * @security: Certificate chain validation is deferred. See docs/backlog.md.
 *
 * Tests: test/rfc3161.test.js
 */ // tva

const TSA_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 65536; // 64 KB

// ---------------------------------------------------------------------------
// OID value bytes (pre-encoded, without tag/length wrapper)
// ---------------------------------------------------------------------------

// 2.16.840.1.101.3.4.2.1 -- SHA-256
const OID_SHA256 = new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

// ---------------------------------------------------------------------------
// DER primitives
// ---------------------------------------------------------------------------

/**
 * Encodes DER definite length for a value of n bytes.
 * Handles lengths up to 16,777,215 (3-byte long form), sufficient for 64 KB responses.
 * @param {number} n
 * @returns {Uint8Array}
 */
function writeLength(n) {
  if (n < 0x80) return new Uint8Array([n]);
  if (n <= 0xff) return new Uint8Array([0x81, n]);
  if (n <= 0xffff) return new Uint8Array([0x82, n >> 8, n & 0xff]);
  if (n <= 0xffffff) return new Uint8Array([0x83, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  throw new Error(`DER length ${n} exceeds 3-byte encoding limit`);
}

/**
 * Encodes a DER TLV (tag-length-value).
 * @param {number} tag
 * @param {Uint8Array} content
 * @returns {Uint8Array}
 */
function writeTLV(tag, content) {
  const lenBytes = writeLength(content.length);
  const out = new Uint8Array(1 + lenBytes.length + content.length);
  out[0] = tag;
  out.set(lenBytes, 1);
  out.set(content, 1 + lenBytes.length);
  return out;
}

/**
 * Decodes the DER length field starting at buf[offset].
 * Returns { length, end } where end is the byte offset of the first value byte.
 * Rejects indefinite-length encoding (DER forbids it).
 * @param {Uint8Array} buf
 * @param {number} offset
 * @returns {{ length: number, end: number }}
 */
function readLength(buf, offset) {
  if (offset >= buf.length) throw new Error('DER: length field past end of buffer');
  const first = buf[offset];
  if (first === 0x80) throw new Error('DER: indefinite length encoding rejected');
  if (first < 0x80) return { length: first, end: offset + 1 };

  const numBytes = first & 0x7f;
  if (numBytes > 3) throw new Error(`DER: length encoding uses ${numBytes} bytes (max 3 supported)`);
  if (offset + 1 + numBytes > buf.length) throw new Error('DER: length bytes past end of buffer');

  let len = 0;
  for (let i = 0; i < numBytes; i++) {
    len = (len << 8) | buf[offset + 1 + i];
  }
  return { length: len, end: offset + 1 + numBytes };
}

/**
 * Decodes a single DER TLV at buf[offset].
 * Returns { tag, length, value, end } where:
 *   tag    -- the raw tag byte
 *   length -- the declared content length
 *   value  -- Uint8Array view of the content bytes
 *   end    -- byte offset immediately after this TLV (= start of next sibling)
 * Validates that the declared length does not exceed the remaining buffer.
 * @param {Uint8Array} buf
 * @param {number} offset  Byte offset of the tag byte
 * @returns {{ tag: number, length: number, value: Uint8Array, end: number }}
 */
function readTLV(buf, offset) {
  if (offset >= buf.length) throw new Error('DER: read past end of buffer');
  const tag = buf[offset];
  const { length, end: valueStart } = readLength(buf, offset + 1);
  if (valueStart + length > buf.length) {
    throw new Error(
      `DER: TLV at offset ${offset} declares length ${length} but only ` +
      `${buf.length - valueStart} bytes remain`
    );
  }
  return {
    tag,
    length,
    value: buf.subarray(valueStart, valueStart + length),
    end: valueStart + length,
  };
}

/**
 * Reads the nth child TLV (0-based) from inside a constructed TLV.
 * The parent TLV's value bytes must already have been located; pass
 * valueStart (first byte of parent content) and valueEnd (exclusive).
 * @param {Uint8Array} buf
 * @param {number} valueStart  First byte of parent content
 * @param {number} valueEnd    One past last byte of parent content
 * @param {number} index       0-based child index to retrieve
 * @returns {{ tag: number, length: number, value: Uint8Array, end: number }}
 */
function childAt(buf, valueStart, valueEnd, index) {
  let pos = valueStart;
  let i = 0;
  while (pos < valueEnd) {
    const tlv = readTLV(buf, pos);
    if (i === index) return tlv;
    i++;
    pos = tlv.end;
  }
  throw new Error(`DER: child index ${index} not found (only ${i} children present)`);
}

/**
 * Concatenates multiple Uint8Arrays into one.
 * @param {...Uint8Array} arrays
 * @returns {Uint8Array}
 */
function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

// ---------------------------------------------------------------------------
// DER building blocks for TimeStampReq
// ---------------------------------------------------------------------------

/**
 * Encodes a DER INTEGER from raw big-endian unsigned bytes.
 * Adds a leading 0x00 sign-extension byte when the high bit of the first byte
 * is set, preventing the value from being interpreted as negative (~50% of
 * random nonces require this).
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
function encodeUnsignedInteger(bytes) {
  const content = (bytes[0] & 0x80)
    ? concat(new Uint8Array([0x00]), bytes)
    : bytes;
  return writeTLV(0x02, content);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Requests a RFC 3161 timestamp from a TSA.
 *
 * Builds a TimeStampReq, POSTs it, then validates the response:
 *   (a) PKIStatus is 0 (granted)
 *   (b) nonce in TSTInfo matches the sent nonce
 *   (c) messageImprint hash in TSTInfo matches bundleHash
 *
 * On success returns { token, genTime, tsa }; throws on any failure.
 *
 * @param {string} tsaUrl       TSA HTTP endpoint
 * @param {string} bundleHash   Hash string "sha256:<64 hex chars>"
 * @param {number} [timeoutMs]  Request timeout in milliseconds
 * @returns {Promise<{ token: string, genTime: string, tsa: string }>}
 * @throws On network error, timeout, parse error, or validation failure
 */
export async function requestTimestamp(tsaUrl, bundleHash, timeoutMs = TSA_TIMEOUT_MS) {
  if (!bundleHash.startsWith('sha256:')) throw new Error('bundleHash must start with "sha256:"');
  const hexHash = bundleHash.slice(7);
  if (hexHash.length !== 64) throw new Error('bundleHash SHA-256 hex must be 64 characters');

  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashBytes[i] = parseInt(hexHash.slice(i * 2, i * 2 + 2), 16);
  }

  // 128-bit nonce -- crypto.getRandomValues is available in Cloudflare Workers
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);

  const reqDer = buildTimeStampReq(hashBytes, nonceBytes);

  const resp = await fetch(tsaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body: reqDer,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`TSA returned HTTP ${resp.status}`);

  const arrayBuf = await resp.arrayBuffer();
  if (arrayBuf.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(
      `TSA response too large: ${arrayBuf.byteLength} bytes (max ${MAX_RESPONSE_BYTES})`
    );
  }

  return parseAndValidate(new Uint8Array(arrayBuf), nonceBytes, bundleHash, tsaUrl);
}

/**
 * Verifies a stored RFC 3161 timestamp token against a bundle hash.
 * Does NOT verify the TSA's cryptographic signature (deferred --
 * X.509 chain validation is not feasible in Cloudflare Workers).
 *
 * @param {string} tokenBase64        Base64-encoded raw DER TimeStampToken
 * @param {string} expectedBundleHash Hash string "sha256:<64 hex chars>"
 * @returns {{ valid: boolean, genTime?: string, reason?: string }}
 */
export function verifyTimestamp(tokenBase64, expectedBundleHash) {
  try {
    const tokenDer = Uint8Array.from(atob(tokenBase64), c => c.charCodeAt(0));
    const { messageImprintHex, genTime } = extractTSTInfo(tokenDer, 0);

    if (!expectedBundleHash.startsWith('sha256:')) {
      return { valid: false, reason: 'expectedBundleHash must start with "sha256:"' };
    }
    const expectedHex = expectedBundleHash.slice(7);
    if (messageImprintHex !== expectedHex) {
      return { valid: false, reason: 'messageImprint hash does not match expectedBundleHash' };
    }
    return { valid: true, genTime };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// Internal: TimeStampReq builder
// ---------------------------------------------------------------------------

/**
 * Builds a DER-encoded TimeStampReq.
 *
 * SEQUENCE {
 *   INTEGER 1                          -- version
 *   SEQUENCE {                         -- MessageImprint
 *     SEQUENCE { OID SHA-256, NULL }   -- AlgorithmIdentifier
 *     OCTET STRING <32 bytes>          -- hashedMessage
 *   }
 *   INTEGER <16 bytes>                 -- nonce (with sign-extension if needed)
 *   [0] BOOLEAN TRUE                   -- certReq (implicit, tag 0x80)
 * }
 *
 * @param {Uint8Array} hashBytes  32-byte SHA-256 hash of the bundle
 * @param {Uint8Array} nonceBytes 16-byte random nonce
 * @returns {Uint8Array}
 */
function buildTimeStampReq(hashBytes, nonceBytes) {
  const version = writeTLV(0x02, new Uint8Array([0x01]));

  const algId = writeTLV(0x30, concat(
    writeTLV(0x06, OID_SHA256),
    writeTLV(0x05, new Uint8Array(0)), // NULL parameters
  ));

  const msgImprint = writeTLV(0x30, concat(
    algId,
    writeTLV(0x04, hashBytes),
  ));

  const nonce = encodeUnsignedInteger(nonceBytes);

  // certReq [0] IMPLICIT BOOLEAN DEFAULT FALSE
  // RFC 3161 s2.4.1: implicit tag replaces BOOLEAN (0x01) with [0] PRIMITIVE (0x80)
  const certReq = writeTLV(0x80, new Uint8Array([0xff]));

  return writeTLV(0x30, concat(version, msgImprint, nonce, certReq));
}

// ---------------------------------------------------------------------------
// Internal: TimeStampResp parser and validator
// ---------------------------------------------------------------------------

/**
 * Parses a TimeStampResp DER buffer and validates status, nonce, and messageImprint.
 * Returns the token, genTime, and tsa on success; throws on any failure.
 *
 * TimeStampResp SEQUENCE:
 *   child 0: PKIStatusInfo SEQUENCE
 *     child 0: status INTEGER  (0 = granted)
 *   child 1: TimeStampToken (ContentInfo) SEQUENCE
 *
 * @param {Uint8Array} der
 * @param {Uint8Array} sentNonceBytes  16-byte nonce sent in the request
 * @param {string}     bundleHash      "sha256:<hex>"
 * @param {string}     tsaUrl
 * @returns {{ token: string, genTime: string, tsa: string }}
 */
function parseAndValidate(der, sentNonceBytes, bundleHash, tsaUrl) {
  // Outer TimeStampResp SEQUENCE
  const outerTlv = readTLV(der, 0);
  if (outerTlv.tag !== 0x30) throw new Error('DER: TimeStampResp must be SEQUENCE');

  const outerValueStart = outerTlv.end - outerTlv.length;
  const outerValueEnd   = outerTlv.end;

  // child 0: PKIStatusInfo SEQUENCE
  const pkiInfo = childAt(der, outerValueStart, outerValueEnd, 0);
  if (pkiInfo.tag !== 0x30) throw new Error('DER: PKIStatusInfo must be SEQUENCE');

  const pkiValueStart = pkiInfo.end - pkiInfo.length;
  const pkiValueEnd   = pkiInfo.end;

  // child 0 of PKIStatusInfo: status INTEGER
  const statusTlv = childAt(der, pkiValueStart, pkiValueEnd, 0);
  if (statusTlv.tag !== 0x02) throw new Error('DER: PKIStatus must be INTEGER');
  // Status value is small -- take the last byte (handles 1-byte and multi-byte encodings)
  const status = statusTlv.value[statusTlv.value.length - 1];
  if (status !== 0) throw new Error(`TSA rejected request with PKIStatus ${status}`);

  // child 1: TimeStampToken (ContentInfo SEQUENCE)
  const tokenTlv = childAt(der, outerValueStart, outerValueEnd, 1);
  if (tokenTlv.tag !== 0x30) throw new Error('DER: TimeStampToken must be SEQUENCE');

  // Compute tag-byte offset of tokenTlv in der
  const tokenTagOffset = tokenTlv.end - tokenTlv.length - writeLength(tokenTlv.length).length - 1;

  // Extract TSTInfo fields from the token
  const { messageImprintHex, genTime, nonceHex } = extractTSTInfo(der, tokenTagOffset);

  // Validate nonce
  // The TSA DER-encodes the nonce as an INTEGER; if the high bit of the first
  // byte was set, a leading 0x00 sign-extension byte was added, producing 17
  // value bytes instead of 16. Strip it before comparing.
  if (nonceHex !== null) {
    const sentHex = [...sentNonceBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    let respHex = nonceHex;
    if (respHex.length === 34 && respHex.startsWith('00')) {
      respHex = respHex.slice(2); // strip DER sign-extension byte
    }
    if (respHex !== sentHex) {
      throw new Error('Nonce mismatch: TSA response nonce does not match request nonce');
    }
  }

  // Validate messageImprint
  const expectedImprint = bundleHash.slice(7);
  if (messageImprintHex !== expectedImprint) {
    throw new Error('messageImprint mismatch: TSA hash does not match submitted hash');
  }

  // Capture raw token DER bytes for storage (base64-encoded)
  const tokenBytes = der.subarray(tokenTagOffset, tokenTlv.end);
  const token = btoa(String.fromCharCode(...tokenBytes));

  return { token, genTime, tsa: tsaUrl };
}

/**
 * Extracts messageImprint hash hex, genTime ISO string, and optional nonce hex
 * from a TimeStampToken (ContentInfo SEQUENCE) at tagOffset inside buf.
 *
 * Navigation path through CMS SignedData:
 *
 *   ContentInfo SEQUENCE                             -- tagOffset
 *     OID id-signedData                              -- child 0 (skipped)
 *     [0] EXPLICIT (0xa0) {                          -- child 1
 *       SignedData SEQUENCE
 *         INTEGER version                            -- child 0 (skipped)
 *         SET digestAlgorithms                       -- child 1 (skipped)
 *         EncapContentInfo SEQUENCE                  -- child 2
 *           OID id-ct-TSTInfo                        -- child 0 (skipped)
 *           [0] EXPLICIT (0xa0) {                    -- child 1
 *             OCTET STRING <TSTInfo DER>             -- child 0
 *           }
 *         ...
 *       }
 *     }
 *   }
 *
 * @param {Uint8Array} buf
 * @param {number} tagOffset  Byte offset of the ContentInfo tag byte
 * @returns {{ messageImprintHex: string, genTime: string, nonceHex: string|null }}
 */
function extractTSTInfo(buf, tagOffset) {
  // ContentInfo SEQUENCE
  const contentInfo = readTLV(buf, tagOffset);
  if (contentInfo.tag !== 0x30) throw new Error('DER: ContentInfo must be SEQUENCE');
  const ciVS = contentInfo.end - contentInfo.length;
  const ciVE = contentInfo.end;

  // child 0: OID id-signedData (skip)
  // child 1: [0] EXPLICIT wrapping SignedData
  const ctxTlv = childAt(buf, ciVS, ciVE, 1);
  if (ctxTlv.tag !== 0xa0) {
    throw new Error(`DER: ContentInfo[1] expected [0] EXPLICIT (0xa0), got 0x${ctxTlv.tag.toString(16)}`);
  }
  const ctxVS = ctxTlv.end - ctxTlv.length;
  const ctxVE = ctxTlv.end;

  // First (and only) child of [0]: SignedData SEQUENCE
  const signedData = childAt(buf, ctxVS, ctxVE, 0);
  if (signedData.tag !== 0x30) throw new Error('DER: SignedData must be SEQUENCE');
  const sdVS = signedData.end - signedData.length;
  const sdVE = signedData.end;

  // SignedData child 2: EncapContentInfo SEQUENCE
  // (child 0 = version INTEGER, child 1 = digestAlgorithms SET, child 2 = encapContentInfo)
  const encapInfo = childAt(buf, sdVS, sdVE, 2);
  if (encapInfo.tag !== 0x30) throw new Error('DER: encapContentInfo must be SEQUENCE');
  const ecVS = encapInfo.end - encapInfo.length;
  const ecVE = encapInfo.end;

  // EncapContentInfo child 1: [0] EXPLICIT wrapping eContent OCTET STRING
  // (child 0 = OID id-ct-TSTInfo, child 1 = [0] EXPLICIT { OCTET STRING })
  const eContentCtx = childAt(buf, ecVS, ecVE, 1);
  if (eContentCtx.tag !== 0xa0) {
    throw new Error(`DER: eContent context expected 0xa0, got 0x${eContentCtx.tag.toString(16)}`);
  }
  const ecCtxVS = eContentCtx.end - eContentCtx.length;
  const ecCtxVE = eContentCtx.end;

  // [0] child 0: OCTET STRING containing TSTInfo DER
  const octetStr = childAt(buf, ecCtxVS, ecCtxVE, 0);
  if (octetStr.tag !== 0x04) {
    throw new Error(`DER: eContent expected OCTET STRING (0x04), got 0x${octetStr.tag.toString(16)}`);
  }

  // Parse TSTInfo from the OCTET STRING payload
  return parseTSTInfo(octetStr.value);
}

/**
 * Parses TSTInfo SEQUENCE fields.
 *
 * TSTInfo SEQUENCE:
 *   child 0: INTEGER version
 *   child 1: OID policy
 *   child 2: MessageImprint SEQUENCE
 *               child 0: AlgorithmIdentifier SEQUENCE (skipped)
 *               child 1: OCTET STRING hashedMessage
 *   child 3: INTEGER serialNumber
 *   child 4: GeneralizedTime genTime
 *   child 5+: optional fields (accuracy, ordering, nonce, tsa, extensions)
 *             nonce is an INTEGER if present
 *
 * @param {Uint8Array} buf  Buffer containing TSTInfo SEQUENCE at offset 0
 * @returns {{ messageImprintHex: string, genTime: string, nonceHex: string|null }}
 */
function parseTSTInfo(buf) {
  const tstInfo = readTLV(buf, 0);
  if (tstInfo.tag !== 0x30) throw new Error('DER: TSTInfo must be SEQUENCE');

  const vs = tstInfo.end - tstInfo.length;
  const ve = tstInfo.end;

  let pos       = vs;
  let childIdx  = 0;
  let messageImprintHex = null;
  let genTime           = null;
  let nonceHex          = null;

  while (pos < ve) {
    const child = readTLV(buf, pos);

    switch (childIdx) {
      case 2: {
        // MessageImprint SEQUENCE
        if (child.tag !== 0x30) throw new Error('DER: TSTInfo MessageImprint must be SEQUENCE');
        const miVS = child.end - child.length;
        const miVE = child.end;
        // child 0: AlgorithmIdentifier (skip)
        const algId = childAt(buf, miVS, miVE, 0);
        // child 1: OCTET STRING hashedMessage
        const hashOctet = childAt(buf, miVS, miVE, 1);
        if (hashOctet.tag !== 0x04) throw new Error('DER: messageImprint hashedMessage must be OCTET STRING');
        messageImprintHex = [...hashOctet.value].map(b => b.toString(16).padStart(2, '0')).join('');
        break;
      }
      case 4: {
        // GeneralizedTime (universal tag 0x18)
        if (child.tag !== 0x18) {
          throw new Error(
            `DER: TSTInfo genTime expected GeneralizedTime (0x18), got 0x${child.tag.toString(16)}`
          );
        }
        genTime = parseGeneralizedTime(String.fromCharCode(...child.value));
        break;
      }
      default:
        // nonce is an optional INTEGER at child 5 or later (after accuracy/ordering)
        if (childIdx > 4 && child.tag === 0x02) {
          nonceHex = [...child.value].map(b => b.toString(16).padStart(2, '0')).join('');
        }
    }

    childIdx++;
    pos = child.end;
  }

  if (messageImprintHex === null) throw new Error('DER: TSTInfo missing MessageImprint');
  if (genTime === null) throw new Error('DER: TSTInfo missing genTime');

  return { messageImprintHex, genTime, nonceHex };
}

/**
 * Converts an ASN.1 GeneralizedTime string to an ISO 8601 string.
 * Input format: YYYYMMDDHHMMSS[.fff]Z  (UTC, trailing Z required by DER)
 *
 * @param {string} gt
 * @returns {string}
 */
function parseGeneralizedTime(gt) {
  const s = gt.endsWith('Z') ? gt.slice(0, -1) : gt;
  const year   = s.slice(0, 4);
  const month  = s.slice(4, 6);
  const day    = s.slice(6, 8);
  const hour   = s.slice(8, 10);
  const minute = s.slice(10, 12);
  const second = s.slice(12, 14);
  const frac   = s.length > 14 ? s.slice(14) : '';
  const ms     = frac
    ? String(Math.round(parseFloat('0' + frac) * 1000)).padStart(3, '0')
    : '000';
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`;
}
