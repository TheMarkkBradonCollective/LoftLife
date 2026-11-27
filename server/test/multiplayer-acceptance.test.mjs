/**
 * Acceptance tests for the shared Main City on the Node dev runtime.
 *
 * These exercise the same contract the Cloudflare runtime must honour, using a
 * real server, a real SQLite file and real WebSocket clients:
 *   - the airport spawn is accepted and relayed to another device
 *   - a stationary player is reported at one position and never drifts
 *   - impossible movement is rejected and repeated attempts disconnect
 *   - presence reflects joins, leaves and reconnects (guests included)
 *   - parties invite/accept, chat across instances and "join leader"
 *   - joinFriend moves a player to a friend in another instance
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import WebSocket from 'ws';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-acceptance-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
process.env.LOFTLIFE_AUTH_RATE_MAX = '500';

// TheCity arrival, straight from src/game/cityLayout.ts. It is far outside the
// hotel plaza, so a spawn-agnostic server would clamp or reject it.
const AIRPORT_SPAWN = { x: 631.63, z: 447.1 };

let startServer;
let closeDb;
let server;
let base;
let port;

before(async () => {
  ({ startServer } = await import('../index.mjs'));
  ({ closeDb } = await import('../db.mjs'));
  const started = await startServer({ port: 0 });
  server = started.server;
  port = started.port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb?.();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter += 1)}`;

async function api(method, route, { token, body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

async function newAccount(overrides = {}) {
  const handle = overrides.handle ?? `p${uniq()}`;
  const res = await api('POST', '/api/auth/register', {
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'correct-horse-battery',
      displayName: overrides.displayName ?? handle,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return { handle, token: res.json.token, user: res.json.user };
}

async function newGuest(displayName) {
  const res = await api('POST', '/api/guest/session', { body: { displayName } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

function makeClient(query = '') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`);
  const queue = [];
  const waiters = [];
  let closeInfo = null;

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const index = waiters.findIndex((waiter) => waiter.pred(msg));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    } else {
      queue.push(msg);
    }
  });

  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const closed = new Promise((resolve) => {
    ws.once('close', (code, reason) => {
      closeInfo = { code, reason: String(reason) };
      resolve(closeInfo);
    });
  });

  return {
    ws,
    opened,
    closed,
    get closeInfo() {
      return closeInfo;
    },
    send(payload) {
      ws.send(JSON.stringify(payload));
    },
    waitFor(pred, timeoutMs = 5000) {
      const found = queue.findIndex(pred);
      if (found >= 0) return Promise.resolve(queue.splice(found, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.timer === timer);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for a realtime message; saw ${JSON.stringify(queue.slice(-4))}`));
        }, timeoutMs);
        waiters.push({ pred, resolve, timer });
      });
    },
    close() {
      ws.close();
    },
  };
}

async function joinCity(token) {
  const client = makeClient('?instance=city');
  await client.opened;
  client.send({ t: 'hello', token, place: { kind: 'city' } });
  const ready = await client.waitFor((m) => m.t === 'ready');
  return { client, ready };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------- movement ------------------------------- */

test('city: the airport spawn pose is accepted and relayed to another device', async () => {
  const a = await newAccount();
  const b = await newAccount();
  const { client: clientA } = await joinCity(a.token);
  const { client: clientB } = await joinCity(b.token);

  clientA.send({ t: 'pose', ...AIRPORT_SPAWN, y: 0, yaw: 1.9, location: 'world' });
  const snapshot = await clientB.waitFor(
    (m) =>
      m.t === 'snapshot' &&
      m.players.some(
        (player) => player.userId === a.user.id && Math.abs(player.x - AIRPORT_SPAWN.x) < 0.05
      )
  );
  const seen = snapshot.players.find((player) => player.userId === a.user.id);
  assert.ok(Math.abs(seen.z - AIRPORT_SPAWN.z) < 0.05, 'the spawn must not be clamped or moved');
  assert.equal(clientA.ws.readyState, WebSocket.OPEN, 'spawning must not kick the player');

  clientA.close();
  clientB.close();
});

