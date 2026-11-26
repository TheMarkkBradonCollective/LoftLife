/**
 * Account-scoped platform preferences.
 *
 * Preferences are stored as validated JSON on the account so they follow the
 * player between devices. The privacy subset is also read by the social,
 * realtime and world services to enforce the choices server-side.
 */
import { db, now } from './db.mjs';
import { badRequest } from './errors.mjs';
import { sanitizeSettings } from '../shared/settings-core.mjs';

const MAX_BYTES = 24_000;

const DEFAULT = sanitizeSettings(null);

export function readSettings(userId) {
  const row = db.prepare('SELECT data_json FROM account_settings WHERE user_id = ?').get(userId);
  if (!row) return DEFAULT;
  try {
    return sanitizeSettings(JSON.parse(row.data_json));
  } catch {
    return DEFAULT;
  }
}

export function writeSettings(userId, body = {}) {
  const source =
    body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'settings')
      ? body.settings
      : body;
  const clean = sanitizeSettings(source);
  if (JSON.stringify(clean).length > MAX_BYTES) throw badRequest('Settings are too large');
  db.prepare(
    `INSERT INTO account_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).run(userId, JSON.stringify(clean), now());
  return clean;
}

function areFriends(a, b) {
  if (!a || !b) return false;
  const [x, y] = a < b ? [a, b] : [b, a];
  return Boolean(
    db.prepare("SELECT 1 AS hit FROM friendships WHERE a = ? AND b = ? AND status = 'accepted'").get(x, y)
  );
}

/** Only account settings decide this; the caller still checks existing friendships. */
export function friendRequestsAllowed(targetId) {
  return readSettings(targetId).privacy.friendRequests === 'everyone';
}

/** Anyone may message unless the recipient restricted DMs to friends. */
export function dmAllowed(senderId, targetId) {
  const privacy = readSettings(targetId).privacy;
  if (privacy.messages === 'everyone') return true;
  return areFriends(senderId, targetId);
}

export function invitationsAllowed(targetId) {
  return readSettings(targetId).privacy.invitations === 'everyone';
}

export function canViewProfile(viewerId, targetId) {
  if (viewerId && viewerId === targetId) return true;
  const visibility = readSettings(targetId).privacy.profileVisibility;
  if (visibility === 'public') return true;
  if (visibility === 'friends') return areFriends(viewerId, targetId);
  return false;
}
