import path from 'node:path';
import fs from 'node:fs';

// Load a simple .env file if present (KEY=VALUE per line). No dependency needed.
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const port = Number(process.env.PORT || 3000);
const demo = process.env.DEMO_MODE === 'true';

// Work out the public address automatically on Render and GitHub Codespaces.
function detectPublicUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return `http://localhost:${port}`;
}

export const config = {
  port,
  // The public HTTPS address of this tool, e.g. https://studio.reachlms.com (no trailing slash).
  publicUrl: detectPublicUrl().replace(/\/$/, ''),
  // DEMO_MODE=true also serves a pretend ReachLMS at /demo on the same address, for testing.
  // Never enable it on the instance your real ReachLMS uses.
  demo,
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  toolName: process.env.TOOL_NAME || 'Reach Studio',
  // How long a studio/player session token stays valid.
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  // Max upload size for images/video in MB.
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 50),
  // Optional: protects the Dynamic Registration page with a shared code.
  registrationCode: process.env.REGISTRATION_CODE || '',
  // Set to "true" when running behind a reverse proxy that terminates TLS.
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Allow plain-http platforms (only for local testing).
  allowInsecure: process.env.ALLOW_INSECURE_PLATFORMS === 'true' || demo,
};

/**
 * Server-to-server calls to our own public address (only happens in demo mode, where the
 * pretend ReachLMS lives on the same server) go straight to this process instead of out
 * through the internet. This matters on Codespaces, where the public port needs a login.
 */
export function internalUrl(u) {
  const s = String(u);
  if (config.demo && s.startsWith(`${config.publicUrl}/`)) return `http://127.0.0.1:${config.port}${s.slice(config.publicUrl.length)}`;
  return s;
}

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'media'), { recursive: true });
