// JSON API used by the studio (library + builder) and the player.
import express from 'express';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { db, newId } from './db.js';
import { config } from './config.js';
import { createSession, getSession, setSessionUser, deleteSession, tokenFrom, requireSession, requireUser } from './sessions.js';
import { buildDeepLinkResponse, postScore } from './lti.js';
import { TYPES, isType } from './types.js';
import { views } from './views.js';

export const apiRouter = express.Router();
apiRouter.use('/api', express.json({ limit: '2mb' }));

const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email } : null);
const getUser = (id) => (id ? db.prepare('SELECT * FROM users WHERE id = ?').get(id) : null);
const emailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

function linkIdentity(session, userId) {
  if (session?.lti?.platformId && session.lti.sub) {
    db.prepare('INSERT OR REPLACE INTO lti_identities (platform_id, sub, user_id) VALUES (?, ?, ?)')
      .run(session.lti.platformId, session.lti.sub, userId);
  }
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
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)')
    .run(id, String(email).trim(), String(name).trim(), await bcrypt.hash(String(password), 11));
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
  const token = startSession(req, user.id);
  res.json({ token, user: publicUser(user) });
});

apiRouter.post('/api/auth/logout', requireSession, (req, res) => {
  if (req.session.lti?.platformId) {
    // Unlink this ReachLMS identity so the next launch asks for an account again.
    db.prepare('DELETE FROM lti_identities WHERE platform_id = ? AND sub = ?').run(req.session.lti.platformId, req.session.lti.sub);
    setSessionUser(req.session.token, null);
  } else {
    deleteSession(req.session.token);
  }
  res.json({ ok: true });
});

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
  const where = ['user_id = ?'];
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
  'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3',
};
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(config.dataDir, 'media'),
    filename: (req, file, cb) => cb(null, newId(18) + ALLOWED[file.mimetype]),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED[file.mimetype]),
});

apiRouter.post('/api/uploads', requireUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a PNG, JPG, GIF, WebP image, MP4/WebM video or MP3 audio file.' });
  db.prepare('INSERT INTO media (id, user_id, filename, mime, size) VALUES (?, ?, ?, ?, ?)')
    .run(req.file.filename, req.session.userId, req.file.originalname.slice(0, 200), req.file.mimetype, req.file.size);
  res.json({ url: `/media/${req.file.filename}`, name: req.file.originalname, mime: req.file.mimetype });
});

// ---------- embed (deep linking response) ----------
apiRouter.post('/api/embed', requireUser, async (req, res) => {
  const lti = req.session.lti;
  if (lti?.kind !== 'deeplink') return res.status(400).json({ error: 'Embedding is only available when Reach Studio is opened from the ReachLMS editor or an assignment.' });
  const c = db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(req.body?.contentId, req.session.userId);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  try {
    const r = await buildDeepLinkResponse(lti, c);
    res.json({ returnUrl: r.returnUrl, jwt: r.jwt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- scores (AGS passback for graded assignment launches) ----------
apiRouter.post('/api/score', requireSession, async (req, res) => {
  const lti = req.session.lti;
  if (lti?.kind !== 'player') return res.status(400).json({ error: 'Not a player session.' });
  const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(lti.contentId);
  if (!c) return res.status(404).json({ error: 'Content not found.' });
  const max = TYPES[c.type].maxScore(JSON.parse(c.data));
  const score = Math.max(0, Math.min(max, Number(req.body?.score) || 0));
  let passback = 'none';
  if (lti.ags?.lineitem && max > 0) {
    const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(lti.platformId);
    try {
      await postScore(platform, lti.ags.lineitem, lti.sub, score, max);
      passback = 'sent';
    } catch (e) {
      console.error(e);
      passback = 'failed';
    }
  }
  db.prepare('INSERT INTO attempts (content_id, platform_id, sub, score, max_score, passback) VALUES (?, ?, ?, ?, ?, ?)')
    .run(c.id, lti.platformId, lti.sub, score, max, passback);
  res.json({ score, max, passback });
});

// ---------- previews (owner only) ----------
apiRouter.get('/preview/:id', (req, res) => {
  const s = getSession(tokenFrom(req));
  const c = s?.userId && db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(req.params.id, s.userId);
  if (!c) return res.status(404).send(views.message('Preview unavailable', 'Sign in to Reach Studio to preview your content.'));
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
