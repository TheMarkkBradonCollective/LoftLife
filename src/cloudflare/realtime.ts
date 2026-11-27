import { neon } from '@neondatabase/serverless';
import { sha256Hex, verifyAuthToken } from '../../shared/auth-core.mjs';
import { CITY_INSTANCE, resolveInstance } from '../../shared/instance.mjs';
import { settingsFor } from './platform';
import {
  CITY_TRAVEL_DESTINATIONS,
  TAXI_DESTINATIONS,
  TAXI_SEATS,
  TAXI_SPEED,
  TRANSIT_HUBS,
  TRANSIT_LINES,
  pathLength,
  pathPointAt,
  taxiLoopPoint,
  taxiPath,
} from './transit';
import type { TravelDestination } from './transit';
import { permission } from './worlds';
import {
  DOORBELL_REASON_TEXT,
  DOORBELL_TIMEOUT_MS,
  doorbellAvailability,
  isDoorbellRoomNumber,
} from '../../shared/doorbell-rules.mjs';

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
  positioned?: boolean; teleportStrikes?: number; sessionExpiresAt?: number; joinedAt?: number;
  voice?: boolean; voiceMode?: 'whisper' | 'say' | 'shout'; voiceBudget?: number[];
  connectedAt?: number; departed?: boolean;
  riding?: string | null; transitLineId?: string | null; transitSeat?: number | null;
  transitStartStop?: number; transitStartedAt?: number;
  taxiId?: string; taxiSeat?: number; taxiBoardedAt?: number;
  taxiX?: number; taxiZ?: number; taxiHeading?: number;
  taxiPath?: Array<{ x: number; z: number }>; taxiStartedAt?: number; taxiDurationMs?: number;
  taxiDestinationId?: string; taxiDestinationLabel?: string;
  taxiArrival?: { x: number; z: number };
  journey?: {
    id: string;
    mode: 'rail' | 'air';
    phase: 'boarding' | 'enroute' | 'arrived';
    destination: TravelDestination;
    startedAt: number;
    departAt: number;
    arriveAt: number;
    vehicleId: string;
    label: string;
  };
};
const MAX_PLAYERS = 64;
const MAX_CHAT_LENGTH = 280;
// The walkable city reaches x≈632 / z≈447 at the airport.
const MAX_CITY_COORD = 1500;
const MAX_SPEED = 12; // m/s; sprint is 10.5, the remainder is lag slack
const MAX_STEP = 2.5; // metres of slack for one pose message
// Placement is accepted without the speed check right after joining, because
// the client scene reports its spawn a moment after the socket connects.
const SPAWN_GRACE_MS = 5_000;
const IDLE_TIMEOUT_MS = 90_000;
const SESSION_SWEEP_MS = 15_000;
const PENDING_CONNECTION_MS = 15_000;
const TRANSIT_SPEED = 9;
const TRANSIT_DWELL_MS = 4500;
const TRANSIT_SEATS = 6;
const TRANSIT_BOARD_RADIUS = 10;
const TRANSIT_MAX_RIDE_MS = 180000;
const encoder = new TextEncoder();

function send(ws: WebSocket, value: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
}
function guestAvatarFromMessage(value: unknown, name: string): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const keys = ['name','skinTone','bodyPreset','height','build','faceShape','eyeShape','facialDetail','hairStyle','hairColor','topStyle','topColor','bottomStyle','bottomColor','shoeColor','accessory','jewelry','carry','facialHair','eyebrows','eyeStyle','makeupStyle'];
  const avatar: Record<string, string> = {};
  for (const key of keys) {
    const field = source[key];
    if (typeof field !== 'string' || field.length > 64) continue;
    if ((key.toLowerCase().includes('color') || key === 'skinTone') && !/^#[0-9a-f]{6}$/i.test(field)) continue;
    avatar[key] = field;
  }
  const required = ['skinTone','hairStyle','hairColor','topStyle','topColor','bottomColor','shoeColor','accessory'];
  if (!required.every((key) => typeof avatar[key] === 'string')) return null;
  avatar.name = (avatar.name || name).slice(0, 32);
  return avatar;
}

