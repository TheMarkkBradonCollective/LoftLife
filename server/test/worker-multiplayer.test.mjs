/**
 * Production-path acceptance tests for the Cloudflare Worker + Durable Object.
 *
 * Runs the shipping `src/cloudflare/worker.ts` fetch handler and the real
 * `LoftLifeRealtime` Durable Object class against an in-memory Neon `/sql`
 * stub and an in-process WebSocketPair. No Cloudflare account or database is
 * needed, so these cover the code that deploys; they do not replace a run
 * against the real Neon project and Durable Object binding.
 *
 * Covered here:
 *   - the 64-player shared city and its full rejection
 *   - registered accounts joining TheCity and seeing each other move
 *   - the airport spawn being accepted, impossible movement rejected
 *   - party invite/accept and "join leader" relocating across instances
 *   - joinFriend relocating across instances
 *   - guest identity, guest restrictions and guest presence
 *   - session expiry closing a live socket
 *   - chat writes reaching the Neon SQL layer
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { before } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-worker-mp-'));
const SECRET = 'worker-multiplayer-secret-0123456789abcdef';
const ORIGIN = 'https://loftlife.test';
const AIRPORT_SPAWN = { x: 631.63, z: 447.1 };

const realFetch = globalThis.fetch;
const NativeResponse = globalThis.Response;

/** In-memory stand-in for the Neon HTTP endpoint. */
const db = {
  accounts: [],
  sessions: [],
  guests: [],
  worlds: [],
  chatInserts: [],
};