test('city: a stationary player keeps one position and is never reported as moving', async () => {
  const mover = await newAccount();
  const watcher = await newAccount();
  const { client: clientA } = await joinCity(mover.token);
  const { client: clientB } = await joinCity(watcher.token);

  clientA.send({ t: 'pose', ...AIRPORT_SPAWN, y: 0, yaw: 0.4, emote: 'idle', location: 'world' });
  // Stand still exactly like the client does: one pose per 100 ms.
  for (let index = 0; index < 4; index += 1) {
    await sleep(110);
    clientA.send({ t: 'pose', ...AIRPORT_SPAWN, y: 0, yaw: 0.4, emote: 'idle', location: 'world' });
  }

  const snapshot = await clientB.waitFor(
    (m) => m.t === 'snapshot' && m.players.some((player) => player.userId === mover.user.id)
  );
  const me = snapshot.players.find((player) => player.userId === mover.user.id);
  assert.equal(me.x, AIRPORT_SPAWN.x);
  assert.equal(me.z, AIRPORT_SPAWN.z);
  assert.equal(clientA.ws.readyState, WebSocket.OPEN);

  clientA.close();
  clientB.close();
});

test('city: impossible movement is rejected and repeated attempts disconnect', async () => {
  const cheater = await newAccount();
  const watcher = await newAccount();
  const { client: clientA } = await joinCity(cheater.token);
  const { client: clientB } = await joinCity(watcher.token);

  clientA.send({ t: 'pose', ...AIRPORT_SPAWN, y: 0, yaw: 0, location: 'world' });
  await clientB.waitFor(
    (m) => m.t === 'snapshot' && m.players.some((player) => player.userId === cheater.user.id)
  );
  // Placement is accepted for a short window after joining so a late first pose
  // can claim the real spawn; wait it out before testing rejected movement.
  await sleep(5_200);

  // One huge jump: rejected, the player stays where the server last put them.
  clientA.send({ t: 'pose', x: 20, z: 20, y: 0, yaw: 0, location: 'world' });
  await sleep(250);
  const afterJump = await clientB.waitFor(
    (m) =>
      m.t === 'snapshot' &&
      m.players.some(
        (player) => player.userId === cheater.user.id && Math.abs(player.x - AIRPORT_SPAWN.x) < 0.05
      )
  );
  assert.ok(afterJump, 'a teleport must not move the authoritative position');

  // Keep insisting: the gateway drops the connection.
  for (let index = 0; index < 16; index += 1) {
    clientA.send({ t: 'pose', x: 20, z: 20, y: 0, yaw: 0, location: 'world' });
    await sleep(120);
  }
  const closed = await clientA.closed;
  assert.equal(closed.code, 4002, `expected the movement close code, got ${closed.code}`);

  clientB.close();
});

/* ------------------------------- presence ------------------------------- */

test('presence: joins, leaves and reconnects are visible and guests count', async () => {
  const guest = await newGuest('Presence Guest');
  const first = await joinCity(guest.token);

  const before = await api('GET', '/api/presence');
  assert.equal(before.json.cityCapacity, 64, 'TheCity is one shared 64-player city');
  const instance = before.json.instances.find((entry) => entry.id === 'city:main');
  assert.ok(instance, 'the shared city reports presence');
  assert.ok(instance.count >= 1, 'a guest counts toward city presence');
  assert.ok(before.json.online >= 1);

  const watcher = await joinCity(guest.token);
  first.client.close();
  const leave = await watcher.client.waitFor((m) => m.t === 'leave');
  assert.ok(leave.connId, 'leaving is broadcast to the other connection');

  const afterLeave = await api('GET', '/api/presence');
  const liveCount = afterLeave.json.instances.find((entry) => entry.id === 'city:main')?.count ?? 0;
  assert.ok(liveCount < before.json.online + 1, 'a closed socket stops counting');

  // Reconnect: the same guest token can rejoin and is announced again.
  const rejoined = makeClient('?instance=city');
  await rejoined.opened;
  rejoined.send({ t: 'hello', token: guest.token, place: { kind: 'city' } });
  const ready = await rejoined.waitFor((m) => m.t === 'ready');
  assert.equal(ready.you.name, 'Guest User - Presence Guest');
  const join = await watcher.client.waitFor(
    (m) => m.t === 'join' && m.player.userId === guest.guest.id
  );
  assert.equal(join.player.isGuest, true);

  rejoined.close();
  watcher.client.close();
});

