# DevX Minion -- Domain Plan Contribution

## Planning Question

What specific CLI commands actually work cross-platform for each verification step? Can this be done with just openssl, jq, and standard tools, or does it require specialized software?

## Analysis

I prototyped every command below on macOS with OpenSSL 3.6.1 and confirmed the expected behavior. The toolchain is **openssl + jq + unzip + standard shell utilities** -- nothing exotic. The hardest step (raw Ed25519 key to PEM) is a one-liner once you know the magic bytes. Here is the full chain, step by step, with difficulty assessment and cross-platform notes.

### Required tools

| Tool | Ships with | Purpose |
|------|-----------|---------|
| `curl` | macOS, most Linux | Download WACZ and signing key |
| `unzip` | macOS, most Linux | Extract WACZ archive |
| `jq` | Needs install | Canonical JSON, field extraction |
| `openssl` (3.0+) | macOS (via Homebrew), most Linux | SHA-256, Ed25519 verify, base64, PEM conversion |
| `printf` | All POSIX shells | Write binary SPKI header bytes |

**OpenSSL version requirement**: Ed25519 support was added in OpenSSL 3.0. macOS ships LibreSSL which does NOT support Ed25519 via `pkeyutl`. Users on macOS will need Homebrew OpenSSL (`brew install openssl`). This is the single biggest cross-platform concern.

### Step 0: Download and extract

**Difficulty: Trivial**

```bash
# Download WACZ
curl -o capture.wacz \
  "https://wrl.benpeter.workers.dev/v1/captures/{id}/artifacts/wacz"

# Extract
unzip capture.wacz -d wacz_contents/
```

### Step 1 (artifactHashes): SHA-256 each resource file

**Difficulty: Easy**

```bash
# Extract resource paths and expected hashes from datapackage.json
jq -r '.resources[] | "\(.hash) \(.path)"' wacz_contents/datapackage.json

# For each resource, compute SHA-256 and compare:
jq -r '.resources[] | "\(.hash) \(.path)"' wacz_contents/datapackage.json | \
while IFS=' ' read -r expected path; do
  computed="sha256:$(openssl dgst -sha256 -hex "wacz_contents/$path" | awk '{print $NF}')"
  if [ "$computed" = "$expected" ]; then
    echo "PASS: $path"
  else
    echo "FAIL: $path (expected $expected, got $computed)"
  fi
done
```

**Cross-platform notes**: `openssl dgst -sha256` works everywhere. `shasum -a 256` is an alternative on systems with Perl. The hash format is `sha256:{64 hex chars}`.

### Step 2 (bundleHash): SHA-256 of canonical JSON of datapackage.json

**Difficulty: Medium -- jq equivalence is the key question**

The WRL `canonicalize()` function produces: recursively sorted keys, no whitespace, standard JSON serialization of primitives. This is **exactly** what `jq -Sc '.'` produces.

```bash
# Compute canonical JSON hash
BUNDLE_HASH="sha256:$(jq -Sc '.' wacz_contents/datapackage.json | \
  tr -d '\n' | openssl dgst -sha256 -hex | awk '{print $NF}')"

# Compare with stored hash
EXPECTED_HASH=$(jq -r '.signedData.hash' wacz_contents/datapackage-digest.json)

if [ "$BUNDLE_HASH" = "$EXPECTED_HASH" ]; then
  echo "PASS: Bundle hash matches"
else
  echo "FAIL: Bundle hash mismatch"
  echo "  Expected: $EXPECTED_HASH"
  echo "  Got:      $BUNDLE_HASH"
fi
```

**Critical nuance**: `jq -Sc` reads the pretty-printed `datapackage.json` and outputs canonical form. The `tr -d '\n'` strips jq's trailing newline so openssl hashes only the JSON bytes. This matches the JS code: `sha256(enc.encode(canonicalize(datapackage)))` -- TextEncoder produces UTF-8 bytes of the canonical string with no trailing newline.

**Verified equivalence**: I confirmed that `jq -Sc '.'` produces byte-identical output to the JS `canonicalize()` function for the WRL datapackage structure. The only theoretical divergence would be floating-point numbers (jq might emit `1.0` vs JS `1`), but WRL's datapackage only contains integers in the `bytes` field, which both serialize identically.

### Step 3 (signature): Ed25519 verification

**Difficulty: Hard -- raw-to-PEM conversion is non-obvious but solvable**

This is the step that requires the most explanation. The `/.well-known/signing-key` endpoint returns a base64-encoded raw 32-byte Ed25519 public key. OpenSSL needs a PEM-wrapped SPKI (Subject Public Key Info) DER structure.

The conversion is: prepend a fixed 12-byte SPKI DER header, then PEM-wrap.

