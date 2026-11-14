// JSON API used by the studio (library + builder) and the player.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import crypto from 'node:crypto';
import { db, newId } from './db.js';
import { config } from './config.js';
import { createSession, getSession, setSessionUser, deleteSession, tokenFrom, requireSession, requireUser } from './sessions.js';
import { buildDeepLinkResponse, postScore } from './lti.js';
import { TYPES, isType, gradingFor } from './types.js';
import { userUsage, quotaBytes, resetUsageCache } from './storage.js';
import { isSecure, markSecure } from './secure.js';
import { markQuiz } from './rqquiz.js';
import { views } from './views.js';

export const apiRouter = express.Router();
apiRouter.use('/api', express.json({ limit: '4mb' }));

const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status } : null);

/** Admin role comes from ADMIN_EMAILS; in demo mode the first account is made an admin so the Admin view can be tried. */
function roleFor(email) {
  if (config.adminEmails.includes(String(email).toLowerCase())) return 'admin';
  if (config.demo && !db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) return 'admin';
  return 'teacher';
}
const getUser = (id) => (id ? db.prepare('SELECT * FROM users WHERE id = ?').get(id) : null);
const emailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

function linkIdentity(session, userId) {
  if (session?.lti?.platformId && session.lti.sub) {
    db.prepare('INSERT OR REPLACE INTO lti_identities (platform_id, sub, user_id, active) VALUES (?, ?, ?, 1)')
      .run(session.lti.platformId, session.lti.sub, userId);
  }
}

/** The ReachLMS identity behind this session, if any: { user_id, active }. */
const sessionIdentity = (session) => (session?.lti?.platformId && session.lti.sub
  ? db.prepare(`SELECT i.user_id, i.active FROM lti_identities i JOIN platforms p ON p.id = i.platform_id
      WHERE p.issuer = (SELECT issuer FROM platforms WHERE id = ?) AND i.sub = ? ORDER BY i.active DESC, (i.platform_id = ?) DESC LIMIT 1`).get(session.lti.platformId, session.lti.sub, session.lti.platformId)
  : null);

/** True when ReachLMS has just vouched for this user (their linked identity launched this session). */
const verifiedByReachLms = (session, userId) => { const i = sessionIdentity(session); return !!(i && i.active && i.user_id === userId); };

const maskEmail = (e) => String(e).replace(/^(.)(.*)(.@.*)$/, (m, a, b, c) => a + '*'.repeat(Math.min(b.length, 6)) + c);
const passwordOk = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;

/**
 * After a password change or reset: sign out every other session, and stop other ReachLMS
 * identities from signing in automatically (they must sign in once with the new password).
 */
function secureAccountAfterPasswordChange(userId, keepToken, keepSession) {
  db.prepare('UPDATE sessions SET user_id = NULL WHERE user_id = ? AND token != ?').run(userId, keepToken || '');
  db.prepare('UPDATE lti_identities SET active = 0 WHERE user_id = ?').run(userId);
  if (keepSession) linkIdentity(keepSession, userId);
}

// Simple in-memory brute-force protection for sign-in.
const attempts = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, list);
  return list.length >= 10;
}

// ---------- session / auth ----------
apiRouter.get('/api/me', requireSession, (req, res) => {
  const l = req.session.lti;
  res.json({
    user: publicUser(getUser(req.session.userId)),
    // Can this session set a new password without the current one? (ReachLMS has vouched for the user.)
    passwordWithoutCurrent: !!req.session.userId && verifiedByReachLms(req.session, req.session.userId),
    // Signed-out ReachLMS user whose identity was linked before: they can reset a forgotten password.
    recoverable: !req.session.userId ? recoverableFor(req.session) : null,
    lti: l ? {
      kind: l.kind, placement: l.placement, name: l.name, email: l.email, instructor: l.instructor,
      context: l.context, platformName: l.platformName, canEmbed: l.kind === 'deeplink',
    } : null,
    types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, { embedSize: v.embedSize }])),
  });
});

