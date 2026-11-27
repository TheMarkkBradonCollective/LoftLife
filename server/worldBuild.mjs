/**
 * Player-created city building: foundations, plots, approvals, collaboration
 * history and publishing.
 *
 * The layout rules live in shared/world-layout.mjs so the Cloudflare Worker
 * enforces exactly the same permissions as this Node authority. Every write
 * here is server-authoritative: the client sends one operation and receives
 * the resulting layout, revision and plot list.
 */
import { db, newId, now, tx, audit } from './db.mjs';
import { badRequest, conflict, forbidden, notFound } from './errors.mjs';
import {
  DEFAULT_FOUNDATION_ID,
  FOUNDATION_IDS,
  MAX_SNAPSHOTS,
  applyWorldOp,
  emptyLayout,
  foundationById,
  parseLayout,
  worldPermissions,
} from '../shared/world-layout.mjs';

function worldRow(worldId) {
  return db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
}

export function isStaffUser(userId) {
  if (!userId) return false;
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
  return row?.role === 'admin' || row?.role === 'staff';
}

function roleFor(world, userId) {
  if (!userId) return null;
  if (world.owner_id === userId) return 'owner';
  const row = db
    .prepare('SELECT role FROM world_collaborators WHERE world_id = ? AND user_id = ?')
    .get(world.id, userId);
  return row?.role ?? null;
}

export function worldPermissionsFor(world, userId) {
  return worldPermissions({
    role: roleFor(world, userId),
    isOwner: world.owner_id === userId,
    isStaff: isStaffUser(userId),
    status: String(world.status ?? 'offline'),
    isOfficial: world.is_official === 1,
  });
}

export function createWorldLayout(foundationId = DEFAULT_FOUNDATION_ID) {
  if (!FOUNDATION_IDS.includes(foundationId)) {
    throw badRequest(`Unknown foundation. Choose one of: ${FOUNDATION_IDS.join(', ')}`);
  }
  return emptyLayout(foundationId);
}

export function foundationMeta() {
  return FOUNDATION_IDS.map((id) => foundationById(id));
}

function plotRows(worldId) {
  return db
    .prepare('SELECT * FROM world_plots WHERE world_id = ? ORDER BY created_at ASC')
    .all(worldId);
}

function snapshotRows(worldId, limit = MAX_SNAPSHOTS) {
  return db
    .prepare(
      `SELECT s.id, s.revision, s.actor_id, s.action, s.detail, s.created_at, u.handle
       FROM world_snapshots s LEFT JOIN users u ON u.id = s.actor_id
       WHERE s.world_id = ? ORDER BY s.revision DESC LIMIT ?`
    )
    .all(worldId, limit);
}

function layoutValue(world) {
  return parseLayout(world.layout_json, world.foundation);
}

