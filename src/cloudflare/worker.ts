import { neon } from '@neondatabase/serverless';

interface WorkerFetcher {
  fetch(request: Request): Promise<Response>;
}

interface WorkerDurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface WorkerDurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): WorkerDurableObjectStub;
}

interface WorkerDurableObjectState {
  getWebSockets(tag?: string): WebSocket[];
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
}

export interface CloudflareEnv {
  DATABASE_URL: string;
  ASSETS?: WorkerFetcher;
  WORLD_SHARD?: WorkerDurableObjectNamespace;
}

export class WorldShardDurableObject {
  private state: WorkerDurableObjectState;

  constructor(state: WorkerDurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ onlineCount: this.state.getWebSockets().length });
    }

    const pairCtor = (globalThis as unknown as { WebSocketPair: new () => { 0: WebSocket; 1: WebSocket } }).WebSocketPair;
    const pair = new pairCtor();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws' && env.WORLD_SHARD) {
      const shardId = env.WORLD_SHARD.idFromName('main-city-shard-1');
      return env.WORLD_SHARD.get(shardId).fetch(request);
    }

    if (url.pathname === '/api/health') {
      const hasNeon = Boolean(env.DATABASE_URL);
      if (hasNeon) {
        const sql = neon(env.DATABASE_URL);
        await sql`SELECT 1`;
      }
      return Response.json({
        ok: true,
        runtime: 'cloudflare-worker',
        storageEngine: hasNeon ? 'neon' : 'unconfigured',
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('LoftLife Cloudflare Worker ready', { status: 200 });
  },
};