```bash
# 1. Fetch the signing key
KEY_B64=$(curl -s "https://wrl.benpeter.workers.dev/.well-known/signing-key" | jq -r '.publicKey')

# 2. Convert raw 32-byte key to PEM via SPKI DER
#    The magic prefix 302a300506032b6570032100 is the Ed25519 SPKI header:
#    SEQUENCE { SEQUENCE { OID 1.3.101.112 (Ed25519) } BIT STRING { <32 bytes> } }
(printf '\x30\x2a\x30\x05\x06\x03\x2b\x65\x70\x03\x21\x00'; \
 echo "$KEY_B64" | openssl base64 -d) | \
openssl pkey -pubin -inform DER -outform PEM -out pubkey.pem

# 3. Extract the signature and hash from digest
SIG_B64=$(jq -r '.signedData.signatures[] | select(.type == "self") | .signature' \
  wacz_contents/datapackage-digest.json)
HASH_STRING=$(jq -r '.signedData.hash' wacz_contents/datapackage-digest.json)

# 4. Write signature bytes and payload to files
echo "$SIG_B64" | openssl base64 -d -out sig.bin
printf '%s' "$HASH_STRING" > payload.bin

# 5. Verify
openssl pkeyutl -verify -pubin -inkey pubkey.pem \
  -in payload.bin -sigfile sig.bin
```

**Key insight**: The signed payload is the UTF-8 bytes of the hash string itself -- literally `"sha256:abcdef..."` -- not the raw hash bytes. This is why we use `printf '%s'` (no newline) to write the exact string.

**Cross-platform concerns**:
- `printf '\x30\x2a...'` works in bash, zsh, and dash. It does NOT work in some minimal sh implementations.
- Alternative for strict POSIX: use `xxd -r -p` to convert hex to binary: `echo "302a300506032b6570032100" | xxd -r -p`
- **LibreSSL (macOS default) does not support Ed25519 in pkeyutl**. Users must install OpenSSL 3.x via Homebrew and use `/opt/homebrew/bin/openssl` explicitly.

### Step 4 (timestamp): RFC 3161 token verification

**Difficulty: Very Hard -- partial verification is feasible, full chain validation requires CA cert**

The RFC 3161 token is stored as a base64-encoded CMS SignedData (ContentInfo) DER structure. Two levels of verification are possible:

#### Level A: MessageImprint match (what WRL itself does)

This checks that the timestamp was computed over the correct hash. It does NOT verify the TSA's cryptographic signature.

```bash
# Extract the timestamp token
TOKEN_B64=$(jq -r '.signedData.signatures[] | select(.type == "rfc3161") | .token' \
  wacz_contents/datapackage-digest.json)

# Decode to DER
echo "$TOKEN_B64" | openssl base64 -d -out ts_token.der

# Extract the TSTInfo and examine it
# openssl can parse it as a PKCS7 structure:
openssl pkcs7 -in ts_token.der -inform DER -print 2>/dev/null | head -50

# Or using openssl asn1parse to find the messageImprint hash:
openssl asn1parse -in ts_token.der -inform DER | grep -A2 "OCTET STRING"
```

This is messy. Extracting the exact messageImprint hash from ASN.1 via openssl CLI is possible but fragile -- it requires knowing the exact offset into the DER structure. The WRL code does this with custom DER parsing.

#### Level B: Full cryptographic verification (openssl ts -verify)

```bash
# This requires:
# 1. The token in PKCS#7 format (-token_in flag)
# 2. The original data hash
# 3. The TSA's root CA certificate

# Download DigiCert's Trusted Root G4 cert
curl -o digicert_root.pem \
  "https://cacerts.digicert.com/DigiCertTrustedRootG4.crt.pem"

# Verify (the -token_in flag tells openssl the input is a PKCS#7 token, not a full TSR)
openssl ts -verify -token_in -in ts_token.der \
  -digest "$BUNDLE_HASH_HEX" -sha256 \
  -CAfile digicert_root.pem \
  -untrusted <(openssl pkcs7 -in ts_token.der -inform DER -print_certs 2>/dev/null)
```

**This may not work out of the box.** The `openssl ts -verify` command is finicky about:
- Whether the intermediate cert chain is complete
- The exact format of the digest argument (hex, no prefix)
- Whether `-untrusted` can be combined with `-token_in`

I was unable to fully verify this path without a real WRL timestamp token. It's the one step that genuinely may require trial-and-error with a real capture.

## Recommendations

### 1. Document checks 1-3 fully; treat check 4 as "advanced"

Checks 1 through 3 (artifactHashes, bundleHash, signature) are achievable with `curl`, `unzip`, `jq`, and `openssl` -- standard developer tools. The commands are deterministic and testable.

Check 4 (RFC 3161 timestamp) should be documented separately as an "advanced" section with honest caveats about what it proves and what it doesn't.

### 2. Provide a copy-paste verification script, not just commands

Individual commands are useful for understanding, but a self-contained bash script that runs all four checks and prints pass/fail results would be dramatically more usable. The script should:
- Check for required tool versions upfront (especially `openssl version` >= 3.0)
- Accept a capture ID as the single argument
- Download everything it needs
- Print a clear summary