function recordSnapshot(worldId, revision, actorId, action, detail, layout) {
  db.prepare(
    `INSERT INTO world_snapshots (id, world_id, revision, actor_id, action, detail, layout_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId('snp'), worldId, revision, actorId ?? null, action, detail, JSON.stringify(layout), now());
  db.prepare(
    `DELETE FROM world_snapshots WHERE world_id = ? AND revision NOT IN
       (SELECT revision FROM world_snapshots WHERE world_id = ? ORDER BY revision DESC LIMIT ?)`
  ).run(worldId, worldId, MAX_SNAPSHOTS);
}

export function initializeWorldLayout(worldId, foundationId, userId) {
  const layout = createWorldLayout(foundationId);
  const timestamp = now();
  db.prepare(
    `UPDATE worlds SET foundation = ?, layout_json = ?, settings_json = ?, layout_version = 0,
       published_version = 0, status = 'offline', undo_json = '[]', redo_json = '[]' WHERE id = ?`
  ).run(layout.foundation, JSON.stringify(layout), JSON.stringify(layout.settings), worldId);
  recordSnapshot(worldId, 0, userId, 'foundation', `Selected ${layout.foundation}`, layout);
  return layout;
}

export function buildStateFor(viewerId, worldId) {
  const world = worldRow(worldId);
  if (!world) throw notFound('World not found');
  const staff = isStaffUser(viewerId);
  if (world.is_official === 1 && !staff) {
    throw forbidden('The official Main City is developed by LoftLife staff only.');
  }
  const permissions = worldPermissionsFor(world, viewerId);
  if (!permissions.canViewStudio && world.owner_id !== viewerId) {
    throw forbidden('Only the owner, co-owner, or a builder can open this world studio.');
  }
  const layout = layoutValue(world);
  const publishedLayout = parseLayout(world.published_layout_json, world.foundation);
  const undo = JSON.parse(world.undo_json ?? '[]');
  const redo = JSON.parse(world.redo_json ?? '[]');
  return {
    world: {
      id: world.id,
      name: world.name,
      kind: world.kind,
      access: world.access,
      status: world.status,
      published: world.published === 1,
      foundation: world.foundation ?? DEFAULT_FOUNDATION_ID,
      isOfficial: world.is_official === 1,
      ownerId: world.owner_id,
      layoutVersion: world.layout_version ?? 0,
      publishedVersion: world.published_version ?? 0,
      updatedAt: world.updated_at,
    },
    role: permissions.role,
    permissions,
    layout,
    publishedLayout,
    plots: plotRows(worldId).map((row) => ({
      id: row.id,
      name: row.name,
      x: row.x,
      z: row.z,
      w: row.w,
      d: row.d,
      status: row.status,
      requestedBy: row.requested_by,
      assignedTo: row.assigned_to,
    })),
    history: snapshotRows(worldId).map((row) => ({
      id: row.id,
      revision: row.revision,
      action: row.action,
      detail: row.detail,
      actorId: row.actor_id,
      actorHandle: row.handle ?? 'system',
      createdAt: row.created_at,
    })),
    canUndo: undo.length > 0 && permissions.canUndo,
    canRedo: redo.length > 0 && permissions.canUndo,
    activeBuilders: 0,
  };
}

function requireStudio(world, userId) {
  const staff = isStaffUser(userId);
  if (world.is_official === 1 && !staff) {
    throw forbidden('The official Main City is developed by LoftLife staff only.');
  }
  const permissions = worldPermissionsFor(world, userId);
  if (!(world.owner_id === userId || permissions.canViewStudio)) {
    throw forbidden('You do not have build access to this world.');
  }
  return permissions;
}

/** The owner, co-owner or an approved builder applies exactly one operation. */
export function applyBuildOperation(userId, worldId, op) {
  const world = worldRow(worldId);
  if (!world) throw notFound('World not found');
  const permissions = requireStudio(world, userId);
  const status = String(world.status ?? 'offline');
  if (status !== 'build_mode') {
    throw conflict('Structural building is only available in Build Mode.');
  }
  if (!permissions.canBuild && !permissions.canApprovePlots) {
    throw forbidden('Your role cannot change this world.');
  }

  const result = tx(() => {
    const current = worldRow(worldId);
    const layout = layoutValue(current);
    const undo = JSON.parse(current.undo_json ?? '[]');
    let outcome;
    try {
      outcome = applyWorldOp({
        layout,
        plots: plotRows(worldId),
        op,
        permissions,
        userId,
      });
    } catch (error) {
      if (error && error.code) throw badRequest(error.message, { reason: error.code });
      throw error;
    }
    const version = Number(current.layout_version ?? 0) + 1;
    undo.push({ layout, summary: outcome.summary });
    const nextUndo = undo.slice(-MAX_SNAPSHOTS);

    db.prepare(
      `UPDATE worlds SET layout_json = ?, settings_json = ?, layout_version = ?, undo_json = ?,
         redo_json = '[]', updated_at = ? WHERE id = ?`
    ).run(
      JSON.stringify(outcome.layout),
      JSON.stringify(outcome.layout.settings),
      version,
      JSON.stringify(nextUndo),
      now(),
      worldId
    );
    syncPlots(worldId, outcome.plots);
    recordSnapshot(worldId, version, userId, op.action, outcome.summary, outcome.layout);
    audit(userId, `world.build.${op.action}`, worldId);
    return outcome;
  });

  return { state: buildStateFor(userId, worldId), summary: result.summary };
}

function syncPlots(worldId, plots) {
  const existing = new Set(plotRows(worldId).map((row) => row.id));
  const keep = new Set(plots.map((plot) => plot.id));
  for (const plot of plots) {
    if (existing.has(plot.id)) {
      db.prepare(
        `UPDATE world_plots SET name = ?, x = ?, z = ?, w = ?, d = ?, status = ?,
           requested_by = ?, assigned_to = ?, updated_at = ? WHERE id = ? AND world_id = ?`
      ).run(
        plot.name,
        plot.x,
        plot.z,
        plot.w,
        plot.d,
        plot.status,
        plot.requestedBy ?? null,
        plot.assignedTo ?? null,
        now(),
        plot.id,
        worldId
      );
    } else {
      db.prepare(
        `INSERT INTO world_plots (id, world_id, name, x, z, w, d, status, requested_by, assigned_to, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        plot.id,
        worldId,
        plot.name,
        plot.x,
        plot.z,
        plot.w,
        plot.d,
        plot.status,
        plot.requestedBy ?? null,
        plot.assignedTo ?? null,
        now(),
        now()
      );
    }
  }
  for (const id of existing) {
    if (!keep.has(id)) db.prepare('DELETE FROM world_plots WHERE world_id = ? AND id = ?').run(worldId, id);
  }
}

