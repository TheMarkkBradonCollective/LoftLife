import { neon } from '@neondatabase/serverless';
import { sha256Hex, verifyAuthToken } from '../../shared/auth-core.mjs';
import { CITY_INSTANCE, resolveInstance } from '../../shared/instance.mjs';
import { settingsFor } from './platform';
import { TRANSIT_LINES } from './transit';

interface Env {
  DATABASE_URL?: string;
  LOFTLIFE_SESSION_SECRET?: string;
  REALTIME?: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
}
type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type Player = {
  connId: string; userId: string; handle: string; name: string; avatar: unknown; isGuest?: boolean;
  instanceId: string; x: number; y: number; z: number; yaw: number;
  emote: string; location: string; lastSeen: number; lastChatAt: number; lastPoseAt?: number;
  riding?: string | null; transitLineId?: string | null; transitSeat?: number | null;
  transitStartStop?: number; transitStartedAt?: number;
};
const MAX_PLAYERS = 64;
const MAX_CHAT_LENGTH = 280;
const TRANSIT_SPEED = 9;
const TRANSIT_DWELL_MS = 4500;
const TRANSIT_SEATS = 6;
const TRANSIT_BOARD_RADIUS = 10;
const TRANSIT_MAX_RIDE_MS = 180000;
const encoder = new TextEncoder();

function send(ws: WebSocket, value: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
}
function publicPlayer(p: Player) {
  return {
    connId: p.connId, userId: p.userId, handle: p.handle,
    name: p.isGuest ? `Guest User - ${p.name}` : p.name, displayName: p.name, isGuest: Boolean(p.isGuest),
    avatar: p.avatar, x: p.x, y: p.y, z: p.z, yaw: p.yaw,
    emote: p.emote, location: p.location, riding: p.riding ?? null,
  };
}
function error(ws: WebSocket, code: string, message: string) {
  send(ws, { t: 'error', code, message });
}

interface HibernatableWebSocket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface DurableObjectStateLike {
  acceptWebSocket(socket: HibernatableWebSocket): void;
  getWebSockets(): HibernatableWebSocket[];
  storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
}
declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

export class LoftLifeRealtime {
  private sql: Sql | null = null;
  constructor(private ctx: DurableObjectStateLike, private env: Env) {}
  private lastSnapshotAt = 0;

