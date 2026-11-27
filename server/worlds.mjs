/**
 * Player-owned spaces: the hotel suite every account gets, plus user-created
 * worlds with owner-controlled access and collaborative editing.
 *
 * Access modes: public | private | invite | friends | collab.
 * Visitors never receive edit rights implicitly.
 */
import { db, newId, now, tx, audit } from './db.mjs';
import { badRequest, conflict, forbidden, notFound } from './errors.mjs';
import {
  WORLD_ACCESS,
  WORLD_KINDS,
  pickOne,
  sanitizeRoomState,
  sanitizeText,
} from './validate.mjs';
import { invitationsAllowed } from './settings.mjs';
import { WORLD_ROLES } from './validate.mjs';
import { DEFAULT_FOUNDATION_ID, FOUNDATION_IDS } from '../shared/world-layout.mjs';
import {
  createWorldLayout,
  initializeWorldLayout,
  isStaffUser,
  worldPermissionsFor,
} from './worldBuild.mjs';

const MAX_WORLDS_PER_OWNER = 20;

function areFriends(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const row = db
    .prepare("SELECT status FROM friendships WHERE a = ? AND b = ? AND status = 'accepted'")
    .get(x, y);
  return Boolean(row);
}

function hasBlocked(ownerId, viewerId) {
  const row = db
    .prepare('SELECT 1 AS hit FROM blocks WHERE user_id = ? AND blocked_id = ?')
    .get(ownerId, viewerId);
  return Boolean(row);
}

function isInvited(worldId, userId) {
  return Boolean(
    db
      .prepare('SELECT 1 AS hit FROM world_invites WHERE world_id = ? AND user_id = ?')
      .get(worldId, userId)
  );
}

export function isCollaborator(worldId, userId) {
  return Boolean(
    db
      .prepare('SELECT 1 AS hit FROM world_collaborators WHERE world_id = ? AND user_id = ?')
      .get(worldId, userId)
  );
}

export function canEditWorld(world, userId) {
  if (!world || !userId) return false;
  if (world.owner_id === userId) return true;
  return isCollaborator(world.id, userId);
}

export function canEnterWorld(world, userId) {
  if (!world) return false;
  if (world.is_official === 1 && !isStaffUser(userId)) return false;
  const status = String(world.status ?? 'offline');
  // Closed-for-editing states never admit visitors; builders may rejoin their
  // own Build Mode session.
  if (status === 'maintenance' || status === 'build_pending') return false;
  if (status === 'build_mode') {
    if (!userId) return false;
    if (world.owner_id === userId) return true;
    const role = db
      .prepare('SELECT role FROM world_collaborators WHERE world_id = ? AND user_id = ?')
      .get(world.id, userId)?.role;
    return role === 'co_owner' || role === 'builder';
  }
  if (!userId) return world.published === 1 && world.access === 'public';
  if (world.owner_id === userId) return true;
  if (hasBlocked(world.owner_id, userId)) return false;
  switch (world.access) {
    case 'public':
      return world.published === 1;
    case 'friends':
      return areFriends(world.owner_id, userId);
    case 'invite':
      return isInvited(world.id, userId);
    case 'collab':
      return isInvited(world.id, userId) || isCollaborator(world.id, userId);
    case 'private':
    default:
      return false;
  }
}

function worldRow(id) {
  return db.prepare('SELECT * FROM worlds WHERE id = ?').get(id);
}

function ownerHandle(ownerId) {
  const row = db.prepare('SELECT handle FROM users WHERE id = ?').get(ownerId);
  return row?.handle ?? 'unknown';
}

function serializeWorld(row, viewerId, { includeState = false } = {}) {
  const permissions = worldPermissionsFor(row, viewerId);
  const role = permissions.role === 'visitor' || permissions.role === 'staff' ? null : permissions.role;
  const base = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    access: row.access,
    published: row.published === 1,
    status: row.status ?? 'offline',
    foundation: row.foundation ?? DEFAULT_FOUNDATION_ID,
    isOfficial: row.is_official === 1,
    ownerId: row.owner_id,
    ownerHandle: ownerHandle(row.owner_id),
    maxVisitors: row.max_visitors,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    role,
    canEdit: canEditWorld(row, viewerId),
    canEnter: canEnterWorld(row, viewerId),
    canBuild: permissions.canBuild,
    canManageStatus: permissions.canManage,
    layoutVersion: row.layout_version ?? 0,
    publishedVersion: row.published_version ?? 0,
  };
  if (includeState) {
    base.items = JSON.parse(row.items_json);
    base.surfaces = JSON.parse(row.surfaces_json);
    base.mood = row.mood;
    base.collaborators = db
      .prepare(
        `SELECT c.user_id, u.handle FROM world_collaborators c
         JOIN users u ON u.id = c.user_id WHERE c.world_id = ?`
      )
      .all(row.id)
      .map((r) => ({ userId: r.user_id, handle: r.handle }));
  }
  return base;
}

