/**
 * Profiles, friendships, blocking, persisted chat and moderation reports.
 */
import { db, newId, now, tx, audit } from './db.mjs';
import { badRequest, conflict, forbidden, notFound } from './errors.mjs';
import { DEFAULT_OWNED_CLOTHING, ownsItem, getWallet, applyLedger } from './economy.mjs';
import { sanitizeAvatar, sanitizeOutfit, sanitizeText, pickOne } from './validate.mjs';
import { CHARACTER_MAKEOVER, foundationalChanges } from '../shared/character.mjs';
import { normalizeVoicePreferences } from '../shared/voice-controls.mjs';
import { friendRequestsAllowed } from './settings.mjs';

export const CHAT_SCOPES = ['city', 'world', 'dm', 'party'];
const MAX_MESSAGE = 240;

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

export function areFriends(a, b) {
  const [x, y] = pair(a, b);
  return Boolean(
    db
      .prepare("SELECT 1 AS hit FROM friendships WHERE a = ? AND b = ? AND status = 'accepted'")
      .get(x, y)
  );
}

const parseJsonObject = (value) => {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export function readProfile(userId) {
  const row = db
    .prepare(
      `SELECT p.user_id, p.display_name, p.avatar_json, p.bio, p.voice_json, p.updated_at,
              u.handle, u.created_at, u.role
       FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?`
    )
    .get(userId);
  if (!row) throw notFound('Profile not found');
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    avatar: JSON.parse(row.avatar_json),
    bio: row.bio,
    voice: normalizeVoicePreferences(parseJsonObject(row.voice_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A player may only wear clothes the account actually owns. */
function assertWardrobeOwned(userId, avatar) {
  const checked = [
    ['top', avatar.topStyle],
    ['bottom', avatar.bottomStyle ?? 'jeans'],
    ['accessory', avatar.accessory],
    ['jewelry', avatar.jewelry ?? 'none'],
    ['bag', avatar.carry ?? 'none'],
  ];
  for (const [kind, id] of checked) {
    if (id === 'none') continue;
    if (!DEFAULT_OWNED_CLOTHING.includes(id) && !ownsItem(userId, 'clothing', id)) {
      throw forbidden(`You do not own the "${id}" ${kind} — buy it in the Wardrobe shop`);
    }
  }
}

export function updateProfile(userId, body = {}) {
  const current = readProfile(userId);
  const avatar = body.avatar ? sanitizeAvatar(body.avatar, current.displayName) : current.avatar;
  assertWardrobeOwned(userId, avatar);

  // Free edits are hair, makeup and owned clothing. A foundational change has
  // to go through applyMakeover() so it is paid and idempotent.
  const foundation = foundationalChanges(current.avatar, avatar);
  if (foundation.length > 0) {
    throw forbidden(
      `Foundational features (${foundation.join(', ')}) require the paid Character Makeover.`
    );
  }

  const displayName =
    body.displayName !== undefined
      ? sanitizeText(body.displayName, { max: 32, field: 'displayName' })
      : current.displayName;
  const bio =
    body.bio !== undefined ? String(body.bio).replace(/[\u0000-\u001f]/g, '').slice(0, 280) : current.bio;
  // Voice preferences sync with the account, but only when the client sends
  // them: an outfit save must never reset the microphone mode.
  const voice =
    body.voice === undefined ? current.voice : normalizeVoicePreferences(body.voice);

  db.prepare(
    'UPDATE profiles SET display_name = ?, avatar_json = ?, bio = ?, voice_json = ?, updated_at = ? WHERE user_id = ?'
  ).run(displayName, JSON.stringify(avatar), bio, JSON.stringify(voice), now(), userId);
  return readProfile(userId);
}

/**
 * Paid foundation change. Hair and makeup never reach this path; only the paid
 * fields are rewritten here. The ledger idempotency key means a retried request
 * cannot charge twice.
 */
export function applyMakeover(userId, body = {}) {
  const current = readProfile(userId);
  if (!body.avatar || typeof body.avatar !== 'object') {
    throw badRequest('avatar is required');
  }
  const next = sanitizeAvatar(body.avatar, current.displayName);
  assertWardrobeOwned(userId, next);
  const changed = foundationalChanges(current.avatar, next);
  if (changed.length === 0) {
    return { profile: current, wallet: getWallet(userId), charged: 0, duplicate: false, changed };
  }
  const idempotencyKey = String(body.idempotencyKey ?? '');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    throw badRequest('A valid idempotencyKey is required for a makeover');
  }

  return tx(() => {
    // Idempotency keys are account-scoped in intent. Never let a key replayed
    // from another account turn into a free makeover.
    const prior = db
      .prepare('SELECT user_id FROM ledger WHERE idempotency_key = ?')
      .get(idempotencyKey);
    if (prior && prior.user_id !== userId) {
      throw conflict('That idempotency key has already been used');
    }
    const { duplicate } = applyLedger({
      userId,
      currency: CHARACTER_MAKEOVER.currency,
      delta: -CHARACTER_MAKEOVER.price,
      reason: 'character_makeover',
      ref: changed.join(','),
      idempotencyKey,
    });
    db.prepare(
      'UPDATE profiles SET avatar_json = ?, updated_at = ? WHERE user_id = ?'
    ).run(JSON.stringify(next), now(), userId);
    if (!duplicate) audit(userId, 'character.makeover', changed.join(','));
    return {
      profile: readProfile(userId),
      wallet: getWallet(userId),
      charged: duplicate ? 0 : CHARACTER_MAKEOVER.price,
      duplicate,
      changed,
    };
  });
}

/* -------------------------------- outfits -------------------------------- */

const outfitView = (row) => ({
  id: row.id,
  name: row.name,
  config: JSON.parse(row.config_json),
  createdAt: row.created_at,
});

export function listOutfits(userId) {
  return db
    .prepare('SELECT id, name, config_json, created_at FROM outfits WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map(outfitView);
}

/** Save an unlimited named outfit containing only owned wardrobe pieces. */
export function saveOutfit(userId, body = {}) {
  const name = sanitizeText(body.name, { max: 32, field: 'name' }) || 'My Outfit';
  const config = sanitizeOutfit(body.config ?? {});
  assertWardrobeOwned(userId, config);
  const id = newId('outfit');
  const createdAt = now();
  db.prepare(
    'INSERT INTO outfits (id, user_id, name, config_json, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, name, JSON.stringify(config), createdAt);
  audit(userId, 'character.outfit.save', name);
  return { id, name, config, createdAt };
}

export function deleteOutfit(userId, id) {
  const result = db
    .prepare('DELETE FROM outfits WHERE id = ? AND user_id = ?')
    .run(String(id ?? ''), userId);
  if (result.changes === 0) throw notFound('Outfit not found');
  audit(userId, 'character.outfit.delete', String(id));
  return { deleted: true, id: String(id) };
}

export function searchPlayers(viewerId, query) {
  const q = String(query ?? '').trim().toLowerCase().slice(0, 32);
  if (q.length < 1) return [];
  return db
    .prepare(
      `SELECT u.id, u.handle, p.display_name
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE (u.handle LIKE ? OR LOWER(p.display_name) LIKE ?)
         AND u.id != ?
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = ? AND b.blocked_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = u.id AND b.blocked_id = ?)
       LIMIT 20`
    )
    .all(`%${q}%`, `%${q}%`, viewerId, viewerId, viewerId)
    .map((row) => ({ userId: row.id, handle: row.handle, displayName: row.display_name ?? row.handle }));
}

export function sendFriendRequest(userId, handle) {
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  if (target.id === userId) throw badRequest('You cannot add yourself');
  if (
    db.prepare('SELECT 1 AS hit FROM blocks WHERE user_id = ? AND blocked_id = ?').get(target.id, userId)
  ) {
    throw forbidden('This player is not accepting requests');
  }
  const [a, b] = pair(userId, target.id);
  const existing = db.prepare('SELECT * FROM friendships WHERE a = ? AND b = ?').get(a, b);
  if (existing) {
    if (existing.status === 'accepted') throw conflict('You are already friends');
    if (existing.requested_by === userId) throw conflict('Request already sent');
    db.prepare("UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?").run(a, b);
    return { status: 'accepted' };
  }
  if (!friendRequestsAllowed(target.id)) {
    throw forbidden('This player is not accepting friend requests');
  }
  db.prepare(
    "INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, 'pending', ?, ?)"
  ).run(a, b, userId, now());
  audit(userId, 'friend.request', target.id);
  return { status: 'pending' };
}

export function acceptFriend(userId, otherId) {
  const [a, b] = pair(userId, otherId);
  const row = db.prepare('SELECT * FROM friendships WHERE a = ? AND b = ?').get(a, b);
  if (!row) throw notFound('No friend request');
  if (row.status === 'accepted') return { status: 'accepted' };
  if (row.requested_by === userId) throw forbidden('This request is yours to be accepted by them');
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?").run(a, b);
  return { status: 'accepted' };
}

export function removeFriend(userId, otherId) {
  const [a, b] = pair(userId, otherId);
  db.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').run(a, b);
  return { removed: true };
}

export function listFriends(userId) {
  const rows = db
    .prepare(
      `SELECT f.a, f.b, f.status, f.requested_by, p.display_name, u.handle, u.id
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE f.a = ? OR f.b = ?`
    )
    .all(userId, userId, userId);

  return rows.map((row) => {
    const otherId = row.a === userId ? row.b : row.a;
    return {
      userId: otherId,
      handle: row.handle,
      displayName: row.display_name ?? row.handle,
      status: row.status,
      direction: row.requested_by === userId ? 'outgoing' : 'incoming',
    };
  });
}

export function blockPlayer(userId, handle) {
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  if (target.id === userId) throw badRequest('You cannot block yourself');
  db.prepare(
    'INSERT INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
  ).run(userId, target.id, now());
  removeFriend(userId, target.id);
  audit(userId, 'player.block', target.id);
  return { blocked: target.id };
}

export function unblockPlayer(userId, handle) {
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(userId, target.id);
  return { unblocked: target.id };
}

export function listBlocked(userId) {
  return db
    .prepare(
      `SELECT b.blocked_id, u.handle FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.user_id = ?`
    )
    .all(userId)
    .map((row) => ({ userId: row.blocked_id, handle: row.handle }));
}

export function isBlockedBetween(a, b) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 AS hit FROM blocks
         WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)`
      )
      .get(a, b, b, a)
  );
}

/* ---------------------------------- chat --------------------------------- */

export function dmScopeId(a, b) {
  const [x, y] = pair(a, b);
  return `${x}|${y}`;
}

export function recordMessage({ scope, scopeId, userId, body }) {
  const clean = sanitizeText(body, { max: MAX_MESSAGE, field: 'message' });
  const id = newId('msg');
  const at = now();
  db.prepare(
    'INSERT INTO chat_messages (id, scope, scope_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, scope, scopeId, userId, clean, at);
  return { id, scope, scopeId, userId, body: clean, createdAt: at };
}

/** DM inbox: latest message per partner, with unread counts and partner avatars. */
export function listConversations(viewerId, limit = 50) {
  const rows = db
    .prepare(
      `SELECT m.scope_id, m.body, m.created_at, m.user_id
       FROM chat_messages m
       WHERE m.scope = 'dm' AND (m.scope_id LIKE ? OR m.scope_id LIKE ?)
       ORDER BY m.created_at DESC LIMIT 500`
    )
    .all(`${viewerId}|%`, `%|${viewerId}`);

  const latest = new Map();
  for (const row of rows) {
    if (!latest.has(row.scope_id)) latest.set(row.scope_id, row);
  }

  const reads = new Map(
    db
      .prepare('SELECT peer_id, last_read_at FROM dm_reads WHERE user_id = ?')
      .all(viewerId)
      .map((row) => [row.peer_id, row.last_read_at])
  );

  const conversations = [];
  for (const [scopeId, last] of latest) {
    const [a, b] = scopeId.split('|');
    const peerId = a === viewerId ? b : a;
    if (!peerId || peerId === viewerId) continue;
    if (isBlockedBetween(viewerId, peerId)) continue;
    const partner = db
      .prepare(
        `SELECT u.handle, p.display_name, p.avatar_json
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`
      )
      .get(peerId);
    if (!partner) continue;
    let avatar = null;
    try {
      avatar = partner.avatar_json ? JSON.parse(partner.avatar_json) : null;
    } catch {
      avatar = null;
    }
    const lastRead = reads.get(peerId) ?? 0;
    const unread = db
      .prepare(
        "SELECT COUNT(*) AS n FROM chat_messages WHERE scope = 'dm' AND scope_id = ? AND user_id = ? AND created_at > ?"
      )
      .get(scopeId, peerId, lastRead).n;
    conversations.push({
      userId: peerId,
      handle: partner.handle,
      displayName: partner.display_name ?? partner.handle,
      avatar,
      unread,
      lastMessage: {
        body: last.body,
        createdAt: last.created_at,
        fromMe: last.user_id === viewerId,
      },
    });
  }

  return conversations
    .sort((left, right) => right.lastMessage.createdAt - left.lastMessage.createdAt)
    .slice(0, Math.min(100, Math.max(1, Number(limit) || 50)));
}

/** Mark a DM conversation read up to now; earlier messages stay unread-free. */
export function markConversationRead(viewerId, handle) {
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  if (isBlockedBetween(viewerId, target.id)) throw forbidden('This conversation is unavailable');
  db.prepare(
    `INSERT INTO dm_reads (user_id, peer_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, peer_id) DO UPDATE SET last_read_at = excluded.last_read_at`
  ).run(viewerId, target.id, now());
  return { ok: true, handle: String(handle).toLowerCase() };
}

export function chatHistory({ scope, scopeId, viewerId, limit = 50 }) {
  if (!CHAT_SCOPES.includes(scope)) throw badRequest('Unknown chat scope');
  if (scope === 'dm') {
    const [a, b] = scopeId.split('|');
    if (viewerId !== a && viewerId !== b) throw forbidden('Not your conversation');
  }
  if (scope === 'party') throw badRequest('Parties are not implemented yet');
  return db
    .prepare(
      `SELECT m.id, m.body, m.created_at, m.user_id, u.handle, p.display_name
       FROM chat_messages m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN profiles p ON p.user_id = m.user_id
       WHERE m.scope = ? AND m.scope_id = ?
       ORDER BY m.created_at DESC LIMIT ?`
    )
    .all(scope, scopeId, Math.min(100, Math.max(1, Number(limit) || 50)))
    .reverse()
    .map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      from: {
        userId: row.user_id,
        handle: row.handle,
        displayName: row.display_name ?? row.handle,
      },
    }));
}

/* ------------------------------- moderation ------------------------------ */

export function fileReport(userId, body = {}) {
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(body.handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  if (target.id === userId) throw badRequest('You cannot report yourself');
  const reason = pickOne(body.reason, ['harassment', 'spam', 'inappropriate', 'impersonation', 'other'], 'reason');
  const details = String(body.details ?? '').slice(0, 1000);
  const id = newId('rep');
  db.prepare(
    `INSERT INTO reports (id, reporter_id, target_user_id, reason, details, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`
  ).run(id, userId, target.id, reason, details, now());
  audit(userId, 'moderation.report', `${target.id}:${reason}`);
  return { id, status: 'open' };
}

export function listOpenReports() {
  return db
    .prepare(
      `SELECT r.id, r.reason, r.details, r.created_at,
              ru.handle AS reporter, tu.handle AS target
       FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       JOIN users tu ON tu.id = r.target_user_id
       WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 100`
    )
    .all();
}

export function suspendAccount(actorId, handle, hours) {
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  const until = hours > 0 ? now() + hours * 3600_000 : 0;
  db.prepare('UPDATE users SET suspended_until = ? WHERE id = ?').run(until, target.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
  audit(actorId, 'moderation.suspend', `${target.id}:${hours}h`);
  return { userId: target.id, suspendedUntil: until };
}
