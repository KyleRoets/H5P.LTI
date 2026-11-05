// Token-based sessions. The studio and player run inside ReachLMS iframes where
// third-party cookies are often blocked (Safari, privacy modes), so instead of
// cookies every launch mints a random bearer token that the page sends with API calls.
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';

export function createSession(userId, lti) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + config.sessionHours * 3600 * 1000;
  db.prepare('INSERT INTO sessions (token, user_id, lti, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId || null, lti ? JSON.stringify(lti) : null, expires);
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row || row.expires_at < Date.now()) return null;
  return { token: row.token, userId: row.user_id, lti: row.lti ? JSON.parse(row.lti) : null };
}

export function setSessionUser(token, userId) {
  db.prepare('UPDATE sessions SET user_id = ? WHERE token = ?').run(userId, token);
}

export function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function tokenFrom(req) {
  const h = req.get('authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return req.query.t || null;
}

// Express middleware: attaches req.session, rejects if missing.
export function requireSession(req, res, next) {
  const s = getSession(tokenFrom(req));
  if (!s) return res.status(401).json({ error: 'Your session has expired. Please relaunch Reach Studio from ReachLMS.' });
  req.session = s;
  next();
}

export function requireUser(req, res, next) {
  requireSession(req, res, () => {
    if (!req.session.userId) return res.status(401).json({ error: 'Please sign in or create an account first.', needsAuth: true });
    next();
  });
}