function sqlResponse(fields, rows, command = 'SELECT') {
  return new Response(JSON.stringify({ fields, rows, rowCount: rows.length, command }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.endsWith('/sql')) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? '{}'));
  const query = String(body.query ?? '');
  const params = body.params ?? [];
  const text = (fields, rows, command) =>
    sqlResponse(fields.map((name) => ({ name, dataTypeID: 25 })), rows, command);

  if (/^\s*INSERT INTO ll_guest_sessions/i.test(query)) {
    db.guests.push({
      jti_hash: params[0], guest_id: params[1], display_name: params[2],
      created_at: params[3], expires_at: params[4],
    });
    return sqlResponse([], [], 'INSERT');
  }
  if (/^\s*DELETE FROM ll_guest_sessions/i.test(query)) {
    const index = db.guests.findIndex((row) => row.jti_hash === params[0]);
    if (index >= 0) db.guests.splice(index, 1);
    return sqlResponse([], [], 'DELETE');
  }
  if (/SELECT guest_id, display_name FROM ll_guest_sessions/i.test(query)) {
    const row = db.guests.find(
      (candidate) =>
        candidate.jti_hash === params[0] &&
        candidate.guest_id === params[1] &&
        candidate.expires_at > params[2]
    );
    return text(['guest_id', 'display_name'], row ? [[row.guest_id, row.display_name]] : []);
  }
  if (/FROM ll_sessions s JOIN ll_accounts a/i.test(query)) {
    const session = db.sessions.find(
      (row) => row.jti_hash === params[0] && row.account_id === params[1] && row.expires_at > params[2]
    );
    const account = session && db.accounts.find((row) => row.id === session.account_id);
    if (!account || Number(account.suspended_until ?? 0) > Number(params[3])) {
      return text(['id', 'handle', 'display_name', 'role'], []);
    }
    return text(
      ['id', 'handle', 'display_name', 'role'],
      [[account.id, account.handle, account.display_name, account.role]]
    );
  }
  if (/SELECT avatar_json FROM ll_profiles WHERE user_id=\$1/i.test(query)) {
    return text(['avatar_json'], []);
  }
  if (/SELECT id FROM ll_accounts WHERE handle=\$1/i.test(query)) {
    const account = db.accounts.find((row) => row.handle === String(params[0]).toLowerCase());
    return text(['id'], account ? [[account.id]] : []);
  }
  if (/SELECT id, owner_id, access, status, max_visitors FROM ll_worlds/i.test(query)) {
    const world = db.worlds.find((row) => row.id === params[0]);
    return text(
      ['id', 'owner_id', 'access', 'status', 'max_visitors'],
      world ? [[world.id, world.owner_id, world.access, world.status, world.max_visitors]] : []
    );
  }
  if (/FROM ll_world_collaborators/i.test(query)) return text(['user_id', 'role'], []);
  if (/FROM ll_blocks/i.test(query)) return text(['?column?'], []);
  if (/FROM ll_accounts a LEFT JOIN ll_profiles p/i.test(query)) {
    const rawIds = params[0];
    const ids = Array.isArray(rawIds)
      ? rawIds
      : typeof rawIds === 'string'
      ? rawIds.replace(/[{}[\]"\s]/g, '').split(',').filter(Boolean)
      : [];
    return text(
      ['id', 'handle', 'display_name'],
      db.accounts
        .filter((account) => ids.includes(account.id))
        .map((account) => [account.id, account.handle, account.display_name])
    );
  }
  if (/INSERT INTO ll_chat_messages/i.test(query)) {
    db.chatInserts.push({ id: params[0], scope: params[1], scope_id: params[2], user_id: params[3], body: params[4] });
    return sqlResponse([], [], 'INSERT');
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
    if (!this.messages.some((message) => message.t === 'close')) {
      this.messages.push({ t: 'close', code, reason });
    }
  }
  serializeAttachment(value) {
    this.attachment = value;
  }
  deserializeAttachment() {
    return this.attachment;
  }
}

const pairs = [];
globalThis.WebSocketPair = class {
  constructor() {
    const client = new FakeSocket();
    const server = new FakeSocket();
    server.send = (data) => client.messages.push(JSON.parse(String(data)));
    server.close = (code, reason) => {
      server.readyState = 3;
      server.closeInfo = { code, reason };
    };
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
let RealtimeDo;
let env;
/** name -> Durable Object instance, matching idFromName routing. */
const dos = new Map();

function createStorageContext() {
  const storage = new Map();
  let alarm = null;
  const sockets = [];
  return {
    acceptWebSocket(socket) {
      sockets.push(socket);
    },
    // A real Durable Object stops returning closed sockets.
    getWebSockets() {
      return sockets.filter((socket) => socket.readyState === FakeSocket.OPEN);
    },
    storage: {
      async get(key) {
        return storage.get(key);
      },
      async put(key, value) {
        storage.set(key, value);
      },
      async setAlarm(at) {
        alarm = at;
      },
      async getAlarm() {
        return alarm;
      },
    },
  };
}

function durable(name) {
  const key = String(name);
  if (!dos.has(key)) dos.set(key, new RealtimeDo(createStorageContext(), env));
  return dos.get(key);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const firstMessage = (pair, type) => pair.client.messages.find((message) => message.t === type);
const lastSnapshot = (pair) =>
  [...pair.client.messages].reverse().find((message) => message.t === 'snapshot');

function websocketRequest(instance) {
  return new Request(`${ORIGIN}/ws?instance=${encodeURIComponent(instance)}`, {
    headers: { Upgrade: 'websocket' },
  });
}

async function connect(instance, token, place) {
  const response = await worker.fetch(websocketRequest(instance), env);
  assert.equal(response.status, 101, `expected an upgrade for ${instance}`);
  const pair = pairs.at(-1);
  const instanceId = instance === 'city' ? 'city:main' : instance;
  await durable(instanceId).webSocketMessage(
    pair.server,
    JSON.stringify({ t: 'hello', token, place })
  );
  return { pair, instanceId, server: durable(instanceId) };
}

async function send(connection, payload) {
  await durable(connection.instanceId).webSocketMessage(
    connection.pair.server,
    JSON.stringify(payload)
  );
}

async function guestSession(displayName, ip = '10.1.0.1') {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/guest/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ displayName }),
    }),
    env
  );
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

async function createAccount(handle, { ttlSeconds = 3600 } = {}) {
  const { signAuthToken, sha256Hex } = await import('../../shared/auth-core.mjs');
  const id = `usr_${handle}`;
  const account = {
    id,
    handle,
    email: `${handle}@example.test`,
    display_name: `${handle[0].toUpperCase()}${handle.slice(1)}`,
    role: 'player',
    suspended_until: 0,
  };
  db.accounts.push(account);
  const sid = randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + ttlSeconds;
  db.sessions.push({ jti_hash: await sha256Hex(sid), account_id: id, expires_at: exp * 1000 });
  const token = await signAuthToken(
    { sub: id, handle, role: 'player', name: account.display_name, sid, iat: issuedAt, exp },
    SECRET
  );
  return { account, token };
}

