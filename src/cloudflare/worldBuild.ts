/**
 * Edge parity for player-created city building.
 *
 * The Neon-backed Worker uses the same shared layout rules as the Node
 * authority so permissions, plot approvals, undo/redo, history and publishing
 * cannot drift between runtimes. Writes are optimistic on layout_version, so
 * two builders editing at once get a clear conflict instead of losing work.
 */
import {
  DEFAULT_FOUNDATION_ID,
  FOUNDATION_IDS,
  MAX_SNAPSHOTS,
  applyWorldOp,
  emptyLayout,
  foundationById,
  parseLayout,
  worldPermissions,
} from '../../shared/world-layout.mjs';

type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type User = { id: string; handle: string; role?: string };
type World = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
function fail(message: string, status: number, code: string, detail?: unknown) {
  return json({ error: message, code, ...(detail === undefined ? {} : { detail }) }, status);
}
function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
function isStaff(user: User | null) {
  return user?.role === 'admin' || user?.role === 'staff';
}

async function roleFor(sql: Sql, world: World, user: User | null) {
  if (!user) return null;
  if (world.owner_id === user.id) return 'owner';
  const rows = (await sql.query(
    'SELECT role FROM ll_world_collaborators WHERE world_id=$1 AND user_id=$2 LIMIT 1',
    [world.id, user.id]
  )) as Array<{ role: string }>;
  return rows[0]?.role ?? null;
}

async function permissionsFor(sql: Sql, world: World, user: User | null) {
  const role = await roleFor(sql, world, user);
  return worldPermissions({
    role: role as unknown as undefined,
    isOwner: world.owner_id === user?.id,
    isStaff: isStaff(user),
    status: String(world.status ?? 'offline'),
    isOfficial: Boolean(world.is_official),
  });
}

function layoutOf(world: World) {
  return parseLayout(world.layout_json, String(world.foundation ?? DEFAULT_FOUNDATION_ID));
}

async function plotsFor(sql: Sql, worldId: string) {
  const rows = (await sql.query(
    'SELECT * FROM ll_world_plots WHERE world_id=$1 ORDER BY created_at ASC',
    [worldId]
  )) as World[];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    x: Number(row.x),
    z: Number(row.z),
    w: Number(row.w),
    d: Number(row.d),
    status: String(row.status),
    requestedBy: row.requested_by ?? null,
    assignedTo: row.assigned_to ?? null,
  }));
}

async function historyFor(sql: Sql, worldId: string) {
  const rows = (await sql.query(
    `SELECT s.id,s.revision,s.actor_id,s.action,s.detail,s.created_at,a.handle
     FROM ll_world_snapshots s LEFT JOIN ll_accounts a ON a.id=s.actor_id
     WHERE s.world_id=$1 ORDER BY s.revision DESC LIMIT $2`,
    [worldId, MAX_SNAPSHOTS]
  )) as World[];
  return rows.map((row) => ({
    id: String(row.id),
    revision: Number(row.revision),
    action: String(row.action),
    detail: String(row.detail ?? ''),
    actorId: row.actor_id ?? null,
    actorHandle: row.handle ?? 'system',
    createdAt: Number(row.created_at),
  }));
}

async function stateFor(sql: Sql, world: World, user: User) {
  const permissions = await permissionsFor(sql, world, user);
  const layout = layoutOf(world);
  const undo = parse<unknown[]>(world.undo_json, []);
  const redo = parse<unknown[]>(world.redo_json, []);
  return {
    world: {
      id: world.id,
      name: world.name,
      kind: world.kind,
      access: world.access,
      status: world.status,
      published: Boolean(world.published),
      foundation: world.foundation ?? DEFAULT_FOUNDATION_ID,
      isOfficial: Boolean(world.is_official),
      ownerId: world.owner_id,
      layoutVersion: Number(world.layout_version ?? 0),
      publishedVersion: Number(world.published_version ?? 0),
      updatedAt: Number(world.updated_at),
    },
    role: permissions.role,
    permissions,
    layout,
    publishedLayout: parseLayout(world.published_layout_json, String(world.foundation ?? DEFAULT_FOUNDATION_ID)),
    plots: await plotsFor(sql, String(world.id)),
    history: await historyFor(sql, String(world.id)),
    canUndo: undo.length > 0 && permissions.canUndo,
    canRedo: redo.length > 0 && permissions.canUndo,
  };
}

