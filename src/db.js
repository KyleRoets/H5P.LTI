import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export const db = new DatabaseSync(process.env.DB_FILE || path.join(config.dataDir, 'studio.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  auth_url TEXT NOT NULL,
  token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(issuer, client_id)
);

CREATE TABLE IF NOT EXISTS deployments (
  platform_id INTEGER NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL,
  first_seen TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (platform_id, deployment_id)
);

CREATE TABLE IF NOT EXISTS oidc_states (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  platform_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lti_identities (
  platform_id INTEGER NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  sub TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (platform_id, sub)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  lti TEXT,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS contents_user ON contents(user_id, updated_at);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  platform_id INTEGER,
  sub TEXT,
  score REAL,
  max_score REAL,
  passback TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Migrations for databases created by earlier versions.
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'teacher'");
if (!userCols.includes('status')) db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
if (!userCols.includes('last_seen')) db.exec('ALTER TABLE users ADD COLUMN last_seen TEXT');
const idCols = db.prepare('PRAGMA table_info(lti_identities)').all().map((c) => c.name);
// active = 0 after "Sign out": the link no longer signs in automatically, but it can still be
// used to prove who someone is when they reset a forgotten password from ReachLMS.
if (!idCols.includes('active')) db.exec('ALTER TABLE lti_identities ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
)`);

// Graded attempts handed in from a ReachLMS assignment. Each one becomes a submission in
// SpeedGrader, which opens /lti/launch?review=<id> to show the lecturer what the student did.
db.exec(`CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  platform_id INTEGER NOT NULL,
  context_id TEXT,
  resource_link_id TEXT,
  lineitem TEXT,
  sub TEXT NOT NULL,
  user_name TEXT,
  attempt INTEGER NOT NULL,
  mode TEXT NOT NULL,
  score REAL,
  auto_score REAL,
  max_score REAL NOT NULL,
  sent_score REAL,
  snapshot TEXT,
  passback TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS submissions_link ON submissions (platform_id, resource_link_id, sub)');
// Question-by-question answers (JSON), for activities that show one question at a time.
if (!db.prepare('PRAGMA table_info(submissions)').all().some((c) => c.name === 'responses')) db.exec('ALTER TABLE submissions ADD COLUMN responses TEXT');

export const newId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');

export function cleanupExpired() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM oidc_states WHERE created_at < ?').run(now - 10 * 60 * 1000);
}
