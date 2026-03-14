#!/usr/bin/env node
// tva
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const publicRaw = publicKey.export({ type: 'spki', format: 'der' });
// Ed25519 SPKI DER: 12-byte header + 32-byte raw key -- strip header to get raw 32 bytes
const publicBase64 = Buffer.from(publicRaw.slice(-32)).toString('base64');

console.log('=== WRL Signing Key Generator ===');
console.log('');
console.log('Private key (PKCS8 DER, base64) -- for wrangler secret:');
console.log(privateDer);
console.log('');
console.log('To set the signing key:');
console.log('  wrangler secret put SIGNING_KEY    (paste the private key above)');
console.log('');
console.log('For local development, add to .dev.vars:');
console.log(`  SIGNING_KEY=${privateDer}`);
console.log('');
console.log('Public key (raw, base64) -- embedded in every signed WACZ automatically:');
console.log(publicBase64);
