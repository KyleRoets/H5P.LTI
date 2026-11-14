// Canvas (ReachLMS) REST API access for ReachQuizzes.
// LTI lets a tool create gradebook columns, but not set the assignment group, description,
// grading type, "Assign To" or publish state. Those need Canvas's REST API, which ReachQuizzes
// calls as the teacher: each teacher clicks "Authorize" once (OAuth2 with an API Developer Key);
// tokens are stored encrypted and refreshed automatically.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, newId } from './db.js';
import { config, internalUrl } from './config.js';

db.exec(`CREATE TABLE IF NOT EXISTS canvas_tokens (
  issuer TEXT NOT NULL,
  sub TEXT NOT NULL,
  canvas_user_id TEXT,
  api_base TEXT NOT NULL,
  secret TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (issuer, sub)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS canvas_oauth_states (
  state TEXT PRIMARY KEY,
  session_token TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);

// ---- encryption at rest (AES-256-GCM, key kept in DATA_DIR/token.key) ----
let key;
function tokenKey() {
  if (key) return key;
  const f = path.join(config.dataDir, 'token.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  key = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64');
  return key;
}
const seal = (obj) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};
const open = (s) => {
  const [iv, tag, data] = s.split('.').map((b) => Buffer.from(b, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', tokenKey(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
};

export const apiConfigured = () => !!(config.canvasClientId && config.canvasClientSecret);
const issuerOf = (platformId) => db.prepare('SELECT issuer, auth_url FROM platforms WHERE id = ?').get(platformId);

/** Canvas's web/API address for this launch: from the launch ($Canvas.api.baseUrl) or the platform. */
export function apiBaseFor(lti) {
  if (config.canvasApiBase) return config.canvasApiBase.replace(/\/$/, '');
  if (lti.canvasApiBase) return String(lti.canvasApiBase).replace(/\/$/, '');
  try { return new URL(issuerOf(lti.platformId).auth_url).origin; } catch { return null; }
}

export const redirectUri = () => `${config.publicUrl}/lti/canvas/callback`;

/**
 * The only Canvas API calls ReachQuizzes makes. Requested on every Authorize so the key works with
 * "Enforce Scopes" on (Canvas refuses an authorisation that names no scopes) and the token can do
 * nothing else. With Enforce Scopes off, Canvas ignores them.
 */
export const API_SCOPES = [
  'url:GET|/api/v1/courses/:id',
  'url:GET|/api/v1/courses/:course_id/assignment_groups',
  'url:GET|/api/v1/courses/:course_id/sections',
  'url:GET|/api/v1/courses/:course_id/users',
  'url:GET|/api/v1/courses/:course_id/assignments',
  'url:POST|/api/v1/courses/:course_id/assignments',
  'url:PUT|/api/v1/courses/:course_id/assignments/:id',
  'url:DELETE|/api/v1/courses/:course_id/assignments/:id',
  'url:POST|/api/v1/courses/:course_id/assignments/:assignment_id/overrides',
  'url:DELETE|/api/v1/courses/:course_id/assignments/:assignment_id/overrides/:id',
];

export function authorizeUrl(session) {
  const base = apiBaseFor(session.lti);
  const state = newId(24);
  db.prepare('INSERT INTO canvas_oauth_states (state, session_token, created_at) VALUES (?, ?, ?)').run(state, session.token, Date.now());
  db.prepare('DELETE FROM canvas_oauth_states WHERE created_at < ?').run(Date.now() - 15 * 60 * 1000);
  const u = new URL(`${base}/login/oauth2/auth`);
  u.search = new URLSearchParams({ client_id: config.canvasClientId, response_type: 'code', redirect_uri: redirectUri(), state, scope: API_SCOPES.join(' ') }).toString();
  return u.toString();
}

async function tokenRequest(base, params) {
  const res = await fetch(internalUrl(`${base}/login/oauth2/token`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.canvasClientId, client_secret: config.canvasClientSecret, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ReachLMS sign-in failed (${res.status}): ${body.error_description || body.error || 'unknown error'}`);
  return body;
}

/**
 * OAuth callback: exchange the code and store the teacher's token. The Canvas user who authorised
 * must be the person who launched ReachQuizzes ($Canvas.user.id from the launch), so one person
 * can't connect another person's account.
 */
