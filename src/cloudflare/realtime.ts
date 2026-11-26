import { neon } from '@neondatabase/serverless';
import { sha256Hex, verifyAuthToken } from '../../shared/auth-core.mjs';

interface Env {
  DATABASE_URL?: string;
  LOFTLIFE_SESSION_SECRET?: string;
}
type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type Player = {
  connId: string; userId: string; handle: string; name: string; avatar: unknown;
  instanceId: string; x: number; y: number; z: number; yaw: number;
  emote: string; location: string; lastSeen: number; lastChatAt: number;
};
const MAX_PLAYERS = 64;
const MAX_CHAT_LENGTH = 280;
const encoder = new TextEncoder();

function send(ws: WebSocket, value: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
}
function publicPlayer(p: Player) {
  return {
    connId: p.connId, userId: p.userId, handle: p.handle, name: p.name,
    avatar: p.avatar, x: p.x, y: p.y, z: p.z, yaw: p.yaw,
    emote: p.emote, location: p.location,
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
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const url = new URL(request.url);
    const instanceId = url.searchParams.get('instance') ?? 'city:main';
    if (!/^city:[a-z0-9_-]{1,32}$/.test(instanceId) && !/^world:[a-zA-Z0-9_-]{1,80}$/.test(instanceId)) {
      return new Response('Invalid instance', { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ instanceId, pending: true });
    return new Response(null, { status: 101, webSocket: client });
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
        const next = {
          ...player,
          x: Number(message.x), y: Number(message.y), z: Number(message.z),
          yaw: Number(message.yaw), emote: String(message.emote ?? 'idle').slice(0, 24),
          location: String(message.location ?? 'world').slice(0, 24), lastSeen: Date.now(),
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
      case 'ping':
        send(ws, { t: 'pong', at: Date.now() });
        return;
      case 'leave':
        ws.close(1000, 'left');
        return;
      case 'voice': {
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
    const sessionRows = await sql.query(
      'SELECT a.id, a.handle, a.display_name, a.role FROM ll_sessions s JOIN ll_accounts a ON a.id=s.account_id WHERE s.jti_hash=$1 AND s.account_id=$2 AND s.expires_at>$3 LIMIT 1',
      [await sha256Hex(payload.sid), payload.sub, Date.now()]
    ) as Array<{ id: string; handle: string; display_name: string; role: string }>;
    const account = sessionRows[0];
    if (!account) {
      error(ws, 'unauthorized', 'Session expired or revoked');
      ws.close(1008, 'unauthorized');
      return;
    }

    if (instanceId.startsWith('world:')) {
      const worldId = instanceId.slice(6);
      const worlds = await sql.query('SELECT id, owner_id, access, published, max_visitors FROM ll_worlds WHERE id=$1 LIMIT 1', [worldId]) as Array<{ id: string; owner_id: string; access: string; published: boolean; max_visitors: number }>;
      const world = worlds[0];
      if (!world) {
        error(ws, 'not_found', 'That world no longer exists');
        ws.close(1008, 'world_not_found');
        return;
      }
      let allowed = world.owner_id === account.id || (world.published && world.access === 'public');
      if (!allowed && ['invite', 'friends', 'collab'].includes(world.access)) {
        const [invite, collaborator, friendship] = await Promise.all([
          sql.query('SELECT 1 FROM ll_world_invites WHERE world_id=$1 AND user_id=$2 LIMIT 1', [worldId, account.id]),
          sql.query('SELECT 1 FROM ll_world_collaborators WHERE world_id=$1 AND user_id=$2 LIMIT 1', [worldId, account.id]),
          sql.query("SELECT 1 FROM ll_friendships WHERE status='accepted' AND ((a=$1 AND b=owner_id) OR (b=$1 AND a=owner_id)) LIMIT 1".replace('owner_id', '$3'), [account.id, worldId, world.owner_id]),
        ]);
        allowed = invite.length > 0 || collaborator.length > 0 || (world.access === 'friends' && friendship.length > 0);
      }
      if (!allowed) {
        error(ws, 'forbidden', 'You do not have access to this world');
        ws.close(1008, 'forbidden');
        return;
      }
    }

    const peers = this.ctx.getWebSockets();
    const active = peers.map((peer) => peer.deserializeAttachment() as Player | undefined).filter((p): p is Player => Boolean(p && p.instanceId === instanceId && !('pending' in (p as object))));
    const max = instanceId.startsWith('world:') ? 64 : MAX_PLAYERS;
    if (active.length >= max) {
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
      lastSeen: Date.now(), lastChatAt: 0,
    };
    ws.serializeAttachment(player);
    const players = this.players(instanceId);
    const capacity = instanceId.startsWith('world:') ? 64 : MAX_PLAYERS;
    send(ws, { t: 'ready', instance: { id: instanceId, kind: instanceId.startsWith('world:') ? 'world' : 'city', worldId: instanceId.startsWith('world:') ? instanceId.slice(6) : null, capacity, count: players.length + 1 }, you: publicPlayer(player), players });
    this.broadcast(instanceId, { t: 'join', player: publicPlayer(player) }, ws);
    this.broadcastSnapshot(instanceId, true);
  }

  private players(instanceId: string): Player[] {
    return this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as Player | undefined)
      .filter((p): p is Player => Boolean(p && p.instanceId === instanceId && p.userId));
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
    this.broadcast(instanceId, { t: 'snapshot', instanceId, at: now, players: this.players(instanceId).map(publicPlayer), vehicles: [] });
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
    if (!['city', 'world', 'local'].includes(scope)) {
      error(ws, 'unsupported_scope', 'Direct and party chat are not migrated to edge yet');
      return;
    }
    const world = player.instanceId.startsWith('world:');
    const dbScope = world ? 'world' : 'city';
    const scopeId = world ? player.instanceId.slice(6) : 'main';
    const id = crypto.randomUUID();
    await this.database().query(
      'INSERT INTO ll_chat_messages (id, scope, scope_id, user_id, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, dbScope, scopeId, player.userId, body, now]
    );
    const event = { t: 'chat', scope, body, from: { userId: player.userId, handle: player.handle, displayName: player.name }, at: now, id, scopeId };
    if (scope === 'local') {
      for (const peer of this.ctx.getWebSockets()) {
        const other = peer.deserializeAttachment() as Player | undefined;
        if (other?.instanceId === player.instanceId && Math.hypot(other.x-player.x, other.z-player.z) <= 24) send(peer, event);
      }
    } else this.broadcast(player.instanceId, event);
    ws.serializeAttachment({ ...player, lastChatAt: now });
  }

  async webSocketClose(ws: WebSocket) {
    const player = ws.deserializeAttachment() as Player | undefined;
    if (player?.userId) {
      this.broadcast(player.instanceId, { t: 'leave', connId: player.connId }, ws);
      this.broadcastSnapshot(player.instanceId, true);
    }
  }
  async webSocketError(ws: WebSocket) {
    const player = ws.deserializeAttachment() as Player | undefined;
    if (player?.userId) this.broadcast(player.instanceId, { t: 'leave', connId: player.connId }, ws);
  }
}
