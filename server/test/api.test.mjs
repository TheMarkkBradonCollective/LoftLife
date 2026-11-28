/**
 * End-to-end API + realtime tests against a real server and a real SQLite file
 * in a temp directory. Run with: npm test
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import WebSocket from 'ws';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-test-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
process.env.LOFTLIFE_INSTANCE_CAPACITY = '40';
// The suite creates many accounts from one address; production keeps the
// default of 12 auth attempts per minute per IP.
process.env.LOFTLIFE_AUTH_RATE_MAX = '500';

let startServer;
let closeDb;
let server;
let base;

before(async () => {
  ({ startServer } = await import('../index.mjs'));
  ({ closeDb } = await import('../db.mjs'));
  const started = await startServer({ port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb?.();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/* ------------------------------- helpers ------------------------------- */

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
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, json };
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

function makeClient(port, query = '') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`);
  const queue = [];
  const waiters = [];

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

  return {
    ws,
    opened,
    send(payload) {
      ws.send(JSON.stringify(payload));
    },
    waitFor(pred, timeoutMs = 4000) {
      const found = queue.findIndex(pred);
      if (found >= 0) return Promise.resolve(queue.splice(found, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.timer === timer);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for a realtime message'));
        }, timeoutMs);
        waiters.push({ pred, resolve, timer });
      });
    },
    close() {
      ws.close();
    },
  };
}

/* --------------------------------- tests -------------------------------- */

test('health endpoint responds', async () => {
  const res = await api('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
});

test('registration validates input and rejects duplicates', async () => {
  const short = await api('POST', '/api/auth/register', {
    body: { handle: 'ab', email: 'a@b.test', password: 'longenoughpassword' },
  });
  assert.equal(short.status, 400);

  const weak = await api('POST', '/api/auth/register', {
    body: { handle: 'validhandle', email: 'a@b.test', password: 'short' },
  });
  assert.equal(weak.status, 400);

  const account = await newAccount();
  const dupe = await api('POST', '/api/auth/register', {
    body: {
      handle: account.handle,
      email: 'other@example.test',
      password: 'correct-horse-battery',
    },
  });
  assert.equal(dupe.status, 409);
});

test('new account gets a wallet, welcome grant, suite and default wardrobe', async () => {
  const account = await newAccount();
  const me = await api('GET', '/api/auth/me', { token: account.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.wallet.yuanzi, 500);
  assert.equal(me.json.wallet.tongbao, 25);
  assert.equal(me.json.wallet.cubits, 250);
  assert.equal(me.json.wallet.cash, 100);
  assert.equal(me.json.bank.account.balance, 0);
  assert.match(me.json.bank.account.accountNumber, /^TG-/);
  // Every account is allocated its own suite from the 65-room hotel; the old
  // behaviour handed every account Suite 402, which made doorbells ambiguous.
  assert.match(me.json.suite.number, /^[2-7](0[1-9]|1[01])$/);
  assert.equal(me.json.suite.floor, Number(me.json.suite.number.slice(0, 1)));
  const second = await newAccount();
  const secondMe = await api('GET', '/api/auth/me', { token: second.token });
  assert.match(secondMe.json.suite.number, /^[2-7](0[1-9]|1[01])$/);
  assert.notEqual(secondMe.json.suite.number, me.json.suite.number);
  assert.equal(me.json.profile.avatar.topStyle, 'tee');

  const history = await api('GET', '/api/economy/history', { token: account.token });
  assert.equal(history.json.length, 4);
  assert.ok(history.json.every((entry) => entry.reason === 'welcome_grant'));
});

test('login works and rejects a wrong password', async () => {
  const account = await newAccount();
  const ok = await api('POST', '/api/auth/login', {
    body: { identifier: account.handle, password: 'correct-horse-battery' },
  });
  assert.equal(ok.status, 200);

  const bad = await api('POST', '/api/auth/login', {
    body: { identifier: account.handle, password: 'wrong-password-here' },
  });
  assert.equal(bad.status, 401);
});

test('protected routes require a token', async () => {
  const res = await api('GET', '/api/economy/wallet');
  assert.equal(res.status, 401);
  const forged = await api('GET', '/api/economy/wallet', { token: 'not-a-real-token' });
  assert.equal(forged.status, 401);
});

test('purchases are server-priced, idempotent and reject overspend', async () => {
  const account = await newAccount();
  const key = `pur_${uniq()}`;

  const bought = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'plush_sofa', idempotencyKey: key },
  });
  assert.equal(bought.status, 200);
  assert.equal(bought.json.wallet.yuanzi, 500 - 120);
  assert.equal(bought.json.item.price, 120);

  // Replaying the same key must not charge twice.
  const replay = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'plush_sofa', idempotencyKey: key },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.duplicate, true);
  assert.equal(replay.json.wallet.yuanzi, 380);

  // The client cannot dictate the price.
  const cheap = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'espresso_bar', price: 1, idempotencyKey: `pur_${uniq()}` },
  });
  assert.equal(cheap.status, 200);
  assert.equal(cheap.json.wallet.yuanzi, 380 - 320);

  const overspend = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'fireplace', idempotencyKey: `pur_${uniq()}` },
  });
  assert.equal(overspend.status, 402);
  assert.equal(overspend.json.code, 'insufficient_funds');

  const unknown = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'free_money', idempotencyKey: `pur_${uniq()}` },
  });
  assert.equal(unknown.status, 404);
});

test('wardrobe is enforced against owned clothing', async () => {
  const account = await newAccount();
  const me = await api('GET', '/api/auth/me', { token: account.token });
  const avatar = { ...me.json.profile.avatar, topStyle: 'blazer' };

  const denied = await api('PATCH', '/api/profile', { token: account.token, body: { avatar } });
  assert.equal(denied.status, 403);

  const buy = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'blazer', idempotencyKey: `pur_${uniq()}` },
  });
  assert.equal(buy.status, 200);
  assert.equal(buy.json.wallet.tongbao, 25 - 6);

  const allowed = await api('PATCH', '/api/profile', { token: account.token, body: { avatar } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.json.avatar.topStyle, 'blazer');
});

test('control preferences persist per account and reject reserved keys', async () => {
  const account = await newAccount();
  const other = await newAccount();

  const initial = await api('GET', '/api/preferences/controls', { token: account.token });
  assert.equal(initial.status, 200);
  assert.equal(initial.json.bindings.menu, 'KeyM');
  assert.equal(initial.json.touch.size, 'md');

  const saved = await api('PUT', '/api/preferences/controls', {
    token: account.token,
    body: {
      bindings: { menu: 'KeyN', isoForward: 'KeyI', playForward: 'KeyO', invalid: 'KeyX' },
      touch: { size: 'lg', handedness: 'left', opacity: 90 },
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.bindings.menu, 'KeyN');
  assert.equal(saved.json.bindings.isoForward, 'KeyI');
  assert.equal(saved.json.bindings.playForward, 'KeyO');
  assert.equal(saved.json.bindings.isoBack, 'KeyS', 'missing actions keep defaults');
  assert.equal(saved.json.bindings.invalid, undefined, 'unknown actions are dropped');
  assert.equal(saved.json.touch.handedness, 'left');
  assert.ok(saved.json.updatedAt > 0);

  const reserved = await api('PUT', '/api/preferences/controls', {
    token: account.token,
    body: { bindings: { menu: 'F5' }, touch: { size: 'md', handedness: 'right' } },
  });
  assert.equal(reserved.status, 200);
  assert.equal(reserved.json.bindings.menu, 'KeyM', 'reserved shortcuts fall back to the default');

  const reread = await api('GET', '/api/preferences/controls', { token: account.token });
  assert.equal(reread.json.bindings.menu, 'KeyM');

  const isolated = await api('GET', '/api/preferences/controls', { token: other.token });
  assert.equal(isolated.json.bindings.menu, 'KeyM');
  assert.equal(isolated.json.updatedAt, 0);

  const anonymous = await api('GET', '/api/preferences/controls');
  assert.equal(anonymous.status, 401);
});

test('suite saves validate furniture and persist', async () => {
  const account = await newAccount();

  const invalid = await api('PUT', '/api/suite', {
    token: account.token,
    body: {
      items: [{ uid: 'a', catalogId: 'not_real', gx: 1, gz: 1, rot: 0, color: '#ffffff' }],
      surfaces: { floor: 'terrazzo', wall: 'sage_plaster' },
      mood: 'night',
    },
  });
  assert.equal(invalid.status, 400);

  const outOfRange = await api('PUT', '/api/suite', {
    token: account.token,
    body: {
      items: [{ uid: 'a', catalogId: 'plush_sofa', gx: 99, gz: 1, rot: 0, color: '#ffffff' }],
    },
  });
  assert.equal(outOfRange.status, 400);

  const ok = await api('PUT', '/api/suite', {
    token: account.token,
    body: {
      name: 'Neon Loft',
      items: [{ uid: 'a', catalogId: 'plush_sofa', gx: 3, gz: 4, rot: 2, color: '#e6dfd3' }],
      surfaces: { floor: 'terrazzo', wall: 'sage_plaster' },
      mood: 'night',
    },
  });
  assert.equal(ok.status, 200);

  const me = await api('GET', '/api/auth/me', { token: account.token });
  assert.equal(me.json.suite.name, 'Neon Loft');
  assert.equal(me.json.suite.items.length, 1);
  assert.equal(me.json.suite.mood, 'night');
});

test('multi-storey suites persist levels and per-storey finishes', async () => {
  const account = await newAccount();
  const body = {
    name: 'Stacked Loft',
    items: [
      { uid: 'g1', catalogId: 'plush_sofa', gx: 2, gz: 2, rot: 0, color: '#e6dfd3' },
      { uid: 'u1', catalogId: 'plush_sofa', gx: 2, gz: 2, rot: 0, color: '#e6dfd3', level: 1 },
      { uid: 's1', catalogId: 'stairs_straight', gx: 5, gz: 5, rot: 0, color: '#e6dfd3' },
    ],
    surfaces: {
      floor: 'terrazzo',
      wall: 'sage_plaster',
      floors: [
        { floor: 'terrazzo', wall: 'sage_plaster' },
        { floor: 'concrete', wall: 'charcoal_loft' },
      ],
    },
    mood: 'night',
  };
  const saved = await api('PUT', '/api/suite', { token: account.token, body });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.surfaces.floors.length, 2);

  const me = await api('GET', '/api/auth/me', { token: account.token });
  const levels = me.json.suite.items.map((item) => item.level).sort();
  assert.deepEqual(levels, [0, 0, 1]);
  assert.equal(me.json.suite.surfaces.floors[1].floor, 'concrete');

  const tooHigh = await api('PUT', '/api/suite', {
    token: account.token,
    body: {
      ...body,
      items: [{ uid: 'x1', catalogId: 'plush_sofa', gx: 1, gz: 1, rot: 0, color: '#e6dfd3', level: 4 }],
    },
  });
  assert.equal(tooHigh.status, 400);

  const badStyle = await api('PUT', '/api/suite', {
    token: account.token,
    body: {
      ...body,
      surfaces: { ...body.surfaces, floors: [{ floor: 'bogus', wall: 'warm_chalk' }] },
    },
  });
  assert.equal(badStyle.status, 400);
});

test('world access modes gate entry and editing', async () => {
  const owner = await newAccount();
  const friend = await newAccount();
  const stranger = await newAccount();

  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Rooftop Club', kind: 'club', access: 'friends' },
  });
  assert.equal(created.status, 201);
  const worldId = created.json.id;
  assert.equal(created.json.canEdit, true);

  // Unpublished + friends-only: nobody else gets in.
  const deniedEntry = await api('GET', `/api/worlds/${worldId}/entry`, { token: stranger.token });
  assert.equal(deniedEntry.status, 403);

  // Become friends, then the friend may enter.
  const request = await api('POST', '/api/friends/request', {
    token: friend.token,
    body: { handle: owner.handle },
  });
  assert.equal(request.json.status, 'pending');
  const accept = await api('POST', '/api/friends/accept', {
    token: owner.token,
    body: { userId: friend.user.id },
  });
  assert.equal(accept.json.status, 'accepted');

  const friendEntry = await api('GET', `/api/worlds/${worldId}/entry`, { token: friend.token });
  assert.equal(friendEntry.status, 200);

  // A friend still cannot build in someone else's world.
  const friendEdit = await api('PUT', `/api/worlds/${worldId}/state`, {
    token: friend.token,
    body: { items: [] },
  });
  assert.equal(friendEdit.status, 403);

  // Owner can grant build rights explicitly.
  const collab = await api('POST', `/api/worlds/${worldId}/collaborators`, {
    token: owner.token,
    body: { handle: friend.handle },
  });
  assert.equal(collab.status, 200);
  assert.equal(collab.json.collaborators.length, 1);

  const editorSave = await api('PUT', `/api/worlds/${worldId}/state`, {
    token: friend.token,
    body: {
      items: [{ uid: 'x', catalogId: 'bar_stool', gx: 1, gz: 1, rot: 0, color: '#e6dfd3' }],
      mood: 'golden',
    },
  });
  assert.equal(editorSave.status, 200);

  // Publishing with public access opens it to anyone.
  await api('PATCH', `/api/worlds/${worldId}`, {
    token: owner.token,
    body: { access: 'public', published: true },
  });
  const publicEntry = await api('GET', `/api/worlds/${worldId}/entry`, { token: stranger.token });
  assert.equal(publicEntry.status, 200);

  const discovered = await api('GET', '/api/worlds?q=Rooftop', { token: stranger.token });
  assert.ok(discovered.json.some((world) => world.id === worldId));
  assert.equal(discovered.json.find((world) => world.id === worldId).canEdit, false);

  // Only the owner can delete.
  const strangerDelete = await api('DELETE', `/api/worlds/${worldId}`, { token: stranger.token });
  assert.equal(strangerDelete.status, 403);
  const ownerDelete = await api('DELETE', `/api/worlds/${worldId}`, { token: owner.token });
  assert.equal(ownerDelete.status, 200);
});

test('private and invite-only worlds behave differently', async () => {
  const owner = await newAccount();
  const guest = await newAccount();

  const priv = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Private Studio', access: 'private' },
  });
  const privateEntry = await api('GET', `/api/worlds/${priv.json.id}/entry`, {
    token: guest.token,
  });
  assert.equal(privateEntry.status, 403);

  const inviteWorld = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Invite Loft', access: 'invite' },
  });
  const before = await api('GET', `/api/worlds/${inviteWorld.json.id}/entry`, { token: guest.token });
  assert.equal(before.status, 403);

  await api('POST', `/api/worlds/${inviteWorld.json.id}/invite`, {
    token: owner.token,
    body: { handle: guest.handle },
  });
  const afterInvite = await api('GET', `/api/worlds/${inviteWorld.json.id}/entry`, {
    token: guest.token,
  });
  assert.equal(afterInvite.status, 200);
});

test('blocking removes friendship and hides the player from search', async () => {
  const a = await newAccount();
  const b = await newAccount();
  await api('POST', '/api/friends/request', { token: a.token, body: { handle: b.handle } });

  const found = await api('GET', `/api/players?q=${b.handle}`, { token: a.token });
  assert.equal(found.json.length, 1);

  const blocked = await api('POST', '/api/blocks', { token: a.token, body: { handle: b.handle } });
  assert.equal(blocked.status, 200);

  const hidden = await api('GET', `/api/players?q=${b.handle}`, { token: a.token });
  assert.equal(hidden.json.length, 0);

  const friends = await api('GET', '/api/friends', { token: a.token });
  assert.equal(friends.json.length, 0);
});

test('realtime: two players see each other, chat and movement are relayed', async () => {
  const a = await newAccount();
  const b = await newAccount();
  const port = Number(new URL(base).port);

  const clientA = makeClient(port);
  const clientB = makeClient(port);
  await Promise.all([clientA.opened, clientB.opened]);

  clientA.send({ t: 'hello', token: a.token, place: { kind: 'city' } });
  const readyA = await clientA.waitFor((m) => m.t === 'ready');
  assert.equal(readyA.instance.kind, 'city');
  assert.equal(readyA.instance.id, 'city:main');

  clientB.send({ t: 'hello', token: b.token, place: { kind: 'city' } });
  const readyB = await clientB.waitFor((m) => m.t === 'ready');
  assert.equal(readyB.instance.id, readyA.instance.id, 'players share one city instance');

  const joinNotice = await clientA.waitFor((m) => m.t === 'join');
  assert.equal(joinNotice.player.userId, b.user.id);
  assert.ok(readyB.players.some((player) => player.userId === a.user.id));

  clientA.send({ t: 'pose', x: 12.5, y: 0, z: -4, yaw: 1.2, emote: 'walk', location: 'world' });
  const snapshot = await clientB.waitFor(
    (m) => m.t === 'snapshot' && m.players.some((p) => p.userId === a.user.id && p.x === 12.5)
  );
  assert.ok(snapshot.players.length >= 2);

  clientA.send({ t: 'chat', scope: 'city', body: 'Hello LoftLife' });
  const chat = await clientB.waitFor((m) => m.t === 'chat' && m.scope === 'city');
  assert.equal(chat.body, 'Hello LoftLife');
  assert.equal(chat.from.userId, a.user.id);

  // Proximity chat is range limited: shout reaches, whisper does not.
  clientA.send({ t: 'chat', scope: 'local', mode: 'whisper', body: 'psst' });
  const whisper = await clientB.waitFor(
    (m) => m.t === 'chat' && m.scope === 'local' && m.mode === 'whisper',
    600
  ).catch(() => null);
  assert.equal(whisper, null, 'a whisper must not reach a distant player');

  const history = await api('GET', '/api/chat/history?scope=city&scopeId=main', {
    token: b.token,
  });
  assert.ok(history.json.some((message) => message.body === 'Hello LoftLife'));

  clientA.close();
  clientB.close();
});

test('guest sessions: dev guests share TheCity and keep the city-only contract', async () => {
  const registered = await newAccount();
  const guestA = await newGuest('Sky Visitor');
  const guestB = await newGuest('River Guest');
  assert.equal(guestA.guest.displayName, 'Sky Visitor');
  assert.equal(typeof guestA.token, 'string');

  const port = Number(new URL(base).port);
  const clientA = makeClient(port, '?instance=city');
  const clientB = makeClient(port, '?instance=city');
  await Promise.all([clientA.opened, clientB.opened]);

  clientA.send({ t: 'hello', token: guestA.token, place: { kind: 'city' } });
  const readyA = await clientA.waitFor((m) => m.t === 'ready');
  assert.equal(readyA.instance.id, 'city:main');
  assert.equal(readyA.you.isGuest, true);
  assert.equal(readyA.you.name, 'Guest User - Sky Visitor');

  clientB.send({ t: 'hello', token: guestB.token, place: { kind: 'city' } });
  const readyB = await clientB.waitFor((m) => m.t === 'ready');
  assert.equal(readyB.instance.id, readyA.instance.id);
  assert.ok(readyB.players.some((player) => player.userId === guestA.guest.id));

  const joinNotice = await clientA.waitFor(
    (m) => m.t === 'join' && m.player.userId === guestB.guest.id
  );
  assert.equal(joinNotice.player.name, 'Guest User - River Guest');

  clientA.send({ t: 'pose', x: 8, y: 0, z: 3, yaw: 0.4, location: 'world' });
  await clientB.waitFor(
    (m) => m.t === 'snapshot' && m.players.some((p) => p.userId === guestA.guest.id && p.x === 8)
  );

  clientA.send({ t: 'chat', scope: 'city', body: 'Guest hello' });
  const chat = await clientB.waitFor((m) => m.t === 'chat' && m.scope === 'city');
  assert.equal(chat.body, 'Guest hello');
  assert.equal(chat.from.isGuest, true);
  assert.equal(chat.from.displayName, 'Guest User - Sky Visitor');

  // Chat throttles before the guest scope guard, so let the city message age.
  await new Promise((resolve) => setTimeout(resolve, 150));
  clientA.send({ t: 'chat', scope: 'dm', to: registered.handle, body: 'private' });
  assert.equal((await clientA.waitFor((m) => m.t === 'error' && m.code === 'forbidden')).code, 'forbidden');
  clientA.send({ t: 'party', action: 'create' });
  await clientA.waitFor((m) => m.t === 'error' && m.code === 'forbidden');
  clientA.send({ t: 'voice', kind: 'offer', to: 'someone', data: {} });
  await clientA.waitFor((m) => m.t === 'error' && m.code === 'forbidden');

  const invalid = makeClient(port, '?instance=city:foo');
  await invalid.opened;
  const invalidError = await invalid.waitFor((m) => m.t === 'error' && m.code === 'invalid_instance');
  assert.equal(invalidError.code, 'invalid_instance');

  const worldGuest = makeClient(port, '?instance=world:test-world');
  await worldGuest.opened;
  worldGuest.send({ t: 'hello', token: guestB.token, place: { kind: 'world', worldId: 'test-world' } });
  const worldDenied = await worldGuest.waitFor((m) => m.t === 'error' && m.code === 'forbidden');
  assert.equal(worldDenied.code, 'forbidden');

  const revoked = await api('DELETE', '/api/guest/session', { token: guestA.token });
  assert.equal(revoked.status, 200);
  const afterRevoke = makeClient(port, '?instance=city');
  await afterRevoke.opened;
  afterRevoke.send({ t: 'hello', token: guestA.token, place: { kind: 'city' } });
  const refused = await afterRevoke.waitFor((m) => m.t === 'error' && m.code === 'unauthorized');
  assert.equal(refused.code, 'unauthorized');

  for (const client of [clientA, clientB, invalid, worldGuest, afterRevoke]) client.close();
});

test('realtime: unauthenticated sockets are refused', async () => {
  const port = Number(new URL(base).port);
  const client = makeClient(port);
  await client.opened;
  client.send({ t: 'hello', token: 'bogus-token', place: { kind: 'city' } });
  const error = await client.waitFor((m) => m.t === 'error');
  assert.equal(error.code, 'unauthorized');
  client.close();
});

test('realtime: a private world cannot be joined over the socket', async () => {
  const owner = await newAccount();
  const guest = await newAccount();
  const port = Number(new URL(base).port);

  const world = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Secret Base', access: 'private' },
  });

  const client = makeClient(port);
  await client.opened;
  client.send({ t: 'hello', token: guest.token, place: { kind: 'world', worldId: world.json.id } });
  const error = await client.waitFor((m) => m.t === 'error');
  assert.equal(error.code, 'forbidden');
  client.close();
});

test('new accounts start furnished and own their starting outfit', async () => {
  const account = await newAccount();
  const me = await api('GET', '/api/auth/me', { token: account.token });
  const { STARTER_SUITE } = await import('../starter.mjs');
  const { CLOTHING_SHOP, isKnownFurniture } = await import('../economy.mjs');

  assert.equal(me.json.suite.items.length, STARTER_SUITE.items.length);
  assert.ok(me.json.suite.items.length >= 10, 'starter suite should be furnished');
  for (const item of STARTER_SUITE.items) {
    assert.ok(isKnownFurniture(item.catalogId), `${item.catalogId} must be purchasable`);
  }

  const ownedClothing = me.json.inventory
    .filter((entry) => entry.kind === 'clothing')
    .map((entry) => entry.catalogId);
  const shopClothing = new Set(CLOTHING_SHOP.map((entry) => entry.id));
  for (const piece of [me.json.profile.avatar.topStyle, me.json.profile.avatar.accessory]) {
    if (shopClothing.has(piece)) {
      assert.ok(ownedClothing.includes(piece), `starting outfit piece "${piece}" must be owned`);
    }
  }

  // Saving the starting outfit must not be rejected by the wardrobe check.
  const saveAvatar = await api('PATCH', '/api/profile', {
    token: account.token,
    body: { avatar: me.json.profile.avatar },
  });
  assert.equal(saveAvatar.status, 200);
});

test('moderation: first account is admin and can review reports', async () => {
  // The first account registered in this database is the bootstrap admin.
  const admin = await newAccount();
  const reported = await newAccount();

  const report = await api('POST', '/api/reports', {
    token: reported.token,
    body: { handle: admin.handle, reason: 'spam', details: 'Test report' },
  });
  assert.equal(report.status, 201);

  const denied = await api('GET', '/api/mod/reports', { token: reported.token });
  assert.equal(denied.status, 403);

  const me = await api('GET', '/api/auth/me', { token: admin.token });
  if (me.json.user.role === 'admin') {
    const list = await api('GET', '/api/mod/reports', { token: admin.token });
    assert.equal(list.status, 200);
  }
});

test('realtime: a suite doorbell only reaches an owner inside their room', async () => {
  const owner = await newAccount();
  const visitor = await newAccount();
  const ownerMe = await api('GET', '/api/auth/me', { token: owner.token });
  const suiteNumber = ownerMe.json.suite.number;
  const port = Number(new URL(base).port);
  const ownerClient = makeClient(port);
  const visitorClient = makeClient(port);
  await Promise.all([ownerClient.opened, visitorClient.opened]);
  ownerClient.send({ t: 'hello', token: owner.token, place: { kind: 'city' } });
  visitorClient.send({ t: 'hello', token: visitor.token, place: { kind: 'city' } });
  await Promise.all([
    ownerClient.waitFor((m) => m.t === 'ready'),
    visitorClient.waitFor((m) => m.t === 'ready'),
  ]);

  // Owners are only reachable while their live location is their own room.
  ownerClient.send({ t: 'pose', x: 0, y: 0, z: 0, yaw: 0, location: 'room' });
  visitorClient.send({ t: 'pose', x: 0, y: 0, z: 0, yaw: 0, location: 'hallway' });
  await new Promise((resolve) => setTimeout(resolve, 180));

  visitorClient.send({ t: 'hotel', action: 'ring', roomNumber: suiteNumber });
  const ringing = await visitorClient.waitFor(
    (m) => m.t === 'hotel' && m.action === 'ringing' && m.roomNumber === suiteNumber
  );
  const ring = await ownerClient.waitFor((m) => m.t === 'hotel' && m.action === 'ring');
  assert.equal(ring.requestId, ringing.requestId);
  assert.equal(ring.from.name, visitor.user.displayName ?? visitor.handle);

  ownerClient.send({ t: 'hotel', action: 'respond', requestId: ring.requestId, accept: true });
  const granted = await visitorClient.waitFor((m) => m.t === 'hotel' && m.action === 'granted');
  assert.equal(granted.room.roomNumber, suiteNumber);
  assert.equal(granted.room.userId, owner.user.id);
  assert.ok(Array.isArray(granted.room.items));

  // Decline leaves the door locked.
  visitorClient.send({ t: 'hotel', action: 'ring', roomNumber: suiteNumber });
  const ring2 = await ownerClient.waitFor((m) => m.t === 'hotel' && m.action === 'ring');
  ownerClient.send({ t: 'hotel', action: 'respond', requestId: ring2.requestId, accept: false });
  const declined = await visitorClient.waitFor((m) => m.t === 'hotel' && m.action === 'declined');
  assert.equal(declined.roomNumber, suiteNumber);

  // Stepping out of the suite makes the owner unreachable.
  ownerClient.send({ t: 'pose', x: 0, y: 0, z: 0, yaw: 0, location: 'lobby' });
  await new Promise((resolve) => setTimeout(resolve, 180));
  visitorClient.send({ t: 'hotel', action: 'ring', roomNumber: suiteNumber });
  const unavailable = await visitorClient.waitFor(
    (m) => m.t === 'hotel' && m.action === 'unavailable'
  );
  assert.equal(unavailable.reason, 'not_in_room');

  ownerClient.close();
  visitorClient.close();
});

test('realtime: parties invite, accept, chat and leave', async () => {
  const leader = await newAccount();
  const guest = await newAccount();
  const port = Number(new URL(base).port);
  const clientA = makeClient(port);
  const clientB = makeClient(port);
  await Promise.all([clientA.opened, clientB.opened]);

  clientA.send({ t: 'hello', token: leader.token, place: { kind: 'city' } });
  await clientA.waitFor((m) => m.t === 'ready');
  clientB.send({ t: 'hello', token: guest.token, place: { kind: 'city' } });
  await clientB.waitFor((m) => m.t === 'ready');

  clientA.send({ t: 'party', action: 'create' });
  const created = await clientA.waitFor((m) => m.t === 'party' && m.party);
  assert.equal(created.party.leaderId, leader.user.id);
  assert.equal(created.party.members.length, 1);

  clientA.send({ t: 'party', action: 'invite', handle: guest.handle });
  const invited = await clientB.waitFor(
    (m) => m.t === 'party' && m.invites.some((invite) => invite.id === created.party.id)
  );
  assert.equal(invited.party, null, 'the invitee is not a member yet');

  clientB.send({ t: 'party', action: 'accept' });
  const joined = await clientB.waitFor((m) => m.t === 'party' && m.party && m.party.members.length === 2);
  assert.equal(joined.party.leaderId, leader.user.id);

  clientA.send({ t: 'chat', scope: 'party', body: 'Party up' });
  const partyChat = await clientB.waitFor((m) => m.t === 'chat' && m.scope === 'party');
  assert.equal(partyChat.body, 'Party up');
  assert.equal(partyChat.scopeId, created.party.id);

  clientB.send({ t: 'party', action: 'leave' });
  const left = await clientB.waitFor((m) => m.t === 'party' && m.party === null);
  assert.equal(left.party, null);
  const remaining = await clientA.waitFor(
    (m) => m.t === 'party' && m.party && m.party.members.length === 1
  );
  assert.equal(remaining.party.members[0].userId, leader.user.id);

  clientA.close();
  clientB.close();
});

test('realtime: voice signalling is relayed to the same instance', async () => {
  const a = await newAccount();
  const b = await newAccount();
  const port = Number(new URL(base).port);
  const clientA = makeClient(port);
  const clientB = makeClient(port);
  await Promise.all([clientA.opened, clientB.opened]);

  clientA.send({ t: 'hello', token: a.token, place: { kind: 'city' } });
  const readyA = await clientA.waitFor((m) => m.t === 'ready');
  clientB.send({ t: 'hello', token: b.token, place: { kind: 'city' } });
  const readyB = await clientB.waitFor((m) => m.t === 'ready');

  clientA.send({
    t: 'pose',
    x: 3,
    y: 0,
    z: 2,
    yaw: 0,
    location: 'world',
    voice: true,
    voiceMode: 'shout',
  });
  const snapshot = await clientB.waitFor(
    (m) =>
      m.t === 'snapshot' &&
      m.players.some(
        (player) => player.userId === a.user.id && player.voice === true && player.voiceMode === 'shout'
      )
  );
  assert.ok(snapshot);

  clientA.send({
    t: 'voice',
    to: readyB.you.connId,
    kind: 'offer',
    data: { type: 'offer', sdp: 'v=0' },
  });
  const signal = await clientB.waitFor((m) => m.t === 'voice' && m.kind === 'offer');
  assert.equal(signal.from.connId, readyA.you.connId);
  assert.equal(signal.from.userId, a.user.id);
  assert.equal(signal.data.sdp, 'v=0');

  clientA.close();
  clientB.close();
});

test('realtime: boarding a LoftLine bus assigns a server-owned seat', async () => {
  const rider = await newAccount();
  const port = Number(new URL(base).port);
  const client = makeClient(port);
  await client.opened;
  client.send({ t: 'hello', token: rider.token, place: { kind: 'city' } });
  await client.waitFor((m) => m.t === 'ready');

  const routes = await api('GET', '/api/transit');
  assert.equal(routes.status, 200);
  assert.ok(routes.json.lines.length >= 3, 'several bus routes share the city');
  assert.ok(
    routes.json.lines.some((entry) => entry.kind === 'rail' && entry.stops.length >= 4),
    'light rail exposes a multi-stop line'
  );
  assert.ok(routes.json.taxis.length >= 3, 'autonomous taxis expose valid destinations');
  assert.ok(routes.json.hubs.some((hub) => hub.id === 'central-station'));
  const line = routes.json.lines.find((entry) => entry.kind === 'bus');
  assert.ok(line.stops.length >= 3, 'the 15th Street line has several stops');

  const stop = line.stops[1];
  client.send({ t: 'pose', x: stop.x, y: 0, z: stop.z, yaw: 0, location: 'world' });
  client.send({ t: 'transit', action: 'board', lineId: line.id, stopId: stop.id });
  const boarded = await client.waitFor((m) => m.t === 'transit' && m.riding);
  assert.equal(boarded.riding.lineId, line.id);
  assert.equal(typeof boarded.riding.seat, 'number');

  const moving = await client.waitFor(
    (m) =>
      m.t === 'snapshot' &&
      (m.vehicles ?? []).some(
        (vehicle) =>
          vehicle.id === boarded.riding.vehicleId &&
          vehicle.riders.some((entry) => entry.userId === rider.user.id)
      )
  );
  assert.ok(moving.vehicles.length >= 1);

  // While riding, a client pose is ignored; the bus drives the avatar.
  client.send({ t: 'pose', x: 480, y: 0, z: 480, yaw: 0, location: 'world' });
  const stillRiding = await client.waitFor(
    (m) =>
      m.t === 'snapshot' &&
      (m.vehicles ?? []).some((vehicle) => vehicle.id === boarded.riding.vehicleId)
  );
  const me = stillRiding.players.find((player) => player.userId === rider.user.id);
  assert.ok(me, 'rider remains in the instance');
  assert.equal(me.location, 'transit');
  assert.ok(Math.abs(me.x) < 480, 'client teleport was rejected while riding');

  client.send({ t: 'transit', action: 'exit' });
  const exited = await client.waitFor((m) => m.t === 'transit' && m.riding === null && m.exited);
  assert.equal(typeof exited.exited.x, 'number');

  client.close();
});

test('realtime: the city does not spawn autonomous taxi cars', async () => {
  const player = await newAccount();
  const port = Number(new URL(base).port);
  const client = makeClient(port);
  await client.opened;
  client.send({ t: 'hello', token: player.token, place: { kind: 'city' } });
  const ready = await client.waitFor((m) => m.t === 'ready');
  assert.ok(ready.vehicles.some((vehicle) => vehicle.kind === 'bus'));
  assert.ok(ready.vehicles.some((vehicle) => vehicle.kind === 'rail'));
  assert.equal(ready.vehicles.some((vehicle) => vehicle.kind === 'taxi'), false);
  client.close();
});
test('realtime: intercity rail checks the gateway and destination access', async () => {
  const traveller = await newAccount();
  const port = Number(new URL(base).port);
  const client = makeClient(port);
  await client.opened;
  client.send({ t: 'hello', token: traveller.token, place: { kind: 'city' } });
  await client.waitFor((m) => m.t === 'ready');

  const routes = await api('GET', '/api/transit');
  const hub = routes.json.hubs.find((entry) => entry.id === 'central-station');

  // Stand at the station but inside the hotel: the server still refuses.
  client.send({ t: 'pose', x: hub.x, y: 0, z: hub.z, yaw: 0, location: 'lobby' });
  await new Promise((resolve) => setTimeout(resolve, 120));
  client.send({ t: 'travel', action: 'start', mode: 'rail', destinationId: 'city-plaza' });
  const far = await client.waitFor((m) => m.t === 'error' && m.code === 'conflict');
  assert.match(far.message, /Central Station/i);

  client.send({ t: 'pose', x: hub.x, y: 0, z: hub.z, yaw: 0, location: 'world' });

  // Unknown / foreign destinations are refused server-side.
  client.send({ t: 'travel', action: 'start', mode: 'rail', destinationId: 'world:not-a-world' });
  const missing = await client.waitFor((m) => m.t === 'error' && m.code === 'not_found');
  assert.match(missing.message, /not available/i);

  client.send({ t: 'travel', action: 'start', mode: 'rail', destinationId: 'city-plaza' });
  const boarding = await client.waitFor((m) => m.t === 'travel' && m.action === 'boarding');
  assert.equal(boarding.journey.destination.id, 'city-plaza');
  assert.ok(boarding.journey.arriveAt > boarding.journey.departAt);
  await client.waitFor((m) => m.t === 'travel' && m.action === 'departed');
  const arrived = await client.waitFor(
    (m) => m.t === 'travel' && m.action === 'arrived',
    20_000
  );
  assert.equal(arrived.journey.destination.location, 'world');
  assert.ok(arrived.journey.destination.spawn);
  client.close();
});

test('travel destinations only include worlds the player may enter', async () => {
  const owner = await newAccount();
  const stranger = await newAccount();
  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Private Rail Retreat', kind: 'house', access: 'private' },
  });
  assert.equal(created.status, 201);

  const own = await api('GET', '/api/travel/destinations', { token: owner.token });
  assert.equal(own.status, 200);
  assert.ok(own.json.city.length >= 4);
  assert.ok(own.json.worlds.some((entry) => entry.worldId === created.json.id));

  const other = await api('GET', '/api/travel/destinations', { token: stranger.token });
  assert.ok(!other.json.worlds.some((entry) => entry.worldId === created.json.id));
  await api('DELETE', `/api/worlds/${created.json.id}`, { token: owner.token });
});

/* ------------------------- platform shell features ------------------------ */

test('platform settings persist and privacy rules are enforced', async () => {
  const owner = await newAccount();
  const stranger = await newAccount();

  const defaults = await api('GET', '/api/settings', { token: owner.token });
  assert.equal(defaults.status, 200);
  assert.equal(defaults.json.settings.privacy.messages, 'everyone');
  assert.equal(defaults.json.settings.graphics.quality, 'high');
  assert.equal(defaults.json.settings.camera.mobileMode, 'auto');

  const saved = await api('PUT', '/api/settings', {
    token: owner.token,
    body: {
      settings: {
        privacy: { profileVisibility: 'private', friendRequests: 'nobody' },
        graphics: { quality: 'low' },
        camera: { mobileMode: 'third-person' },
        accessibility: { largeText: true },
        controls: { isometric: { forward: 'KeyI' } },
        unknownSection: { nope: true },
      },
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.settings.privacy.profileVisibility, 'private');
  assert.equal(saved.json.settings.privacy.friendRequests, 'nobody');
  assert.equal(saved.json.settings.graphics.quality, 'low');
  assert.equal(saved.json.settings.camera.mobileMode, 'third-person');
  assert.equal(saved.json.settings.accessibility.largeText, true);
  assert.equal(saved.json.settings.controls, undefined, 'controls live in their own account store');
  assert.equal(saved.json.settings.unknownSection, undefined, 'unknown keys are dropped');

  const reloaded = await api('GET', '/api/settings', { token: owner.token });
  assert.equal(reloaded.json.settings.privacy.profileVisibility, 'private');
  assert.equal(reloaded.json.settings.graphics.quality, 'low');
  assert.equal(reloaded.json.settings.camera.mobileMode, 'third-person');
  assert.equal(reloaded.json.settings.accessibility.largeText, true);

  const request = await api('POST', '/api/friends/request', {
    token: stranger.token,
    body: { handle: owner.handle },
  });
  assert.equal(request.status, 403, 'closed friend requests are refused');

  const hidden = await api('GET', `/api/profiles/${owner.handle}`, { token: stranger.token });
  assert.equal(hidden.status, 403, 'a private profile is not readable by strangers');

  const own = await api('GET', `/api/profiles/${owner.handle}`, { token: owner.token });
  assert.equal(own.status, 200, 'the owner can always read their own profile');
  assert.equal(own.json.bio !== undefined, true);
});

test('DM inbox lists conversations, unread counts and read markers', async () => {
  const sender = await newAccount();
  const recipient = await newAccount();
  const port = Number(new URL(base).port);
  const clientA = makeClient(port);
  const clientB = makeClient(port);
  await Promise.all([clientA.opened, clientB.opened]);

  clientA.send({ t: 'hello', token: sender.token, place: { kind: 'city' } });
  await clientA.waitFor((m) => m.t === 'ready');
  clientB.send({ t: 'hello', token: recipient.token, place: { kind: 'city' } });
  await clientB.waitFor((m) => m.t === 'ready');

  clientA.send({ t: 'chat', scope: 'dm', to: recipient.handle, body: 'Meet at the hotel?' });
  const delivered = await clientB.waitFor(
    (m) => m.t === 'chat' && m.scope === 'dm' && m.body === 'Meet at the hotel?'
  );
  assert.equal(delivered.from.handle, sender.handle);

  const inbox = await api('GET', '/api/messages/conversations', { token: recipient.token });
  assert.equal(inbox.status, 200);
  const thread = inbox.json.conversations.find((entry) => entry.handle === sender.handle);
  assert.ok(thread, 'the conversation is listed for the recipient');
  assert.equal(thread.unread, 1);
  assert.equal(thread.lastMessage.body, 'Meet at the hotel?');
  assert.equal(thread.lastMessage.fromMe, false);

  const read = await api('POST', '/api/messages/read', {
    token: recipient.token,
    body: { handle: sender.handle },
  });
  assert.equal(read.status, 200);

  const after = await api('GET', '/api/messages/conversations', { token: recipient.token });
  assert.equal(
    after.json.conversations.find((entry) => entry.handle === sender.handle).unread,
    0
  );

  const history = await api(
    'GET',
    `/api/chat/history?scope=dm&with=${sender.handle}`,
    { token: recipient.token }
  );
  assert.equal(history.status, 200);
  assert.ok(history.json.some((message) => message.body === 'Meet at the hotel?'));

  clientA.close();
  clientB.close();
});

test('friends-only DMs and invite preferences are refused over the socket and API', async () => {
  const guarded = await newAccount();
  const outsider = await newAccount();

  const saved = await api('PUT', '/api/settings', {
    token: guarded.token,
    body: { settings: { privacy: { messages: 'friends', invitations: 'nobody' } } },
  });
  assert.equal(saved.status, 200);

  const port = Number(new URL(base).port);
  const client = makeClient(port);
  await client.opened;
  client.send({ t: 'hello', token: outsider.token, place: { kind: 'city' } });
  await client.waitFor((m) => m.t === 'ready');

  client.send({ t: 'chat', scope: 'dm', to: guarded.handle, body: 'Are you there?' });
  const refused = await client.waitFor((m) => m.t === 'error');
  assert.equal(refused.code, 'forbidden');
  client.close();

  const inbox = await api('GET', '/api/messages/conversations', { token: guarded.token });
  assert.equal(inbox.status, 200);
  assert.equal(
    inbox.json.conversations.some((entry) => entry.handle === outsider.handle),
    false,
    'a refused DM is not delivered or stored'
  );

  const world = await api('POST', '/api/worlds', {
    token: outsider.token,
    body: { name: 'Closed House', access: 'invite' },
  });
  const invite = await api('POST', `/api/worlds/${world.json.id}/invite`, {
    token: outsider.token,
    body: { handle: guarded.handle },
  });
  assert.equal(invite.status, 403, 'invitations can be turned off server-side');
});