  private database(): Sql {
    if (!this.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    this.sql ??= neon(this.env.DATABASE_URL) as unknown as Sql;
    return this.sql;
  }

  async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === '/internal/world/action' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { worldId?: string; userId?: string; action?: string; status?: string };
      if (!body.worldId || !body.userId) return Response.json({error:'worldId and userId are required',code:'bad_request'},{status:400});
      const worldId = String(body.worldId);
      const rows = await this.database().query('SELECT owner_id,status FROM ll_worlds WHERE id=$1 LIMIT 1',[worldId]) as Array<{owner_id:string;status:string}>;
      const world = rows[0];
      if (!world) return Response.json({error:'World not found',code:'not_found'},{status:404});
      const roleRows = world.owner_id === body.userId
        ? [{role:'owner'}]
        : await this.database().query('SELECT role FROM ll_world_collaborators WHERE world_id=$1 AND user_id=$2 LIMIT 1',[worldId,body.userId]) as Array<{role:string}>;
      const role = roleRows[0]?.role ?? null;
      const canManage = role === 'owner' || role === 'co_owner';
      const canBuild = canManage || role === 'builder';
      const instanceId = `world:${worldId}`;
      const active = this.players(instanceId);
      if (body.action === 'set_status') {
        if (!canManage) return Response.json({error:'Only the owner or co-owner can change city status',code:'forbidden'},{status:403});
        const status = String(body.status ?? '');
        if (!['live','available','offline'].includes(status)) return Response.json({error:'Invalid city status',code:'invalid_status'},{status:400});
        if (['build_mode','build_pending','maintenance'].includes(String(world.status)) && status !== 'available') {
          return Response.json({error:'Finish Build Mode or maintenance before changing this city status',code:'invalid_transition'},{status:409});
        }
        if (status === 'live' && !active.some(player => player.userId === body.userId)) {
          return Response.json({error:'Enter your city before making it Live',code:'must_be_present'},{status:409});
        }
        await this.database().query('UPDATE ll_worlds SET status=$1,published=$2,updated_at=$3 WHERE id=$4',[status,status==='live',Date.now(),worldId]);
        this.broadcast(instanceId,{t:'world_status',status});
        return Response.json({status,activeCount:active.length});
      }
      if (body.action === 'request_build') {
        if (!canBuild) return Response.json({error:'Only the owner, co-owner, or builder can enter Build Mode',code:'forbidden'},{status:403});
        if (String(world.status) !== 'offline') return Response.json({error:'The owner or co-owner must first set the city to Offline',code:'city_must_be_offline'},{status:409});
        const nextStatus = active.length === 0 ? 'build_mode' : 'build_pending';
        await this.database().query('UPDATE ll_worlds SET status=$1,published=FALSE,updated_at=$2 WHERE id=$3',[nextStatus,Date.now(),worldId]);
        this.broadcast(instanceId,{t:'world_status',status:nextStatus,activeCount:active.length});
        return Response.json({status:nextStatus,activeCount:active.length,pending:active.length>0});
      }
      return Response.json({error:'Unknown world action',code:'unsupported_action'},{status:400});
    }
    if (requestUrl.pathname === '/internal/chat/broadcast' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userIds?: string[]; message?: unknown };
      const recipients = new Set(body.userIds ?? []);
      for (const socket of this.ctx.getWebSockets()) {
        const player = socket.deserializeAttachment() as Player | undefined;
        if (player?.userId && recipients.has(player.userId)) send(socket,body.message);
      }
      return Response.json({ok:true});
    }
    if (requestUrl.pathname === '/internal/relay' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userIds?: string[]; message?: unknown };
      await this.relayUsers(body.userIds ?? [],body.message);
      return Response.json({ok:true});
    }
    if (requestUrl.pathname === '/internal/party/chat' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { partyId?: string; userId?: string; message?: unknown };
      const state = await this.partyData();
      const party = body.partyId ? state.parties[body.partyId] : null;
      if (!party || !body.userId || !party.members.includes(body.userId)) return Response.json({error:'You are not in that party',code:'forbidden'},{status:403});
      await this.relayUsers(party.members,body.message);
      return Response.json({ok:true});
    }
    if (requestUrl.pathname === '/internal/party/presence-snapshot' && request.method === 'GET') {
      const state = await this.partyData();
      const counts = new Map<string,number>();
      for (const instanceId of Object.values(state.userInstances)) counts.set(instanceId,(counts.get(instanceId)??0)+1);
      const instances = [...counts.entries()].map(([id,count])=>({id,kind:id.startsWith('world:')?'world':'city',worldId:id.startsWith('world:')?id.slice(6):null,capacity:MAX_PLAYERS,count}));
      return Response.json({online:Object.values(state.userInstances).length,instances,cityCapacity:MAX_PLAYERS});
    }
    if (requestUrl.pathname === '/internal/party/state' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userId?: string };
      if (!body.userId) return new Response('userId required',{status:400});
      return Response.json(await this.partyState(body.userId));
    }
    if (requestUrl.pathname === '/internal/party/action' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userId?: string; action?: string; handle?: string; targetUserId?: string };
      if (!body.userId) return new Response('userId required',{status:400});
      const result = await this.partyAction(body.userId, body.action ?? '', body.handle, body.targetUserId);
      if ('error' in result) return Response.json({error:result.error,code:result.code},{status:result.status});
      return Response.json(result);
    }
    if (requestUrl.pathname === '/internal/party/presence' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userId?: string; instanceId?: string | null };
      if (!body.userId) return new Response('userId required',{status:400});
      const state = await this.partyData();
      if (body.instanceId) state.userInstances[body.userId] = body.instanceId;
      else delete state.userInstances[body.userId];
      await this.ctx.storage.put('party_state',state);
      return Response.json({ok:true});
    }
    if (requestUrl.pathname === '/internal/party/broadcast' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { notifyUserIds?: string[]; party?: unknown; invites?: unknown[] };
      const notify = new Set(body.notifyUserIds ?? []);
      for (const socket of this.ctx.getWebSockets()) {
        const player = socket.deserializeAttachment() as Player | undefined;
        if (player?.userId && notify.has(player.userId)) send(socket,{t:'party',party:body.party??null,invites:body.invites??[]});
      }
      return Response.json({ok:true});
    }
    if (requestUrl.pathname === '/internal/presence') {
      const players = this.players('city:main');
      return new Response(JSON.stringify({
        online: players.length,
        instances: [{ id: 'city:main', kind: 'city', worldId: null, capacity: MAX_PLAYERS, count: players.length }],
        cityCapacity: MAX_PLAYERS,
      }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const url = new URL(request.url);
    const instanceId = resolveInstance(url.searchParams.get('instance'));
    if (!instanceId) return new Response('Invalid instance', { status: 400 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as HibernatableWebSocket;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ instanceId, pending: true });
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  async webSocketMessage(ws: HibernatableWebSocket, raw: string | ArrayBuffer) {
    let message: Record<string, unknown>;
    try {
      const source = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      message = JSON.parse(source);
    } catch {
      error(ws, 'bad_json', 'Malformed message');
      return;
    }
    if (!message || typeof message !== 'object') {
      error(ws, 'bad_message', 'Malformed message');
      return;
    }

    const current = (ws.deserializeAttachment() ?? {}) as Partial<Player> & { pending?: boolean; instanceId?: string };
    if (current.pending) {
      if (message.t !== 'hello') {
        error(ws, 'unauthorized', 'Send hello first');
        return;
      }
      await this.join(ws, current.instanceId ?? 'city:main', String(message.token ?? ''), message.place);
      return;
    }

    const player = current as Player;
    switch (message.t) {
      case 'pose': {
        const now = Date.now();
        if (now - (player.lastPoseAt ?? 0) < 70) return;
        if (player.riding) {
          if (now - Number(player.transitStartedAt ?? now) > TRANSIT_MAX_RIDE_MS) {
            this.transit(ws, player, { action: 'exit' });
            return;
          }
          const next = this.riderPose(player, now);
          ws.serializeAttachment({ ...next, lastSeen: now, lastPoseAt: now });
          this.broadcastSnapshot(player.instanceId);
          return;
        }
        const next = {
          ...player,
          x: Number(message.x), y: Number(message.y), z: Number(message.z),
          yaw: Number(message.yaw), emote: String(message.emote ?? 'idle').slice(0, 24),
          location: String(message.location ?? 'world').slice(0, 24), lastSeen: now, lastPoseAt: now,
        };
        if (![next.x, next.y, next.z, next.yaw].every(Number.isFinite) ||
            Math.abs(next.x) > 10000 || Math.abs(next.y) > 10000 || Math.abs(next.z) > 10000) return;
        ws.serializeAttachment(next);
        this.broadcastSnapshot(next.instanceId);
        return;
      }
      case 'chat':
        await this.chat(ws, player, message);
        return;
      case 'transit':
        this.transit(ws, player, message);
        return;
      case 'party':
        await this.handleParty(ws, player, message);
        return;
      case 'ping':
        send(ws, { t: 'pong', at: Date.now() });
        return;
      case 'leave':
        ws.close(1000, 'left');
        return;
      case 'voice': {
        if (player.isGuest) { error(ws, 'forbidden', 'Guest visitors cannot use private voice signalling'); return; }
        const target = String(message.to ?? '');
        const peer = this.ctx.getWebSockets().find((candidate) => {
          const state = candidate.deserializeAttachment() as Player | undefined;
          return state?.connId === target && state.instanceId === player.instanceId;
        });
        if (peer) send(peer, { t: 'voice', from: { connId: player.connId, userId: player.userId, handle: player.handle, name: player.name }, kind: message.kind, data: message.data });
        return;
      }
      default:
        error(ws, 'unsupported_action', 'This realtime action is not migrated to the edge yet');
    }
  }

  private async join(ws: HibernatableWebSocket, instanceId: string, token: string, place: unknown) {
    const secret = this.env.LOFTLIFE_SESSION_SECRET ?? '';
    if (secret.length < 32 || !token) {
      error(ws, 'unauthorized', 'Sign in to play online');
      ws.close(1008, 'unauthorized');
      return;
    }
    const payload = await verifyAuthToken(token, secret);
    if (!payload || typeof payload.sid !== 'string') {
      error(ws, 'unauthorized', 'Session expired or invalid');
      ws.close(1008, 'unauthorized');
      return;
    }
    const sql = this.database();
    if (payload.kind === 'guest') {
      if (instanceId !== CITY_INSTANCE || (place && typeof place === 'object' && (place as {kind?:string}).kind === 'world')) {
        error(ws, 'forbidden', 'Guest sessions can only enter TheCity');
        ws.close(1008, 'guest_city_only');
        return;
      }
      const guestRows = await sql.query(
        'SELECT guest_id, display_name FROM ll_guest_sessions WHERE jti_hash=$1 AND guest_id=$2 AND expires_at>$3 LIMIT 1',
        [await sha256Hex(payload.sid), payload.sub, Date.now()]
      ) as Array<{guest_id:string;display_name:string}>;
      const guest = guestRows[0];
      if (!guest) {
        error(ws, 'unauthorized', 'Guest session expired or revoked');
        ws.close(1008, 'guest_expired');
        return;
      }
      const player: Player = {
        connId: crypto.randomUUID(), userId: guest.guest_id, handle: 'guest',
        name: guest.display_name, avatar: null, isGuest: true, instanceId,
        x: 0, y: 0, z: 0, yaw: 0, emote: 'idle', location: 'world',
        lastSeen: Date.now(), lastChatAt: 0, lastPoseAt: 0,
      };
      const active = this.players(instanceId);
      if (active.length >= MAX_PLAYERS) {
        error(ws, 'instance_full', 'TheCity is full');
        ws.close(1013, 'instance_full');
        return;
      }
      ws.serializeAttachment(player);
      send(ws, { t: 'ready', instance: { id: instanceId, kind: 'city', worldId: null, capacity: MAX_PLAYERS, count: active.length + 1 }, you: publicPlayer(player), players: active.map(publicPlayer) });
      this.broadcast(instanceId, { t: 'join', player: publicPlayer(player) }, ws);
      this.broadcastSnapshot(instanceId, true);
      return;
    }
    const sessionRows = await sql.query(
      'SELECT a.id, a.handle, a.display_name, a.role FROM ll_sessions s JOIN ll_accounts a ON a.id=s.account_id WHERE s.jti_hash=$1 AND s.account_id=$2 AND s.expires_at>$3 AND COALESCE(a.suspended_until,0)<=$4 LIMIT 1',
      [await sha256Hex(payload.sid), payload.sub, Date.now(), Date.now()]
    ) as Array<{ id: string; handle: string; display_name: string; role: string }>;
    const account = sessionRows[0];
    if (!account) {
      error(ws, 'unauthorized', 'Session expired or revoked');
      ws.close(1008, 'unauthorized');
      return;
    }

    let capacity = MAX_PLAYERS;
    if (instanceId.startsWith('world:')) {
      const worldId = instanceId.slice(6);
      const worlds = await sql.query('SELECT id, owner_id, access, status, max_visitors FROM ll_worlds WHERE id=$1 LIMIT 1', [worldId]) as Array<{ id: string; owner_id: string; access: string; status: string; max_visitors: number }>;
      const world = worlds[0];
      if (!world) {
        error(ws, 'not_found', 'That world no longer exists');
        ws.close(1008, 'world_not_found');
        return;
      }
      if (world.status === 'live') {
        const staffRows = await sql.query(
          "SELECT user_id FROM ll_world_collaborators WHERE world_id=$1 AND role IN ('co_owner','moderator')",
          [worldId]
        ) as Array<{user_id:string}>;
        const staffIds = new Set([world.owner_id,...staffRows.map(row=>row.user_id)]);
        const alreadyPresent = this.players(instanceId).some(player=>staffIds.has(player.userId));
        if (!alreadyPresent) {
          world.status = 'available';
          await sql.query("UPDATE ll_worlds SET status='available',published=FALSE,updated_at=$1 WHERE id=$2",[Date.now(),worldId]);
        }
      }
      const roleRows = world.owner_id === account.id
        ? [{role:'owner'}]
        : await sql.query('SELECT role FROM ll_world_collaborators WHERE world_id=$1 AND user_id=$2 LIMIT 1',[worldId,account.id]) as Array<{role:string}>;
      const role = roleRows[0]?.role ?? null;
      const canManage = role === 'owner' || role === 'co_owner';
      const canBuild = canManage || role === 'builder';
      const blocked = world.owner_id !== account.id
        ? await sql.query('SELECT 1 FROM ll_blocks WHERE user_id=$1 AND blocked_id=$2 LIMIT 1',[world.owner_id,account.id])
        : [];
      let allowed = false;
      if (!blocked.length) {
        if (world.status === 'live') allowed = true;
        else if (world.status === 'build_mode') allowed = canBuild;
        else if (world.status === 'offline') allowed = canManage;
        else if (world.status === 'available') {
          allowed = Boolean(role) || world.access === 'public';
          if (!allowed && world.access === 'friends') {
            const friendship = await sql.query("SELECT 1 FROM ll_friendships WHERE status='accepted' AND ((a=$1 AND b=$2) OR (a=$2 AND b=$1)) LIMIT 1",[account.id,world.owner_id]);
            allowed = friendship.length > 0;
          } else if (!allowed && world.access === 'invite') {
            const invite = await sql.query('SELECT 1 FROM ll_world_invites WHERE world_id=$1 AND user_id=$2 LIMIT 1',[worldId,account.id]);
            allowed = invite.length > 0;
          } else if (!allowed && world.access === 'collab') {
            const invite = await sql.query('SELECT 1 FROM ll_world_invites WHERE world_id=$1 AND user_id=$2 LIMIT 1',[worldId,account.id]);
            allowed = invite.length > 0;
          }
        }
      }
      if (!allowed) {
        error(ws, 'forbidden', 'This city is not currently available to your account');
        ws.close(1008, 'forbidden');
        return;
      }
    }

    const peers = this.ctx.getWebSockets();
    const active = peers.map((peer) => peer.deserializeAttachment() as Player | undefined).filter((p): p is Player => Boolean(p && p.instanceId === instanceId && !('pending' in (p as object))));
    if (active.length >= capacity) {
      error(ws, 'instance_full', 'This instance is full');
      ws.close(1013, 'instance_full');
      return;
    }
    const profiles = await sql.query('SELECT avatar_json FROM ll_profiles WHERE user_id=$1 LIMIT 1', [account.id]) as Array<{ avatar_json: string }>;
    let avatar: unknown = null;
    try { avatar = profiles[0]?.avatar_json ? JSON.parse(profiles[0].avatar_json) : null; } catch { avatar = null; }
    const player: Player = {
      connId: crypto.randomUUID(), userId: account.id, handle: account.handle,
      name: account.display_name || account.handle, avatar, instanceId,
      x: 0, y: 0, z: 0, yaw: 0, emote: 'idle', location: 'world',
      lastSeen: Date.now(), lastChatAt: 0, lastPoseAt: 0,
    };
    ws.serializeAttachment(player);
    await this.updatePartyPresence(account.id, instanceId);
    const players = this.players(instanceId);
    const existingPlayers = players.filter((entry) => entry.connId !== player.connId);
    send(ws, { t: 'ready', instance: { id: instanceId, kind: instanceId.startsWith('world:') ? 'world' : 'city', worldId: instanceId.startsWith('world:') ? instanceId.slice(6) : null, capacity, count: existingPlayers.length + 1 }, you: publicPlayer(player), players: existingPlayers });
    this.broadcast(instanceId, { t: 'join', player: publicPlayer(player) }, ws);
    this.broadcastSnapshot(instanceId, true);
    if (instanceId.startsWith('world:')) await this.syncWorldStatus(instanceId.slice(6));
  }

  private players(instanceId: string): Player[] {
    return this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as Player | undefined)
      .filter((p): p is Player => Boolean(p && p.instanceId === instanceId && p.userId));
  }
  private async syncWorldStatus(worldId: string, leavingConnId?: string) {
    const instanceId = `world:${worldId}`;
    const active = this.players(instanceId).filter(player => player.connId !== leavingConnId);
    const rows = await this.database().query('SELECT owner_id,status FROM ll_worlds WHERE id=$1 LIMIT 1',[worldId]) as Array<{owner_id:string;status:string}>;
    const world = rows[0];
    if (!world) return;
    let nextStatus = world.status;
    if (world.status === 'build_pending' && active.length === 0) {
      nextStatus = 'build_mode';
    } else if (world.status === 'live') {
      const staff = await this.database().query(
        "SELECT user_id,role FROM ll_world_collaborators WHERE world_id=$1 AND role IN ('co_owner','moderator')",
        [worldId]
      ) as Array<{user_id:string;role:string}>;
      const qualifying = new Set([world.owner_id,...staff.map(row=>row.user_id)]);
      if (!active.some(player => qualifying.has(player.userId))) nextStatus = 'available';
    }
    if (nextStatus !== world.status) {
      await this.database().query('UPDATE ll_worlds SET status=$1,published=$2,updated_at=$3 WHERE id=$4',[nextStatus,nextStatus==='live',Date.now(),worldId]);
      this.broadcast(instanceId,{t:'world_status',status:nextStatus,activeCount:active.length});
    }
  }
  private broadcast(instanceId: string, value: unknown, except?: HibernatableWebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const player = ws.deserializeAttachment() as Player | undefined;
      if (player?.instanceId === instanceId && player.userId) send(ws, value);
    }
  }
  private broadcastSnapshot(instanceId: string, force = false) {
    const now = Date.now();
    if (!force && now - this.lastSnapshotAt < 100) return;
    this.lastSnapshotAt = now;
    this.broadcast(instanceId, { t: 'snapshot', instanceId, at: now, players: this.players(instanceId).map(publicPlayer), vehicles: this.vehiclesFor(instanceId, now) });
  }
  private routePosition(line: typeof TRANSIT_LINES[number], startStop: number, elapsed: number) {
    const stops=line.stops, n=stops.length;
    const distance=(a:typeof stops[number],b:typeof stops[number])=>Math.hypot(b.x-a.x,b.z-a.z);
    const duration=stops.length*TRANSIT_DWELL_MS+stops.reduce((sum,stop,index)=>sum+(distance(stop,stops[(index+1)%n])/TRANSIT_SPEED)*1000,0);
    let remaining=Math.max(0,elapsed)%duration, heading=0;
    const start=stops[startStop%n];
    if(remaining<TRANSIT_DWELL_MS)return{x:start.x,z:start.z,heading,stopIndex:startStop%n,dwelling:true};
    remaining-=TRANSIT_DWELL_MS;
    for(let step=0;step<n;step++){
      const from=stops[(startStop+step)%n],to=stops[(startStop+step+1)%n];
      const dist=distance(from,to),segment=(dist/TRANSIT_SPEED)*1000;
      heading=Math.atan2(to.x-from.x,to.z-from.z);
      if(remaining<segment){
        const progress=segment===0?1:remaining/segment;
        return{x:from.x+(to.x-from.x)*progress,z:from.z+(to.z-from.z)*progress,heading,stopIndex:(startStop+step+1)%n,dwelling:false};
      }
      remaining-=segment;
      const arrived=(startStop+step+1)%n;
      if(remaining<TRANSIT_DWELL_MS)return{x:to.x,z:to.z,heading,stopIndex:arrived,dwelling:true};
      remaining-=TRANSIT_DWELL_MS;
    }
    return{x:start.x,z:start.z,heading,stopIndex:startStop%n,dwelling:true};
  }
  private riderPose(player: Player, now: number): Player {
    const line=TRANSIT_LINES.find(entry=>entry.id===player.transitLineId);
    if(!line||player.transitSeat==null||player.transitStartStop===undefined||player.transitStartedAt===undefined)return player;
    const route=this.routePosition(line,player.transitStartStop,now-player.transitStartedAt);
    const side=player.transitSeat%2===0?-1:1,row=Math.floor(player.transitSeat/2);
    const lateral=side*0.62,along=1.35-row*1.25;
    const forwardX=Math.sin(route.heading),forwardZ=Math.cos(route.heading);
    const rightX=Math.cos(route.heading),rightZ=-Math.sin(route.heading);
    return {...player,x:route.x+rightX*lateral+forwardX*along,y:0.34,z:route.z+rightZ*lateral+forwardZ*along,yaw:route.heading,location:'transit'};
  }
  private vehiclesFor(instanceId: string, now: number) {
    const riders=this.players(instanceId).filter(player=>Boolean(player.riding&&player.transitLineId));
    const groups=new Map<string,Player[]>();
    for(const rider of riders){
      const key=String(rider.riding);
      const group=groups.get(key)??[];
      group.push(rider);groups.set(key,group);
    }
    return [...groups.entries()].map(([id,group])=>{
      const first=group[0],line=TRANSIT_LINES.find(entry=>entry.id===first.transitLineId);
      if(!line||first.transitStartStop===undefined||first.transitStartedAt===undefined)return null;
      const route=this.routePosition(line,first.transitStartStop,now-first.transitStartedAt);
      return {id,lineId:line.id,label:line.label,kind:'bus',x:Math.round(route.x*100)/100,z:Math.round(route.z*100)/100,heading:Math.round(route.heading*1000)/1000,stopIndex:route.stopIndex,dwelling:route.dwelling,seats:TRANSIT_SEATS,riders:group.map(r=>({userId:r.userId,handle:r.handle,seat:r.transitSeat}))};
    }).filter(Boolean);
  }
  private transit(ws: HibernatableWebSocket, player: Player, message: Record<string, unknown>) {
    const action=String(message.action??'');
    if(action==='board'){
      const line=TRANSIT_LINES.find(entry=>entry.id===String(message.lineId??''));
      if(!line){error(ws,'not_found','Unknown transit line');return;}
      const stopIndex=line.stops.findIndex(stop=>stop.id===String(message.stopId??''));
      if(stopIndex<0){error(ws,'bad_request','Unknown transit stop');return;}
      if(player.riding){error(ws,'conflict','You are already riding transit');return;}
      if(player.location!=='world'){error(ws,'conflict','Walk to a transit stop first');return;}
      const stop=line.stops[stopIndex];
      if(Math.hypot(player.x-stop.x,player.z-stop.z)>TRANSIT_BOARD_RADIUS){error(ws,'bad_request','Walk closer to the stop to board');return;}
      const existing=this.players(player.instanceId).filter(r=>r.transitLineId===line.id&&r.riding);
      const startStop=existing[0]?.transitStartStop??stopIndex;
      const startedAt=existing[0]?.transitStartedAt??Date.now();
      const used=new Set(existing.map(r=>r.transitSeat));
      let seat=-1;for(let i=0;i<TRANSIT_SEATS;i++){if(!used.has(i)){seat=i;break;}}
      if(seat<0){error(ws,'conflict','This bus is full');return;}
      const vehicleId=`bus_${line.id}_${startedAt}`;
      const next=this.riderPose({...player,riding:vehicleId,transitLineId:line.id,transitSeat:seat,transitStartStop:startStop,transitStartedAt:startedAt},Date.now());
      ws.serializeAttachment(next);
      send(ws,{t:'transit',riding:{vehicleId,lineId:line.id,seat,label:line.label},vehicles:this.vehiclesFor(player.instanceId,Date.now())});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    if(action==='exit'){
      if(!player.riding){send(ws,{t:'transit',riding:null,vehicles:this.vehiclesFor(player.instanceId,Date.now())});return;}
      const line=TRANSIT_LINES.find(entry=>entry.id===player.transitLineId);
      const route=line&&player.transitStartStop!==undefined&&player.transitStartedAt!==undefined
        ? this.routePosition(line,player.transitStartStop,Date.now()-player.transitStartedAt)
        : {x:player.x,z:player.z,heading:player.yaw};
      const next:Player={...player,x:route.x,y:0,z:route.z,yaw:route.heading,location:'world',riding:null,transitLineId:null,transitSeat:null,transitStartStop:undefined,transitStartedAt:undefined,lastSeen:Date.now()};
      ws.serializeAttachment(next);
      send(ws,{t:'transit',riding:null,exited:{x:route.x,z:route.z,lineId:line?.id??null,label:line?.label??null},vehicles:this.vehiclesFor(player.instanceId,Date.now())});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    error(ws,'bad_request','Unknown transit action');
  }
  private async relayUsers(userIds:string[],message:unknown) {
    if(!this.env.REALTIME||!userIds.length)return;
    const state=await this.partyData();
    const instances=[...new Set(userIds.map(id=>state.userInstances[id]).filter((value):value is string=>Boolean(value)))];
    await Promise.all(instances.map(instanceId=>this.env.REALTIME!.get(this.env.REALTIME!.idFromName(instanceId)).fetch(new Request('https://loftlife-internal/internal/chat/broadcast',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userIds,message}),
    }))));
  }
  private async updatePartyPresence(userId:string,instanceId:string|null) {
    const namespace=this.env.REALTIME;
    if(!namespace)return;
    await namespace.get(namespace.idFromName('party:global')).fetch(new Request('https://loftlife-internal/internal/party/presence',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId,instanceId}),
    }));
  }
    private async partyData(): Promise<{ parties: Record<string,{id:string;leaderId:string;members:string[];invites:string[];createdAt:number}>; memberParty: Record<string,string>; userInstances: Record<string,string> }> {
    return (await this.ctx.storage.get<{ parties: Record<string,{id:string;leaderId:string;members:string[];invites:string[];createdAt:number}>; memberParty: Record<string,string>; userInstances: Record<string,string> }>('party_state')) ?? { parties: {}, memberParty: {}, userInstances: {} };
  }
  private async partyView(party: {id:string;leaderId:string;members:string[];invites:string[];createdAt:number} | null) {
    if (!party) return null;
    const ids=[...new Set([...party.members,...party.invites])];
    const rows=ids.length ? await this.database().query(
      'SELECT a.id,a.handle,COALESCE(p.display_name,a.handle) AS display_name FROM ll_accounts a LEFT JOIN ll_profiles p ON p.user_id=a.id WHERE a.id = ANY($1::text[])',
      [ids]
    ) as Array<{id:string;handle:string;display_name:string}> : [];
    const cards=new Map(rows.map(row=>[row.id,{userId:row.id,handle:row.handle,displayName:row.display_name}]));
    return {id:party.id,leaderId:party.leaderId,members:party.members.map(id=>cards.get(id)).filter(Boolean),invites:party.invites.map(id=>cards.get(id)).filter(Boolean),maxMembers:8,createdAt:party.createdAt};
  }
  private async partyState(userId: string) {
    const state=await this.partyData();
    const currentId=state.memberParty[userId];
    const current=currentId?state.parties[currentId]??null:null;
    const pending=Object.values(state.parties).filter(party=>party.invites.includes(userId)).sort((a,b)=>b.createdAt-a.createdAt);
    return {party:await this.partyView(current),invites:await Promise.all(pending.map(party=>this.partyView(party)))};
  }
  private async partyAction(userId:string,action:string,handle?:string,targetUserId?:string) {
    const state=await this.partyData();
    const oldId=state.memberParty[userId];
    const oldParty=oldId?state.parties[oldId]??null:null;
    const notify=new Set<string>(oldParty?[...oldParty.members,...oldParty.invites]:[userId]);
    const conflict=(message:string)=>({error:message,code:'conflict',status:409});
    const bad=(message:string)=>({error:message,code:'bad_request',status:400});
    const forbidden=(message:string)=>({error:message,code:'forbidden',status:403});
    const missing=(message:string)=>({error:message,code:'not_found',status:404});
    if(action==='create'){
      if(oldParty)return conflict('You are already in a party');
      const party={id:`party_${crypto.randomUUID()}`,leaderId:userId,members:[userId],invites:[],createdAt:Date.now()};
      state.parties[party.id]=party;state.memberParty[userId]=party.id;notify.add(userId);
    } else if(action==='invite'){
      if(!oldParty)return bad('Create or join a party first');
      const cleaned=String(handle??'').trim().replace(/^@/,'').toLowerCase();
      if(!cleaned)return bad('A player handle is required');
      const targets=await this.database().query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[cleaned]) as Array<{id:string}>;
      if(!targets[0])return missing('No player with that handle');
      const target=targets[0].id;
      if(target===userId)return bad('You are already in this party');
      if(oldParty.members.includes(target))return conflict('That player is already in your party');
      if(oldParty.members.length>=8)return conflict('This party is full');
      const blocked=await this.database().query('SELECT 1 FROM ll_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1) LIMIT 1',[userId,target]);
      if(blocked.length)return forbidden('You cannot invite this player');
      if(!oldParty.invites.includes(target))oldParty.invites.push(target);
      notify.add(target);
    } else if(action==='accept'||action==='join'){
      if(oldParty)return conflict('Leave your current party first');
      const pending=Object.values(state.parties).filter(party=>party.invites.includes(userId)).sort((a,b)=>b.createdAt-a.createdAt);
      const party=pending[0];
      if(!party)return missing('No pending party invitation');
      if(party.members.length>=8)return conflict('That party is full');
      party.invites=party.invites.filter(id=>id!==userId);party.members.push(userId);state.memberParty[userId]=party.id;
      for(const id of [...party.members,...party.invites])notify.add(id);
    } else if(action==='leave'){
      if(!oldParty)return {party:null,invites:[],notifyUserIds:[userId]};
      oldParty.members=oldParty.members.filter(id=>id!==userId);oldParty.invites=oldParty.invites.filter(id=>id!==userId);delete state.memberParty[userId];
      if(!oldParty.members.length)delete state.parties[oldParty.id];
      else if(oldParty.leaderId===userId)oldParty.leaderId=oldParty.members[0];
    } else if(action==='kick'){
      if(!oldParty)return bad('You are not in a party');
      if(oldParty.leaderId!==userId)return forbidden('Only the party leader can remove members');
      const target=String(targetUserId??'');
      if(target===userId)return bad('Leaders leave the party instead of kicking themselves');
      if(!oldParty.members.includes(target))return missing('That player is not in your party');
      oldParty.members=oldParty.members.filter(id=>id!==target);delete state.memberParty[target];notify.add(target);
    } else return bad('Unknown party action');
    await this.ctx.storage.put('party_state',state);
    const snapshot=await this.partyState(userId);
    for(const id of snapshot.party?.members.map(member=>member?.userId).filter((id):id is string=>Boolean(id))??[])notify.add(id);
    for(const party of snapshot.invites)for(const member of party?.invites??[])if(member?.userId)notify.add(member.userId);
    const notifyUserIds=[...notify];
    const payload={...snapshot,notifyUserIds};
    if(this.env.REALTIME){
      const targets=[...new Set(notifyUserIds.map(id=>state.userInstances[id]).filter((value):value is string=>Boolean(value)))];
      await Promise.all(targets.map(instanceId=>this.env.REALTIME!.get(this.env.REALTIME!.idFromName(instanceId)).fetch(new Request('https://loftlife-internal/internal/party/broadcast',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),
      }))));
    }
    return payload;
  }
  private async handleParty(ws:HibernatableWebSocket,player:Player,message:Record<string,unknown>) {
    if (player.isGuest) { error(ws, 'forbidden', 'Guest visitors cannot use parties'); return; }
    const namespace=this.env.REALTIME;
    if(!namespace){error(ws,'party_unavailable','Party service is not configured');return;}
    const id=namespace.idFromName('party:global');
    const response=await namespace.get(id).fetch(new Request('https://loftlife-internal/internal/party/action',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({userId:player.userId,action:String(message.action??''),handle:message.handle,targetUserId:message.userId}),
    }));
    const result=await response.json() as {error?:string;code?:string;party?:unknown;invites?:unknown[];notifyUserIds?:string[]};
    if(!response.ok){error(ws,result.code??'party_error',result.error??'Party action failed');return;}
  }

  /** Respect the recipient's "messages from friends only" preference. */
  private async dmAllowed(senderId: string, targetId: string): Promise<boolean> {
    try {
      const settings = await settingsFor(this.database(), targetId);
      if (settings.privacy.messages !== 'friends') return true;
      const friends = await this.database().query(
        "SELECT 1 FROM ll_friendships WHERE status='accepted' AND ((a=$1 AND b=$2) OR (a=$2 AND b=$1)) LIMIT 1",
        [senderId, targetId]
      );
      return friends.length > 0;
    } catch {
      return true;
    }
  }

  private async chat(ws: HibernatableWebSocket, player: Player, message: Record<string, unknown>) {
    const body = typeof message.body === 'string' ? message.body.trim().slice(0, MAX_CHAT_LENGTH) : '';
    if (!body) return;
    const now = Date.now();
    if (now - player.lastChatAt < 700) {
      error(ws, 'rate_limited', 'Slow down before sending another message');
      return;
    }
    const scope = String(message.scope ?? 'city');
    if (!['city','world','local','dm','party'].includes(scope)) {
      error(ws,'unsupported_scope','Unknown chat scope');
      return;
    }
    if (player.isGuest && !['city','local'].includes(scope)) {
      error(ws, 'forbidden', 'Guest visitors can only use public city and nearby chat');
      return;
    }
    const world = player.instanceId.startsWith('world:');
    let dbScope = scope === 'local' ? 'local' : world ? 'world' : 'city';
    let scopeId = world ? player.instanceId.slice(6) : 'main';
    let recipients: string[] = [];
    let to: {userId:string;handle:string}|undefined;
    let partyId: string|undefined;
    if (scope === 'dm') {
      const handle=String(message.to??'').replace(/^@/,'').trim().toLowerCase();
      if(!handle){error(ws,'bad_request','A recipient handle is required');return;}
      const rows=await this.database().query('SELECT id,handle FROM ll_accounts WHERE handle=$1 LIMIT 1',[handle]) as Array<{id:string;handle:string}>;
      if(!rows[0]){error(ws,'not_found','No player with that handle');return;}
      if(!(await this.dmAllowed(player.userId,rows[0].id))){error(ws,'forbidden','This player only accepts messages from friends');return;}
      const target=rows[0];
      if(target.id===player.userId){error(ws,'bad_request','You cannot message yourself');return;}
      const blocked=await this.database().query('SELECT 1 FROM ll_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1) LIMIT 1',[player.userId,target.id]);
      if(blocked.length){error(ws,'forbidden','This conversation is unavailable');return;}
      const [a,b]=player.userId<target.id?[player.userId,target.id]:[target.id,player.userId];
      dbScope='dm';scopeId=`${a}|${b}`;recipients=[player.userId,target.id];to={userId:target.id,handle:target.handle};
    } else if (scope === 'party') {
      const namespace=this.env.REALTIME;
      if(!namespace){error(ws,'party_unavailable','Party service is not configured');return;}
      const response=await namespace.get(namespace.idFromName('party:global')).fetch(new Request('https://loftlife-internal/internal/party/state',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:player.userId}),
      }));
      const state=await response.json() as {party?:{id:string;members:Array<{userId:string}>}};
      if(!state.party){error(ws,'not_in_party','Join a party before using party chat');return;}
      if(message.scopeId&&message.scopeId!==state.party.id){error(ws,'forbidden','You are not in that party');return;}
      dbScope='party';scopeId=state.party.id;partyId=state.party.id;recipients=state.party.members.map(member=>member.userId);
    }
    const id=crypto.randomUUID();
    if (!player.isGuest && scope !== 'local') {
      await this.database().query(
        'INSERT INTO ll_chat_messages (id, scope, scope_id, user_id, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [id,dbScope,scopeId,player.userId,body,now]
      );
    }
    const mode=String(message.mode??'say');
    const event={t:'chat',scope,mode,body,from:{userId:player.userId,handle:player.handle,displayName:player.isGuest ? `Guest User - ${player.name}` : player.name,isGuest:Boolean(player.isGuest)},to,at:now,id,scopeId};
    if(scope==='local'){
      const range=mode==='whisper'?6:mode==='shout'?60:24;
      for(const peer of this.ctx.getWebSockets()){
        const other=peer.deserializeAttachment() as Player|undefined;
        if(other?.instanceId===player.instanceId&&Math.hypot(other.x-player.x,other.z-player.z)<=range)send(peer,{...event,range});
      }
    } else if(scope==='dm'||scope==='party'){
      const namespace=this.env.REALTIME;
      if(namespace){
        const endpoint=scope==='party'?'/internal/party/chat':'/internal/relay';
        const payload=scope==='party'?{partyId,userId:player.userId,message:event}:{userIds:recipients,message:event};
        const response=await namespace.get(namespace.idFromName('party:global')).fetch(new Request(`https://loftlife-internal${endpoint}`,{
          method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),
        }));
        if(!response.ok){error(ws,'chat_delivery_failed','Message could not be delivered');return;}
      }
    } else this.broadcast(player.instanceId,event);
    ws.serializeAttachment({...player,lastChatAt:now});
  }

  async webSocketClose(ws: HibernatableWebSocket, code: number, reason: string) {
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) ws.close(code, reason);
    else ws.close();
    const player = ws.deserializeAttachment() as Player | undefined;
    if (player?.userId) {
      if (!player.isGuest) await this.updatePartyPresence(player.userId, null);
      this.broadcast(player.instanceId, { t: 'leave', connId: player.connId }, ws);
      this.broadcastSnapshot(player.instanceId, true);
      if (player.instanceId.startsWith('world:')) await this.syncWorldStatus(player.instanceId.slice(6),player.connId);
    }
  }
  async webSocketError(ws: HibernatableWebSocket) {
    const player = ws.deserializeAttachment() as Player | undefined;
    if (player?.userId) {
      if (!player.isGuest) await this.updatePartyPresence(player.userId, null);
      this.broadcast(player.instanceId, { t: 'leave', connId: player.connId }, ws);
      if (player.instanceId.startsWith('world:')) await this.syncWorldStatus(player.instanceId.slice(6),player.connId);
    }
  }
}
