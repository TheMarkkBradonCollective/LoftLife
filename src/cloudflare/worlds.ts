import { invitationsAllowedWith } from './platform';

type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type User = { id: string; handle: string };
type World = Record<string, unknown>;
type RealtimeBinding = { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
type WorldRole = 'co_owner' | 'moderator' | 'builder' | 'member';
const ROLES: WorldRole[] = ['co_owner', 'moderator', 'builder', 'member'];
const WORLD_STATUSES = ['live', 'available', 'offline', 'build_mode', 'build_pending', 'maintenance'];

const ACCESS = ['public', 'private', 'invite', 'friends', 'collab'];
const KINDS = ['hangout', 'house', 'apartment', 'club', 'restaurant', 'shop', 'park', 'venue', 'neighborhood'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function fail(message: string, status: number, code: string) {
  return json({ error: message, code }, status);
}
function parse(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
async function permission(sql: Sql, world: World, user: User | null) {
  let role: string | null = null;
  if (user) {
    if (world.owner_id === user.id) role = 'owner';
    else {
      const rows = await sql.query(
        'SELECT role FROM ll_world_collaborators WHERE world_id=$1 AND user_id=$2 LIMIT 1',
        [world.id, user.id]
      ) as Array<{ role: string }>;
      role = rows[0]?.role ?? null;
    }
  }
  const status = String(world.status ?? 'offline');
  const canBuild = role === 'owner' || role === 'co_owner' || role === 'builder';
  const canManageStatus = role === 'owner' || role === 'co_owner';
  if (role === 'owner') return { canEnter: true, canEdit: status === 'build_mode', canBuild, canManageStatus, role };
  if (status === 'maintenance') return { canEnter: false, canEdit: false, canBuild, canManageStatus, role };
  if (status === 'build_mode') {
    return { canEnter: canBuild, canEdit: canBuild, canBuild, canManageStatus, role };
  }
  if (status === 'offline') {
    return { canEnter: canManageStatus, canEdit: false, canBuild, canManageStatus, role };
  }
  if (status === 'build_pending') {
    return { canEnter: false, canEdit: false, canBuild, canManageStatus, role };
  }
  if (status === 'live') {
    if (user) {
      const blocked = await sql.query('SELECT 1 FROM ll_blocks WHERE user_id=$1 AND blocked_id=$2 LIMIT 1', [world.owner_id, user.id]);
      if (blocked.length) return { canEnter: false, canEdit: false, canBuild, canManageStatus, role };
    }
    return { canEnter: true, canEdit: false, canBuild, canManageStatus, role };
  }
  if (!user) return { canEnter: false, canEdit: false, canBuild, canManageStatus, role };
  if (world.owner_id === user.id || role) {
    return { canEnter: true, canEdit: false, canBuild, canManageStatus, role };
  }
  const blocked = await sql.query('SELECT 1 FROM ll_blocks WHERE user_id=$1 AND blocked_id=$2 LIMIT 1', [world.owner_id, user.id]);
  if (blocked.length) return { canEnter: false, canEdit: false, canBuild, canManageStatus, role };
  let canEnter = world.access === 'public';
  if (world.access === 'friends') {
    const rows = await sql.query("SELECT 1 FROM ll_friendships WHERE status='accepted' AND ((a=$1 AND b=$2) OR (a=$2 AND b=$1)) LIMIT 1", [world.owner_id, user.id]);
    canEnter = rows.length > 0;
  } else if (world.access === 'invite') {
    const rows = await sql.query('SELECT 1 FROM ll_world_invites WHERE world_id=$1 AND user_id=$2 LIMIT 1', [world.id, user.id]);
    canEnter = rows.length > 0;
  } else if (world.access === 'collab') {
    const [invites, collaborators] = await Promise.all([
      sql.query('SELECT 1 FROM ll_world_invites WHERE world_id=$1 AND user_id=$2 LIMIT 1', [world.id, user.id]),
      sql.query('SELECT 1 FROM ll_world_collaborators WHERE world_id=$1 AND user_id=$2 LIMIT 1', [world.id, user.id]),
    ]);
    canEnter = invites.length > 0 || collaborators.length > 0;
  }
  return { canEnter, canEdit: false, canBuild, canManageStatus, role };
}
async function view(sql: Sql, world: World, user: User | null, state = false) {
  const [owners, access] = await Promise.all([
    sql.query('SELECT handle FROM ll_accounts WHERE id=$1 LIMIT 1', [world.owner_id]) as Promise<Array<{ handle: string }>>,
    permission(sql, world, user),
  ]);
  const result: World = {
    id: world.id, name: world.name, kind: world.kind, description: world.description,
    access: world.access, status: String(world.status ?? 'offline'), published: String(world.status ?? 'offline') === 'live', ownerId: world.owner_id,
    ownerHandle: owners[0]?.handle ?? 'unknown', maxVisitors: Number(world.max_visitors),
    updatedAt: Number(world.updated_at), createdAt: Number(world.created_at),
    role: access.role, canEdit: access.canEdit, canBuild: access.canBuild,
    canManageStatus: access.canManageStatus, canEnter: access.canEnter,
  };
  if (state && access.canEnter) {
    result.items = parse(world.items_json, []);
    result.surfaces = parse(world.surfaces_json, {});
    result.mood = world.mood;
    const collaborators = await sql.query(
      'SELECT c.user_id,a.handle,c.role FROM ll_world_collaborators c JOIN ll_accounts a ON a.id=c.user_id WHERE c.world_id=$1',
      [world.id]
    ) as Array<{ user_id: string; handle: string; role: string }>;
    result.collaborators = collaborators.map(row => ({ userId: row.user_id, handle: row.handle, role: row.role }));
  }
  return result;
}
function sanitizeState(body: Record<string, unknown>) {
  const furniture = new Set(['plush_sofa','sectional_sofa','lounge_chair','bar_stool','cozy_bed','dining_set','espresso_bar','dual_desk','coffee_table','side_desk','record_console','media_tv','fireplace','bookshelf','arc_lamp','table_lamp','monstera_plant','olive_tree','woven_rug','wall_art','wall_shelf','floor_mirror','neon_sign']);
  const floors = new Set(['oak_parquet','walnut_herringbone','terrazzo','concrete','boucle_carpet']);
  const walls = new Set(['warm_chalk','sage_plaster','terracotta','slate_blue','charcoal_loft','soft_blush']);
  const moods = new Set(['morning','golden','night']);
  if (!Array.isArray(body.items) || body.items.length > 200) return null;
  const seen = new Set<string>();
  const items: World[] = [];
  for (let i=0;i<body.items.length;i++) {
    const raw = body.items[i] as World;
    if (!raw || !furniture.has(String(raw.catalogId))) return null;
    const uid = typeof raw.uid === 'string' ? raw.uid.slice(0,64) : `it_${i}`;
    if (seen.has(uid) || ![raw.gx,raw.gz,raw.rot].every(Number.isInteger)) return null;
    if (Number(raw.gx)<0 || Number(raw.gx)>14 || Number(raw.gz)<0 || Number(raw.gz)>14 || Number(raw.rot)<0 || Number(raw.rot)>3) return null;
    seen.add(uid);
    items.push({ uid, catalogId: raw.catalogId, gx: raw.gx, gz: raw.gz, rot: raw.rot, color: typeof raw.color==='string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color.toLowerCase() : '#e6dfd3', ...(raw.wall==='north'||raw.wall==='west'?{wall:raw.wall}:{}), ...(typeof raw.active==='boolean'?{active:raw.active}:{}) });
  }
  const surfaces = body.surfaces && typeof body.surfaces==='object' ? body.surfaces as World : {};
  const mood = String(body.mood ?? 'morning');
  if (!floors.has(String(surfaces.floor)) || !walls.has(String(surfaces.wall)) || !moods.has(mood)) return null;
  return { items, surfaces: { floor: surfaces.floor, wall: surfaces.wall }, mood };
}

export async function handleWorldRoute(request: Request, sql: Sql, user: User | null, realtime?: RealtimeBinding): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/worlds' && request.method === 'POST') {
    if (!user) return fail('Sign in to create a world.',401,'unauthorized');
    const body = await request.json().catch(()=>({})) as World;
    const name = typeof body.name==='string' ? body.name.trim().slice(0,48) : '';
    const kind = String(body.kind ?? 'hangout');
    const access = String(body.access ?? 'private');
    if (name.length<2 || !KINDS.includes(kind) || !ACCESS.includes(access)) return fail('Invalid world name, kind, or access.',400,'invalid_input');
    const count = await sql.query('SELECT COUNT(*) AS total FROM ll_worlds WHERE owner_id=$1',[user.id]) as Array<{total:string|number}>;
    if (Number(count[0]?.total ?? 0)>=20) return fail('Each account may own at most 20 worlds.',400,'world_limit');
    const id = `wld_${crypto.randomUUID()}`;
    const at = Date.now();
    const created = await sql.query(
      "INSERT INTO ll_worlds (id,owner_id,name,kind,description,access,published,status,items_json,surfaces_json,mood,max_visitors,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,FALSE,'offline','[]',$7,'morning',30,$8,$8) RETURNING *",
      [id,user.id,name,kind,typeof body.description==='string'?body.description.slice(0,280):'',access,JSON.stringify({floor:'oak_parquet',wall:'warm_chalk'}),at]
    ) as World[];
    return json(await view(sql,created[0],user,true),201);
  }
  if (path === '/api/worlds' && request.method === 'GET') {
    const mine = url.searchParams.get('mine') === '1';
    if (mine && !user) return fail('Sign in to view your worlds.', 401, 'unauthorized');
    const search = (url.searchParams.get('q') ?? '').slice(0,60);
    const kind = url.searchParams.get('kind') ?? '';
    const rows = mine
      ? await sql.query('SELECT * FROM ll_worlds WHERE owner_id=$1 ORDER BY updated_at DESC', [user!.id]) as World[]
      : await sql.query("SELECT * FROM ll_worlds WHERE status IN ('live','available') AND (status='live' OR access='public') AND name ILIKE $1 AND ($2='' OR kind=$2) ORDER BY CASE WHEN status='live' THEN 0 ELSE 1 END, updated_at DESC LIMIT 100", [`%${search}%`, kind]) as World[];
    const results = await Promise.all(rows.map(async world => {
      if (user) {
        const blocked = await sql.query('SELECT 1 FROM ll_blocks WHERE user_id=$1 AND blocked_id=$2 LIMIT 1', [world.owner_id,user.id]);
        if (blocked.length) return null;
      }
      return view(sql, world, user, false);
    }));
    return json(results.filter(Boolean));
  }
  const match = path.match(/^\/api\/worlds\/([^/]+)(?:\/(.*))?$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  const action = match[2] ?? '';
  if (action === 'entry' && request.method === 'GET' && !user) return fail('Sign in to enter a world.',401,'unauthorized');
  if (['POST','PATCH','PUT','DELETE'].includes(request.method) && !user) return fail('Sign in to manage worlds.',401,'unauthorized');
  const rows = await sql.query('SELECT * FROM ll_worlds WHERE id=$1 LIMIT 1', [id]) as World[];
  const world = rows[0];
  if (!world) return fail('World not found.',404,'not_found');
  if (action === '' && request.method === 'GET') return json(await view(sql,world,user,true));
  if (action === 'entry' && request.method === 'GET') {
    const access = await permission(sql,world,user);
    if (!access.canEnter) return fail('This city is not currently available to your account.',403,'forbidden');
    return json({instanceId:`world:${id}`,capacity:Number(world.max_visitors),name:world.name,status:String(world.status ?? 'offline')});
  }
  if (action === 'status' && request.method === 'POST') {
    if (!user || !realtime) return fail('World status service is unavailable.',503,'realtime_unavailable');
    const body = await request.json().catch(()=>({})) as World;
    const status = String(body.status ?? '');
    if (!['live','available','offline'].includes(status)) return fail('Invalid city status.',400,'invalid_status');
    const service = realtime.get(realtime.idFromName(`world:${id}`));
    return service.fetch(new Request('https://loftlife-internal/internal/world/action', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({worldId:id,userId:user.id,action:'set_status',status}),
    }));
  }
  if (action === 'build-mode' && request.method === 'POST') {
    if (!user || !realtime) return fail('World build service is unavailable.',503,'realtime_unavailable');
    const service = realtime.get(realtime.idFromName(`world:${id}`));
    return service.fetch(new Request('https://loftlife-internal/internal/world/action', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({worldId:id,userId:user.id,action:'request_build'}),
    }));
  }
  if (action === 'collaborators' && request.method === 'POST') {
    if (!user) return fail('Sign in to manage city roles.',401,'unauthorized');
    const manager = await permission(sql,world,user);
    if (!manager.canManageStatus) return fail('Only the owner or co-owner can manage city roles.',403,'forbidden');
    const body = await request.json().catch(()=>({})) as World;
    const role = String(body.role ?? 'builder');
    if (!ROLES.includes(role as WorldRole)) return fail('Invalid city role.',400,'invalid_role');
    if (role === 'co_owner' && world.owner_id !== user.id) return fail('Only the owner can appoint a co-owner.',403,'forbidden');
    const targets = await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[String(body.handle??'').toLowerCase()]) as Array<{id:string}>;
    if (!targets[0]) return fail('No player with that handle.',404,'not_found');
    if (targets[0].id === user!.id) return fail('You already own this world.',400,'bad_request');
    await sql.query("INSERT INTO ll_world_collaborators(world_id,user_id,role,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(world_id,user_id) DO UPDATE SET role=EXCLUDED.role",[id,targets[0].id,role,Date.now()]);
    const updated = await sql.query('SELECT * FROM ll_worlds WHERE id=$1 LIMIT 1',[id]) as World[];
    return json(await view(sql,updated[0],user,true));
  }
  if (action.startsWith('collaborators/') && request.method === 'DELETE') {
    if (!user || !(await permission(sql,world,user)).canManageStatus) return fail('Only the owner or co-owner can remove city roles.',403,'forbidden');
    const targetId = decodeURIComponent(action.slice('collaborators/'.length));
    await sql.query('DELETE FROM ll_world_collaborators WHERE world_id=$1 AND user_id=$2',[id,targetId]);
    const updated = await sql.query('SELECT * FROM ll_worlds WHERE id=$1 LIMIT 1',[id]) as World[];
    return json(await view(sql,updated[0],user,true));
  }
  if (action === 'invite' && request.method === 'POST') {
    const access = await permission(sql,world,user);
    if (!access.canManageStatus) return fail('Only the owner or co-owner can invite players.',403,'forbidden');
    const body = await request.json().catch(()=>({})) as World;
    const targets = await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[String(body.handle??'').toLowerCase()]) as Array<{id:string}>;
    if (!targets[0]) return fail('No player with that handle.',404,'not_found');
    if (!(await invitationsAllowedWith(sql,targets[0].id))) return fail('This player is not accepting world invitations.',403,'forbidden');
    await sql.query('INSERT INTO ll_world_invites(world_id,user_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,targets[0].id,Date.now()]);
    return json({invited:targets[0].id});
  }
  if (action === '' && request.method === 'DELETE') {
    if (world.owner_id !== user?.id) return fail('Only the owner can delete this world.',403,'forbidden');
    await sql.query('DELETE FROM ll_worlds WHERE id=$1',[id]);
    return json({deleted:true});
  }
  if (action === 'state' && request.method === 'PUT') {
    const access = await permission(sql,world,user);
    if (!access.canBuild || String(world.status ?? 'offline') !== 'build_mode') return fail('Build Mode must be active and you must be the owner, co-owner, or builder.',403,'build_mode_required');
    const state = sanitizeState(await request.json().catch(()=>({})));
    if (!state) return fail('Invalid world room state.',400,'invalid_input');
    const at = Date.now();
    await sql.query('UPDATE ll_worlds SET items_json=$1,surfaces_json=$2,mood=$3,updated_at=$4 WHERE id=$5',[JSON.stringify(state.items),JSON.stringify(state.surfaces),state.mood,at,id]);
    return json({id,...state,updatedAt:at});
  }
  if (action === '' && request.method === 'PATCH') {
    if (!user || !(await permission(sql,world,user)).canManageStatus) return fail('Only the owner or co-owner can change this city.',403,'forbidden');
    const body = await request.json().catch(()=>({})) as World;
    const name = body.name===undefined?String(world.name):String(body.name).trim().slice(0,48);
    const kind = body.kind===undefined?String(world.kind):String(body.kind);
    const access = body.access===undefined?String(world.access):String(body.access);
    if (!name || !KINDS.includes(kind) || !ACCESS.includes(access)) return fail('Invalid world name, kind, or access.',400,'invalid_input');
    const description = body.description===undefined?String(world.description):String(body.description).slice(0,280);
    const visitors = body.maxVisitors===undefined?Number(world.max_visitors):Math.min(60,Math.max(2,Number(body.maxVisitors)||Number(world.max_visitors)));
    const updated = await sql.query('UPDATE ll_worlds SET name=$1,kind=$2,access=$3,description=$4,max_visitors=$5,updated_at=$6 WHERE id=$7 RETURNING *',[name,kind,access,description,visitors,Date.now(),id]) as World[];
    return json(await view(sql,updated[0],user,true));
  }
  return null;
}
