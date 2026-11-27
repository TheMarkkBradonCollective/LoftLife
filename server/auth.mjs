/**
 * Accounts, password storage, sessions and rate limiting.
 *
 * Passwords are hashed with scrypt and a per-user random salt; session tokens
 * are random 256-bit values stored only as SHA-256 digests, so a leaked
 * database does not leak usable credentials or live sessions.
 */
import crypto from 'node:crypto';
import { db, newId, now, audit, tx } from './db.mjs';
import { ApiError, badRequest, conflict, unauthorized, tooMany } from './errors.mjs';
import {
  CLOTHING_SHOP,
  DEFAULT_OWNED_CLOTHING,
  WELCOME_BALANCES,
  ensureBankAccount,
} from './economy.mjs';
import { EDGE_TOKEN_PREFIX, edgeUserForToken } from './edge-auth.mjs';
import { STARTER_SUITE } from './starter.mjs';
import { DEFAULT_AVATAR, sanitizeAvatar } from './validate.mjs';
import { firstFreeRoomNumber } from '../shared/hotel-layout.mjs';

export { DEFAULT_AVATAR };

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = now();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(sha256(token), userId, createdAt, createdAt + SESSION_TTL_MS);
  return { token, expiresAt: createdAt + SESSION_TTL_MS };
}

export function revokeSession(token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function userForToken(token) {
  if (!token) return null;
  // Tokens minted by the Cloudflare edge are verified by signature and linked
  // to a local account on first use; no session row exists for them locally.
  if (String(token).startsWith(EDGE_TOKEN_PREFIX)) {
    const edgeUser = edgeUserForToken(String(token));
    if (!edgeUser) throw unauthorized('Session expired or invalid');
    if (edgeUser.suspended_until && edgeUser.suspended_until > now()) {
      throw new ApiError(403, 'suspended', 'This account is suspended');
    }
    return edgeUser;
  }
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(sha256(token));
  if (!row) return null;
  if (row.expires_at < now()) {
    revokeSession(token);
    return null;
  }
  if (row.suspended_until && row.suspended_until > now()) {
    throw new ApiError(403, 'suspended', 'This account is suspended');
  }
  return row;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    handle: user.handle,
    role: user.role,
    createdAt: user.created_at,
  };
}

function assertCredentials({ handle, email, password }) {
  if (!HANDLE_RE.test(String(handle ?? ''))) {
    throw badRequest('Handle must be 3–20 characters: lowercase letters, numbers or underscore');
  }
  if (!EMAIL_RE.test(String(email ?? ''))) throw badRequest('Enter a valid email address');
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
    throw badRequest('Password must be at least 10 characters');
  }
}