export async function completeAuthorization(state, code) {
  const row = db.prepare('SELECT * FROM canvas_oauth_states WHERE state = ?').get(String(state || ''));
  if (!row || row.created_at < Date.now() - 15 * 60 * 1000) throw new Error('This authorisation link has expired. Close this window and click Authorize again.');
  db.prepare('DELETE FROM canvas_oauth_states WHERE state = ?').run(row.state);
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(row.session_token);
  const lti = s?.lti ? JSON.parse(s.lti) : null;
  if (!lti) throw new Error('Your ReachQuizzes session has expired. Open it again from the course menu.');
  const base = apiBaseFor(lti);
  const t = await tokenRequest(base, { grant_type: 'authorization_code', code: String(code || ''), redirect_uri: redirectUri() });
  const canvasUserId = String(t.user?.id ?? '');
  if (lti.canvasUserId && canvasUserId && canvasUserId !== String(lti.canvasUserId)) {
    throw new Error('You signed in to ReachLMS as a different person from the one who opened ReachQuizzes. Sign in as yourself and try again.');
  }
  const issuer = issuerOf(lti.platformId).issuer;
  db.prepare(`INSERT INTO canvas_tokens (issuer, sub, canvas_user_id, api_base, secret, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(issuer, sub) DO UPDATE SET canvas_user_id = excluded.canvas_user_id, api_base = excluded.api_base, secret = excluded.secret, updated_at = excluded.updated_at`)
    .run(issuer, lti.sub, canvasUserId, base, seal({ access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (Number(t.expires_in) || 3600) * 1000 }));
  return { name: t.user?.name || lti.name };
}

function tokenRow(lti) {
  const issuer = issuerOf(lti.platformId)?.issuer;
  return issuer ? db.prepare('SELECT * FROM canvas_tokens WHERE issuer = ? AND sub = ?').get(issuer, lti.sub) : null;
}
export const isConnected = (lti) => !!tokenRow(lti);
export function disconnect(lti) {
  const issuer = issuerOf(lti.platformId)?.issuer;
  if (issuer) db.prepare('DELETE FROM canvas_tokens WHERE issuer = ? AND sub = ?').run(issuer, lti.sub);
}

async function accessToken(lti) {
  const row = tokenRow(lti);
  if (!row) { const e = new Error('Connect ReachQuizzes to ReachLMS first.'); e.needsAuth = true; throw e; }
  const t = open(row.secret);
  if (t.exp > Date.now() + 60_000) return { token: t.access, base: row.api_base };
  if (!t.refresh) { disconnect(lti); const e = new Error('Your ReachLMS connection expired. Click Authorize again.'); e.needsAuth = true; throw e; }
  try {
    const n = await tokenRequest(row.api_base, { grant_type: 'refresh_token', refresh_token: t.refresh });
    db.prepare("UPDATE canvas_tokens SET secret = ?, updated_at = datetime('now') WHERE issuer = ? AND sub = ?")
      .run(seal({ access: n.access_token, refresh: n.refresh_token || t.refresh, exp: Date.now() + (Number(n.expires_in) || 3600) * 1000 }), row.issuer, row.sub);
    return { token: n.access_token, base: row.api_base };
  } catch {
    disconnect(lti);
    const e = new Error('Your ReachLMS connection expired or was removed. Click Authorize again.'); e.needsAuth = true; throw e;
  }
}

/** Canvas REST client acting as this teacher. Paths start with /api/v1/. */
export function canvasApi(lti) {
  async function call(method, p, body) {
    const { token, base } = await accessToken(lti);
    const res = await fetch(internalUrl(`${base}${p}`), {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { disconnect(lti); const e = new Error('ReachLMS no longer accepts ReachQuizzes\' access. Click Authorize again.'); e.needsAuth = true; throw e; }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.errors ? JSON.stringify(data.errors).slice(0, 300) : data?.message || res.statusText;
      throw new Error(`ReachLMS said no (${res.status}): ${msg}`);
    }
    return data;
  }
  // Follow Canvas's pagination (Link: rel="next") for list endpoints, up to a sensible limit.
  async function list(p) {
    const { token, base } = await accessToken(lti);
    let url = `${base}${p}${p.includes('?') ? '&' : '?'}per_page=100`;
    const out = [];
    for (let i = 0; url && i < 20; i++) {
      const res = await fetch(internalUrl(url), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`ReachLMS said no (${res.status}) for ${p}`);
      out.push(...(await res.json()));
      url = (res.headers.get('link') || '').split(',').map((x) => x.match(/<([^>]+)>;\s*rel="next"/)?.[1]).find(Boolean) || null;
    }
    return out;
  }
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p), list };
}
