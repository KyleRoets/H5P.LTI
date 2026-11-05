// The tool's own RSA signing key. Generated once and stored in DATA_DIR/tool-keys.json.
// The public half is published at /.well-known/jwks.json; Canvas uses it to verify
// deep-linking responses and the client-credentials assertions used for grade passback.
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair, exportJWK, importJWK } from 'jose';
import { config } from './config.js';

const keyFile = path.join(config.dataDir, 'tool-keys.json');
let current;

export async function loadKeys() {
  if (fs.existsSync(keyFile)) {
    const stored = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    current = { kid: stored.kid, privateJwk: stored.privateJwk, publicJwk: stored.publicJwk };
  } else {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    const kid = new Date().toISOString();
    const privateJwk = { ...(await exportJWK(privateKey)), kid, alg: 'RS256', use: 'sig' };
    const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
    fs.writeFileSync(keyFile, JSON.stringify({ kid, privateJwk, publicJwk }, null, 2), { mode: 0o600 });
    current = { kid, privateJwk, publicJwk };
  }
  current.privateKey = await importJWK(current.privateJwk, 'RS256');
  return current;
}

export const signingKey = () => current;
export const publicJwks = () => ({ keys: [current.publicJwk] });
