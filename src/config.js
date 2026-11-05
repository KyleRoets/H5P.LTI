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

export const config = {
  port,
  // The public HTTPS address of this tool, e.g. https://studio.reachlms.com (no trailing slash).
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
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
  allowInsecure: process.env.ALLOW_INSECURE_PLATFORMS === 'true',
};

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'media'), { recursive: true });