function publicPlayer(p: Player) {
  return {
    connId: p.connId, userId: p.userId, handle: p.handle,
    name: p.isGuest ? `Guest User - ${p.name}` : p.name, displayName: p.name, isGuest: Boolean(p.isGuest),
    avatar: p.avatar, x: p.x, y: p.y, z: p.z, yaw: p.yaw,
    emote: p.emote, location: p.location, riding: p.riding ?? null,
    voice: Boolean(p.voice), voiceMode: p.voiceMode ?? 'say',
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
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    setAlarm?(scheduledTime: number): Promise<void> | void;
    getAlarm?(): Promise<number | null> | number | null;
  };
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
        // Nobody can shut down a live world while players remain inside.
        if (String(world.status) === 'live' && status !== 'live' && active.length > 0) {
          return Response.json({error:'Nobody can shut down a live world while players are still inside',code:'players_present'},{status:409});
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
      if (!this.env.REALTIME) return Response.json({ online: 0, instances: [], cityCapacity: MAX_PLAYERS });
      const state = await this.partyData();
      const url = new URL(request.url);
      const includeDetails = url.searchParams.get('details') === '1';
      const instanceIds = [...new Set(['city:main', ...Object.values(state.userInstances)])].filter(id => id !== 'party:global');
      const snapshots = await Promise.all(instanceIds.map(async (instanceId) => {
        const target = new URL('https://loftlife-internal/internal/presence');
        target.searchParams.set('instanceId', instanceId);
        if (includeDetails) target.searchParams.set('details', '1');
        const response = await this.env.REALTIME!.get(this.env.REALTIME!.idFromName(instanceId)).fetch(new Request(target));
        if (!response.ok) return null;
        return await response.json() as { online: number; instances: Array<{id:string;kind:string;worldId:string|null;capacity:number;count:number}>; userIds: string[]; players?: Array<Record<string,unknown>> };
      }));
      const active = snapshots.filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
      const actualPresence: Record<string,string> = {};
      for (const snapshot of active) for (const userId of snapshot.userIds) {
        const instance = snapshot.instances[0];
        if (instance) actualPresence[userId] = instance.id;
      }
      const liveInstances = active.flatMap(snapshot => snapshot.instances).map((instance) => ({
        ...instance, count: Object.values(actualPresence).filter((id) => id === instance.id).length,
      })).filter((instance) => instance.count > 0);
      state.userInstances = actualPresence;
      await this.ctx.storage.put('party_state', state);
      const uniquePlayers = new Map<string,Record<string,unknown>>();
      if (includeDetails) for (const snapshot of active) for (const player of snapshot.players ?? []) uniquePlayers.set(String(player.userId), player);
      const result: Record<string,unknown> = { online: Object.keys(actualPresence).length, instances: liveInstances, cityCapacity: MAX_PLAYERS, updatedAt: Date.now() };
      if (includeDetails) result.players = [...uniquePlayers.values()];
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    }
    if (requestUrl.pathname === '/internal/party/instance-of' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { userId?: string };
      if (!body.userId) return new Response('userId required',{status:400});
      const state = await this.partyData();
      return Response.json({ instanceId: state.userInstances[body.userId] ?? null });
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
      const body = await request.json().catch(() => ({})) as { userId?: string; instanceId?: string | null; expectedInstanceId?: string };
      if (!body.userId) return new Response('userId required',{status:400});
      const state = await this.partyData();
      if (body.instanceId) state.userInstances[body.userId] = body.instanceId;
      else if (!body.expectedInstanceId || state.userInstances[body.userId] === body.expectedInstanceId) delete state.userInstances[body.userId];
      await this.ctx.storage.put('party_state',state);
      return Response.json({ok:true});
    }
    if (requestUrl.pathname === '/internal/party/broadcast' && request.method === 'POST') {
      // Each recipient gets their *own* party view: an invitee must see the
      // invitation, not the inviter's current party.
      const body = await request.json().catch(() => ({})) as { updates?: Array<{ userId?: string; party?: unknown; invites?: unknown[] }> };
      const updates = new Map((body.updates ?? []).filter((entry) => entry?.userId).map((entry) => [String(entry.userId), entry]));
      for (const socket of this.ctx.getWebSockets()) {
        const player = socket.deserializeAttachment() as Player | undefined;
        const update = player?.userId ? updates.get(player.userId) : undefined;
        if (update) send(socket, { t: 'party', party: update.party ?? null, invites: update.invites ?? [] });
      }
      return Response.json({ok:true});
    }
    if (requestUrl.pathname === '/internal/presence') {
      const url = new URL(request.url);
      const instanceId = url.searchParams.get('instanceId') ?? 'city:main';
      const players = this.players(instanceId);
      const result: Record<string, unknown> = {
        online: players.length,
        instances: [{ id: instanceId, kind: instanceId.startsWith('world:') ? 'world' : 'city', worldId: instanceId.startsWith('world:') ? instanceId.slice(6) : null, capacity: MAX_PLAYERS, count: players.length }],
        cityCapacity: MAX_PLAYERS, userIds: players.map((player) => player.userId),
      };
      if (url.searchParams.get('details') === '1') result.players = players.map((player) => ({
        userId: player.userId, handle: player.handle, name: player.isGuest ? 'Guest User - ' + player.name : player.name,
        isGuest: Boolean(player.isGuest), instanceId: player.instanceId, location: player.location,
        connectedAt: Number(player.connectedAt ?? player.lastSeen), lastSeen: Number(player.lastSeen),
      }));
      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
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
    server.serializeAttachment({ instanceId, pending: true, pendingSince: Date.now() });
    this.scheduleSweep();
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
      await this.join(ws, current.instanceId ?? 'city:main', String(message.token ?? ''), message.place, message.avatar);
      return;
    }

    const player = current as Player;
    // Any traffic keeps presence alive; the idle sweep reads this value.
    player.lastSeen = Date.now();
    ws.serializeAttachment(player);
    switch (message.t) {
      case 'pose': {
        const now = Date.now();
        if (now - (player.lastPoseAt ?? 0) < 70) return;
        if (player.journey) {
          this.advanceJourney(ws, player, now);
          return;
        }
        if (player.taxiId) {
          this.taxiTick(ws, player, now);
          return;
        }
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
        const raw = {
          x: Number(message.x), y: Number(message.y), z: Number(message.z), yaw: Number(message.yaw),
        };
        if (![raw.x, raw.y, raw.z, raw.yaw].every(Number.isFinite)) return;
        const next: Player = {
          ...player,
          x: Math.max(-MAX_CITY_COORD, Math.min(MAX_CITY_COORD, raw.x)),
          y: Math.max(-3, Math.min(3, raw.y)),
          z: Math.max(-MAX_CITY_COORD, Math.min(MAX_CITY_COORD, raw.z)),
          yaw: raw.yaw,
          emote: String(message.emote ?? 'idle').slice(0, 24),
          location: String(message.location ?? 'world').slice(0, 24),
          lastSeen: now, lastPoseAt: now,
          voice: !player.isGuest && message.voice === true,
          voiceMode: message.voiceMode === 'whisper' || message.voiceMode === 'shout' || message.voiceMode === 'say'
            ? message.voiceMode
            : (player.voiceMode ?? 'say'),
        };
        if (!player.positioned || now - Number(player.joinedAt ?? 0) < SPAWN_GRACE_MS) {
          // The client owns its spawn point (TheCity arrival is at the airport,
          // far from the origin); placement only has to be inside the map.
          next.positioned = true;
          next.teleportStrikes = 0;
        } else {
          const elapsed = Math.max(1, Math.min(2_000, now - Number(player.lastPoseAt ?? now)));
          const allowed = Math.max(MAX_STEP, (MAX_SPEED * elapsed) / 1_000 + 0.75);
          const jump = Math.hypot(next.x - player.x, next.z - player.z);
          if (jump > allowed) {
            const strikes = Number(player.teleportStrikes ?? 0) + 1;
            if (strikes > 12) {
              error(ws, 'kicked', 'Movement rejected by the server');
              ws.close(4002, 'movement');
              return;
            }
            ws.serializeAttachment({ ...player, teleportStrikes: strikes, lastPoseAt: now, lastSeen: now });
            return;
          }
          next.teleportStrikes = Math.max(0, Number(player.teleportStrikes ?? 0) - 1);
        }
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
      case 'travel':
        void this.travel(ws, player, message);
        return;
      case 'party':
        await this.handleParty(ws, player, message);
        return;
      case 'hotel':
        await this.hotel(ws, player, message);
        return;
      case 'joinFriend': {
        if (player.isGuest) { error(ws, 'forbidden', 'Guest visitors cannot join friends'); return; }
        const handle = String(message.handle ?? '').trim().replace(/^@/, '').toLowerCase();
        if (!handle) { error(ws, 'bad_request', 'A player handle is required'); return; }
        const rows = await this.database().query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1', [handle]) as Array<{ id: string }>;
        if (!rows[0]) { error(ws, 'not_found', 'No player with that handle'); return; }
        await this.relocateToUser(ws, player, rows[0].id);
        return;
      }
      case 'ping':
        send(ws, { t: 'pong', at: Date.now() });
        return;
      case 'leave':
        ws.close(1000, 'left');
        return;
      case 'voice': {
        if (player.isGuest) { error(ws, 'forbidden', 'Guest visitors cannot use private voice signalling'); return; }
        if (!player.voice) return;
        const kind = String(message.kind ?? '');
        if (!['offer', 'answer', 'ice'].includes(kind)) { error(ws, 'bad_request', 'Unknown voice signal'); return; }
        const now = Date.now();
        const budget = (player.voiceBudget ?? []).filter((at) => now - at < 10_000);
        if (budget.length >= 250) { error(ws, 'rate_limited', 'Voice signalling rate limited'); return; }
        budget.push(now);
        const target = String(message.to ?? '');
        const peer = this.ctx.getWebSockets().find((candidate) => {
          const state = candidate.deserializeAttachment() as Player | undefined;
          return state?.connId === target && state.instanceId === player.instanceId &&
            state.userId !== player.userId && state.voice === true && !state.isGuest;
        });
        if (!peer) return;
        ws.serializeAttachment({ ...player, voiceBudget: budget });
        send(peer, { t: 'voice', from: { connId: player.connId, userId: player.userId, handle: player.handle, name: player.name }, kind, data: message.data ?? null });
        return;
      }
      default:
        error(ws, 'unsupported_action', 'This realtime action is not migrated to the edge yet');
    }
  }

  private async join(ws: HibernatableWebSocket, instanceId: string, token: string, place: unknown, guestAvatar?: unknown) {
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
        name: guest.display_name, avatar: guestAvatarFromMessage(guestAvatar, guest.display_name), isGuest: true,
        x: 0, y: 0, z: 0, yaw: 0, emote: 'idle', location: 'world', voice: false, voiceMode: 'say',
        connectedAt: Date.now(), lastSeen: Date.now(), lastChatAt: 0, lastPoseAt: 0,
        positioned: false, teleportStrikes: 0, sessionExpiresAt: Number(payload.exp) * 1000,
        joinedAt: Date.now(),
      };
      const active = this.players(instanceId);
      if (active.length >= MAX_PLAYERS && !active.some((entry) => entry.userId === player.userId)) {
        error(ws, 'instance_full', 'TheCity is full');
        ws.close(1013, 'instance_full');
        return;
      }
      const existingPlayers = active.filter((entry) => entry.userId !== player.userId);
      ws.serializeAttachment(player);
      await this.replaceDuplicateConnections(ws, player);
      send(ws, { t: 'ready', instance: { id: instanceId, kind: 'city', worldId: null, capacity: MAX_PLAYERS, count: existingPlayers.length + 1 }, you: publicPlayer(player), players: existingPlayers.map(publicPlayer) });
      this.broadcast(instanceId, { t: 'join', player: publicPlayer(player) }, ws);
      this.broadcastSnapshot(instanceId, true);
      this.scheduleSweep();
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

    const active = this.players(instanceId);
    if (active.length >= capacity && !active.some((entry) => entry.userId === account.id)) {
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
      x: 0, y: 0, z: 0, yaw: 0, emote: 'idle', location: 'world', voice: false, voiceMode: 'say',
      lastSeen: Date.now(), lastChatAt: 0, lastPoseAt: 0,
      positioned: false, teleportStrikes: 0, sessionExpiresAt: Number(payload.exp) * 1000,
      joinedAt: Date.now(),
    };
    ws.serializeAttachment(player);
    await this.replaceDuplicateConnections(ws, player);
    await this.updatePartyPresence(account.id, instanceId);
    const players = this.players(instanceId);
    const existingPlayers = players.filter((entry) => entry.connId !== player.connId);
    send(ws, { t: 'ready', instance: { id: instanceId, kind: instanceId.startsWith('world:') ? 'world' : 'city', worldId: instanceId.startsWith('world:') ? instanceId.slice(6) : null, capacity, count: existingPlayers.length + 1 }, you: publicPlayer(player), players: existingPlayers });
    this.broadcast(instanceId, { t: 'join', player: publicPlayer(player) }, ws);
    this.broadcastSnapshot(instanceId, true);
    this.scheduleSweep();
    if (instanceId.startsWith('world:')) await this.syncWorldStatus(instanceId.slice(6));
  }

  private hotelRequests = new Map<
    string,
    {
      id: string;
      ownerId: string;
      visitorId: string;
      roomNumber: string;
      expiresAt: number;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();

  private socketFor(userId: string): HibernatableWebSocket | null {
    for (const socket of this.ctx.getWebSockets()) {
      const state = socket.deserializeAttachment() as Player | undefined;
      if (state?.userId === userId && !state.departed && socket.readyState === WebSocket.OPEN) {
        return socket;
      }
    }
    return null;
  }

  private async suiteRow(roomNumber: string) {
    const rows = await this.database().query(
      `SELECT s.owner_id, s.number, s.floor, s.name, s.items_json, s.surfaces_json, s.mood,
              a.display_name, p.avatar_json
         FROM ll_suites s
         JOIN ll_accounts a ON a.id = s.owner_id
         LEFT JOIN ll_profiles p ON p.user_id = s.owner_id
        WHERE s.number = $1
        LIMIT 1`,
      [roomNumber]
    ) as Array<{
      owner_id: string;
      number: string;
      floor: number | string;
      name: string;
      items_json: string;
      surfaces_json: string;
      mood: string;
      display_name: string | null;
      avatar_json: string | null;
    }>;
    return rows[0] ?? null;
  }

  private suiteVisitPayload(suite: Awaited<ReturnType<LoftLifeRealtime['suiteRow']>>) {
    if (!suite) return null;
    let avatar: unknown = null;
    try {
      avatar = suite.avatar_json ? JSON.parse(suite.avatar_json) : null;
    } catch {
      avatar = null;
    }
    return {
      userId: suite.owner_id,
      name: suite.display_name ?? 'Resident',
      roomNumber: suite.number,
      floor: Number(suite.floor),
      avatar,
      items: JSON.parse(suite.items_json ?? '[]'),
      surfaces: JSON.parse(suite.surfaces_json ?? '{}'),
      mood: suite.mood ?? 'morning',
    };
  }

  private closeDoorbell(
    requestId: string,
    visitorPayload: unknown,
    ownerPayload: unknown
  ) {
    const request = this.hotelRequests.get(requestId);
    if (!request) return;
    this.hotelRequests.delete(requestId);
    if (request.timer) clearTimeout(request.timer);
    const visitor = this.socketFor(request.visitorId);
    const owner = this.socketFor(request.ownerId);
    if (visitor) send(visitor, visitorPayload);
    if (owner) send(owner, ownerPayload);
  }

  /** Owner-gated suite doorbells; the owner must be online and in the suite. */
  private async hotel(
    ws: HibernatableWebSocket,
    player: Player,
    message: Record<string, unknown>
  ) {
    const action = String(message.action ?? '');
    if (action === 'respond') {
      const requestId = String(message.requestId ?? '');
      const request = this.hotelRequests.get(requestId);
      if (!request) return;
      if (request.ownerId !== player.userId) {
        error(ws, 'forbidden', 'Only the suite owner can answer that doorbell');
        return;
      }
      const accept = message.accept === true;
      this.hotelRequests.delete(requestId);
      if (request.timer) clearTimeout(request.timer);
      const visitor = this.socketFor(request.visitorId);
      if (!visitor) return;
      if (!accept) {
        send(visitor, { t: 'hotel', action: 'declined', requestId, roomNumber: request.roomNumber });
        send(ws, { t: 'hotel', action: 'resolved', requestId, accepted: false });
        return;
      }
      const suite = await this.suiteRow(request.roomNumber);
      const room = this.suiteVisitPayload(suite);
      if (!room) {
        send(visitor, {
          t: 'hotel',
          action: 'unavailable',
          roomNumber: request.roomNumber,
          reason: 'not_found',
          message: DOORBELL_REASON_TEXT.not_found,
        });
        return;
      }
      send(visitor, { t: 'hotel', action: 'granted', requestId, room });
      send(ws, { t: 'hotel', action: 'resolved', requestId, accepted: true });
      return;
    }

    if (action === 'cancel') {
      const requestId = String(message.requestId ?? '');
      const request = this.hotelRequests.get(requestId);
      if (!request || request.visitorId !== player.userId) return;
      this.closeDoorbell(
        requestId,
        { t: 'hotel', action: 'cancelled', requestId },
        { t: 'hotel', action: 'cancelled', requestId }
      );
      return;
    }

    if (action !== 'ring') {
      error(ws, 'bad_request', 'Unknown doorbell action');
      return;
    }
    const roomNumber = String(message.roomNumber ?? '');
    if (!isDoorbellRoomNumber(roomNumber)) {
      error(ws, 'bad_request', 'That is not a hotel suite number');
      return;
    }
    if (player.isGuest) {
      send(ws, { t: 'hotel', action: 'unavailable', roomNumber, reason: 'guest', message: DOORBELL_REASON_TEXT.guest });
      return;
    }
    const suite = await this.suiteRow(roomNumber);
    const ownerSocket = suite ? this.socketFor(suite.owner_id) : null;
    const ownerState = ownerSocket?.deserializeAttachment() as Player | undefined;
    const availability = doorbellAvailability({
      suite,
      requesterId: player.userId,
      requesterIsGuest: player.isGuest,
      ownerOnline: Boolean(ownerSocket),
      ownerLocation: ownerState?.location ?? null,
    });
    if (!availability.ok || !ownerSocket) {
      send(ws, {
        t: 'hotel',
        action: 'unavailable',
        roomNumber,
        reason: availability.reason === 'ok' ? 'offline' : availability.reason,
        message: (DOORBELL_REASON_TEXT as Record<string, string>)[availability.reason] ?? '',
      });
      return;
    }
    // At most one pending ring per visitor.
    for (const [id, existing] of this.hotelRequests) {
      if (existing.visitorId === player.userId) {
        this.closeDoorbell(
          id,
          { t: 'hotel', action: 'cancelled', requestId: id },
          { t: 'hotel', action: 'cancelled', requestId: id }
        );
      }
    }
    const requestId = crypto.randomUUID();
    const expiresAt = Date.now() + DOORBELL_TIMEOUT_MS;
    const timer = setTimeout(() => {
      this.closeDoorbell(
        requestId,
        { t: 'hotel', action: 'expired', requestId, roomNumber },
        { t: 'hotel', action: 'expired', requestId, roomNumber }
      );
    }, DOORBELL_TIMEOUT_MS);
    this.hotelRequests.set(requestId, {
      id: requestId,
      ownerId: suite!.owner_id,
      visitorId: player.userId,
      roomNumber,
      expiresAt,
      timer,
    });
    send(ws, { t: 'hotel', action: 'ringing', requestId, roomNumber, expiresAt });
    send(ownerSocket, {
      t: 'hotel',
      action: 'ring',
      requestId,
      roomNumber,
      expiresAt,
      from: {
        userId: player.userId,
        handle: player.handle,
        name: player.isGuest ? `Guest User - ${player.name}` : player.name,
      },
    });
  }

  private players(instanceId: string): Player[] {
    const now = Date.now();
    const unique = new Map<string, Player>();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const player = socket.deserializeAttachment() as (Player & { pending?: boolean }) | undefined;
      if (!player?.userId || player.pending || player.departed || player.instanceId !== instanceId) continue;
      if (now - Number(player.lastSeen ?? 0) > IDLE_TIMEOUT_MS) continue;
      const previous = unique.get(player.userId);
      if (!previous || Number(player.lastSeen ?? 0) > Number(previous.lastSeen ?? 0)) unique.set(player.userId, player);
    }
    return [...unique.values()];
  }

  private async replaceDuplicateConnections(current: HibernatableWebSocket, player: Player) {
    if (player.isGuest) return;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === current) continue;
      const existing = socket.deserializeAttachment() as Player | undefined;
      if (!existing?.userId || existing.departed || existing.userId !== player.userId || existing.instanceId !== player.instanceId) continue;
      socket.serializeAttachment({ ...existing, departed: true });
      send(socket, { t: 'replaced', reason: 'This account connected from another session' });
      socket.close(4003, 'replaced');
      this.broadcast(existing.instanceId, { t: 'leave', connId: existing.connId }, socket);
    }
  }

  private async disconnectPlayer(ws: HibernatableWebSocket) {
    const player = ws.deserializeAttachment() as Player | undefined;
    if (!player?.userId || player.departed) return;
    ws.serializeAttachment({ ...player, departed: true, voice: false });
    const stillConnected = this.ctx.getWebSockets().some((socket) => {
      if (socket === ws || socket.readyState !== WebSocket.OPEN) return false;
      const other = socket.deserializeAttachment() as Player | undefined;
      return Boolean(other?.userId === player.userId && other.instanceId === player.instanceId && !other.departed);
    });
    if (!player.isGuest && !stillConnected) await this.updatePartyPresence(player.userId, null, player.instanceId);
    this.broadcast(player.instanceId, { t: 'leave', connId: player.connId }, ws);
    this.broadcastSnapshot(player.instanceId, true);
    if (player.instanceId.startsWith('world:')) await this.syncWorldStatus(player.instanceId.slice(6), player.connId);
  }

  /** Which instance a signed-in player is currently connected to, if any. */
  private async instanceOf(userId: string): Promise<string | null> {
    const namespace = this.env.REALTIME;
    if (!namespace) return null;
    const response = await namespace.get(namespace.idFromName('party:global')).fetch(new Request(
      'https://loftlife-internal/internal/party/instance-of', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      }
    ));
    if (!response.ok) return null;
    const body = await response.json() as { instanceId?: string | null };
    return body.instanceId ?? null;
  }

  /**
   * A WebSocket is pinned to the Durable Object that accepted it, so joining a
   * player elsewhere means telling the client to reconnect to that instance.
   */
  private async relocateToUser(ws: HibernatableWebSocket, player: Player, targetUserId: string) {
    if (targetUserId === player.userId) { error(ws, 'bad_request', 'That is you'); return; }
    const target = await this.instanceOf(targetUserId);
    if (!target) { error(ws, 'offline', 'That player is not online right now'); return; }
    if (target === player.instanceId) {
      send(ws, { t: 'instance', instance: { id: target, kind: 'city', worldId: null, capacity: MAX_PLAYERS, count: this.players(target).length } });
      return;
    }
    const kind = target.startsWith('world:') ? 'world' : 'city';
    send(ws, { t: 'relocate', instance: { id: target, kind, worldId: kind === 'world' ? target.slice(6) : null } });
  }

  private scheduleSweep() {
    const storage = this.ctx.storage;
    if (typeof storage.setAlarm !== 'function') return;
    try {
      void storage.setAlarm(Date.now() + SESSION_SWEEP_MS);
    } catch {
      // Alarm support is optional in the test harness.
    }
  }

  /** Close sockets whose signed session expired or whose client went silent. */
  async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment() as (Player & { pending?: boolean; pendingSince?: number }) | undefined;
      if (!state || state.departed) continue;
      if (!state.userId) {
        if (state.pending && now - Number(state.pendingSince ?? now) > PENDING_CONNECTION_MS) ws.close(4001, 'hello required');
        continue;
      }
      if (Number(state.sessionExpiresAt ?? 0) > 0 && now > Number(state.sessionExpiresAt)) {
        error(ws, 'unauthorized', 'Session expired');
        await this.disconnectPlayer(ws);
        ws.close(1008, 'session_expired');
        continue;
      }
      if (now - Number(state.lastSeen ?? 0) > IDLE_TIMEOUT_MS) {
        await this.disconnectPlayer(ws);
        ws.close(4001, 'idle');
      }
    }
    if (this.ctx.getWebSockets().some((socket) => socket.readyState === WebSocket.OPEN)) this.scheduleSweep();
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
    const dwell=line.dwellMs,speed=line.speed;
    const duration=stops.length*dwell+stops.reduce((sum,stop,index)=>sum+(distance(stop,stops[(index+1)%n])/speed)*1000,0);
    let remaining=Math.max(0,elapsed)%duration, heading=0;
    const start=stops[startStop%n];
    if(remaining<dwell)return{x:start.x,z:start.z,heading,stopIndex:startStop%n,dwelling:true};
    remaining-=dwell;
    for(let step=0;step<n;step++){
      const from=stops[(startStop+step)%n],to=stops[(startStop+step+1)%n];
      const dist=distance(from,to),segment=(dist/speed)*1000;
      heading=Math.atan2(to.x-from.x,to.z-from.z);
      if(remaining<segment){
        const progress=segment===0?1:remaining/segment;
        return{x:from.x+(to.x-from.x)*progress,z:from.z+(to.z-from.z)*progress,heading,stopIndex:(startStop+step+1)%n,dwelling:false};
      }
      remaining-=segment;
      const arrived=(startStop+step+1)%n;
      if(remaining<dwell)return{x:to.x,z:to.z,heading,stopIndex:arrived,dwelling:true};
      remaining-=dwell;
    }
    return{x:start.x,z:start.z,heading,stopIndex:startStop%n,dwelling:true};
  }
  private riderPose(player: Player, now: number): Player {
    const line=TRANSIT_LINES.find(entry=>entry.id===player.transitLineId);
    if(!line||player.transitSeat==null||player.transitStartStop===undefined||player.transitStartedAt===undefined)return player;
    const route=this.routePosition(line,player.transitStartStop,now-player.transitStartedAt);
    const side=player.transitSeat%2===0?-1:1,row=Math.floor(player.transitSeat/2);
    const lateral=side*(line.kind==='rail'?0.72:0.62),along=line.kind==='rail'?4.6-row*1.35:1.35-row*1.25;
    const forwardX=Math.sin(route.heading),forwardZ=Math.cos(route.heading);
    const rightX=Math.cos(route.heading),rightZ=-Math.sin(route.heading);
    return {...player,x:route.x+rightX*lateral+forwardX*along,y:0.34,z:route.z+rightZ*lateral+forwardZ*along,yaw:route.heading,location:'transit'};
  }
  private vehiclesFor(instanceId: string, now: number) {
    const players=this.players(instanceId);
    const vehicles: Array<Record<string, unknown>>=[...TRANSIT_LINES].map((line)=>{
      const group=players.filter(player=>player.riding&&player.transitLineId===line.id);
      const first=group[0];
      const route=first&&first.transitStartStop!==undefined&&first.transitStartedAt!==undefined
        ? this.routePosition(line,first.transitStartStop,now-first.transitStartedAt)
        : this.routePosition(line,0,now);
      return {
        id:first?String(first.riding):`amb_${line.id}`,
        lineId:line.id,label:line.label,kind:line.kind,color:line.color,
        x:Math.round(route.x*100)/100,z:Math.round(route.z*100)/100,heading:Math.round(route.heading*1000)/1000,
        stopIndex:route.stopIndex,dwelling:route.dwelling,seats:line.seats,
        riders:group.map(r=>({userId:r.userId,handle:r.handle,seat:r.transitSeat})),
      };
    });
    for(let i=1;i<=3;i++){
      const id=`taxi_${i}`;
      const group=players.filter(player=>player.taxiId===id);
      const first=group[0];
      let x=0,z=0,heading=0,state='roam';
      if(first){
        const path=first.taxiPath;const startedAt=Number(first.taxiStartedAt??first.taxiBoardedAt??now);
        if(path&&path.length>1){
          const elapsed=Math.max(0,now-startedAt);
          const duration=Number(first.taxiDurationMs??1);
          const pos=pathPointAt(path,Math.min(pathLength(path),(elapsed/1000)*TAXI_SPEED));
          x=pos.x;z=pos.z;heading=pos.heading;state=elapsed>=duration?'arrived':'driving';
        } else {
          x=Number(first.taxiX??0);z=Number(first.taxiZ??0);heading=Number(first.taxiHeading??0);state='waiting';
        }
      } else {
        const pos=taxiLoopPoint((now/1000)*TAXI_SPEED+i*70);
        x=pos.x;z=pos.z;heading=pos.heading;
      }
      vehicles.push({id,lineId:'taxi',label:'Autonomous Taxi',kind:'taxi',color:'#f5b718',x:Math.round(x*100)/100,z:Math.round(z*100)/100,heading:Math.round(heading*1000)/1000,stopIndex:0,dwelling:state!=='driving',state,seats:TAXI_SEATS,destinationId:first?.taxiDestinationId??null,destinationLabel:first?.taxiDestinationLabel??null,riders:group.map(r=>({userId:r.userId,handle:r.handle,seat:r.taxiSeat}))});
    }
    return vehicles;
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
      let seat=-1;for(let i=0;i<line.seats;i++){if(!used.has(i)){seat=i;break;}}
      if(seat<0){error(ws,'conflict',`This ${line.kind==='rail'?'train':'bus'} is full`);return;}
      const vehicleId=`${line.kind}_${line.id}_${startedAt}`;
      const next=this.riderPose({...player,riding:vehicleId,transitLineId:line.id,transitSeat:seat,transitStartStop:startStop,transitStartedAt:startedAt,taxiId:undefined},Date.now());
      ws.serializeAttachment(next);
      send(ws,{t:'transit',riding:{vehicleId,lineId:line.id,seat,label:line.label,kind:line.kind},vehicles:this.vehiclesFor(player.instanceId,Date.now())});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    if(action==='hailTaxi'){
      if(player.riding){error(ws,'conflict','You are already riding transit');return;}
      if(player.journey){error(ws,'conflict','Finish your journey first');return;}
      if(player.location!=='world'){error(ws,'conflict','Walk to a taxi first');return;}
      const taxiId=String(message.vehicleId??'');
      const index=Number(taxiId.replace('taxi_',''));
      if(!Number.isFinite(index)||index<1||index>3){error(ws,'not_found','That taxi is not available');return;}
      const now=Date.now();
      const pos=taxiLoopPoint((now/1000)*TAXI_SPEED+index*70);
      if(Math.hypot(player.x-pos.x,player.z-pos.z)>9){error(ws,'bad_request','Walk closer to the taxi');return;}
      const group=this.players(player.instanceId).filter(r=>r.taxiId===taxiId);
      const used=new Set(group.map(r=>r.taxiSeat));
      let seat=-1;for(let i=0;i<TAXI_SEATS;i++){if(!used.has(i)){seat=i;break;}}
      if(seat<0){error(ws,'conflict','This taxi is full');return;}
      const next:Player={...player,riding:taxiId,taxiId,taxiSeat:seat,taxiBoardedAt:now,taxiX:pos.x,taxiZ:pos.z,taxiHeading:pos.heading,taxiPath:undefined,taxiStartedAt:undefined,taxiDurationMs:undefined,taxiDestinationId:undefined,taxiDestinationLabel:undefined,taxiArrival:undefined,location:'transit',lastSeen:now};
      ws.serializeAttachment(next);
      send(ws,{t:'transit',riding:{vehicleId:taxiId,lineId:'taxi',seat,label:'Autonomous Taxi',kind:'taxi'},taxi:{state:'waiting',destinations:TAXI_DESTINATIONS},vehicles:this.vehiclesFor(player.instanceId,now)});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    if(action==='taxiDestination'){
      if(!player.taxiId){error(ws,'conflict','You are not in a taxi');return;}
      const destination=TAXI_DESTINATIONS.find(entry=>entry.id===String(message.destinationId??''));
      if(!destination){error(ws,'bad_request','Unknown taxi destination');return;}
      const path=taxiPath({x:Number(player.taxiX??player.x),z:Number(player.taxiZ??player.z)},destination);
      const duration=Math.max(1000,(pathLength(path)/TAXI_SPEED)*1000);
      const now=Date.now();
      const next:Player={...player,taxiPath:path,taxiStartedAt:now,taxiDurationMs:duration,taxiDestinationId:destination.id,taxiDestinationLabel:destination.label,taxiArrival:destination.arrival,lastSeen:now};
      ws.serializeAttachment(next);
      send(ws,{t:'transit',taxi:{state:'driving',destinationId:destination.id,destinationLabel:destination.label,destinations:[],etaSeconds:Math.ceil(duration/1000)},vehicles:this.vehiclesFor(player.instanceId,now)});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    if(action==='exit'){
      if(player.taxiId){
        const now=Date.now();
        const next:Player={...player,x:player.x,z:player.z,y:0,location:'world',riding:null,transitLineId:null,transitSeat:null,taxiId:undefined,taxiPath:undefined,taxiStartedAt:undefined,taxiDurationMs:undefined,taxiDestinationId:undefined,taxiDestinationLabel:undefined,taxiArrival:undefined,lastSeen:now,lastPoseAt:now};
        ws.serializeAttachment(next);
        send(ws,{t:'transit',riding:null,exited:{x:next.x,z:next.z,lineId:'taxi',label:'Taxi · City'},vehicles:this.vehiclesFor(player.instanceId,now)});
        this.broadcastSnapshot(player.instanceId,true);
        return;
      }
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
  /** A hired taxi is server-owned: its path, clock and drop-off live here. */
  private taxiTick(ws: HibernatableWebSocket, player: Player, now: number) {
    const group=this.players(player.instanceId).filter(entry=>entry.taxiId===player.taxiId);
    const source=player.taxiPath?player:group.find(entry=>entry.taxiPath);
    const path=source?.taxiPath;
    if(!path||path.length<2){
      ws.serializeAttachment({...player,lastPoseAt:now,lastSeen:now});
      return;
    }
    const startedAt=Number(source?.taxiStartedAt??now);
    const duration=Number(source?.taxiDurationMs??1);
    const elapsed=Math.max(0,now-startedAt);
    if(elapsed>=duration){
      const arrival=source?.taxiArrival??path[path.length-1];
      const next:Player={
        ...player,x:arrival.x,z:arrival.z,y:0,location:'world',riding:null,transitLineId:null,transitSeat:null,
        taxiId:undefined,taxiPath:undefined,taxiStartedAt:undefined,taxiDurationMs:undefined,
        taxiDestinationId:undefined,taxiDestinationLabel:undefined,taxiArrival:undefined,lastSeen:now,lastPoseAt:now,
      };
      ws.serializeAttachment(next);
      send(ws,{t:'transit',riding:null,exited:{x:arrival.x,z:arrival.z,lineId:'taxi',label:`Taxi · ${source?.taxiDestinationLabel??'City'}`},taxiArrived:true,vehicles:this.vehiclesFor(player.instanceId,now)});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    const pos=pathPointAt(path,(elapsed/1000)*TAXI_SPEED);
    const next:Player={...player,x:pos.x,z:pos.z,y:0.34,yaw:pos.heading,location:'transit',lastSeen:now,lastPoseAt:now};
    ws.serializeAttachment(next);
    this.broadcastSnapshot(player.instanceId);
  }

  private async travel(ws: HibernatableWebSocket, player: Player, message: Record<string, unknown>) {
    const action=String(message.action??'');
    if(action==='start'){
      const mode=String(message.mode??'');
      if(mode!=='rail'&&mode!=='air'){error(ws,'bad_request','Unknown travel mode');return;}
      if(player.riding){error(ws,'conflict','Step off transit before starting a journey');return;}
      if(player.journey){error(ws,'conflict','You are already travelling');return;}
      if(mode==='rail'){
        if(player.location!=='world'){error(ws,'conflict','Walk to LoftLife Central Station first');return;}
        const hub=TRANSIT_HUBS.find(entry=>entry.mode==='rail');
        if(!hub||Math.hypot(player.x-hub.x,player.z-hub.z)>18){error(ws,'conflict','Walk to LoftLife Central Station to board the train');return;}
      } else if(player.location!=='airport'){
        error(ws,'conflict','Check in at the airport before boarding a flight');
        return;
      }
      const destinationId=String(message.destinationId??'');
      let destination:TravelDestination|undefined=CITY_TRAVEL_DESTINATIONS.find(entry=>entry.id===destinationId);
      if(!destination&&destinationId.startsWith('world:')){
        if(player.isGuest){error(ws,'conflict','Guest sessions cannot visit player worlds');return;}
        const worldId=destinationId.slice('world:'.length);
        const rows=await this.database().query('SELECT * FROM ll_worlds WHERE id=$1 LIMIT 1',[worldId]) as Array<Record<string,unknown>>;
        const row=rows[0];
        if(!row){error(ws,'not_found','That destination is not available');return;}
        const access=await permission(this.database(),row,{id:player.userId,handle:player.handle});
        if(!access.canEnter){error(ws,'not_found','That destination is not available');return;}
        destination={id:`world:${worldId}`,label:String(row.name??'Player world'),kind:'world',location:'world',worldId,access:String(row.access??'private')};
      }
      if(!destination){error(ws,'not_found','That destination is not available');return;}
      const now=Date.now();
      const departMs=mode==='rail'?2500:3000,travelMs=mode==='rail'?6000:8000;
      const journey={
        id:`j_${Math.random().toString(36).slice(2,10)}`,
        mode:mode as 'rail'|'air',
        phase:'boarding' as const,
        destination,
        startedAt:now,
        departAt:now+departMs,
        arriveAt:now+departMs+travelMs,
        vehicleId:`${mode}_${now}`,
        label:mode==='rail'?'LoftLife Intercity':'LoftLife Air',
      };
      const next:Player={...player,journey,location:'transit',riding:null,transitLineId:null,transitSeat:null,lastSeen:now};
      ws.serializeAttachment(next);
      send(ws,{t:'travel',action:'boarding',journey});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    if(action==='cancel'){
      if(!player.journey)return;
      const mode=player.journey.mode;
      const next:Player={...player,journey:undefined,location:mode==='air'?'airport':'world',lastSeen:Date.now()};
      ws.serializeAttachment(next);
      send(ws,{t:'travel',action:'cancelled',mode});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    error(ws,'bad_request','Unknown travel action');
  }

  /** The client keeps sending poses, which drive the server-owned journey clock. */
  private advanceJourney(ws: HibernatableWebSocket, player: Player, now: number) {
    const journey=player.journey;
    if(!journey)return;
    if(journey.phase==='boarding'&&now>=journey.departAt){
      const next:Player={...player,journey:{...journey,phase:'enroute'},lastSeen:now,lastPoseAt:now};
      ws.serializeAttachment(next);
      send(ws,{t:'travel',action:'departed',journey:next.journey});
      this.broadcastSnapshot(player.instanceId,true);
      return;
    }
    if(journey.phase==='enroute'&&now>=journey.arriveAt){
      const destination=journey.destination;
      const spawn=destination.kind==='city'?destination.spawn:undefined;
      const hub=TRANSIT_HUBS[0];
      const next:Player={
        ...player,
        journey:undefined,
        location:destination.location,
        x:spawn?.x??(destination.kind==='world'?hub.x:player.x),
        z:spawn?.z??(destination.kind==='world'?hub.z:player.z),
        y:0,
        lastSeen:now,
        lastPoseAt:now,
      };
      ws.serializeAttachment(next);
      send(ws,{t:'travel',action:'arrived',journey:{...journey,phase:'arrived'}});
      this.broadcastSnapshot(player.instanceId,true);
    }
  }

  private async relayUsers(userIds:string[],message:unknown) {
    if(!this.env.REALTIME||!userIds.length)return;
    const state=await this.partyData();
    const instances=[...new Set(userIds.map(id=>state.userInstances[id]).filter((value):value is string=>Boolean(value)))];
    await Promise.all(instances.map(instanceId=>this.env.REALTIME!.get(this.env.REALTIME!.idFromName(instanceId)).fetch(new Request('https://loftlife-internal/internal/chat/broadcast',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userIds,message}),
    }))));
  }
  private async updatePartyPresence(userId:string,instanceId:string|null,expectedInstanceId?:string) {
    const namespace=this.env.REALTIME;
    if(!namespace)return;
    await namespace.get(namespace.idFromName('party:global')).fetch(new Request('https://loftlife-internal/internal/party/presence',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId,instanceId,expectedInstanceId}),
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
    if(this.env.REALTIME){
      const updates=await Promise.all(notifyUserIds.map(async id=>({userId:id,...await this.partyState(id)})));
      const targets=[...new Set(notifyUserIds.map(id=>state.userInstances[id]).filter((value):value is string=>Boolean(value)))];
      await Promise.all(targets.map(instanceId=>this.env.REALTIME!.get(this.env.REALTIME!.idFromName(instanceId)).fetch(new Request('https://loftlife-internal/internal/party/broadcast',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({updates}),
      }))));
    }
    return {...snapshot,notifyUserIds};
  }
  private async handleParty(ws:HibernatableWebSocket,player:Player,message:Record<string,unknown>) {
    if (player.isGuest) { error(ws, 'forbidden', 'Guest visitors cannot use parties'); return; }
    const namespace=this.env.REALTIME;
    if(!namespace){error(ws,'party_unavailable','Party service is not configured');return;}
    const id=namespace.idFromName('party:global');
    if (String(message.action ?? '') === 'join') {
      // "Join leader" travels to the leader's instance; it is not an invitation
      // accept (the client sends `accept` for that).
      const stateResponse=await namespace.get(id).fetch(new Request('https://loftlife-internal/internal/party/state',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:player.userId}),
      }));
      const state=await stateResponse.json() as {party?:{leaderId?:string}|null};
      const leaderId=state.party?.leaderId;
      if(!leaderId){error(ws,'not_in_party','Join or create a party first');return;}
      if(leaderId===player.userId){error(ws,'party_leader','You are the leader — your party joins you');return;}
      await this.relocateToUser(ws,player,leaderId);
      return;
    }
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

  async webSocketClose(ws: HibernatableWebSocket) {
    await this.disconnectPlayer(ws);
  }
  async webSocketError(ws: HibernatableWebSocket) {
    await this.disconnectPlayer(ws);
  }
}