async function worldById(sql: Sql, worldId: string) {
  const rows = (await sql.query('SELECT * FROM ll_worlds WHERE id=$1 LIMIT 1', [worldId])) as World[];
  return rows[0] ?? null;
}

async function snapshot(sql: Sql, worldId: string, revision: number, actorId: string, action: string, detail: string, layout: unknown) {
  await sql.query(
    `INSERT INTO ll_world_snapshots (id,world_id,revision,actor_id,action,detail,layout_json,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [`snp_${crypto.randomUUID()}`, worldId, revision, actorId, action, detail, JSON.stringify(layout), Date.now()]
  );
  await sql.query(
    `DELETE FROM ll_world_snapshots WHERE world_id=$1 AND revision NOT IN
       (SELECT revision FROM ll_world_snapshots WHERE world_id=$1 ORDER BY revision DESC LIMIT $2)`,
    [worldId, MAX_SNAPSHOTS]
  );
}

async function syncPlots(sql: Sql, worldId: string, plots: Array<Record<string, unknown>>) {
  const existing = (await sql.query('SELECT id FROM ll_world_plots WHERE world_id=$1', [worldId])) as Array<{ id: string }>;
  const keep = new Set(plots.map((plot) => String(plot.id)));
  for (const plot of plots) {
    await sql.query(
      `INSERT INTO ll_world_plots (id,world_id,name,x,z,w,d,status,requested_by,assigned_to,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,x=EXCLUDED.x,z=EXCLUDED.z,w=EXCLUDED.w,
         d=EXCLUDED.d,status=EXCLUDED.status,requested_by=EXCLUDED.requested_by,
         assigned_to=EXCLUDED.assigned_to,updated_at=EXCLUDED.updated_at`,
      [
        String(plot.id), worldId, String(plot.name), Number(plot.x), Number(plot.z), Number(plot.w),
        Number(plot.d), String(plot.status), plot.requestedBy ?? null, plot.assignedTo ?? null,
        Date.now(), Date.now(),
      ]
    );
  }
  for (const row of existing) {
    if (!keep.has(row.id)) await sql.query('DELETE FROM ll_world_plots WHERE world_id=$1 AND id=$2', [worldId, row.id]);
  }
}

export async function createWorldLayoutOnEdge(sql: Sql, worldId: string, foundationId: string, actorId: string) {
  const layout = emptyLayout(foundationId);
  await sql.query('UPDATE ll_worlds SET layout_json=$1,settings_json=$2 WHERE id=$3', [
    JSON.stringify(layout),
    JSON.stringify(layout.settings),
    worldId,
  ]);
  await snapshot(sql, worldId, 0, actorId, 'foundation', `Selected ${layout.foundation}`, layout);
}

export async function handleWorldBuildRoute(request: Request, sql: Sql, user: User | null): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/official/main-city' && request.method === 'GET') {
    if (!user) return fail('Sign in to continue.', 401, 'unauthorized');
    if (!isStaff(user)) return fail('The official Main City workspace is restricted to LoftLife staff.', 403, 'forbidden');
    let rows = (await sql.query('SELECT * FROM ll_worlds WHERE is_official=TRUE LIMIT 1')) as World[];
    if (!rows[0]) {
      const id = `wld_${crypto.randomUUID()}`;
      const layout = emptyLayout(DEFAULT_FOUNDATION_ID);
      const at = Date.now();
      await sql.query(
        `INSERT INTO ll_worlds (id,owner_id,name,kind,description,access,published,status,items_json,
           surfaces_json,mood,max_visitors,foundation,layout_json,settings_json,layout_version,
           published_version,undo_json,redo_json,is_official,created_at,updated_at)
         VALUES ($1,$2,'Main City','neighborhood','Official LoftLife city. Staff workspace only.',
           'private',FALSE,'offline','[]','{}','morning',64,$3,$4,$5,0,0,'[]','[]',TRUE,$6,$6)
         RETURNING *`,
        [id, user.id, DEFAULT_FOUNDATION_ID, JSON.stringify(layout), JSON.stringify(layout.settings), at]
      );
      await snapshot(sql, id, 0, user.id, 'foundation', 'Official Main City foundation', layout);
      rows = (await sql.query('SELECT * FROM ll_worlds WHERE id=$1 LIMIT 1', [id])) as World[];
    }
    const permissions = await permissionsFor(sql, rows[0], user);
    if (!permissions.canAccessOfficialWorkspace) return fail('Staff access required.', 403, 'forbidden');
    return json(await stateFor(sql, rows[0], user));
  }

  const match = path.match(/^\/api\/worlds\/([^/]+)\/build(?:\/([^/]+))?$/);
  if (!match) return null;
  if (request.method !== 'GET' && request.method !== 'POST') return fail('Method not allowed.', 405, 'method_not_allowed');
  if (!user) return fail('Sign in to build.', 401, 'unauthorized');
  const worldId = decodeURIComponent(match[1]);
  const action = match[2] ?? '';
  const world = await worldById(sql, worldId);
  if (!world) return fail('World not found.', 404, 'not_found');
  if (Boolean(world.is_official) && !isStaff(user)) {
    return fail('The official Main City is developed by LoftLife staff only.', 403, 'forbidden');
  }
  const permissions = await permissionsFor(sql, world, user);
  const isOwner = world.owner_id === user.id;
  if (!permissions.canViewStudio && !isOwner) {
    return fail('Only the owner, co-owner, or a builder can open this world studio.', 403, 'forbidden');
  }

  if (action === '' && request.method === 'GET') {
    return json(await stateFor(sql, world, user));
  }

  const inBuild = String(world.status ?? 'offline') === 'build_mode';
  if (!inBuild) return fail('Build Mode must be active.', 409, 'build_mode_required');

  if (action === 'op' && request.method === 'POST') {
    if (!permissions.canBuild && !permissions.canApprovePlots) {
      return fail('Your role cannot change this world.', 403, 'forbidden');
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const current = await worldById(sql, worldId);
    if (!current) return fail('World not found.', 404, 'not_found');
    const layout = layoutOf(current);
    const plots = await plotsFor(sql, worldId);
    let outcome: { layout: unknown; plots: Array<Record<string, unknown>>; summary: string };
    try {
      outcome = applyWorldOp({ layout, plots: plots as never, op: body, permissions, userId: user.id }) as unknown as {
        layout: unknown;
        plots: Array<Record<string, unknown>>;
        summary: string;
      };
    } catch (error) {
      const shape = error as { code?: string; message?: string };
      return fail(shape.message ?? 'Invalid build operation.', 400, shape.code ?? 'invalid_input');
    }
    const version = Number(current.layout_version ?? 0) + 1;
    const undo = parse<unknown[]>(current.undo_json, []);
    undo.push({ layout, summary: outcome.summary });
    const nextLayout = outcome.layout as { settings: Record<string, unknown> };
    const updated = (await sql.query(
      `UPDATE ll_worlds SET layout_json=$1,settings_json=$2,layout_version=$3,undo_json=$4,
         redo_json='[]',updated_at=$5 WHERE id=$6 AND layout_version=$7 RETURNING *`,
      [JSON.stringify(outcome.layout), JSON.stringify(nextLayout.settings), version,
        JSON.stringify(undo.slice(-MAX_SNAPSHOTS)), Date.now(), worldId, Number(current.layout_version ?? 0)]
    )) as World[];
    if (!updated[0]) return fail('Another builder changed this world. Reload and try again.', 409, 'revision_conflict');
    await syncPlots(sql, worldId, outcome.plots);
    await snapshot(sql, worldId, version, user.id, String(body.action ?? 'edit'), outcome.summary, outcome.layout);
    return json({ state: await stateFor(sql, updated[0], user), summary: outcome.summary });
  }

  if ((action === 'undo' || action === 'redo') && request.method === 'POST') {
    if (!permissions.canUndo) return fail('Undo and redo require build access.', 403, 'forbidden');
    const current = await worldById(sql, worldId);
    if (!current) return fail('World not found.', 404, 'not_found');
    const undo = parse<Array<{ layout: unknown; summary?: string }>>(current.undo_json, []);
    const redo = parse<Array<{ layout: unknown; summary?: string }>>(current.redo_json, []);
    const source = action === 'undo' ? undo : redo;
    if (source.length === 0) return fail(`Nothing to ${action}.`, 409, 'conflict');
    const entry = source[source.length - 1];
    source.pop();
    if (action === 'undo') redo.push({ layout: layoutOf(current), summary: entry.summary });
    else undo.push({ layout: layoutOf(current), summary: entry.summary });
    const layout = parseLayout(entry.layout, String(current.foundation ?? DEFAULT_FOUNDATION_ID));
    const version = Number(current.layout_version ?? 0) + 1;
    const updated = (await sql.query(
      `UPDATE ll_worlds SET layout_json=$1,settings_json=$2,layout_version=$3,undo_json=$4,
         redo_json=$5,updated_at=$6 WHERE id=$7 AND layout_version=$8 RETURNING *`,
      [JSON.stringify(layout), JSON.stringify(layout.settings), version,
        JSON.stringify(undo.slice(-MAX_SNAPSHOTS)), JSON.stringify(redo.slice(-MAX_SNAPSHOTS)),
        Date.now(), worldId, Number(current.layout_version ?? 0)]
    )) as World[];
    if (!updated[0]) return fail('Another builder changed this world. Reload and try again.', 409, 'revision_conflict');
    const summary = `${action === 'undo' ? 'Undid' : 'Redid'} ${entry.summary ?? 'change'}`;
    await snapshot(sql, worldId, version, user.id, action, summary, layout);
    return json({ state: await stateFor(sql, updated[0], user), summary });
  }

  if (action === 'restore' && request.method === 'POST') {
    if (!permissions.canManage) return fail('Only the owner or co-owner can restore a saved version.', 403, 'forbidden');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const revision = Number(body.revision);
    const rows = (await sql.query(
      'SELECT * FROM ll_world_snapshots WHERE world_id=$1 AND revision=$2 LIMIT 1',
      [worldId, revision]
    )) as World[];
    if (!rows[0]) return fail('That saved version no longer exists.', 404, 'not_found');
    const current = await worldById(sql, worldId);
    if (!current) return fail('World not found.', 404, 'not_found');
    const layout = parseLayout(rows[0].layout_json, String(current.foundation ?? DEFAULT_FOUNDATION_ID));
    const undo = parse<unknown[]>(current.undo_json, []);
    undo.push({ layout: layoutOf(current), summary: `restore revision ${revision}` });
    const version = Number(current.layout_version ?? 0) + 1;
    const updated = (await sql.query(
      `UPDATE ll_worlds SET layout_json=$1,settings_json=$2,layout_version=$3,undo_json=$4,
         redo_json='[]',updated_at=$5 WHERE id=$6 AND layout_version=$7 RETURNING *`,
      [JSON.stringify(layout), JSON.stringify(layout.settings), version,
        JSON.stringify(undo.slice(-MAX_SNAPSHOTS)), Date.now(), worldId, Number(current.layout_version ?? 0)]
    )) as World[];
    if (!updated[0]) return fail('Another builder changed this world. Reload and try again.', 409, 'revision_conflict');
    const summary = `Restored revision ${revision}`;
    await snapshot(sql, worldId, version, user.id, 'restore', summary, layout);
    return json({ state: await stateFor(sql, updated[0], user), summary });
  }

  if (action === 'publish' && request.method === 'POST') {
    if (!permissions.canPublish) return fail('Only the world owner can publish a new city layout.', 403, 'forbidden');
    const current = await worldById(sql, worldId);
    if (!current) return fail('World not found.', 404, 'not_found');
    const layout = layoutOf(current);
    const version = Number(current.layout_version ?? 0);
    const updated = (await sql.query(
      `UPDATE ll_worlds SET published_layout_json=$1,published_version=$2,status='available',
         published=FALSE,updated_at=$3 WHERE id=$4 AND layout_version=$5 RETURNING *`,
      [JSON.stringify(layout), version, Date.now(), worldId, version]
    )) as World[];
    if (!updated[0]) return fail('Another builder changed this world. Reload and try again.', 409, 'revision_conflict');
    return json({ state: await stateFor(sql, updated[0], user), summary: `Published revision ${version} · city is Available` });
  }

  if (action === 'foundations' && request.method === 'GET') {
    return json({ default: DEFAULT_FOUNDATION_ID, foundations: FOUNDATION_IDS.map((id) => foundationById(id)) });
  }

  return fail('Unknown build action.', 404, 'not_found');
}
