// Manually register a ReachLMS/Canvas platform (use when Dynamic Registration isn't possible).
// Usage:
//   npm run add-platform -- --issuer https://lms.example.edu --client-id 10000000000123 \
//        [--base https://lms.example.edu] [--name "ReachLMS"]
// Endpoints default to Canvas paths under --base (or the issuer):
//   auth  {base}/api/lti/authorize_redirect
//   token {base}/login/oauth2/token
//   jwks  {base}/api/lti/security/jwks
import { upsertPlatform } from '../src/lti.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean)
  .map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
if (!args.issuer || !args['client-id']) {
  console.error('Required: --issuer <url> --client-id <id>'); process.exit(1);
}
const base = (args.base || args.issuer).replace(/\/$/, '');
const p = upsertPlatform({
  name: args.name || 'ReachLMS',
  issuer: args.issuer,
  client_id: args['client-id'],
  auth_url: args.auth || `${base}/api/lti/authorize_redirect`,
  token_url: args.token || `${base}/login/oauth2/token`,
  jwks_url: args.jwks || `${base}/api/lti/security/jwks`,
});
console.log('Platform saved:', p);
