// Admin API: overview statistics and user management (suspend, reactivate, change role, delete).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';
import crypto from 'node:crypto';
import { requireAdmin, revokeUserSessions } from './sessions.js';
import { hashToken } from './api.js';
import { usage, userUsage, resetUsageCache, quotaBytes } from './storage.js';

export const adminRouter = express.Router();
adminRouter.use('/api/admin', express.json(), requireAdmin);

adminRouter.get('/api/admin/stats', (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  res.json({
    users: one('SELECT COUNT(*) n FROM users').n,
    activeUsers: one("SELECT COUNT(*) n FROM users WHERE status = 'active'").n,
    suspendedUsers: one("SELECT COUNT(*) n FROM users WHERE status = 'suspended'").n,
    admins: one("SELECT COUNT(*) n FROM users WHERE role = 'admin'").n,
    activeLast30: one("SELECT COUNT(*) n FROM users WHERE last_seen >= datetime('now', '-30 days')").n,
    newLast30: one("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now', '-30 days')").n,
    contents: one('SELECT COUNT(*) n FROM contents').n,
    // Measured on disk: every uploaded file, plus anything else in the media folder.
    storage: (() => { const u = usage(); return { ...u.all, total: u.all.total + u.orphans, orphans: u.orphans, disk: u.disk, quota: quotaBytes() }; })(),
    mediaBytes: usage().all.total + usage().orphans,
    attempts: one('SELECT COUNT(*) n FROM attempts').n,
    gradesSent: one("SELECT COUNT(*) n FROM attempts WHERE passback = 'sent'").n,
    platforms: db.prepare('SELECT name, issuer, created_at FROM platforms ORDER BY id').all(),
  });
});

const USER_SQL = `
  SELECT u.id, u.name, u.email, u.role, u.status, u.created_at, u.last_seen,
    (SELECT COUNT(*) FROM contents c WHERE c.user_id = u.id) AS contents,
    (SELECT MAX(updated_at) FROM contents c WHERE c.user_id = u.id) AS last_edit,
    (SELECT COUNT(*) FROM lti_identities i WHERE i.user_id = u.id AND i.active = 1) AS linked
  FROM users u`;

adminRouter.get('/api/admin/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(`${USER_SQL} WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.created_at DESC`).all(`%${q}%`, `%${q}%`)
    : db.prepare(`${USER_SQL} ORDER BY u.created_at DESC`).all();
  res.json(rows.map((r) => { const s = userUsage(r.id); return { ...r, media_bytes: s.total, storage: s }; }));
});

adminRouter.get('/api/admin/users/:id', (req, res) => {
  const user = db.prepare(`${USER_SQL} WHERE u.id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const storage = userUsage(user.id);
  res.json({ user: { ...user, media_bytes: storage.total }, storage: { ...storage, quota: quotaBytes() } });
});

adminRouter.patch('/api/admin/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  const { status, role } = req.body || {};
  if (target.id === req.user.id && (status === 'suspended' || role === 'teacher')) {
    return res.status(400).json({ error: 'You can\'t suspend your own account or remove your own admin access.' });
  }
  if (status !== undefined) {
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target.id);
    if (status === 'suspended') revokeUserSessions(target.id);
  }
  if (role !== undefined) {
    if (!['teacher', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
  }
  res.json(db.prepare(`${USER_SQL} WHERE u.id = ?`).get(target.id));
});

// One-time password reset link (valid for 1 hour) for the admin to send to the user.
adminRouter.post('/api/admin/users/:id/reset-link', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.status !== 'active') return res.status(400).json({ error: 'Reactivate this account before resetting its password.' });
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 60 * 60 * 1000;
  db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(target.id); // only the newest link works
  db.prepare('INSERT INTO password_resets (token_hash, user_id, created_by, expires_at) VALUES (?, ?, ?, ?)').run(hashToken(token), target.id, req.user.id, expiresAt);
  res.json({ url: `${config.publicUrl}/reset?token=${token}`, expiresAt, email: target.email, name: target.name });
});

adminRouter.delete('/api/admin/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You can\'t delete your own account.' });
  const files = db.prepare('SELECT id FROM media WHERE user_id = ?').all(target.id);
  revokeUserSessions(target.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id); // cascades to content, folders, media rows, identities
  for (const f of files) fs.rmSync(path.join(config.dataDir, 'media', path.basename(f.id)), { force: true });
  resetUsageCache();
  res.json({ ok: true, deletedFiles: files.length });
});