before(async () => {
  const outfile = path.join(WORK_DIR, 'worker.mjs');
  execFileSync(
    path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
    [
      path.join(ROOT, 'src/cloudflare/worker.ts'),
      '--bundle', '--format=esm', '--platform=node', '--log-level=warning',
      `--outfile=${outfile}`,
    ],
    { cwd: ROOT, stdio: 'inherit' }
  );
  const workerModule = await import(pathToFileURL(outfile).href);
  worker = workerModule.default;
  RealtimeDo = workerModule.LoftLifeRealtime;

  env = { DATABASE_URL: 'postgresql://test:test@fake.neon.test/loftlife', LOFTLIFE_SESSION_SECRET: SECRET };
  env.REALTIME = {
    idFromName(name) {
      return String(name);
    },
    get(name) {
      const instance = durable(name);
      return { fetch: (request) => instance.fetch(request) };
    },
  };
  db.worlds.push({ id: 'test-world', owner_id: 'usr_alice', access: 'public', status: 'available', max_visitors: 30 });
});

/* -------------------------------------------------------------------------- */

test('worker: TheCity admits 64 players and rejects the 65th', async () => {
  const sessions = [];
  for (let index = 0; index < 65; index += 1) {
    sessions.push(await guestSession(`Capacity ${index}`, `10.2.0.${index}`));
  }

  const admitted = [];
  for (let index = 0; index < 64; index += 1) {
    const connection = await connect('city', sessions[index].token, { kind: 'city' });
    const ready = firstMessage(connection.pair, 'ready');
    assert.ok(ready, `guest ${index} must be admitted: ${JSON.stringify(connection.pair.client.messages)}`);
    assert.equal(ready.instance.id, 'city:main');
    assert.equal(ready.instance.capacity, 64);
    admitted.push(connection);
  }

  const overflow = await connect('city', sessions[64].token, { kind: 'city' });
  const failure = firstMessage(overflow.pair, 'error');
  assert.equal(failure?.code, 'instance_full');
  assert.equal(overflow.pair.server.closeInfo?.code, 1013);

  const presence = await worker.fetch(new Request(`${ORIGIN}/api/presence`), env);
  const body = await presence.json();
  const city = body.instances.find((entry) => entry.id === 'city:main');
  assert.equal(body.cityCapacity, 64);
  assert.equal(city.count, 64);

  for (const connection of admitted) connection.pair.server.close(1000, 'done');
});

test('worker: registered players share TheCity, spawn correctly and cannot teleport', async () => {
  const alice = await createAccount('alice', { ttlSeconds: 3600 });
  const bob = await createAccount('bob', { ttlSeconds: 3600 });
  const a = await connect('city', alice.token, { kind: 'city' });
  const b = await connect('city', bob.token, { kind: 'city' });

  const readyA = firstMessage(a.pair, 'ready');
  assert.equal(readyA.you.name, 'Alice');
  assert.equal(readyA.you.isGuest, false);
  const readyB = firstMessage(b.pair, 'ready');
  assert.ok(readyB.players.some((player) => player.userId === alice.account.id));

  await sleep(120);
  await send(a, { t: 'pose', ...AIRPORT_SPAWN, y: 0, yaw: 1.2, location: 'world' });
  const seen = lastSnapshot(b.pair);
  const atSpawn = seen.players.find((player) => player.userId === alice.account.id);
  assert.ok(atSpawn, 'the other player receives a snapshot');
  assert.equal(atSpawn.x, AIRPORT_SPAWN.x, 'the airport spawn must not be clamped');
  assert.equal(atSpawn.z, AIRPORT_SPAWN.z);
  assert.equal(a.pair.server.readyState, FakeSocket.OPEN, 'spawning must not disconnect');

  // Placement is accepted for a short window after joining; age it so this
  // check exercises the walking speed limit rather than the spawn grace.
  a.pair.server.serializeAttachment({ ...a.pair.server.deserializeAttachment(), joinedAt: Date.now() - 10_000 });

  // A 350 m jump in one tick is not walkable.
  await sleep(120);
  await send(a, { t: 'pose', x: 980, z: 900, y: 0, yaw: 0, location: 'world' });
  await sleep(120);
  const afterJump = lastSnapshot(b.pair).players.find((player) => player.userId === alice.account.id);
  assert.equal(afterJump.x, AIRPORT_SPAWN.x, 'teleporting is rejected');
  assert.equal(afterJump.z, AIRPORT_SPAWN.z);

  // City chat is delivered and written to Neon for registered players.
  await send(a, { t: 'chat', scope: 'city', body: 'hello from the edge' });
  const chat = b.pair.client.messages.find((message) => message.t === 'chat');
  assert.equal(chat?.body, 'hello from the edge');
  assert.ok(
    db.chatInserts.some((row) => row.body === 'hello from the edge' && row.scope === 'city'),
    'registered city chat is persisted'
  );

  a.pair.server.close(1000, 'done');
  b.pair.server.close(1000, 'done');
});