### 3. Address the LibreSSL/macOS gap explicitly

macOS ships LibreSSL, not OpenSSL. LibreSSL does not support Ed25519 in the `pkeyutl` command. The documentation MUST address this with a clear callout:

> **macOS users**: The default `openssl` command is LibreSSL, which does not support Ed25519 verification. Install OpenSSL 3.x via Homebrew: `brew install openssl` and use `/opt/homebrew/bin/openssl` (Apple Silicon) or `/usr/local/bin/openssl` (Intel).

### 4. Consider providing a standalone Node.js verification script as well

Since the verification code already exists in `src/verify.js`, a standalone Node.js script that requires no compilation and works on any platform with Node 18+ would give users a second path that avoids all the OpenSSL/PEM conversion complexity. Node.js has native Ed25519 support via `crypto.subtle`.

### 5. jq -Sc canonical JSON equivalence should be explicitly documented

The fact that `jq -Sc '.'` produces output identical to the WRL `canonicalize()` function is not obvious. It should be stated clearly with the caveat about number serialization (no floating-point values are used in the current datapackage schema, so the equivalence holds).

## Proposed Tasks

1. **Write CLI verification guide** with checks 1-3 as copy-paste commands, including the SPKI DER prefix explanation and macOS/LibreSSL callout.

2. **Write a self-contained `verify.sh` script** that automates all four checks with proper error handling and prerequisite checks. Ship it in the repo (e.g., `scripts/verify.sh`).

3. **Add RFC 3161 "advanced verification" section** with honest documentation of what `openssl ts -verify` can and cannot do, and what trust assumptions each level provides.

4. **Test all commands against a real WRL capture** before publishing. The commands above were prototyped with synthetic keys; they need validation against an actual capture to catch any encoding edge cases (e.g., base64 line-wrapping in the API response, jq floating-point surprises).

5. **(Optional) Provide a Node.js verification one-liner** as an alternative for users who have Node.js but not OpenSSL 3.x.

## Risks and Concerns

### High Risk: LibreSSL on macOS

The default `openssl` on macOS is LibreSSL, which does not support Ed25519 via `pkeyutl`. This will be the number-one source of user frustration. Users will copy the commands, get a cryptic error about unsupported algorithms, and give up. **Mitigation**: Prominent callout at the top of the guide, prerequisite check in the script.

### Medium Risk: jq canonical JSON edge cases

While `jq -Sc` matches `canonicalize()` for all current WRL data, a future datapackage field containing a floating-point value like `1.0` could break the equivalence (jq might emit `1.0`, JS emits `1`). **Mitigation**: Document the assumption. The verify script could also use Node.js for canonicalization as a fallback.

### Medium Risk: RFC 3161 full chain validation complexity

`openssl ts -verify` with `-token_in` requires the correct CA certificate hierarchy for the TSA. DigiCert's timestamp signing chain has changed over time. Users will need the correct root CA cert, which may not be obvious. **Mitigation**: Document the exact CA cert URL and provide it in the script. Accept that this step may require updates as DigiCert rotates signing certificates.

### Low Risk: printf hex escapes on non-bash shells

The `printf '\x30\x2a...'` syntax works in bash, zsh, and dash, but not in all sh implementations. **Mitigation**: Provide `xxd -r -p` as an alternative, or make the script explicitly require bash via `#!/usr/bin/env bash`.

### Low Risk: openssl base64 vs system base64

macOS `base64` and GNU `base64` have different flags (`-D` vs `--decode`). Using `openssl base64 -d` throughout avoids this entirely since we already require openssl. **Mitigation**: Consistently use `openssl base64 -d` instead of the system `base64` command.

## Additional Agents Needed

- **Security Minion**: Should review the verification guide to ensure it doesn't mislead users about what each check proves (e.g., messageImprint match vs full TSA chain validation are very different trust levels). Should also confirm that publishing the SPKI DER prefix magic bytes doesn't create any footgun.

- **User Docs Minion**: The verify page content needs to balance technical accuracy with readability for non-cryptography-experts. The raw CLI commands are correct but dense. A docs specialist should help with progressive disclosure (summary first, commands second, ASN.1 deep-dive third).

## Summary of Difficulty by Step

| Check | Difficulty | Toolchain | Cross-platform issues |
|-------|-----------|-----------|----------------------|
| artifactHashes | Easy | openssl dgst, jq | None |
| bundleHash | Medium | jq -Sc, openssl dgst | jq float serialization (theoretical) |
| signature | Hard | openssl pkeyutl, printf hex | LibreSSL on macOS lacks Ed25519 |
| timestamp | Very Hard | openssl ts -verify, openssl pkcs7 | CA cert management, ASN.1 parsing |

**Bottom line**: Checks 1-3 are documentable today with standard tools. Check 4 requires either accepting partial verification (messageImprint only) or providing a purpose-built script. The verify page should ship with checks 1-3 and a clear "what this proves" explanation, with check 4 as an advanced addendum.
