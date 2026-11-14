// Optional backup to a private GitHub repository, for hosts whose disk is wiped on every restart
// (for example Render's free plan, which also restarts after 15 minutes without visitors).
//
// Set BACKUP_GITHUB_REPO (owner/name) and BACKUP_GITHUB_TOKEN (a fine-grained token with
// "Contents: read and write" on that one repository). Then:
//   - on start, if the data folder is empty, everything is restored from the repository;
//   - every 30 seconds, anything that changed is saved there (and once more on shutdown).
// What's saved: the database, the tool's signing key, the key that encrypts ReachLMS tokens,
// and uploaded files up to 25 MB each (larger videos: use YouTube or Vimeo while on a free plan).
// With BACKUP_PASSPHRASE set, every file is encrypted before it leaves the server.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const REPO = (process.env.BACKUP_GITHUB_REPO || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
const TOKEN = (process.env.BACKUP_GITHUB_TOKEN || '').trim();
const BRANCH = (process.env.BACKUP_GITHUB_BRANCH || 'main').trim();
const API = (process.env.BACKUP_GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
const PASS = process.env.BACKUP_PASSPHRASE || '';
const EVERY_MS = Number(process.env.BACKUP_INTERVAL_MS) || 30_000;
const MAX_MEDIA = 25 * 1024 * 1024;
const ROOT = 'backup';
const KEY_FILES = ['tool-keys.json', 'token.key'];

export const backupEnabled = () => !!(REPO && TOKEN);
let restoreFailed = false; // never save over a good backup after failing to load it
const log = (...a) => console.log('[backup]', ...a);

// ---- optional encryption (AES-256-GCM, key from BACKUP_PASSPHRASE) ----
const MAGIC = Buffer.from('RSB1');
const encKey = () => crypto.scryptSync(PASS, 'reachstudio-backup', 32);
function wrap(buf) {
  if (!PASS) return buf;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), data]);
}
function unwrap(buf) {
  if (!buf.subarray(0, 4).equals(MAGIC)) return buf;
  if (!PASS) throw new Error('The backup is encrypted: set BACKUP_PASSPHRASE to the passphrase it was saved with.');
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), buf.subarray(4, 16));
  d.setAuthTag(buf.subarray(16, 32));
  try { return Buffer.concat([d.update(buf.subarray(32)), d.final()]); } catch { throw new Error('BACKUP_PASSPHRASE doesn\'t match the one the backup was saved with.'); }
}

