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

// Changes on every deploy; used in asset URLs so browsers never run an old copy of the app.
const build = (process.env.RENDER_GIT_COMMIT || process.env.SOURCE_COMMIT || Date.now().toString(36)).slice(0, 10);

export const config = {
  build,
  port,
  // The public HTTPS address of this tool, e.g. https://studio.reachlms.com (no trailing slash).
  publicUrl: detectPublicUrl().replace(/\/$/, ''),
  // DEMO_MODE=true also serves a pretend ReachLMS at /demo on the same address, for testing.
  // Never enable it on the instance your real ReachLMS uses.
  demo,
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  toolName: process.env.TOOL_NAME || 'ReachStudio',
  // ReachQuizzes: the tool's name in ReachLMS, and the short label in the course menu.
  quizToolName: process.env.QUIZ_TOOL_NAME || 'ReachQuizzes',
  quizNavLabel: process.env.QUIZ_NAV_LABEL || 'Quizzes+',
  // Canvas REST API access for ReachQuizzes (assignment groups, descriptions, Assign To, publish):
  // an API Developer Key from ReachLMS → Admin → Developer Keys → + API Key.
  canvasClientId: process.env.CANVAS_API_CLIENT_ID || (demo ? 'mock-api-key' : ''),
  canvasClientSecret: process.env.CANVAS_API_CLIENT_SECRET || (demo ? 'mock-api-secret' : ''),
  // Optional: ReachLMS's web address if it differs from what launches report.
  canvasApiBase: process.env.CANVAS_API_BASE || '',
  // Comma-separated emails that get the Admin view (manage all users). See also `npm run make-admin`.
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  // How long a studio/player session token stays valid.
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  // Max upload size in MB for images, audio and captions.
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 50),
  // Max upload size in MB for video files (MP4/WebM).
  maxVideoMb: Number(process.env.MAX_VIDEO_MB || 500),
  // Optional storage limit per account in MB (0 = no limit). Counts every uploaded file.
  storageQuotaMb: Number(process.env.STORAGE_QUOTA_MB || 0),
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
