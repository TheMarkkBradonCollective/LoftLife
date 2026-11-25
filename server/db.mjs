/**
 * LoftLife persistence layer.
 *
 * Uses Node's built-in `node:sqlite` (Node >= 22.5, stable in Node 24) so the
 * whole server runs with zero native dependencies. The database file lives in
 * LOFTLIFE_DATA_DIR (default ./data, git-ignored).
 *
 * All writes that must stay consistent use `tx()`, which takes SQLite's
 * IMMEDIATE write lock so concurrent requests cannot interleave a
 * read-modify-write sequence (this is what makes wallet balances safe).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DATA_DIR = process.env.LOFTLIFE_DATA_DIR
  ? path.resolve(process.env.LOFTLIFE_DATA_DIR)
  : path.resolve(process.cwd(), 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.LOFTLIFE_DB_PATH
  ? path.resolve(process.env.LOFTLIFE_DB_PATH)
  : path.join(DATA_DIR, 'loftlife.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  handle          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'player',
  created_at      INTEGER NOT NULL,
  suspended_until INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_json  TEXT NOT NULL,
  bio          TEXT NOT NULL DEFAULT '',
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  yuanzi  INTEGER NOT NULL DEFAULT 0 CHECK (yuanzi >= 0),
  tongbao INTEGER NOT NULL DEFAULT 0 CHECK (tongbao >= 0)
);

CREATE TABLE IF NOT EXISTS ledger (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency        TEXT NOT NULL CHECK (currency IN ('yuanzi','tongbao')),
  delta           INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  ref             TEXT,
  idempotency_key TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_idem
  ON ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('furniture','clothing')),
  catalog_id  TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 0),
  acquired_at INTEGER NOT NULL,
  UNIQUE (user_id, kind, catalog_id)
);

-- One hotel suite per player, plus the shared decoration state of it.
CREATE TABLE IF NOT EXISTS suites (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  number       TEXT NOT NULL,
  floor        INTEGER NOT NULL,
  name         TEXT NOT NULL,
  items_json   TEXT NOT NULL DEFAULT '[]',
  surfaces_json TEXT NOT NULL DEFAULT '{}',
  mood         TEXT NOT NULL DEFAULT 'morning',
  is_public    INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS worlds (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'hangout',
  description  TEXT NOT NULL DEFAULT '',
  access       TEXT NOT NULL DEFAULT 'private'
               CHECK (access IN ('public','private','invite','friends','collab')),
  published    INTEGER NOT NULL DEFAULT 0,
  items_json   TEXT NOT NULL DEFAULT '[]',
  surfaces_json TEXT NOT NULL DEFAULT '{}',
  mood         TEXT NOT NULL DEFAULT 'morning',
  max_visitors INTEGER NOT NULL DEFAULT 30,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS worlds_owner ON worlds(owner_id);
CREATE INDEX IF NOT EXISTS worlds_public ON worlds(published, access);

CREATE TABLE IF NOT EXISTS world_collaborators (
  world_id  TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, user_id)
);

CREATE TABLE IF NOT EXISTS world_invites (
  world_id   TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, user_id)
);

-- Friendship rows store the pair with a < b so one relationship has one row.
CREATE TABLE IF NOT EXISTS friendships (
  a            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending','accepted')),
  requested_by TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS blocks (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL CHECK (scope IN ('city','world','dm','party')),
  scope_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_scope ON chat_messages(scope, scope_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id             TEXT PRIMARY KEY,
  reporter_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL,
  details        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','actioned')),
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_log(created_at DESC);
`);

/** Run `fn` inside an IMMEDIATE transaction; rolls back on any throw. */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Rollback failure is reported by the original error below.
    }
    throw error;
  }
}

let counter = 0;
/** Short, sortable, collision-resistant identifier. */
export function newId(prefix = 'id') {
  counter = (counter + 1) % 0xffff;
  const time = Date.now().toString(36);
  const rand = crypto.randomBytes(5).toString('hex');
  return `${prefix}_${time}${counter.toString(36)}${rand}`;
}

export function now() {
  return Date.now();
}

export function audit(actorId, action, detail = '') {
  db.prepare(
    'INSERT INTO audit_log (id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(newId('aud'), actorId ?? null, action, detail, now());
}

export function closeDb() {
  try {
    db.close();
  } catch {
    // Already closed.
  }
}