test('worker: party "join leader" and joinFriend relocate across instances', async () => {
  const alice = await createAccount('alice', { ttlSeconds: 3600 });
  const bob = await createAccount('bob', { ttlSeconds: 3600 });

  const hostWorld = await connect('world:test-world', alice.token, { kind: 'world', worldId: 'test-world' });
  assert.equal(firstMessage(hostWorld.pair, 'ready').instance.id, 'world:test-world');
  const guestCity = await connect('city', bob.token, { kind: 'city' });
  assert.equal(firstMessage(guestCity.pair, 'ready').instance.id, 'city:main');

  await send(hostWorld, { t: 'party', action: 'create' });
  const created = firstMessage(hostWorld.pair, 'party');
  assert.ok(created, 'creating a party answers the leader');
  assert.equal(created.party.leaderId, alice.account.id);

  await send(hostWorld, { t: 'party', action: 'invite', handle: 'bob' });
  const invited = guestCity.pair.client.messages.find(
    (message) => message.t === 'party' && message.invites?.length
  );
  assert.ok(invited, `the invite reaches the member: ${JSON.stringify(guestCity.pair.client.messages)}`);

  await send(guestCity, { t: 'party', action: 'accept' });
  const joined = guestCity.pair.client.messages.find(
    (message) => message.t === 'party' && message.party?.members?.some((entry) => entry.userId === bob.account.id)
  );
  assert.ok(joined, 'accepting the invite joins the party');

  // "Join leader" is a move, not a second invite accept.
  await send(guestCity, { t: 'party', action: 'join' });
  const relocate = firstMessage(guestCity.pair, 'relocate');
  assert.deepEqual(relocate?.instance, {
    id: 'world:test-world', kind: 'world', worldId: 'test-world',
  });

  // joinFriend uses the same relocation path.
  const friendCity = await connect('city', bob.token, { kind: 'city' });
  await send(friendCity, { t: 'joinFriend', handle: 'alice' });
  assert.deepEqual(firstMessage(friendCity.pair, 'relocate')?.instance, {
    id: 'world:test-world', kind: 'world', worldId: 'test-world',
  });

  hostWorld.pair.server.close(1000, 'done');
  guestCity.pair.server.close(1000, 'done');
  friendCity.pair.server.close(1000, 'done');
});

test('worker: guests are labelled, restricted and counted in presence', async () => {
  const guest = await guestSession('Sky Visitor', '10.3.0.1');
  const connection = await connect('city', guest.token, { kind: 'city' });
  const ready = firstMessage(connection.pair, 'ready');
  assert.equal(ready.you.isGuest, true);
  assert.equal(ready.you.name, 'Guest User - Sky Visitor');

  await send(connection, { t: 'party', action: 'create' });
  await send(connection, { t: 'joinFriend', handle: 'alice' });
  await send(connection, { t: 'voice', kind: 'offer', to: 'nobody', data: {} });
  const errors = connection.pair.client.messages.filter((message) => message.t === 'error');
  assert.equal(errors.length, 3, JSON.stringify(errors));
  assert.ok(errors.every((error) => error.code === 'forbidden'));

  // Nearby chat is permitted for guests.
  await send(connection, { t: 'chat', scope: 'local', mode: 'say', body: 'hi nearby' });
  assert.ok(connection.pair.client.messages.some((message) => message.t === 'chat' && message.scope === 'local'));

  const presence = await worker.fetch(new Request(`${ORIGIN}/api/presence`), env);
  const body = await presence.json();
  const city = body.instances.find((entry) => entry.id === 'city:main');
  assert.ok(city.count >= 1, 'guests count toward city presence');

  connection.pair.server.close(1000, 'done');
});

test('worker: a live socket is closed when its session expires', async () => {
  const short = await createAccount('expiring', { ttlSeconds: 2 });
  const connection = await connect('city', short.token, { kind: 'city' });
  assert.ok(firstMessage(connection.pair, 'ready'));

  await sleep(2100);
  await connection.server.alarm();
  const failure = firstMessage(connection.pair, 'error');
  assert.equal(failure?.code, 'unauthorized');
  assert.equal(connection.pair.server.closeInfo?.code, 1008);
  assert.equal(connection.pair.server.closeInfo?.reason, 'session_expired');
});