// ---- GitHub contents API ----
const shas = new Map(); // repo path -> blob sha (needed to update or delete a file)
async function gh(method, p, { body, raw } = {}) {
  const res = await fetch(`${API}/repos/${REPO}/contents/${p}${method === 'GET' ? `?ref=${encodeURIComponent(BRANCH)}` : ''}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'reach-studio-backup',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const e = new Error(`GitHub ${method} ${p}: ${res.status} ${t.slice(0, 200)}`); e.status = res.status; throw e;
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}
async function listDir(p) {
  const items = await gh('GET', p);
  if (!Array.isArray(items)) return [];
  for (const it of items) if (it.type === 'file') shas.set(it.path, it.sha);
  return items.filter((it) => it.type === 'file');
}
async function put(p, buf, message) {
  const send = () => gh('PUT', p, { body: { message, branch: BRANCH, content: wrap(buf).toString('base64'), ...(shas.has(p) ? { sha: shas.get(p) } : {}) } });
  let r;
  try { r = await send(); } catch (e) {
    if (e.status !== 409 && e.status !== 422) throw e;
    // Our idea of the file's version was out of date: look it up and try once more.
    const cur = await gh('GET', p); if (cur?.sha) shas.set(p, cur.sha); else shas.delete(p);
    r = await send();
  }
  shas.set(p, r.content.sha);
}
async function remove(p, message) {
  if (!shas.has(p)) return;
  await gh('DELETE', p, { body: { message, branch: BRANCH, sha: shas.get(p) } });
  shas.delete(p);
}

const dataFile = (...p) => path.join(config.dataDir, ...p);
const mediaDir = () => dataFile('media');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const saved = new Map(); // repo path -> hash of what was last saved

/** Before the database opens: if this disk is fresh, bring back the last backup. */
export async function restoreIfEmpty() {
  if (!backupEnabled()) return;
  try { await restore(); } catch (e) { restoreFailed = true; throw e; }
}
async function restore() {
  if (!/^[\w.-]+\/[\w.-]+$/.test(REPO)) { console.error(`[backup] BACKUP_GITHUB_REPO should look like owner/name, not "${REPO}". Backups are off.`); return; }
  const top = await listDir(ROOT);
  const media = await listDir(`${ROOT}/media`);
  if (fs.existsSync(dataFile('studio.db'))) { log(`data folder already has a database; not restoring (${REPO}).`); return; }
  if (!top.some((f) => f.name === 'studio.db')) { log(`no backup in ${REPO} yet; starting fresh.`); return; }
  // Uploads and keys first, the database last (written under a temporary name and then renamed):
  // if anything fails partway, there's still no database, so the next start tries again.
  fs.mkdirSync(mediaDir(), { recursive: true });
  for (const f of media) {
    const buf = unwrap(await gh('GET', f.path, { raw: true }));
    fs.writeFileSync(path.join(mediaDir(), path.basename(f.name)), buf);
    saved.set(f.path, 'present');
  }
  for (const f of top) {
    if (!KEY_FILES.includes(f.name)) continue;
    const buf = unwrap(await gh('GET', f.path, { raw: true }));
    fs.writeFileSync(dataFile(f.name), buf, { mode: 0o600 });
    saved.set(f.path, hash(buf));
  }
  const dbBuf = unwrap(await gh('GET', `${ROOT}/studio.db`, { raw: true }));
  fs.writeFileSync(dataFile('studio.db.restoring'), dbBuf, { mode: 0o600 });
  fs.renameSync(dataFile('studio.db.restoring'), dataFile('studio.db'));
  saved.set(`${ROOT}/studio.db`, hash(dbBuf));
  log(`restored the database, keys and ${media.length} uploaded file(s) from ${REPO}.`);
}

let db;
let lastChanges = '';
let running = null;

async function backupNow(reason) {
  if (running) return running;
  running = (async () => {
    // Database: a consistent copy via VACUUM INTO, saved only when something changed.
    // total_changes: this server's writes; data_version: writes by other processes (e.g. admin scripts).
    const changes = `${db.prepare('SELECT total_changes() AS n').get().n}/${db.prepare('PRAGMA data_version').get().data_version}`;
    if (changes !== lastChanges) {
      const snap = dataFile('.backup-snapshot.db');
      fs.rmSync(snap, { force: true });
      db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
      const buf = fs.readFileSync(snap);
      fs.rmSync(snap, { force: true });
      const h = hash(buf);
      if (saved.get(`${ROOT}/studio.db`) !== h) { await put(`${ROOT}/studio.db`, buf, `Back up database (${reason})`); saved.set(`${ROOT}/studio.db`, h); }
      lastChanges = changes;
    }
    for (const name of KEY_FILES) {
      if (!fs.existsSync(dataFile(name))) continue;
      const buf = fs.readFileSync(dataFile(name)); const h = hash(buf);
      if (saved.get(`${ROOT}/${name}`) !== h) { await put(`${ROOT}/${name}`, buf, `Back up ${name}`); saved.set(`${ROOT}/${name}`, h); }
    }
    // Uploaded files never change once written (each has its own id): add new ones, drop deleted ones.
    const local = new Set(fs.existsSync(mediaDir()) ? fs.readdirSync(mediaDir()) : []);
    for (const name of local) {
      const p = `${ROOT}/media/${name}`;
      if (saved.has(p)) continue;
      const st = fs.statSync(path.join(mediaDir(), name));
      if (!st.isFile()) continue;
      if (st.size > MAX_MEDIA) { saved.set(p, 'too-big'); log(`skipped ${name} (${Math.round(st.size / 1048576)} MB is over the 25 MB backup limit).`); continue; }
      await put(p, fs.readFileSync(path.join(mediaDir(), name)), `Back up upload ${name}`);
      saved.set(p, 'present');
    }
    for (const p of [...saved.keys()]) {
      if (!p.startsWith(`${ROOT}/media/`) || local.has(p.slice(ROOT.length + 7))) continue;
      await remove(p, `Remove deleted upload ${p.slice(ROOT.length + 7)}`);
      saved.delete(p);
    }
  })().catch((e) => console.error('[backup] failed:', e.message)).finally(() => { running = null; });
  return running;
}

/** After the database is open: save changes every 30 seconds, and once more on shutdown. */
export async function startBackups() {
  if (!backupEnabled() || !/^[\w.-]+\/[\w.-]+$/.test(REPO)) return;
  if (restoreFailed) { console.error('[backup] OFF for this run: the backup could not be loaded, so saving now could overwrite it. Fix the problem above and restart.'); return; }
  ({ db } = await import('./db.js'));
  if (!saved.size) { await listDir(ROOT).catch(() => {}); await listDir(`${ROOT}/media`).then((m) => m.forEach((f) => saved.set(f.path, 'present'))).catch(() => {}); }
  setInterval(() => backupNow('scheduled'), EVERY_MS).unref();
  setTimeout(() => backupNow('start'), 2000).unref();
  let stopping = false;
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => {
      if (stopping) return; stopping = true;
      log(`${sig}: saving before shutdown…`);
      await running; await backupNow('shutdown');
      process.exit(0);
    });
  }
  log(`on: saving to ${REPO} (${BRANCH}) every ${Math.round(EVERY_MS / 1000)} s${PASS ? ', encrypted' : ''}.`);
}
