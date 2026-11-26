/**
 * Dev-server guest sessions.
 *
 * Mirrors the Worker's `/api/guest/session` contract: a 12-hour opaque token
 * that can only enter TheCity. Kept separate from auth.mjs so registered
 * account sessions and token handling stay untouched.
 */
import crypto from 'node:crypto';
import { db, newId, now } from './db.mjs';
import { badRequest, unauthorized } from './errors.mjs';

const GUEST_TTL_MS = 12 * 60 * 60 * 1000;
const DISPLAY_NAME_MAX = 32;

db.exec(`
CREATE TABLE IF NOT EXISTS guest_sessions (
  token_hash   TEXT PRIMARY KEY,
  guest_id     TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_sessions_expiry ON guest_sessions(expires_at);
`);

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function cleanDisplayName(value) {
  const raw = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
    : '';
  if (raw.length < 2 || raw.length > DISPLAY_NAME_MAX) {
    throw badRequest(`Choose a display name between 2 and ${DISPLAY_NAME_MAX} characters.`);
  }
  return raw;
}

export function createGuestSession(displayName) {
  const name = cleanDisplayName(displayName);
  const token = crypto.randomBytes(32).toString('base64url');
  const guestId = newId('gst');
  const createdAt = now();
  const expiresAt = createdAt + GUEST_TTL_MS;

  // Opportunistic cleanup keeps the dev database from accumulating dead rows.
  db.prepare('DELETE FROM guest_sessions WHERE expires_at <= ?').run(createdAt);
  db.prepare(
    'INSERT INTO guest_sessions (token_hash, guest_id, display_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(hashToken(token), guestId, name, createdAt, expiresAt);

  return {
    guest: { id: guestId, displayName: name },
    token,
    expiresAt,
  };
}

export function guestForToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      'SELECT guest_id, display_name, expires_at FROM guest_sessions WHERE token_hash = ?'
    )
    .get(hashToken(token));
  if (!row) return null;
  if (row.expires_at <= now()) {
    revokeGuestSession(token);
    return null;
  }
  return {
    id: row.guest_id,
    displayName: row.display_name,
    isGuest: true,
  };
}

export function revokeGuestSession(token) {
  const result = db.prepare('DELETE FROM guest_sessions WHERE token_hash = ?').run(hashToken(token));
  if (result.changes === 0) throw unauthorized('Guest session is invalid or expired.');
}