export function createWorld(userId, body = {}) {
  const name = sanitizeText(body.name, { max: 48, field: 'name' });
  const kind = pickOne(body.kind ?? 'hangout', WORLD_KINDS, 'kind');
  const access = pickOne(body.access ?? 'private', WORLD_ACCESS, 'access');
  const description = typeof body.description === 'string'
    ? body.description.slice(0, 280)
    : '';

  const foundation = body.foundation === undefined ? DEFAULT_FOUNDATION_ID : String(body.foundation);
  if (!FOUNDATION_IDS.includes(foundation)) {
    throw badRequest(`foundation must be one of: ${FOUNDATION_IDS.join(', ')}`);
  }
  const layout = createWorldLayout(foundation);

  return tx(() => {
    const count = db
      .prepare('SELECT COUNT(*) AS n FROM worlds WHERE owner_id = ?')
      .get(userId).n;
    if (count >= MAX_WORLDS_PER_OWNER) {
      throw badRequest(`Each account may own at most ${MAX_WORLDS_PER_OWNER} worlds`);
    }
    const id = newId('wld');
    const timestamp = now();
    db.prepare(
      `INSERT INTO worlds (id, owner_id, name, kind, description, access, published,
        items_json, surfaces_json, mood, max_visitors, status, foundation, layout_json,
        settings_json, layout_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, '[]', ?, 'morning', 30, 'offline', ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      userId,
      name,
      kind,
      description,
      access,
      JSON.stringify({ floor: 'oak_parquet', wall: 'warm_chalk' }),
      foundation,
      JSON.stringify(layout),
      JSON.stringify(layout.settings),
      timestamp,
      timestamp
    );
    initializeWorldLayout(id, foundation, userId);
    audit(userId, 'world.create', id);
    return serializeWorld(worldRow(id), userId, { includeState: true });
  });
}

export function listWorlds(viewerId, { mine = false, search = '', kind = '' } = {}) {
  let rows;
  if (mine) {
    rows = db
      .prepare('SELECT * FROM worlds WHERE owner_id = ? ORDER BY updated_at DESC')
      .all(viewerId);
  } else {
    const like = `%${String(search).slice(0, 60)}%`;
    rows = db
      .prepare(
        `SELECT * FROM worlds
         WHERE published = 1 AND access = 'public' AND name LIKE ?
         ORDER BY updated_at DESC LIMIT 100`
      )
      .all(like);
  }
  return rows
    .filter((row) => (kind ? row.kind === kind : true))
    .filter((row) => !viewerId || !hasBlocked(row.owner_id, viewerId))
    .map((row) => serializeWorld(row, viewerId));
}

/** Worlds a signed-in player can actually enter, for travel destinations. */
export function travelWorlds(viewerId) {
  if (!viewerId) return [];
  const rows = db
    .prepare(
      `SELECT * FROM worlds
       WHERE owner_id = ? OR published = 1
       ORDER BY updated_at DESC LIMIT 60`
    )
    .all(viewerId);
  return rows
    .filter((row) => canEnterWorld(row, viewerId))
    .map((row) => serializeWorld(row, viewerId));
}

export function getWorld(userId, worldId) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  const canEnter = canEnterWorld(row, userId);
  return serializeWorld(row, userId, { includeState: canEnter });
}

export function updateWorld(userId, worldId, body = {}) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  if (!canEditWorld(row, userId)) throw forbidden('Only the owner can change this world');

  const patch = { ...body };
  const next = {
    name: patch.name !== undefined ? sanitizeText(patch.name, { max: 48, field: 'name' }) : row.name,
    kind: patch.kind !== undefined ? pickOne(patch.kind, WORLD_KINDS, 'kind') : row.kind,
    access:
      patch.access !== undefined ? pickOne(patch.access, WORLD_ACCESS, 'access') : row.access,
    description:
      patch.description !== undefined
        ? String(patch.description).slice(0, 280)
        : row.description,
    published: row.published,
    maxVisitors:
      patch.maxVisitors !== undefined
        ? Math.min(60, Math.max(2, Number(patch.maxVisitors) || row.max_visitors))
        : row.max_visitors,
  };

  // Only the owner may publish; publishing a world makes it discoverable when
  // access is 'public'.
  if (patch.published !== undefined) {
    if (row.owner_id !== userId) throw forbidden('Only the owner can publish a world');
    next.published = patch.published ? 1 : 0;
  }

  db.prepare(
    `UPDATE worlds SET name = ?, kind = ?, access = ?, description = ?, published = ?,
       max_visitors = ?, updated_at = ? WHERE id = ?`
  ).run(
    next.name,
    next.kind,
    next.access,
    next.description,
    next.published,
    next.maxVisitors,
    now(),
    worldId
  );
  audit(userId, 'world.update', worldId);
  return serializeWorld(worldRow(worldId), userId, { includeState: true });
}

export function saveWorldState(userId, worldId, body) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  if (!canEditWorld(row, userId)) {
    throw forbidden('You do not have build permission for this world');
  }
  const state = sanitizeRoomState(body);
  db.prepare(
    `UPDATE worlds SET items_json = ?, surfaces_json = ?, mood = ?, updated_at = ? WHERE id = ?`
  ).run(JSON.stringify(state.items), JSON.stringify(state.surfaces), state.mood, now(), worldId);
  return { id: worldId, ...state, updatedAt: now() };
}

/* --------------------------- management states --------------------------- */

/** Owner/co-owner only. A live world cannot be closed while players remain. */
export function setWorldStatus(userId, worldId, status, { activeCount = 0, viewerPresent = false } = {}) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  const permissions = worldPermissionsFor(row, userId);
  if (!permissions.canManage) {
    throw forbidden('Only the owner or co-owner can change this world status');
  }
  const next = pickOne(status, ['live', 'available', 'offline'], 'status');
  const current = String(row.status ?? 'offline');
  if (next === 'live' && !viewerPresent) {
    throw conflict('Enter your city before making it Live');
  }
  if (current === 'live' && next !== 'live' && activeCount > 0) {
    throw conflict('Nobody can shut down a live world while players are still inside');
  }
  if (current === 'build_mode' || current === 'build_pending') {
    throw conflict('Publish or leave Build Mode before changing this city status');
  }
  db.prepare(
    'UPDATE worlds SET status = ?, published = ?, updated_at = ? WHERE id = ?'
  ).run(next, next === 'live' ? 1 : 0, now(), worldId);
  audit(userId, 'world.status', `${worldId}:${next}`);
  return { status: next, activeCount, world: serializeWorld(worldRow(worldId), userId, { includeState: true }) };
}

/** Build Mode opens only when the live player count has reached zero. */
export function requestWorldBuildMode(userId, worldId, activeCount = 0) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  const permissions = worldPermissionsFor(row, userId);
  if (!permissions.canOpenBuildMode) {
    throw forbidden('Only the owner, co-owner, or an approved builder can open Build Mode');
  }
  const current = String(row.status ?? 'offline');
  if (current !== 'offline') {
    throw conflict('The city must be set Offline before Build Mode can start');
  }
  const next = activeCount === 0 ? 'build_mode' : 'build_pending';
  db.prepare(
    'UPDATE worlds SET status = ?, published = 0, updated_at = ? WHERE id = ?'
  ).run(next, now(), worldId);
  audit(userId, 'world.build_mode', `${worldId}:${next}`);
  return { status: next, activeCount, pending: activeCount > 0 };
}

export function deleteWorld(userId, worldId) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  if (row.owner_id !== userId) throw forbidden('Only the owner can delete this world');
  if (row.is_official === 1) throw forbidden('The official Main City cannot be deleted');
  db.prepare('DELETE FROM worlds WHERE id = ?').run(worldId);
  audit(userId, 'world.delete', worldId);
  return { deleted: true };
}

export function addCollaborator(userId, worldId, handle, role = 'builder') {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  if (row.owner_id !== userId && !isStaffUser(userId)) {
    throw forbidden('Only the owner can assign world roles');
  }
  const nextRole = pickOne(role ?? 'builder', WORLD_ROLES, 'role');
  if (nextRole === 'co_owner' && row.owner_id !== userId) {
    throw forbidden('Only the owner can appoint a co-owner');
  }
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  if (target.id === userId) throw badRequest('You already own this world');
  db.prepare(
    `INSERT INTO world_collaborators (world_id, user_id, role, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(world_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(worldId, target.id, nextRole, now());
  audit(userId, 'world.collaborator.add', `${worldId}:${target.id}:${nextRole}`);
  return serializeWorld(worldRow(worldId), userId, { includeState: true });
}

export function removeCollaborator(userId, worldId, collaboratorId) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  if (row.owner_id !== userId) throw forbidden('Only the owner can remove collaborators');
  db.prepare('DELETE FROM world_collaborators WHERE world_id = ? AND user_id = ?').run(
    worldId,
    collaboratorId
  );
  return serializeWorld(worldRow(worldId), userId, { includeState: true });
}

export function inviteToWorld(userId, worldId, handle) {
  const row = worldRow(worldId);
  if (!row) throw notFound('World not found');
  if (!canEditWorld(row, userId)) throw forbidden('Only the owner can invite players');
  const target = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(String(handle ?? '').toLowerCase());
  if (!target) throw notFound('No player with that handle');
  if (!invitationsAllowed(target.id)) {
    throw forbidden('This player is not accepting world invitations');
  }
  db.prepare(
    `INSERT INTO world_invites (world_id, user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(world_id, user_id) DO NOTHING`
  ).run(worldId, target.id, now());
  return { invited: target.id };
}

/* ------------------------------------------------------------------ */
/* Hotel suite (one per account)                                       */
/* ------------------------------------------------------------------ */

export function getSuite(userId) {
  const own = db.prepare('SELECT * FROM suites WHERE owner_id = ?').get(userId);
  if (!own) throw notFound('Suite not found');
  return serializeSuite(own, own.owner_id === userId);
}

export function getSuiteFor(viewerId, ownerId) {
  const row = db.prepare('SELECT * FROM suites WHERE owner_id = ?').get(ownerId);
  if (!row) throw notFound('Suite not found');
  const allowed =
    row.owner_id === viewerId ||
    row.is_public === 1 ||
    areFriends(viewerId, ownerId) ||
    canEnterSuiteByInvite(row.id, viewerId);
  if (!allowed) throw forbidden('This suite is private');
  return serializeSuite(row, row.owner_id === viewerId);
}

function canEnterSuiteByInvite(suiteId, userId) {
  return Boolean(
    db
      .prepare('SELECT 1 AS hit FROM world_invites WHERE world_id = ? AND user_id = ?')
      .get(suiteId, userId)
  );
}

function serializeSuite(row, isOwner) {
  const profile = db
    .prepare(
      `SELECT p.display_name, p.avatar_json, u.handle FROM profiles p
       JOIN users u ON u.id = p.user_id WHERE p.user_id = ?`
    )
    .get(row.owner_id);
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerHandle: profile?.handle ?? 'unknown',
    ownerName: profile?.display_name ?? 'Resident',
    number: row.number,
    floor: row.floor,
    name: row.name,
    isPublic: row.is_public === 1,
    isOwner,
    items: JSON.parse(row.items_json),
    surfaces: JSON.parse(row.surfaces_json),
    mood: row.mood,
    updatedAt: row.updated_at,
  };
}

export function saveSuite(userId, body) {
  const row = db.prepare('SELECT * FROM suites WHERE owner_id = ?').get(userId);
  if (!row) throw notFound('Suite not found');
  const state = sanitizeRoomState(body);
  const name = body.name !== undefined ? sanitizeText(body.name, { max: 48, field: 'name' }) : row.name;
  db.prepare(
    `UPDATE suites SET name = ?, items_json = ?, surfaces_json = ?, mood = ?, updated_at = ?
     WHERE owner_id = ?`
  ).run(
    name,
    JSON.stringify(state.items),
    JSON.stringify(state.surfaces),
    state.mood,
    now(),
    userId
  );
  return {
    name,
    ...state,
    updatedAt: now(),
    visibility: row.is_public ? 'public' : 'private',
  };
}

export function setSuiteVisibility(userId, isPublic) {
  db.prepare('UPDATE suites SET is_public = ?, updated_at = ? WHERE owner_id = ?').run(
    isPublic ? 1 : 0,
    now(),
    userId
  );
  return getSuite(userId);
}