export function undoBuild(userId, worldId) {
  return moveHistory(userId, worldId, 'undo');
}

export function redoBuild(userId, worldId) {
  return moveHistory(userId, worldId, 'redo');
}

function moveHistory(userId, worldId, direction) {
  const world = worldRow(worldId);
  if (!world) throw notFound('World not found');
  const permissions = requireStudio(world, userId);
  if (!permissions.canUndo) throw forbidden('Undo and redo require Build Mode and build access.');
  if (String(world.status) !== 'build_mode') throw conflict('Undo and redo only work in Build Mode.');

  const result = tx(() => {
    const current = worldRow(worldId);
    const undo = JSON.parse(current.undo_json ?? '[]');
    const redo = JSON.parse(current.redo_json ?? '[]');
    const source = direction === 'undo' ? undo : redo;
    if (source.length === 0) throw conflict(`Nothing to ${direction}.`);
    const entry = source[source.length - 1];
    const layout = parseLayout(entry.layout, current.foundation);
    source.pop();
    if (direction === 'undo') redo.push({ layout: layoutValue(current), summary: entry.summary });
    else undo.push({ layout: layoutValue(current), summary: entry.summary });

    const version = Number(current.layout_version ?? 0) + 1;
    db.prepare(
      `UPDATE worlds SET layout_json = ?, settings_json = ?, layout_version = ?, undo_json = ?,
         redo_json = ?, updated_at = ? WHERE id = ?`
    ).run(
      JSON.stringify(layout),
      JSON.stringify(layout.settings),
      version,
      JSON.stringify(undo.slice(-MAX_SNAPSHOTS)),
      JSON.stringify(redo.slice(-MAX_SNAPSHOTS)),
      now(),
      worldId
    );
    const summary = `${direction === 'undo' ? 'Undid' : 'Redid'} ${entry.summary ?? 'change'}`;
    recordSnapshot(worldId, version, userId, direction, summary, layout);
    audit(userId, `world.build.${direction}`, worldId);
    return summary;
  });
  return { state: buildStateFor(userId, worldId), summary: result };
}

