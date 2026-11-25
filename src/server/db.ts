import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool as NeonPool } from '@neondatabase/serverless';
import {
  PLAYER_SUITE_FLOOR,
  PLAYER_SUITE_NUMBER,
} from '../game/catalog.ts';
import type {
  AccountProfile,
  AvatarConfig,
  LightingMood,
  PersistedPlayerState,
  PlacedItem,
  RoomAccessMode,
  RoomSurfaceConfig,
  UserRole,
} from '../game/types.ts';
import {
  createOpaqueSessionToken,
  defaultInitialRoomState,
  hashPassword,
  hashSessionToken,
  sanitizeAccessMode,
  sanitizeAvatarConfig,
  sanitizeMood,
  sanitizePlacedItems,
  sanitizeRoomName,
  sanitizeSurfaces,
  SESSION_TTL_MS,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './auth.ts';

export type StorageEngine = 'neon' | 'sqlite';

export interface RegisterInput {
  username: string;
  email: string;
  displayName?: string;
  password: string;
  importState?: {
    avatar?: unknown;
    roomName?: unknown;
    surfaces?: unknown;
    mood?: unknown;
    items?: unknown;
  };
}

export interface UpdateStateInput {
  displayName?: unknown;
  avatar?: unknown;
  roomName?: unknown;
  accessMode?: unknown;
  surfaces?: unknown;
  mood?: unknown;
  items?: unknown;
}

const SUITE_POOL: { suiteNumber: string; floor: number }[] = [
  { suiteNumber: PLAYER_SUITE_NUMBER, floor: PLAYER_SUITE_FLOOR },
  { suiteNumber: '403', floor: 4 },
  { suiteNumber: '302', floor: 3 },
  { suiteNumber: '303', floor: 3 },
  { suiteNumber: '201', floor: 2 },
  { suiteNumber: '203', floor: 2 },
  { suiteNumber: '204', floor: 2 },
];

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class LoftLifeDatabase {
  readonly engine: StorageEngine;
  private sqlite: DatabaseSync | null = null;
  private neonPool: NeonPool | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      this.engine = 'neon';
      this.neonPool = new NeonPool({ connectionString: databaseUrl });
      this.neonPool.on('error', (err: unknown) => {
        console.error('Neon pool idle error:', err);
      });
    } else {
      this.engine = 'sqlite';
      const dataDir = path.resolve(process.cwd(), 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      const dbPath = path.join(dataDir, 'loftlife.db');
      this.sqlite = new DatabaseSync(dbPath);
      this.sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initSchema();
    }
    return this.initPromise;
  }

  private async initSchema(): Promise<void> {
    if (this.engine === 'neon' && this.neonPool) {
      await this.neonPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'player',
          suite_number TEXT NOT NULL,
          floor INTEGER NOT NULL DEFAULT 4,
          created_at TEXT NOT NULL,
          last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS characters (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          avatar_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS personal_rooms (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          suite_number TEXT NOT NULL,
          floor INTEGER NOT NULL,
          room_name TEXT NOT NULL,
          access_mode TEXT NOT NULL DEFAULT 'friends',
          surfaces_json TEXT NOT NULL,
          mood TEXT NOT NULL DEFAULT 'morning',
          items_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallets (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          yuanzi INTEGER NOT NULL DEFAULT 500 CHECK (yuanzi >= 0),
          tongbao INTEGER NOT NULL DEFAULT 25 CHECK (tongbao >= 0),
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          detail TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      return;
    }

    if (this.sqlite) {
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'player',
          suite_number TEXT NOT NULL,
          floor INTEGER NOT NULL DEFAULT 4,
          created_at TEXT NOT NULL,
          last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS characters (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          avatar_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS personal_rooms (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          suite_number TEXT NOT NULL,
          floor INTEGER NOT NULL,
          room_name TEXT NOT NULL,
          access_mode TEXT NOT NULL DEFAULT 'friends',
          surfaces_json TEXT NOT NULL,
          mood TEXT NOT NULL DEFAULT 'morning',
          items_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wallets (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          yuanzi INTEGER NOT NULL DEFAULT 500 CHECK (yuanzi >= 0),
          tongbao INTEGER NOT NULL DEFAULT 25 CHECK (tongbao >= 0),
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          detail TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    }
  }

  private async pickNextSuite(): Promise<{ suiteNumber: string; floor: number }> {
    let count = 0;
    if (this.engine === 'neon' && this.neonPool) {
      const res = await this.neonPool.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM users');
      count = Number(res.rows[0]?.cnt ?? 0);
    } else if (this.sqlite) {
      const row = this.sqlite.prepare('SELECT COUNT(*) AS cnt FROM users').get() as
        | { cnt?: number }
        | undefined;
      count = Number(row?.cnt ?? 0);
    }
    if (count < SUITE_POOL.length) {
      return SUITE_POOL[count];
    }
    const extraFloor = 5 + Math.floor((count - SUITE_POOL.length) / 8);
    const unit = ((count - SUITE_POOL.length) % 8) + 1;
    return {
      suiteNumber: `${extraFloor}0${unit}`,
      floor: extraFloor,
    };
  }

  async registerUser(
    rawInput: RegisterInput
  ): Promise<{ state: PersistedPlayerState; sessionToken: string }> {
    await this.ensureInitialized();

    const username = validateUsername(rawInput.username);
    if (!username) {
      throw new AuthError(400, 'Username must be 3–24 characters using lowercase letters, numbers, or underscores.');
    }
    const email = validateEmail(rawInput.email);
    if (!email) {
      throw new AuthError(400, 'Please enter a valid email address.');
    }
    const password = validatePassword(rawInput.password);
    if (!password) {
      throw new AuthError(400, 'Password must be between 8 and 128 characters.');
    }

    const displayName = validateDisplayName(rawInput.displayName || username, username);
    const passwordHash = hashPassword(password);
    const userId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    const now = new Date().toISOString();
    const sessionToken = createOpaqueSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const suite = await this.pickNextSuite();

    const defaults = defaultInitialRoomState(displayName);
    const avatar: AvatarConfig = rawInput.importState?.avatar
      ? sanitizeAvatarConfig(rawInput.importState.avatar, displayName)
      : defaults.avatar;
    const roomName = rawInput.importState?.roomName
      ? sanitizeRoomName(rawInput.importState.roomName)
      : defaults.roomName;
    const surfaces: RoomSurfaceConfig = rawInput.importState?.surfaces
      ? sanitizeSurfaces(rawInput.importState.surfaces)
      : defaults.surfaces;
    const mood: LightingMood = rawInput.importState?.mood
      ? sanitizeMood(rawInput.importState.mood)
      : defaults.mood;
    const items: PlacedItem[] = rawInput.importState?.items
      ? sanitizePlacedItems(rawInput.importState.items)
      : defaults.items;
    const accessMode: RoomAccessMode = 'friends';
    const role: UserRole = 'player';

    if (this.engine === 'neon' && this.neonPool) {
      const client = await this.neonPool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1',
          [username, email]
        );
        if (existing.rows.length > 0) {
          throw new AuthError(409, 'Username or email is already registered.');
        }

        await client.query(
          `INSERT INTO users (id, username, display_name, email, password_hash, role, suite_number, floor, created_at, last_login_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [userId, username, displayName, email, passwordHash, role, suite.suiteNumber, suite.floor, now, now]
        );
        await client.query(
          `INSERT INTO characters (user_id, avatar_json, updated_at) VALUES ($1, $2, $3)`,
          [userId, JSON.stringify(avatar), now]
        );
        await client.query(
          `INSERT INTO personal_rooms (id, owner_id, suite_number, floor, room_name, access_mode, surfaces_json, mood, items_json, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            roomId,
            userId,
            suite.suiteNumber,
            suite.floor,
            roomName,
            accessMode,
            JSON.stringify(surfaces),
            mood,
            JSON.stringify(items),
            now,
          ]
        );
        await client.query(
          `INSERT INTO wallets (user_id, yuanzi, tongbao, updated_at) VALUES ($1, 500, 25, $2)`,
          [userId, now]
        );
        await client.query(
          `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)`,
          [tokenHash, userId, expiresAt, now]
        );
        await client.query(
          `INSERT INTO audit_logs (id, user_id, action, detail, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [crypto.randomUUID(), userId, 'account_register', `Registered suite ${suite.suiteNumber}`, now]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } else if (this.sqlite) {
      const existing = this.sqlite
        .prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1')
        .get(username, email) as { id?: string } | undefined;
      if (existing?.id) {
        throw new AuthError(409, 'Username or email is already registered.');
      }

      this.sqlite.exec('BEGIN');
      try {
        this.sqlite
          .prepare(
            `INSERT INTO users (id, username, display_name, email, password_hash, role, suite_number, floor, created_at, last_login_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(userId, username, displayName, email, passwordHash, role, suite.suiteNumber, suite.floor, now, now);

        this.sqlite
          .prepare(`INSERT INTO characters (user_id, avatar_json, updated_at) VALUES (?, ?, ?)`)
          .run(userId, JSON.stringify(avatar), now);

        this.sqlite
          .prepare(
            `INSERT INTO personal_rooms (id, owner_id, suite_number, floor, room_name, access_mode, surfaces_json, mood, items_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            roomId,
            userId,
            suite.suiteNumber,
            suite.floor,
            roomName,
            accessMode,
            JSON.stringify(surfaces),
            mood,
            JSON.stringify(items),
            now
          );

        this.sqlite
          .prepare(`INSERT INTO wallets (user_id, yuanzi, tongbao, updated_at) VALUES (?, 500, 25, ?)`)
          .run(userId, now);

        this.sqlite
          .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
          .run(tokenHash, userId, expiresAt, now);

        this.sqlite
          .prepare(`INSERT INTO audit_logs (id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
          .run(crypto.randomUUID(), userId, 'account_register', `Registered suite ${suite.suiteNumber}`, now);

        this.sqlite.exec('COMMIT');
      } catch (err) {
        this.sqlite.exec('ROLLBACK');
        throw err;
      }
    }

    const state: PersistedPlayerState = {
      account: {
        id: userId,
        username,
        displayName,
        email,
        role,
        suiteNumber: suite.suiteNumber,
        floor: suite.floor,
        createdAt: now,
        lastLoginAt: now,
      },
      wallet: {
        yuanzi: 500,
        tongbao: 25,
        updatedAt: now,
      },
      avatar,
      roomName,
      accessMode,
      surfaces,
      mood,
      items,
      updatedAt: now,
    };

    return { state, sessionToken };
  }

  async loginUser(
    identifierRaw: string,
    passwordRaw: string
  ): Promise<{ state: PersistedPlayerState; sessionToken: string }> {
    await this.ensureInitialized();
    const identifier = typeof identifierRaw === 'string' ? identifierRaw.trim().toLowerCase() : '';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (!identifier || !password) {
      throw new AuthError(400, 'Please enter your username/email and password.');
    }

    let userRow:
      | {
          id: string;
          username: string;
          display_name: string;
          email: string;
          password_hash: string;
          role: string;
          suite_number: string;
          floor: number;
          created_at: string;
        }
      | undefined;

    if (this.engine === 'neon' && this.neonPool) {
      const res = await this.neonPool.query<NonNullable<typeof userRow>>(
        `SELECT id, username, display_name, email, password_hash, role, suite_number, floor, created_at
         FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
        [identifier]
      );
      userRow = res.rows[0];
    } else if (this.sqlite) {
      userRow = this.sqlite
        .prepare(
          `SELECT id, username, display_name, email, password_hash, role, suite_number, floor, created_at
           FROM users WHERE username = ? OR email = ? LIMIT 1`
        )
        .get(identifier, identifier) as typeof userRow;
    }

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      throw new AuthError(401, 'Invalid username/email or password.');
    }

    const now = new Date().toISOString();
    const sessionToken = createOpaqueSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    if (this.engine === 'neon' && this.neonPool) {
      await this.neonPool.query(`UPDATE users SET last_login_at = $1 WHERE id = $2`, [now, userRow.id]);
      await this.neonPool.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)`,
        [tokenHash, userRow.id, expiresAt, now]
      );
    } else if (this.sqlite) {
      this.sqlite.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`).run(now, userRow.id);
      this.sqlite
        .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
        .run(tokenHash, userRow.id, expiresAt, now);
    }

    const state = await this.loadUserStateById(userRow.id);
    if (!state) {
      throw new AuthError(500, 'Account record is incomplete.');
    }
    return { state, sessionToken };
  }

  async getSessionState(rawToken: string | null): Promise<PersistedPlayerState | null> {
    if (!rawToken) return null;
    await this.ensureInitialized();
    const tokenHash = hashSessionToken(rawToken);
    const now = new Date().toISOString();

    let sessionRow: { user_id: string; expires_at: string } | undefined;
    if (this.engine === 'neon' && this.neonPool) {
      const res = await this.neonPool.query<NonNullable<typeof sessionRow>>(
        `SELECT user_id, expires_at FROM sessions WHERE token_hash = $1 LIMIT 1`,
        [tokenHash]
      );
      sessionRow = res.rows[0];
    } else if (this.sqlite) {
      sessionRow = this.sqlite
        .prepare(`SELECT user_id, expires_at FROM sessions WHERE token_hash = ? LIMIT 1`)
        .get(tokenHash) as typeof sessionRow;
    }

    if (!sessionRow) return null;
    if (sessionRow.expires_at <= now) {
      await this.revokeSession(rawToken);
      return null;
    }
    return this.loadUserStateById(sessionRow.user_id);
  }

  async revokeSession(rawToken: string | null): Promise<void> {
    if (!rawToken) return;
    await this.ensureInitialized();
    const tokenHash = hashSessionToken(rawToken);
    if (this.engine === 'neon' && this.neonPool) {
      await this.neonPool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
    } else if (this.sqlite) {
      this.sqlite.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    }
  }

  async loadUserStateById(userId: string): Promise<PersistedPlayerState | null> {
    await this.ensureInitialized();

    type JoinedRow = {
      id: string;
      username: string;
      display_name: string;
      email: string;
      role: string;
      suite_number: string;
      floor: number;
      created_at: string;
      last_login_at: string | null;
      avatar_json: string;
      room_name: string;
      access_mode: string;
      surfaces_json: string;
      mood: string;
      items_json: string;
      room_updated_at: string;
      yuanzi: number;
      tongbao: number;
      wallet_updated_at: string;
    };

    let row: JoinedRow | undefined;
    const sqlQuery = `
      SELECT
        u.id, u.username, u.display_name, u.email, u.role, u.suite_number, u.floor, u.created_at, u.last_login_at,
        c.avatar_json,
        r.room_name, r.access_mode, r.surfaces_json, r.mood, r.items_json, r.updated_at AS room_updated_at,
        w.yuanzi, w.tongbao, w.updated_at AS wallet_updated_at
      FROM users u
      JOIN characters c ON c.user_id = u.id
      JOIN personal_rooms r ON r.owner_id = u.id
      JOIN wallets w ON w.user_id = u.id
    `;

    if (this.engine === 'neon' && this.neonPool) {
      const res = await this.neonPool.query<JoinedRow>(`${sqlQuery} WHERE u.id = $1 LIMIT 1`, [userId]);
      row = res.rows[0];
    } else if (this.sqlite) {
      row = this.sqlite.prepare(`${sqlQuery} WHERE u.id = ? LIMIT 1`).get(userId) as
        | JoinedRow
        | undefined;
    }

    if (!row) return null;

    const account: AccountProfile = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      role: (row.role === 'admin' || row.role === 'moderator' ? row.role : 'player') as UserRole,
      suiteNumber: row.suite_number,
      floor: Number(row.floor),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };

    return {
      account,
      wallet: {
        yuanzi: Number(row.yuanzi),
        tongbao: Number(row.tongbao),
        updatedAt: row.wallet_updated_at,
      },
      avatar: sanitizeAvatarConfig(JSON.parse(row.avatar_json), row.display_name),
      roomName: sanitizeRoomName(row.room_name),
      accessMode: sanitizeAccessMode(row.access_mode),
      surfaces: sanitizeSurfaces(JSON.parse(row.surfaces_json)),
      mood: sanitizeMood(row.mood),
      items: sanitizePlacedItems(JSON.parse(row.items_json)),
      updatedAt: row.room_updated_at,
    };
  }

  async updatePlayerState(userId: string, patch: UpdateStateInput): Promise<PersistedPlayerState> {
    const current = await this.loadUserStateById(userId);
    if (!current) {
      throw new AuthError(404, 'Account not found.');
    }

    const displayName =
      patch.displayName !== undefined
        ? validateDisplayName(patch.displayName, current.account.displayName)
        : current.account.displayName;
    const avatar =
      patch.avatar !== undefined
        ? sanitizeAvatarConfig(patch.avatar, displayName)
        : current.avatar;
    const roomName =
      patch.roomName !== undefined ? sanitizeRoomName(patch.roomName) : current.roomName;
    const accessMode =
      patch.accessMode !== undefined ? sanitizeAccessMode(patch.accessMode) : current.accessMode;
    const surfaces =
      patch.surfaces !== undefined ? sanitizeSurfaces(patch.surfaces) : current.surfaces;
    const mood = patch.mood !== undefined ? sanitizeMood(patch.mood) : current.mood;
    const items = patch.items !== undefined ? sanitizePlacedItems(patch.items) : current.items;
    const now = new Date().toISOString();

    if (this.engine === 'neon' && this.neonPool) {
      const client = await this.neonPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE users SET display_name = $1 WHERE id = $2`, [displayName, userId]);
        await client.query(
          `UPDATE characters SET avatar_json = $1, updated_at = $2 WHERE user_id = $3`,
          [JSON.stringify(avatar), now, userId]
        );
        await client.query(
          `UPDATE personal_rooms
           SET room_name = $1, access_mode = $2, surfaces_json = $3, mood = $4, items_json = $5, updated_at = $6
           WHERE owner_id = $7`,
          [
            roomName,
            accessMode,
            JSON.stringify(surfaces),
            mood,
            JSON.stringify(items),
            now,
            userId,
          ]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } else if (this.sqlite) {
      this.sqlite.exec('BEGIN');
      try {
        this.sqlite
          .prepare(`UPDATE users SET display_name = ? WHERE id = ?`)
          .run(displayName, userId);
        this.sqlite
          .prepare(`UPDATE characters SET avatar_json = ?, updated_at = ? WHERE user_id = ?`)
          .run(JSON.stringify(avatar), now, userId);
        this.sqlite
          .prepare(
            `UPDATE personal_rooms
             SET room_name = ?, access_mode = ?, surfaces_json = ?, mood = ?, items_json = ?, updated_at = ?
             WHERE owner_id = ?`
          )
          .run(
            roomName,
            accessMode,
            JSON.stringify(surfaces),
            mood,
            JSON.stringify(items),
            now,
            userId
          );
        this.sqlite.exec('COMMIT');
      } catch (err) {
        this.sqlite.exec('ROLLBACK');
        throw err;
      }
    }

    return {
      ...current,
      account: {
        ...current.account,
        displayName,
      },
      avatar,
      roomName,
      accessMode,
      surfaces,
      mood,
      items,
      updatedAt: now,
    };
  }
}
