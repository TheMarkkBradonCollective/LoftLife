/**
 * Trust for identities issued by the Cloudflare edge.
 *
 * The Worker owns account creation and passwords (stored in Neon) and signs a
 * session token with LOFTLIFE_SESSION_SECRET. This module verifies that token
 * locally with HMAC-SHA256, so the game server never round-trips to Neon on the
 * hot path, and provisions the matching local account on first sight. The
 * account id is the Neon user id, so both sides always refer to the same user.
 */
import crypto from 'node:crypto';
import { audit, db, newId, now, tx } from './db.mjs';
import { DEFAULT_OWNED_CLOTHING } from './economy.mjs';
import { STARTER_SUITE } from './starter.mjs';
import { DEFAULT_AVATAR, sanitizeAvatar } from './validate.mjs';

export const EDGE_TOKEN_PREFIX = 'llt1.';
const MIN_SECRET_LENGTH = 32;
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

function sessionSecret() {
  const secret = process.env.LOFTLIFE_SESSION_SECRET ?? '';
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function edgeAuthConfigured() {
  return sessionSecret() !== null;
}

/** Verify signature, prefix and expiry. Returns the payload or null. */
export function verifyEdgeToken(token, atMs = Date.now()) {
  const secret = sessionSecret();
  if (!secret || typeof token !== 'string' || !token.startsWith(EDGE_TOKEN_PREFIX)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [prefix, body, signature] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${prefix}.${body}`)
    .digest();
  let given;
  try {
    given = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= atMs) return null;
  return payload;
}

function displayNameFor(payload, fallbackHandle) {
  const raw = typeof payload.name === 'string' ? payload.name : '';
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 32);
  return cleaned.length >= 2 ? cleaned : fallbackHandle;
}

function uniqueHandle(preferred) {
  const base = HANDLE_RE.test(preferred) ? preferred : 'resident';
  let candidate = base;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const taken = db.prepare('SELECT 1 FROM users WHERE handle = ?').get(candidate);
    if (!taken) return candidate;
    candidate = `${base.slice(0, 14)}_${crypto.randomBytes(2).toString('hex')}`;
  }
  throw new Error('Could not allocate a handle for the edge account');
}

/**
 * Find the local row for a verified edge identity, creating the account,
 * profile, wallet, starter suite and starting wardrobe the first time.
 * Returns the same shape as a `users` row.
 */
export function ensureEdgeUser(payload) {
  const existing = db
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(payload.sub);
  if (existing) return existing;

  const preferredHandle =
    typeof payload.handle === 'string' ? payload.handle.toLowerCase().slice(0, 20) : 'resident';
  const handle = uniqueHandle(preferredHandle);
  const displayName = displayNameFor(payload, handle);
  const role = payload.role === 'admin' ? 'admin' : 'player';
  const createdAt = now();
  const avatarJson = JSON.stringify(
    sanitizeAvatar({ ...DEFAULT_AVATAR, name: displayName }, displayName)
  );

  tx(() => {
    db.prepare(
      `INSERT INTO users (id, handle, email, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(payload.sub, handle, `${payload.sub}@edge.loftlife.invalid`, '!edge-account', role, createdAt);

    db.prepare(
      `INSERT INTO profiles (user_id, display_name, avatar_json, bio, updated_at)
       VALUES (?, ?, ?, '', ?)`
    ).run(payload.sub, displayName, avatarJson, createdAt);

    db.prepare(
      'INSERT INTO wallets (user_id, yuanzi, tongbao) VALUES (?, 500, 25)'
    ).run(payload.sub);

    for (const [currency, amount] of [
      ['yuanzi', 500],
      ['tongbao', 25],
    ]) {
      db.prepare(
        `INSERT INTO ledger (id, user_id, currency, delta, balance_after, reason, ref, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, 'welcome_grant', NULL, ?, ?)`
      ).run(newId('led'), payload.sub, currency, amount, amount, `welcome:${payload.sub}:${currency}`, createdAt);
    }

    db.prepare(
      `INSERT INTO suites (id, owner_id, number, floor, name, items_json, surfaces_json, mood, is_public, updated_at)
       VALUES (?, ?, '402', 4, ?, ?, ?, ?, 0, ?)`
    ).run(
      newId('ste'),
      payload.sub,
      STARTER_SUITE.name,
      JSON.stringify(STARTER_SUITE.items),
      JSON.stringify(STARTER_SUITE.surfaces),
      STARTER_SUITE.mood,
      createdAt
    );

    for (const piece of DEFAULT_OWNED_CLOTHING) {
      db.prepare(
        `INSERT INTO inventory (id, user_id, kind, catalog_id, qty, acquired_at)
         VALUES (?, ?, 'clothing', ?, 1, ?)
         ON CONFLICT(user_id, kind, catalog_id) DO NOTHING`
      ).run(newId('inv'), payload.sub, piece, createdAt);
    }

    audit(payload.sub, 'account.edge_link', handle);
  });

  return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
}

/** Verify an edge token and return its provisioned local account, or null. */
export function edgeUserForToken(token) {
  const payload = verifyEdgeToken(token);
  if (!payload) return null;
  return ensureEdgeUser(payload);
}