/** Register an account plus its profile, wallet, welcome grant and hotel suite. */
export function registerUser({ handle, email, password, displayName, avatar }) {
  assertCredentials({ handle, email, password });
  const cleanHandle = String(handle).toLowerCase();
  const cleanEmail = String(email).toLowerCase();
  const name = String(displayName || handle).trim().slice(0, 32) || cleanHandle;

  const userId = newId('usr');
  const createdAt = now();
  // Sanitize once so stored avatars can never contain arbitrary client data.
  const safeAvatar = sanitizeAvatar(
    { ...DEFAULT_AVATAR, ...(avatar ?? {}), name },
    name
  );
  const avatarJson = JSON.stringify(safeAvatar);

  const result = tx(() => {
    // Bootstrap: the very first account on a fresh deployment administers it.
    const isFirstAccount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
    const existing = db
      .prepare('SELECT handle, email FROM users WHERE handle = ? OR email = ?')
      .get(cleanHandle, cleanEmail);
    if (existing) {
      throw conflict(
        existing.handle.toLowerCase() === cleanHandle
          ? 'That handle is already taken'
          : 'That email is already registered'
      );
    }

    db.prepare(
      `INSERT INTO users (id, handle, email, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      cleanHandle,
      cleanEmail,
      hashPassword(password),
      isFirstAccount ? 'admin' : 'player',
      createdAt
    );

    db.prepare(
      `INSERT INTO profiles (user_id, display_name, avatar_json, bio, updated_at)
       VALUES (?, ?, ?, '', ?)`
    ).run(userId, name, avatarJson, createdAt);

    db.prepare('INSERT INTO wallets (user_id) VALUES (?)').run(userId);
    ensureBankAccount(userId);

    // Welcome grant goes through the ledger like any other balance change.
    // CUBITS and cash are additive starter assets; existing currencies keep
    // their historical welcome amounts and no exchange rate is applied.
    for (const [currency, amount] of Object.entries(WELCOME_BALANCES)) {
      const balance = amount;
      db.prepare(`UPDATE wallets SET ${currency} = ? WHERE user_id = ?`).run(balance, userId);
      db.prepare(
        `INSERT INTO ledger (id, user_id, currency, delta, balance_after, reason, ref, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, 'welcome_grant', NULL, ?, ?)`
      ).run(
        newId('led'),
        userId,
        currency,
        amount,
        balance,
        // The key must be unique per currency as well as per account.
        `welcome:${userId}:${currency}`,
        createdAt
      );
    }

    // Every account gets its own suite from the canonical 65-room hotel.
    // Previously every account was handed Suite 402, which made the doorbell,
    // the hallway plaques and the elevator directory lie about occupancy.
    const usedNumbers = db.prepare('SELECT number FROM suites').all().map((row) => row.number);
    const allocation = firstFreeRoomNumber(usedNumbers);
    db.prepare(
      `INSERT INTO suites (id, owner_id, number, floor, name, items_json, surfaces_json, mood, is_public, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
      newId('ste'),
      userId,
      allocation.number,
      allocation.floor,
      STARTER_SUITE.name,
      JSON.stringify(STARTER_SUITE.items),
      JSON.stringify(STARTER_SUITE.surfaces),
      STARTER_SUITE.mood,
      createdAt
    );

    // Own the free starter wardrobe plus whatever clothing the chosen starting
    // outfit uses, so the account is never rejected by ownership checks.
    const clothingIds = new Set(CLOTHING_SHOP.map((entry) => entry.id));
    const starterPieces = new Set(DEFAULT_OWNED_CLOTHING);
    for (const piece of [
      ...DEFAULT_OWNED_CLOTHING,
      safeAvatar.topStyle,
      safeAvatar.bottomStyle,
      safeAvatar.accessory,
      safeAvatar.jewelry,
      safeAvatar.carry,
    ]) {
      // Free starter pieces are owned even though they are not sold in the shop;
      // every other starting piece must exist in the catalogue.
      if (!starterPieces.has(piece) && !clothingIds.has(piece)) continue;
      db.prepare(
        `INSERT INTO inventory (id, user_id, kind, catalog_id, qty, acquired_at)
         VALUES (?, ?, 'clothing', ?, 1, ?)
         ON CONFLICT(user_id, kind, catalog_id) DO NOTHING`
      ).run(newId('inv'), userId, piece, createdAt);
    }

    audit(userId, 'account.register', cleanHandle);
    return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(userId) };
  });

  const session = createSession(userId);
  return { user: publicUser(result.user), token: session.token, expiresAt: session.expiresAt };
}

export function loginUser({ identifier, password }) {
  const id = String(identifier ?? '').trim().toLowerCase();
  if (!id || typeof password !== 'string' || !password) {
    throw badRequest('Handle/email and password are required');
  }
  const user = db
    .prepare('SELECT * FROM users WHERE handle = ? OR email = ?')
    .get(id, id);
  // Compare against a dummy hash when the user is missing so response timing
  // does not reveal whether an account exists.
  const stored = user?.password_hash ?? hashPassword('invalid-password-placeholder');
  const ok = verifyPassword(password, stored);
  if (!user || !ok) throw unauthorized('Incorrect handle/email or password');
  if (user.suspended_until && user.suspended_until > now()) {
    throw new ApiError(403, 'suspended', 'This account is suspended');
  }
  const session = createSession(user.id);
  audit(user.id, 'account.login');
  return { user: publicUser(user), token: session.token, expiresAt: session.expiresAt };
}

/** Express middleware: attaches req.user, or throws a 401. */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const user = userForToken(token);
  if (!user) return next(unauthorized());
  req.user = user;
  req.token = token;
  next();
}

export function optionalAuth(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  try {
    req.user = userForToken(token) ?? undefined;
  } catch {
    req.user = undefined;
  }
  next();
}

/** Small fixed-window limiter. Good enough for a single-node deployment. */
export function rateLimiter({ windowMs = 60_000, max = 20, key = (req) => req.ip }) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = now() - windowMs;
    for (const [k, entry] of hits) {
      if (entry.resetAt < cutoff) hits.delete(k);
    }
  }, windowMs).unref?.();

  return (req, _res, next) => {
    const k = key(req) ?? 'anon';
    const entry = hits.get(k);
    if (!entry || entry.resetAt < now()) {
      hits.set(k, { count: 1, resetAt: now() + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return next(tooMany());
    next();
  };
}
