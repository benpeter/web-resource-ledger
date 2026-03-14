## Task: README Key Generation Documentation

Working directory: /Users/ben/github/benpeter/web-resource-ledger

### Context
The WACZ signing pipeline uses Ed25519 keys. A key generation script exists at `scripts/generate-signing-key.js`. The README needs a section documenting the key generation procedure -- this is an explicit acceptance criterion of issue #4.

### What to do

Add a section to `README.md` under a heading like "## Signing Key Setup" or similar (fit the existing README structure). Include:

1. **What**: WRL signs WACZ bundles with Ed25519. A signing key must be configured before captures produce signed bundles.
2. **Generate a key pair**:
   ```bash
   node scripts/generate-signing-key.js
   ```
3. **Set the production secret**:
   ```bash
   wrangler secret put SIGNING_KEY
   # Paste the private key (PKCS8 DER, base64) when prompted
   ```
4. **Set the local dev secret**: Add to `.dev.vars`:
   ```
   SIGNING_KEY=<base64 string from the script>
   ```
5. **Note**: The signing key is optional. If not configured, captures complete without WACZ bundles (individual artifacts are still stored). The public key is embedded in each signed bundle for verification.
6. **Security**: Never commit the private key to version control. `.dev.vars` is already in `.gitignore`.

Read the existing README.md first and fit the new section into its structure naturally.

### What NOT to do
- Do NOT rewrite the entire README
- Do NOT document WACZ format details (that belongs in evolution log or separate docs)
- Do NOT use TypeScript examples
- Keep it concise -- the operator audience knows what they're doing

### Deliverables
1. Updated `README.md` with key generation section

### Success criteria
- README documents how to generate and configure the signing key
- Instructions reference the script and wrangler secret put
