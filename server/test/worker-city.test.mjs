/**
 * Worker-level city test.
 *
 * Runs the shipping Worker fetch handler and the real LoftLifeRealtime DO with
 * two guest clients, without a Neon or Cloudflare account:
 *   - Neon HTTP is served by an in-memory /sql stub.
 *   - WebSocketPair is a small in-process pair that records what each side sends.
 *   - The DO ctx is an in-memory hibernation stand-in.
 *
 * This exercises the same code paths as production: guest session creation,
 * /ws instance routing, token verification against guest rows, presence, pose
 * snapshots and city chat.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-worker-city-'));
const SECRET = 'worker-city-two-client-secret-0123456789';
const ORIGIN = 'https://loftlife.test';

const realFetch = globalThis.fetch;
const NativeResponse = globalThis.Response;
const guestRows = [];
const routed = [];
const pairs = [];

function sqlResponse(fields, rows, command = 'SELECT') {
  return new Response(JSON.stringify({ fields, rows, rowCount: rows.length, command }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// The Worker and DO reach Neon through fetch. Serve only the queries this test
// needs and fail loudly if the real network would be used.
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.endsWith('/sql')) return realFetch(input, init);

  const body = JSON.parse(String(init?.body ?? '{}'));
  const query = String(body.query ?? '');
  const params = body.params ?? [];

  if (/^\s*INSERT INTO ll_guest_sessions/i.test(query)) {
    guestRows.push({
      jti_hash: params[0],
      guest_id: params[1],
      display_name: params[2],
      created_at: params[3],
      expires_at: params[4],
    });
    return sqlResponse([], [], 'INSERT');
  }
  if (/^\s*DELETE FROM ll_guest_sessions/i.test(query)) {
    const index = guestRows.findIndex((row) => row.jti_hash === params[0]);
    if (index >= 0) guestRows.splice(index, 1);
    return sqlResponse([], [], 'DELETE');
  }
  if (/SELECT guest_id, display_name FROM ll_guest_sessions/i.test(query)) {
    const row = guestRows.find(
      (candidate) =>
        candidate.jti_hash === params[0] &&
        candidate.guest_id === params[1] &&
        candidate.expires_at > params[2]
    );
    return sqlResponse(
      [
        { name: 'guest_id', dataTypeID: 25 },
        { name: 'display_name', dataTypeID: 25 },
      ],
      row ? [[row.guest_id, row.display_name]] : []
    );
  }
  return sqlResponse([], [], 'OK');
};

// Workers allow a 101 Response carrying `webSocket`; Node's Response does not.
function ResponseShim(body, init) {
  if (init?.status === 101 && init.webSocket) {
    const response = Object.create(NativeResponse.prototype);
    Object.defineProperties(response, {
      status: { value: 101 },
      ok: { value: false },
      statusText: { value: 'Switching Protocols' },
      headers: { value: new Headers() },
      webSocket: { value: init.webSocket },
    });
    return response;
  }
  return new NativeResponse(body, init);
}
ResponseShim.json = NativeResponse.json.bind(NativeResponse);
ResponseShim.redirect = NativeResponse.redirect.bind(NativeResponse);
ResponseShim.error = NativeResponse.error.bind(NativeResponse);
globalThis.Response = ResponseShim;

class FakeSocket {
  static OPEN = 1;

  constructor() {
    this.readyState = FakeSocket.OPEN;
    this.messages = [];
    this.attachment = undefined;
  }

  send(data) {
    this.messages.push(JSON.parse(String(data)));
  }

  close(code, reason) {
    this.readyState = 3;
    this.closeInfo = { code, reason };
  }

  serializeAttachment(value) {
    this.attachment = value;
  }

  deserializeAttachment() {
    return this.attachment;
  }
}

globalThis.WebSocketPair = class {
  constructor() {
    const client = new FakeSocket();
    const server = new FakeSocket();
    // Sending server -> client is what a real pair does; record on the client.
    server.send = (data) => client.messages.push(JSON.parse(String(data)));
    pairs.push({ client, server });
    this[0] = client;
    this[1] = server;
  }
};

if (!globalThis.WebSocket) {
  globalThis.WebSocket = class {
    static OPEN = 1;
  };
}

let worker;
let durable;
let env;

function websocketRequest(instance) {
  return new Request(`${ORIGIN}/ws?instance=${encodeURIComponent(instance)}`, {
    headers: { Upgrade: 'websocket' },
  });
}

async function openGuest(displayName) {
  const sessionResponse = await worker.fetch(
    new Request(`${ORIGIN}/api/guest/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName }),
    }),
    env
  );
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();

  const upgrade = await worker.fetch(websocketRequest('city'), env);
  assert.equal(upgrade.status, 101);
  const pair = pairs.at(-1);
  await durable.webSocketMessage(
    pair.server,
    JSON.stringify({ t: 'hello', token: session.token, place: { kind: 'city' } })
  );
  return { session, pair };
}

const firstMessage = (pair, type) => pair.client.messages.find((message) => message.t === type);

before(async () => {
  const outfile = path.join(WORK_DIR, 'worker.mjs');
  execFileSync(
    path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
    [
      path.join(ROOT, 'src/cloudflare/worker.ts'),
      '--bundle',
      '--format=esm',
      '--platform=node',
      '--log-level=warning',
      `--outfile=${outfile}`,
    ],
    { cwd: ROOT, stdio: 'inherit' }
  );

  const workerModule = await import(pathToFileURL(outfile).href);
  worker = workerModule.default;

  const storage = new Map();
  const sockets = [];
  const ctx = {
    acceptWebSocket(socket) {
      sockets.push(socket);
    },
    getWebSockets() {
      return sockets;
    },
    storage: {
      async get(key) {
        return storage.get(key);
      },
      async put(key, value) {
        storage.set(key, value);
      },
    },
  };

  env = {
    DATABASE_URL: 'postgresql://test:test@fake.neon.test/loftlife',
    LOFTLIFE_SESSION_SECRET: SECRET,
  };
  durable = new workerModule.LoftLifeRealtime(ctx, env);
  env.REALTIME = {
    idFromName(name) {
      routed.push(name);
      return name;
    },
    get() {
      return { fetch: (request) => durable.fetch(request) };
    },
  };
});

after(() => {
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
});

test('worker: /ws resolves city requests and rejects other city shards', async () => {
  routed.length = 0;

  const bad = await worker.fetch(websocketRequest('city:foo'), env);
  assert.equal(bad.status, 400);
  assert.deepEqual(routed, [], 'an invalid city shard must not reach a Durable Object');

  const empty = await worker.fetch(websocketRequest(''), env);
  assert.equal(empty.status, 400);

  const city = await worker.fetch(websocketRequest('city'), env);
  assert.equal(city.status, 101);
  assert.deepEqual(routed, ['city:main']);

  const world = await worker.fetch(websocketRequest('world:test-world'), env);
  assert.equal(world.status, 101);
  assert.deepEqual(routed, ['city:main', 'world:test-world']);
});

test('worker: two guests share TheCity, see movement and city chat', async () => {
  const guestA = await openGuest('Sky Visitor');
  const guestB = await openGuest('River Guest');

  const readyA = firstMessage(guestA.pair, 'ready');
  assert.equal(readyA.instance.id, 'city:main');
  assert.equal(readyA.you.isGuest, true);
  assert.equal(readyA.you.name, 'Guest User - Sky Visitor');

  const readyB = firstMessage(guestB.pair, 'ready');
  assert.equal(readyB.instance.id, 'city:main');
  assert.ok(readyB.players.some((player) => player.userId === guestA.session.guest.id));

  await new Promise((resolve) => setImmediate(resolve));
  const join = firstMessage(guestA.pair, 'join');
  assert.equal(join.player.name, 'Guest User - River Guest');

  // Snapshots are throttled to 10 Hz; let the join snapshot clear.
  await new Promise((resolve) => setTimeout(resolve, 120));
  await durable.webSocketMessage(
    guestB.pair.server,
    JSON.stringify({ t: 'pose', x: 14, y: 0, z: -6, yaw: 0.5, location: 'world' })
  );
  const snapshot = guestA.pair.client.messages.find(
    (message) =>
      message.t === 'snapshot' &&
      message.players.some((player) => player.userId === guestB.session.guest.id && player.x === 14)
  );
  assert.ok(snapshot, 'the first guest sees the second guest move');

  await durable.webSocketMessage(
    guestB.pair.server,
    JSON.stringify({ t: 'chat', scope: 'city', body: 'Hello from the Worker' })
  );
  const chat = guestA.pair.client.messages.find(
    (message) => message.t === 'chat' && message.body === 'Hello from the Worker'
  );
  assert.ok(chat, 'city chat is broadcast to the other guest');
  assert.equal(chat.from.isGuest, true);
  assert.equal(chat.from.displayName, 'Guest User - River Guest');
  assert.equal(chat.scopeId, 'main');

  // Chat is throttled to one message per 700 ms before the guest scope guard.
  await new Promise((resolve) => setTimeout(resolve, 720));
  await durable.webSocketMessage(
    guestB.pair.server,
    JSON.stringify({ t: 'chat', scope: 'dm', to: 'someone', body: 'private' })
  );
  const denied = guestB.pair.client.messages.find(
    (message) => message.t === 'error' && message.code === 'forbidden'
  );
  assert.ok(denied, `guests cannot use direct messages: ${JSON.stringify(guestB.pair.client.messages)}`);

  await durable.webSocketMessage(
    guestB.pair.server,
    JSON.stringify({ t: 'party', action: 'create' })
  );
  assert.equal(
    guestB.pair.client.messages.filter((message) => message.t === 'error' && message.code === 'forbidden').length,
    2
  );

  const worldUpgrade = await worker.fetch(websocketRequest('world:test-world'), env);
  assert.equal(worldUpgrade.status, 101);
  const worldPair = pairs.at(-1);
  await durable.webSocketMessage(
    worldPair.server,
    JSON.stringify({ t: 'hello', token: guestB.session.token, place: { kind: 'world', worldId: 'test-world' } })
  );
  assert.equal(
    worldPair.client.messages.find((message) => message.t === 'error')?.code,
    'forbidden'
  );
});