/* ------------------------------ party + friend --------------------------- */

async function publicWorld(owner) {
  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: `Acceptance ${uniq()}`, access: 'public' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const published = await api('PATCH', `/api/worlds/${created.json.id}`, {
    token: owner.token,
    body: { published: true },
  });
  assert.equal(published.status, 200, JSON.stringify(published.json));
  return created.json.id;
}

async function joinWorld(token, worldId) {
  const client = makeClient(`?instance=world:${worldId}`);
  await client.opened;
  client.send({ t: 'hello', token, place: { kind: 'world', worldId } });
  const ready = await client.waitFor((m) => m.t === 'ready');
  assert.equal(ready.instance.id, `world:${worldId}`);
  return client;
}

test('party: invite, accept, cross-instance chat and join leader', async () => {
  const leader = await newAccount();
  const member = await newAccount();
  const worldId = await publicWorld(leader);

  const leaderWorld = await joinWorld(leader.token, worldId);
  const { client: memberCity, ready: memberReady } = await joinCity(member.token);

  leaderWorld.send({ t: 'party', action: 'create' });
  await leaderWorld.waitFor((m) => m.t === 'party' && m.party?.members?.length === 1);

  leaderWorld.send({ t: 'party', action: 'invite', handle: member.handle });
  const invite = await memberCity.waitFor(
    (m) => m.t === 'party' && m.invites?.some((party) => party.leaderId === leader.user.id)
  );
  assert.equal(invite.party, null);

  memberCity.send({ t: 'party', action: 'accept' });
  const joined = await memberCity.waitFor(
    (m) => m.t === 'party' && m.party?.members?.some((entry) => entry.userId === leader.user.id)
  );
  assert.ok(joined.party.members.some((entry) => entry.userId === member.user.id));

  // Party chat is one conversation across instances.
  memberCity.send({ t: 'chat', scope: 'party', body: 'party across shards' });
  const chat = await leaderWorld.waitFor((m) => m.t === 'chat' && m.scope === 'party');
  assert.equal(chat.body, 'party across shards');
  assert.equal(chat.from.userId, member.user.id);
  assert.ok(memberReady.you.connId);

  // "Join leader" moves the member from the city into the leader's world.
  await sleep(150);
  memberCity.send({ t: 'party', action: 'join' });
  const moved = await memberCity.waitFor((m) => m.t === 'ready');
  assert.equal(moved.instance.id, `world:${worldId}`);
  assert.equal(moved.instance.kind, 'world');

  leaderWorld.close();
  memberCity.close();
});

test('friends: joinFriend moves the player to a friend in another instance', async () => {
  const host = await newAccount();
  const friend = await newAccount();
  const worldId = await publicWorld(host);
  const hostWorld = await joinWorld(host.token, worldId);
  const { client: friendCity } = await joinCity(friend.token);

  friendCity.send({ t: 'joinFriend', handle: host.handle });
  const moved = await friendCity.waitFor((m) => m.t === 'ready');
  assert.equal(moved.instance.id, `world:${worldId}`);

  // A player who is not connected cannot be joined.
  const stranger = makeClient('?instance=city');
  await stranger.opened;
  stranger.send({ t: 'hello', token: friend.token, place: { kind: 'city' } });
  await stranger.waitFor((m) => m.t === 'ready');
  stranger.send({ t: 'joinFriend', handle: 'nobody_online_here' });
  const missing = await stranger.waitFor((m) => m.t === 'error');
  assert.equal(missing.code, 'not_found');

  hostWorld.close();
  friendCity.close();
  stranger.close();
});