function startSession(req, userId) {
  const existing = getSession(tokenFrom(req));
  if (existing) {
    setSessionUser(existing.token, userId);
    linkIdentity(existing, userId);
    return existing.token;
  }
  return createSession(userId, null);
}

apiRouter.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  }
  const id = newId();
  db.prepare('INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, String(email).trim(), String(name).trim(), await bcrypt.hash(String(password), 11), roleFor(email));
  const token = startSession(req, id);
  res.json({ token, user: publicUser(getUser(id)) });
});

apiRouter.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const key = `${req.ip}|${String(email).toLowerCase()}`;
  if (tooMany(key)) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || ''));
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
    attempts.get(key).push(Date.now());
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (user.status !== 'active') return res.status(403).json({ error: 'Your ReachStudio account has been suspended. Please contact your administrator.' });
  if (user.role !== 'admin' && config.adminEmails.includes(user.email.toLowerCase())) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
    user.role = 'admin';
  }
  const token = startSession(req, user.id);
  res.json({ token, user: publicUser(user) });
});

apiRouter.post('/api/auth/logout', requireSession, (req, res) => {
  if (req.session.lti?.platformId) {
    // Stop this ReachLMS identity signing in automatically. The link is kept (inactive) so the
    // person can still prove who they are from ReachLMS if they forget their password.
    db.prepare('UPDATE lti_identities SET active = 0 WHERE sub = ? AND platform_id IN (SELECT id FROM platforms WHERE issuer = (SELECT issuer FROM platforms WHERE id = ?))').run(req.session.lti.sub, req.session.lti.platformId);
    setSessionUser(req.session.token, null);
  } else {
    deleteSession(req.session.token);
  }
  res.json({ ok: true });
});

function recoverableFor(session) {
  const i = sessionIdentity(session);
  if (!i || i.active) return null;
  const u = getUser(i.user_id);
  return u && u.status === 'active' ? { emailHint: maskEmail(u.email), name: u.name } : null;
}

// Change password. The current password is needed unless ReachLMS has just vouched for the user.
apiRouter.post('/api/auth/password', requireUser, async (req, res) => {
  const { current, password } = req.body || {};
  if (!passwordOk(password)) return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
  const user = getUser(req.session.userId);
  if (!verifiedByReachLms(req.session, user.id)) {
    const key = `pw|${user.id}`;
    if (tooMany(key)) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes.' });
    if (!(await bcrypt.compare(String(current || ''), user.password_hash))) {
      attempts.get(key).push(Date.now());
      return res.status(401).json({ error: 'Your current password is incorrect.' });
    }
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, 11), user.id);
  secureAccountAfterPasswordChange(user.id, req.session.token, req.session);
  res.json({ ok: true });
});

// Forgot password, opened from ReachLMS: a signed-out person whose ReachLMS login was linked to
// the account before can choose a new password (ReachLMS has just confirmed who they are).
apiRouter.post('/api/auth/recover', requireSession, async (req, res) => {
  const { password } = req.body || {};
  const i = sessionIdentity(req.session);
  if (req.session.userId || !i || i.active) return res.status(400).json({ error: 'Password recovery through ReachLMS isn\'t available here. Ask your ReachStudio admin for a reset link.' });
  const user = getUser(i.user_id);
  if (!user || user.status !== 'active') return res.status(403).json({ error: 'This account is suspended. Please contact your administrator.' });
  if (!passwordOk(password)) return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, 11), user.id);
  setSessionUser(req.session.token, user.id);
  secureAccountAfterPasswordChange(user.id, req.session.token, req.session);
  res.json({ ok: true, user: publicUser(getUser(user.id)) });
});

