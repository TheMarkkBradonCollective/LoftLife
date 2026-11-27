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
  -- Voice range + microphone mode + sensitivity, synced to the account.
  voice_json   TEXT NOT NULL DEFAULT '{}',
  -- Keybindings and touch layout, synced per account.
  controls_json TEXT NOT NULL DEFAULT '{}',
  controls_updated_at INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  yuanzi  INTEGER NOT NULL DEFAULT 0 CHECK (yuanzi >= 0),
  tongbao INTEGER NOT NULL DEFAULT 0 CHECK (tongbao >= 0),
  cubits  INTEGER NOT NULL DEFAULT 0 CHECK (cubits >= 0),
  cash    INTEGER NOT NULL DEFAULT 0 CHECK (cash >= 0)
);

CREATE TABLE IF NOT EXISTS ledger (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency        TEXT NOT NULL CHECK (currency IN ('yuanzi','tongbao','cubits','cash')),
  account         TEXT NOT NULL DEFAULT 'wallet' CHECK (account IN ('wallet','bank','cash')),
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

-- Unlimited named outfits, account-scoped so they follow the player across
-- devices. Only the wardrobe slice of an avatar is stored here.
CREATE TABLE IF NOT EXISTS outfits (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS outfits_user ON outfits(user_id, created_at DESC);

-- TG-Banking account and immutable payment/transfer receipts. The spendable
-- digital wallet (CUBITS) lives in wallets; the bank account holds deposits.
CREATE TABLE IF NOT EXISTS bank_accounts (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL UNIQUE,
  card_last4    TEXT NOT NULL,
  card_status   TEXT NOT NULL DEFAULT 'active',
  balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_payments (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal','payment')),
  method          TEXT NOT NULL CHECK (method IN ('wallet','card','cash')),
  amount          INTEGER NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'cubits' CHECK (currency = 'cubits'),
  merchant        TEXT,
  ref             TEXT,
  atm_id          TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bank_payments_user ON bank_payments(user_id, created_at DESC);

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
  status       TEXT NOT NULL DEFAULT 'offline',
  foundation   TEXT NOT NULL DEFAULT 'TG-MapDefault',
  layout_json  TEXT,
  published_layout_json TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  layout_version INTEGER NOT NULL DEFAULT 0,
  published_version INTEGER NOT NULL DEFAULT 0,
  redo_json    TEXT NOT NULL DEFAULT '[]',
  undo_json    TEXT NOT NULL DEFAULT '[]',
  is_official  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS worlds_owner ON worlds(owner_id);
CREATE INDEX IF NOT EXISTS worlds_public ON worlds(published, access);

CREATE TABLE IF NOT EXISTS world_collaborators (
  world_id  TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'builder'
            CHECK (role IN ('co_owner','moderator','builder','member')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, user_id)
);

-- Build areas and their owner/co-owner approvals.
CREATE TABLE IF NOT EXISTS world_plots (
  id           TEXT PRIMARY KEY,
  world_id     TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  x            INTEGER NOT NULL,
  z            INTEGER NOT NULL,
  w            INTEGER NOT NULL,
  d            INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'available'
               CHECK (status IN ('available','requested','approved','denied')),
  requested_by TEXT,
  assigned_to  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS world_plots_world ON world_plots(world_id);

-- Every structural revision, used for undo/redo, history and restoration.
CREATE TABLE IF NOT EXISTS world_snapshots (
  id          TEXT PRIMARY KEY,
  world_id    TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  revision    INTEGER NOT NULL,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  layout_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (world_id, revision)
);
CREATE INDEX IF NOT EXISTS world_snapshots_world ON world_snapshots(world_id, revision DESC);

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

-- Per-account preferences and per-conversation read markers for the platform UI.
CREATE TABLE IF NOT EXISTS account_settings (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data_json  TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_reads (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, peer_id)
);

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

// Databases created before voice preferences existed keep their rows; the
// column is added in place instead of requiring a rebuild.
const profileColumns = db
  .prepare('PRAGMA table_info(profiles)')
  .all()
  .map((row) => row.name);
if (!profileColumns.includes('voice_json')) {
  db.exec("ALTER TABLE profiles ADD COLUMN voice_json TEXT NOT NULL DEFAULT '{}'");
}
if (!profileColumns.includes('controls_json')) {
  db.exec("ALTER TABLE profiles ADD COLUMN controls_json TEXT NOT NULL DEFAULT '{}'");
}
if (!profileColumns.includes('controls_updated_at')) {
  db.exec('ALTER TABLE profiles ADD COLUMN controls_updated_at INTEGER NOT NULL DEFAULT 0');
}

// Existing databases predate the city-building columns and the role set.
const worldColumns = db
  .prepare('PRAGMA table_info(worlds)')
  .all()
  .map((row) => row.name);
const WORLD_COLUMN_DEFAULTS = {
  status: "TEXT NOT NULL DEFAULT 'offline'",
  foundation: "TEXT NOT NULL DEFAULT 'TG-MapDefault'",
  layout_json: 'TEXT',
  published_layout_json: 'TEXT',
  settings_json: "TEXT NOT NULL DEFAULT '{}'",
  layout_version: 'INTEGER NOT NULL DEFAULT 0',
  published_version: 'INTEGER NOT NULL DEFAULT 0',
  redo_json: "TEXT NOT NULL DEFAULT '[]'",
  undo_json: "TEXT NOT NULL DEFAULT '[]'",
  is_official: 'INTEGER NOT NULL DEFAULT 0',
};
for (const [column, definition] of Object.entries(WORLD_COLUMN_DEFAULTS)) {
  if (!worldColumns.includes(column)) {
    db.exec(`ALTER TABLE worlds ADD COLUMN ${column} ${definition}`);
  }
}

// CUBITS and physical cash are additive columns. Existing YUANZI/TONGBAO
// balances and ledger rows are left untouched for the future conversion policy.
const walletColumns = db
  .prepare('PRAGMA table_info(wallets)')
  .all()
  .map((row) => row.name);
if (!walletColumns.includes('cubits')) {
  db.exec('ALTER TABLE wallets ADD COLUMN cubits INTEGER NOT NULL DEFAULT 0 CHECK (cubits >= 0)');
}
if (!walletColumns.includes('cash')) {
  db.exec('ALTER TABLE wallets ADD COLUMN cash INTEGER NOT NULL DEFAULT 0 CHECK (cash >= 0)');
}

// The original ledger constraint only allowed yuanzi/tongbao. SQLite cannot
// widen a CHECK in place, so rebuild it while copying every historical row.
const ledgerSql =
  db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ledger'").get()?.sql ?? '';
if (!ledgerSql.includes("'cubits'")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TRIGGER IF EXISTS ledger_no_update;
    DROP TRIGGER IF EXISTS ledger_no_delete;
    BEGIN IMMEDIATE;
    ALTER TABLE ledger RENAME TO ledger_legacy;
    CREATE TABLE ledger (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      currency        TEXT NOT NULL CHECK (currency IN ('yuanzi','tongbao','cubits','cash')),
      account         TEXT NOT NULL DEFAULT 'wallet' CHECK (account IN ('wallet','bank','cash')),
      delta           INTEGER NOT NULL,
      balance_after   INTEGER NOT NULL,
      reason          TEXT NOT NULL,
      ref             TEXT,
      idempotency_key TEXT,
      created_at      INTEGER NOT NULL
    );
    INSERT INTO ledger (id, user_id, currency, account, delta, balance_after, reason, ref, idempotency_key, created_at)
      SELECT id, user_id, currency, 'wallet', delta, balance_after, reason, ref, idempotency_key, created_at
      FROM ledger_legacy;
    DROP TABLE ledger_legacy;
    DROP INDEX IF EXISTS ledger_user;
    DROP INDEX IF EXISTS ledger_idem;
    CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS ledger_idem
      ON ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

// Financial history is append-only. Corrections must be new compensating
// entries, never edits or deletes of past balances.
db.exec(`
  CREATE TRIGGER IF NOT EXISTS ledger_no_update
    BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS ledger_no_delete
    BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS bank_payment_no_update
    BEFORE UPDATE ON bank_payments BEGIN SELECT RAISE(ABORT, 'bank payments are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS bank_payment_no_delete
    BEFORE DELETE ON bank_payments BEGIN SELECT RAISE(ABORT, 'bank payments are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_update
    BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete
    BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
`);

// Older SQLite files only allow the legacy 'editor' role. Rebuild the table
// with the current role set while preserving assignments.
const collaboratorSql = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='world_collaborators'")
  .get()?.sql ?? '';
if (/role\s+TEXT[^,]*CHECK\s*\(\s*role\s+IN\s*\(\s*'editor'\s*\)/i.test(collaboratorSql)) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    ALTER TABLE world_collaborators RENAME TO world_collaborators_legacy;
    CREATE TABLE world_collaborators (
      world_id  TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role      TEXT NOT NULL DEFAULT 'builder'
                CHECK (role IN ('co_owner','moderator','builder','member')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (world_id, user_id)
    );
    INSERT INTO world_collaborators (world_id, user_id, role, created_at)
      SELECT world_id, user_id, CASE WHEN role='editor' THEN 'builder' ELSE role END, created_at
      FROM world_collaborators_legacy;
    DROP TABLE world_collaborators_legacy;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

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