export function restoreBuild(userId, worldId, revision) {
  const world = worldRow(worldId);
  if (!world) throw notFound('World not found');
  const permissions = requireStudio(world, userId);
  if (!permissions.canManage) throw forbidden('Only the owner or co-owner can restore a saved version.');
  if (String(world.status) !== 'build_mode') throw conflict('Restore is only available in Build Mode.');
  const snapshot = db
    .prepare('SELECT * FROM world_snapshots WHERE world_id = ? AND revision = ? LIMIT 1')
    .get(worldId, Number(revision));
  if (!snapshot) throw notFound('That saved version no longer exists.');
  const layout = parseLayout(snapshot.layout_json, world.foundation);

  const summary = tx(() => {
    const current = worldRow(worldId);
    const undo = JSON.parse(current.undo_json ?? '[]');
    undo.push({ layout: layoutValue(current), summary: `restore revision ${revision}` });
    const version = Number(current.layout_version ?? 0) + 1;
    db.prepare(
      `UPDATE worlds SET layout_json = ?, settings_json = ?, layout_version = ?, undo_json = ?,
       redo_json = '[]', updated_at = ? WHERE id = ?`
    ).run(
      JSON.stringify(layout),
      JSON.stringify(layout.settings),
      version,
      JSON.stringify(undo.slice(-MAX_SNAPSHOTS)),
      now(),
      worldId
    );
    const label = `Restored revision ${revision}`;
    recordSnapshot(worldId, version, userId, 'restore', label, layout);
    audit(userId, 'world.build.restore', `${worldId}:${revision}`);
    return label;
  });
  return { state: buildStateFor(userId, worldId), summary };
}

/**
 * Copy the draft into the published layout, then close editing. Publishing is
 * owner-only; co-owners manage Live/Available but cannot publish structure.
 */
export function publishBuild(userId, worldId, activeCount = 0) {
  const world = worldRow(worldId);
  if (!world) throw notFound('World not found');
  const permissions = requireStudio(world, userId);
  if (!permissions.canPublish) {
    throw forbidden('Only the world owner can publish a new city layout.');
  }
  if (String(world.status) !== 'build_mode') throw conflict('Build Mode must be active to publish.');
  if (activeCount > 0) throw conflict('Everyone must leave the world before it can be published.');
  const layout = layoutValue(world);
  const version = Number(world.layout_version ?? 0);
  db.prepare(
    `UPDATE worlds SET published_layout_json = ?, published_version = ?, status = 'available',
       published = 0, updated_at = ? WHERE id = ?`
  ).run(JSON.stringify(layout), version, now(), worldId);
  audit(userId, 'world.build.publish', `${worldId}:v${version}`);
  return {
    state: buildStateFor(userId, worldId),
    summary: `Published revision ${version} · city is Available`,
  };
}

/* ----------------------------- official city ----------------------------- */

export function ensureOfficialMainCity(userId) {
  if (!isStaffUser(userId)) {
    throw forbidden('The official Main City workspace is restricted to LoftLife staff.');
  }
  let world = db.prepare('SELECT * FROM worlds WHERE is_official = 1 LIMIT 1').get();
  if (!world) {
    const id = newId('wld');
    const timestamp = now();
    const layout = emptyLayout(DEFAULT_FOUNDATION_ID);
    db.prepare(
      `INSERT INTO worlds (id, owner_id, name, kind, description, access, published, items_json,
         surfaces_json, mood, max_visitors, status, foundation, layout_json, settings_json,
         layout_version, published_version, undo_json, redo_json, is_official, created_at, updated_at)
       VALUES (?, ?, 'Main City', 'neighborhood',
         'Official LoftLife city. Staff workspace only.', 'private', 0, '[]', '{}', 'morning', 64,
         'offline', ?, ?, ?, 0, 0, '[]', '[]', 1, ?, ?)`
    ).run(id, userId, DEFAULT_FOUNDATION_ID, JSON.stringify(layout), JSON.stringify(layout.settings), timestamp, timestamp);
    recordSnapshot(id, 0, userId, 'foundation', 'Official Main City foundation', layout);
    audit(userId, 'world.official.create', id);
    world = worldRow(id);
  }
  return buildStateFor(userId, world.id);
}

export function worldSnapshotCount(worldId) {
  return db.prepare('SELECT COUNT(*) AS n FROM world_snapshots WHERE world_id = ?').get(worldId).n;
}
