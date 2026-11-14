// Storage accounting for uploaded media. Sizes come from the files on disk (fs.stat), not from
// what the browser reported, so the admin view shows exactly what each account takes up.
// Files live in DATA_DIR/media on the ReachStudio server (never in ReachLMS/Canvas storage).
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

export const mediaDir = () => path.join(config.dataDir, 'media');
export const kindOf = (mime = '') => (mime.startsWith('image/') ? 'images' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'other');
const empty = () => ({ total: 0, images: 0, video: 0, audio: 0, other: 0, files: 0 });

function fileSize(id) {
  try { return fs.statSync(path.join(mediaDir(), path.basename(id))).size; } catch { return null; }
}

let cache = null;
/** Per-user usage plus totals. Cached for a few seconds; uploads and deletes clear it. */
export function usage() {
  if (cache && cache.at > Date.now() - 10_000) return cache.data;
  const byUser = new Map();
  const known = new Set();
  const all = empty();
  for (const m of db.prepare('SELECT id, user_id, mime FROM media').all()) {
    known.add(m.id);
    const size = fileSize(m.id);
    if (size === null) continue; // row without a file (already removed)
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, empty());
    for (const u of [byUser.get(m.user_id), all]) { u.total += size; u[kindOf(m.mime)] += size; u.files += 1; }
  }
  // Anything else in the media folder (e.g. left behind by an interrupted upload) still uses disk.
  let orphans = 0;
  try {
    for (const f of fs.readdirSync(mediaDir())) {
      if (known.has(f)) continue;
      try { const st = fs.statSync(path.join(mediaDir(), f)); if (st.isFile()) orphans += st.size; } catch { /* ignore */ }
    }
  } catch { /* no folder yet */ }
  let disk = null;
  try { const s = fs.statfsSync(mediaDir()); disk = { size: s.blocks * s.bsize, free: s.bavail * s.bsize }; } catch { /* not supported */ }
  const data = { byUser, all, orphans, disk };
  cache = { at: Date.now(), data };
  return data;
}
export const userUsage = (userId) => usage().byUser.get(userId) || empty();
export const resetUsageCache = () => { cache = null; };

/** Per-account quota in bytes (STORAGE_QUOTA_MB; 0 = no limit). */
export const quotaBytes = () => Math.max(0, Number(config.storageQuotaMb) || 0) * 1024 * 1024;