// Reset with a one-time link created by an admin.
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
apiRouter.post('/api/auth/reset', async (req, res) => {
  const { token, password } = req.body || {};
  const row = token && db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hashToken(token));
  if (!row || row.used_at || row.expires_at < Date.now()) return res.status(400).json({ error: 'This reset link has expired or has already been used. Ask your admin for a new one.' });
  if (!passwordOk(password)) return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
  const user = getUser(row.user_id);
  if (!user || user.status !== 'active') return res.status(403).json({ error: 'This account is suspended. Please contact your administrator.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, 11), user.id);
  db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(Date.now(), row.token_hash);
  secureAccountAfterPasswordChange(user.id, null, null);
  res.json({ ok: true, email: user.email });
});

apiRouter.get('/reset', (req, res) => res.send(views.reset()));

// Opens the studio in a new browser tab with a fresh session (no embedding from there).
apiRouter.post('/api/session/handoff', requireUser, (req, res) => {
  res.json({ token: createSession(req.session.userId, null) });
});

// ---------- folders ----------
apiRouter.get('/api/folders', requireUser, (req, res) => {
  res.json(db.prepare(`SELECT f.id, f.name, (SELECT COUNT(*) FROM contents c WHERE c.folder_id = f.id) AS count
                       FROM folders f WHERE user_id = ? ORDER BY name COLLATE NOCASE`).all(req.session.userId));
});
apiRouter.post('/api/folders', requireUser, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Folder name is required.' });
  const id = newId();
  db.prepare('INSERT INTO folders (id, user_id, name) VALUES (?, ?, ?)').run(id, req.session.userId, name);
  res.json({ id, name, count: 0 });
});
apiRouter.patch('/api/folders/:id', requireUser, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const r = db.prepare('UPDATE folders SET name = ? WHERE id = ? AND user_id = ?').run(name, req.params.id, req.session.userId);
  if (!r.changes) return res.status(404).json({ error: 'Folder not found.' });
  res.json({ ok: true });
});
apiRouter.delete('/api/folders/:id', requireUser, (req, res) => {
  db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// ---------- content ----------
const own = (req) => db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
const out = (c, full = false) => ({
  id: c.id, type: c.type, title: c.title, folderId: c.folder_id, createdAt: c.created_at, updatedAt: c.updated_at,
  ...(full ? { data: JSON.parse(c.data) } : {}),
});

apiRouter.get('/api/contents', requireUser, (req, res) => {
  // Course quizzes (ReachQuizzes) live in their course, not in the personal library.
  const where = ['user_id = ?', "type != 'rqquiz'"];
  const args = [req.session.userId];
  if (req.query.folder === 'none') where.push('folder_id IS NULL');
  else if (req.query.folder) { where.push('folder_id = ?'); args.push(req.query.folder); }
  if (req.query.type) { where.push('type = ?'); args.push(req.query.type); }
  if (req.query.q) { where.push('title LIKE ?'); args.push(`%${req.query.q}%`); }
  const rows = db.prepare(`SELECT * FROM contents WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 500`).all(...args);
  res.json(rows.map((r) => out(r)));
});

function validate(body) {
  if (!isType(body.type)) return 'Unknown content type.';
  if (!body.title || !String(body.title).trim()) return 'Please give your content a title.';
  if (typeof body.data !== 'object' || body.data === null) return 'Missing content data.';
  return null;
}

apiRouter.post('/api/contents', requireUser, (req, res) => {
  const err = validate(req.body || {});
  if (err) return res.status(400).json({ error: err });
  const id = newId(9);
  db.prepare('INSERT INTO contents (id, user_id, folder_id, type, title, data) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.session.userId, req.body.folderId || null, req.body.type, String(req.body.title).trim().slice(0, 200), JSON.stringify(req.body.data));
  res.json(out(db.prepare('SELECT * FROM contents WHERE id = ?').get(id), true));
});

apiRouter.get('/api/contents/:id', requireUser, (req, res) => {
  const c = own(req);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  res.json(out(c, true));
});

apiRouter.put('/api/contents/:id', requireUser, (req, res) => {
  const c = own(req);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  const body = { ...out(c, true), ...req.body, type: c.type };
  const err = validate(body);
  if (err) return res.status(400).json({ error: err });
  db.prepare("UPDATE contents SET title = ?, data = ?, folder_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(String(body.title).trim().slice(0, 200), JSON.stringify(body.data), body.folderId || null, c.id);
  res.json(out(db.prepare('SELECT * FROM contents WHERE id = ?').get(c.id), true));
});

apiRouter.post('/api/contents/:id/duplicate', requireUser, (req, res) => {
  const c = own(req);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  const id = newId(9);
  db.prepare('INSERT INTO contents (id, user_id, folder_id, type, title, data) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, c.user_id, c.folder_id, c.type, `${c.title} (copy)`.slice(0, 200), c.data);
  res.json(out(db.prepare('SELECT * FROM contents WHERE id = ?').get(id)));
});

apiRouter.delete('/api/contents/:id', requireUser, (req, res) => {
  db.prepare('DELETE FROM contents WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// ---------- media uploads ----------
const ALLOWED = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'text/vtt': '.vtt',
};
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(config.dataDir, 'media'),
    filename: (req, file, cb) => cb(null, newId(18) + ALLOWED[file.mimetype]),
  }),
  limits: { fileSize: Math.max(config.maxUploadMb, config.maxVideoMb) * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED[file.mimetype]),
});

apiRouter.post('/api/uploads', requireUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a PNG, JPG, GIF, WebP image, MP4/WebM video, MP3 audio or VTT captions file.' });
  const reject = (status, error) => { fs.rm(req.file.path, { force: true }, () => {}); res.status(status).json({ error }); };
  const isVideo = req.file.mimetype.startsWith('video/');
  if (!isVideo && req.file.size > config.maxUploadMb * 1024 * 1024) return reject(413, `File is larger than ${config.maxUploadMb} MB.`);
  const quota = quotaBytes();
  if (quota && userUsage(req.session.userId).total + req.file.size > quota) {
    return reject(413, `This upload would go over your storage limit of ${config.storageQuotaMb} MB. Delete unused media, link the video from YouTube or Vimeo instead, or ask your administrator for more space.`);
  }
  db.prepare('INSERT INTO media (id, user_id, filename, mime, size) VALUES (?, ?, ?, ?, ?)')
    .run(req.file.filename, req.session.userId, req.file.originalname.slice(0, 200), req.file.mimetype, req.file.size);
  resetUsageCache();
  res.json({ url: `/media/${req.file.filename}`, name: req.file.originalname, mime: req.file.mimetype, size: req.file.size });
});

// The signed-in teacher's own storage use (sidebar meter).
apiRouter.get('/api/storage', requireUser, (req, res) => {
  res.json({ ...userUsage(req.session.userId), quota: quotaBytes(), maxUploadMb: config.maxUploadMb, maxVideoMb: config.maxVideoMb });
});

// ---------- embed (deep linking response) ----------
apiRouter.post('/api/embed', requireUser, async (req, res) => {
  const lti = req.session.lti;
  if (lti?.kind !== 'deeplink') return res.status(400).json({ error: 'Embedding is only available when ReachStudio is opened from the ReachLMS editor or an assignment.' });
  const c = db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(req.body?.contentId, req.session.userId);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  try {
    const r = await buildDeepLinkResponse(lti, c);
    res.json({ returnUrl: r.returnUrl, jwt: r.jwt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- graded attempts (ReachLMS assignments → gradebook + SpeedGrader) ----------
const MAX_SNAPSHOT = 1_500_000;
/**
 * The snapshot is the activity as the student left it (their answers, marked right/wrong), saved
 * as HTML so SpeedGrader can show it. It is only ever displayed in a sandboxed frame with scripts
 * disabled; this strips active content as a second line of defence.
 */
export function cleanSnapshot(html) {
  return String(html || '').slice(0, MAX_SNAPSHOT)
    .replace(/<\s*(script|style|iframe|object|embed|frame|frameset|base|meta|link|form|noscript|template)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|object|embed|frame|frameset|base|meta|link|form|noscript|template)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|xlink:href|action|formaction|srcset)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '')
    .replace(/\s(href|src|xlink:href|action|formaction)\s*=\s*(javascript|data|vbscript):[^\s>]*/gi, '');
}

// Plain-text answer record; shown with textContent only, but kept small and well-formed.
export function cleanResponses(list) {
  if (!Array.isArray(list)) return null;
  const t = (v, n) => (v === undefined || v === null ? '' : String(v).slice(0, n));
  const out = list.slice(0, 500).filter((r) => r && typeof r === 'object').map((r) => ({
    key: t(r.key, 80), question: t(r.question, 1000), answer: t(r.answer, 4000), correct: t(r.correct, 2000),
    ok: r.ok === true ? true : r.ok === false ? false : null, note: t(r.note, 200),
  }));
  return out.length ? JSON.stringify(out) : null;
}

const linkKey = (lti) => lti.resourceLinkId || `content:${lti.contentId}`;
const mySubs = (lti) => db.prepare('SELECT id, attempt, mode, score, auto_score, max_score, sent_score, passback, created_at FROM submissions WHERE platform_id = ? AND resource_link_id = ? AND sub = ? ORDER BY attempt')
  .all(lti.platformId, linkKey(lti), lti.sub);

function summary(lti, grading) {
  const list = mySubs(lti);
  const used = list.length;
  const scored = list.filter((x) => x.score !== null);
  const best = scored.length ? Math.max(...scored.map((x) => x.score)) : null;
  const last = list.at(-1) || null;
  return {
    grading,
    used,
    remaining: grading.attempts ? Math.max(0, grading.attempts - used) : null,
    best,
    counted: grading.keep === 'latest' ? (last?.score ?? null) : best,
    last: last && { id: last.id, attempt: last.attempt, score: last.score, max: last.max_score, mode: last.mode, at: last.created_at, passback: last.passback },
  };
}

// What the Grading tab will produce (points and mode), computed by the same code the server grades with.
apiRouter.post('/api/grading-info', requireUser, (req, res) => {
  if (!isType(req.body?.type)) return res.status(400).json({ error: 'Unknown content type.' });
  const g = gradingFor(req.body.type, req.body.data || {});
  res.json({ mode: g.mode, max: g.max, autoMax: g.autoMax });
});

// Status of the student's work on this assignment (attempts used, score that counts…).
apiRouter.get('/api/assignment', requireSession, (req, res) => {
  const lti = req.session.lti;
  if (lti?.kind !== 'player' || !lti.ags) return res.json({ graded: false });
  const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(lti.contentId);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  const grading = gradingFor(c.type, JSON.parse(c.data));
  res.json({ graded: true, ...forStudent(summary(lti, grading), grading) });
});

/**
 * Hand in an attempt. Body: { score (auto-marked types), snapshot (HTML of the finished activity) }.
 * Outside an assignment (an embed on a page) the score is only recorded for statistics.
 */
apiRouter.post('/api/score', requireSession, async (req, res) => {
  const lti = req.session.lti;
  if (lti?.kind !== 'player') return res.status(400).json({ error: 'Not a player session.' });
  const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(lti.contentId);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  const grading = gradingFor(c.type, JSON.parse(c.data));
  const raw = Number(req.body?.score);
  let autoScore = grading.autoMax > 0 && Number.isFinite(raw) ? Math.max(0, Math.min(grading.autoMax, raw)) : null;
  // Exam mode: the page never had the answer key, so the server marks the student's choices.
  let secureResponses = null; let review = false;
  if (lti.ags && c.type === 'rqquiz') {
    // Course quizzes are always marked here (choice and numeric answers never reach the page).
    const m = markQuiz(JSON.parse(c.data), req.body?.responses);
    autoScore = m.score; secureResponses = m.responses; review = m.review;
  } else if (lti.ags && isSecure(c.type, grading)) {
    const m = markSecure(JSON.parse(c.data), req.body?.responses);
    autoScore = m.score; secureResponses = m.responses;
  }

  if (!lti.ags) { // not an assignment: keep the old lightweight statistics only
    if (grading.autoMax > 0) {
      db.prepare('INSERT INTO attempts (content_id, platform_id, sub, score, max_score, passback) VALUES (?, ?, ?, ?, ?, ?)')
        .run(c.id, lti.platformId, lti.sub, autoScore ?? 0, grading.autoMax, 'none');
    }
    return res.json({ score: autoScore ?? 0, max: grading.autoMax, passback: 'none' });
  }

  const before = summary(lti, grading);
  if (grading.attempts && before.used >= grading.attempts) {
    return res.status(409).json({ error: `You have used all ${grading.attempts} attempt${grading.attempts === 1 ? '' : 's'} for this assignment.`, ...before });
  }

  const id = newId(16);
  const attempt = before.used + 1;
  const score = grading.mode === 'auto' ? (autoScore ?? 0) : null;
  // Score sent to the gradebook: this attempt, or the best so far.
  let sent = score;
  if (score !== null && grading.keep === 'best' && before.best !== null) sent = Math.max(score, before.best);
  db.prepare(`INSERT INTO submissions (id, content_id, platform_id, context_id, resource_link_id, lineitem, sub, user_name, attempt, mode, score, auto_score, max_score, sent_score, snapshot, responses, passback)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .run(id, c.id, lti.platformId, lti.contextId, linkKey(lti), lti.ags.lineitem, lti.sub, lti.name || '', attempt, grading.mode, score, autoScore, grading.max, sent, cleanSnapshot(req.body?.snapshot), cleanResponses(secureResponses || req.body?.responses));

  let passback = 'sent';
  try {
    const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(lti.platformId);
    await postScore(platform, lti.ags.lineitem, {
      sub: lti.sub, scoreGiven: sent, scoreMaximum: grading.max, mode: grading.mode, review,
      reviewUrl: `${config.publicUrl}/lti/launch?review=${id}`,
    });
  } catch (e) {
    console.error(e);
    passback = 'failed';
  }
  db.prepare('UPDATE submissions SET passback = ? WHERE id = ?').run(passback, id);
  db.prepare('INSERT INTO attempts (content_id, platform_id, sub, score, max_score, passback) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.id, lti.platformId, lti.sub, score ?? 0, grading.max, passback);
  res.json(forStudent({ id, score, sent, max: grading.max, mode: grading.mode, passback, ...summary(lti, grading) }, grading));
});

// When the lecturer hides scores, students' API answers leave them out too (not just the page).
function forStudent(o, grading) {
  if (grading.showScore) return o;
  const strip = (x) => (x ? { ...x, score: null, sent: null, autoScore: null } : x);
  return { ...strip(o), best: null, counted: null, last: strip(o.last) };
}

// One submitted attempt with its snapshot: for the lecturer (SpeedGrader / results list) or the student who made it.
function canSeeSubmission(session, sub) {
  const l = session.lti;
  if (!l || !sub) return false;
  // Same ReachLMS site (it may have registered ReachStudio more than once, under several client IDs).
  if (sub.platform_id !== l.platformId) {
    const issuer = (id) => db.prepare('SELECT issuer FROM platforms WHERE id = ?').get(id)?.issuer;
    if (!issuer(sub.platform_id) || issuer(sub.platform_id) !== issuer(l.platformId)) return false;
  }
  if (l.kind === 'review') return l.reviewSub === sub.sub && l.reviewLink === sub.resource_link_id;
  // ReachQuizzes teacher page: any quiz in this course.
  if (l.kind === 'quizzes' && l.instructor && String(sub.resource_link_id).startsWith('quiz:')) {
    const q = db.prepare('SELECT context_id FROM course_quizzes WHERE id = ?').get(sub.resource_link_id.slice(5));
    return !!q && q.context_id === l.contextId;
  }
  if (l.kind === 'player' && l.teacherAssignment) return sub.resource_link_id === linkKey(l);
  if (l.kind === 'player' && l.ags) return sub.sub === l.sub && sub.resource_link_id === linkKey(l);
  return false;
}
const subOut = (x, withSnapshot) => ({
  id: x.id, attempt: x.attempt, mode: x.mode, score: x.score, autoScore: x.auto_score, max: x.max_score, sent: x.sent_score,
  passback: x.passback, at: x.created_at, name: x.user_name,
  ...(withSnapshot ? { snapshot: x.snapshot || '', responses: x.responses ? JSON.parse(x.responses) : [] } : {}),
});
apiRouter.get('/api/submissions/:id', requireSession, (req, res) => {
  const x = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!canSeeSubmission(req.session, x)) return res.status(404).json({ error: 'Submission not found.' });
  const c = db.prepare('SELECT id, type, title FROM contents WHERE id = ?').get(x.content_id);
  // The other attempts by the same student on the same assignment, for switching between them.
  const all = db.prepare('SELECT * FROM submissions WHERE platform_id = ? AND resource_link_id = ? AND sub = ? ORDER BY attempt').all(x.platform_id, x.resource_link_id, x.sub);
  let submission = subOut(x, true); let attempts = all.map((a) => subOut(a, false));
  // A student looking at their own work sees only what the lecturer allows.
  const l = req.session.lti;
  const studentSelf = (l.kind === 'player' && !l.teacherAssignment) || (l.kind === 'review' && !l.instructor);
  if (studentSelf) {
    const full = db.prepare('SELECT type, data FROM contents WHERE id = ?').get(x.content_id);
    const g = full ? gradingFor(full.type, JSON.parse(full.data)) : { showScore: true, showFeedback: true };
    if (!g.showFeedback) submission.responses = submission.responses.map((r) => ({ ...r, correct: '', ok: null }));
    else if (full?.type === 'rqquiz' && !g.showAnswers) submission.responses = submission.responses.map((r) => ({ ...r, correct: '' }));
    if (!g.showScore) { submission = forStudent(submission, g); attempts = attempts.map((a) => forStudent(a, g)); }
  }
  res.json({ submission, content: c && { id: c.id, type: c.type, title: c.title }, attempts });
});

// Which submission a SpeedGrader launch opened.
apiRouter.get('/api/review', requireSession, (req, res) => {
  if (req.session.lti?.kind !== 'review') return res.status(400).json({ error: 'Not a submission view.' });
  res.json({ id: req.session.lti.reviewId });
});

// Lecturer view inside the assignment: every student's attempts.
apiRouter.get('/api/results', requireSession, (req, res) => {
  const l = req.session.lti;
  if (!(l?.kind === 'player' && l.teacherAssignment)) return res.status(403).json({ error: 'Only lecturers can see results.' });
  const rows = db.prepare('SELECT * FROM submissions WHERE platform_id = ? AND resource_link_id = ? ORDER BY sub, attempt').all(l.platformId, linkKey(l));
  const bySub = new Map();
  rows.forEach((r) => { if (!bySub.has(r.sub)) bySub.set(r.sub, []); bySub.get(r.sub).push(subOut(r, false)); });
  res.json({ students: [...bySub.values()].map((list) => ({ name: list.at(-1).name || 'Student', attempts: list })) });
});

// ---------- previews (owner only) ----------
apiRouter.get('/preview/:id', (req, res) => {
  const s = getSession(tokenFrom(req));
  const u = s?.userId && getUser(s.userId);
  const c = u && u.status === 'active' && db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(req.params.id, u.id);
  if (!c) return res.status(404).send(views.message('Preview unavailable', 'Sign in to ReachStudio to preview your content.'));
  res.send(views.player(s.token, c, { canEdit: false, graded: false, preview: true }));
});

// Standalone studio (opened in a new tab, or outside ReachLMS).
apiRouter.get('/studio', (req, res) => res.send(views.studio(tokenFrom(req) || '')));

export function mediaStatic() {
  const dir = path.join(config.dataDir, 'media');
  return express.static(dir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
  });
}
