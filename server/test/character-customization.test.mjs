/**
 * Character customization, paid makeovers, wardrobe ownership and account
 * outfit persistence. Runs a real API server and SQLite database so the tests
 * cover the same paths the Android and desktop clients use.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-character-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
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

async function newAccount(avatar) {
  const handle = `c${uniq()}`;
  const email = `${handle}@example.test`;
  const res = await api('POST', '/api/auth/register', {
    body: { handle, email, password: 'correct-horse-battery', displayName: handle, avatar },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return { handle, email, password: 'correct-horse-battery', token: res.json.token, user: res.json.user };
}

const starterOutfit = {
  topStyle: 'tee',
  topColor: '#e6dfd3',
  bottomStyle: 'jeans',
  bottomColor: '#2b3a2a',
  shoeColor: '#1b1b1b',
  accessory: 'none',
  jewelry: 'none',
  carry: 'none',
};

test('accounts start with the full foundational avatar shape', async () => {
  const account = await newAccount();
  const me = await api('GET', '/api/auth/me', { token: account.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.profile.avatar.bodyPreset, 'balanced');
  assert.equal(me.json.profile.avatar.height, 'average');
  assert.equal(me.json.profile.avatar.build, 'average');
  assert.equal(me.json.profile.avatar.faceShape, 'oval');
  assert.equal(me.json.profile.avatar.eyeShape, 'almond');
  assert.equal(me.json.profile.avatar.facialDetail, 'none');
  assert.deepEqual(me.json.outfits, []);
  // The free starter wardrobe always includes a bottom, not only a top.
  const owned = me.json.inventory.map((entry) => entry.catalogId);
  assert.ok(owned.includes('tee'));
  assert.ok(owned.includes('jeans'));
});

test('hair and makeup save freely but foundational features require a makeover', async () => {
  const account = await newAccount();
  const me = await api('GET', '/api/auth/me', { token: account.token });
  const avatar = me.json.profile.avatar;

  const free = await api('PATCH', '/api/profile', {
    token: account.token,
    body: { avatar: { ...avatar, hairStyle: 'locs', hairColor: '#b55436', makeupStyle: 'bold' } },
  });
  assert.equal(free.status, 200, JSON.stringify(free.json));
  assert.equal(free.json.avatar.hairStyle, 'locs');
  assert.equal(free.json.avatar.makeupStyle, 'bold');

  const denied = await api('PATCH', '/api/profile', {
    token: account.token,
    body: { avatar: { ...avatar, eyebrows: 'bold' } },
  });
  assert.equal(denied.status, 403);
  assert.match(denied.json.error, /Character Makeover/);
});

test('a character makeover charges once, is idempotent and persists', async () => {
  const account = await newAccount();
  const me = await api('GET', '/api/auth/me', { token: account.token });
  const avatar = {
    ...me.json.profile.avatar,
    bodyPreset: 'athletic',
    height: 'tall',
    build: 'athletic',
    faceShape: 'square',
    eyeShape: 'upturned',
    facialDetail: 'freckles',
  };

  const missingKey = await api('POST', '/api/character/makeover', {
    token: account.token,
    body: { avatar },
  });
  assert.equal(missingKey.status, 400);

  const key = `makeover_test_${uniq()}`;
  const paid = await api('POST', '/api/character/makeover', {
    token: account.token,
    body: { avatar, idempotencyKey: key },
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.json));
  assert.equal(paid.json.charged, 250);
  assert.equal(paid.json.wallet.yuanzi, 250);
  assert.equal(paid.json.profile.avatar.bodyPreset, 'athletic');
  assert.equal(paid.json.profile.avatar.faceShape, 'square');

  const replay = await api('POST', '/api/character/makeover', {
    token: account.token,
    body: { avatar, idempotencyKey: key },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.charged, 0);
  assert.equal(replay.json.wallet.yuanzi, 250);

  const reloaded = await api('GET', '/api/auth/me', { token: account.token });
  assert.equal(reloaded.json.profile.avatar.build, 'athletic');
  assert.equal(reloaded.json.profile.avatar.facialDetail, 'freckles');

  // The same account signs in on a second device and receives the new face.
  const second = await api('POST', '/api/auth/login', {
    body: { identifier: account.email, password: account.password },
  });
  const secondMe = await api('GET', '/api/auth/me', { token: second.json.token });
  assert.equal(secondMe.json.profile.avatar.bodyPreset, 'athletic');
  assert.equal(secondMe.json.profile.avatar.faceShape, 'square');
  assert.equal(secondMe.json.profile.avatar.eyeShape, 'upturned');
});

test('a makeover idempotency key cannot be replayed by another account', async () => {
  const first = await newAccount();
  const second = await newAccount();
  const secondMe = await api('GET', '/api/auth/me', { token: second.token });
  const key = `makeover_shared_${uniq()}`;

  const paid = await api('POST', '/api/character/makeover', {
    token: first.token,
    body: { avatar: { ...secondMe.json.profile.avatar, bodyPreset: 'broad' }, idempotencyKey: key },
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.json));

  const replay = await api('POST', '/api/character/makeover', {
    token: second.token,
    body: { avatar: { ...secondMe.json.profile.avatar, bodyPreset: 'athletic' }, idempotencyKey: key },
  });
  assert.equal(replay.status, 409);

  const unchanged = await api('GET', '/api/auth/me', { token: second.token });
  assert.equal(unchanged.json.profile.avatar.bodyPreset, 'balanced');
  assert.equal(unchanged.json.wallet.yuanzi, 500);
});

test('owned bottoms unlock for wearing and unowned bottoms stay locked', async () => {
  const account = await newAccount();
  const me = await api('GET', '/api/auth/me', { token: account.token });
  const avatar = me.json.profile.avatar;

  const denied = await api('PATCH', '/api/profile', {
    token: account.token,
    body: { avatar: { ...avatar, bottomStyle: 'chinos' } },
  });
  assert.equal(denied.status, 403);
  assert.match(denied.json.error, /do not own/);

  const buy = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'chinos', idempotencyKey: `buy_chinos_${uniq()}` },
  });
  assert.equal(buy.status, 200, JSON.stringify(buy.json));
  assert.equal(buy.json.wallet.yuanzi, 430);

  const allowed = await api('PATCH', '/api/profile', {
    token: account.token,
    body: { avatar: { ...avatar, bottomStyle: 'chinos' } },
  });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.json));
  assert.equal(allowed.json.avatar.bottomStyle, 'chinos');
});

test('unlimited outfits persist across devices and deletions sync back', async () => {
  const account = await newAccount();
  for (let index = 0; index < 12; index += 1) {
    const saved = await api('POST', '/api/outfits', {
      token: account.token,
      body: { name: `Look ${index + 1}`, config: starterOutfit },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
  }

  const list = await api('GET', '/api/outfits', { token: account.token });
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 12);

  // Second device: a fresh sign-in receives the same account closet.
  const second = await api('POST', '/api/auth/login', {
    body: { identifier: account.email, password: account.password },
  });
  assert.equal(second.status, 200, JSON.stringify(second.json));
  const secondMe = await api('GET', '/api/auth/me', { token: second.json.token });
  assert.equal(secondMe.json.outfits.length, 12);
  assert.equal(secondMe.json.profile.avatar.bodyPreset, 'balanced');

  const removed = await api('DELETE', `/api/outfits/${secondMe.json.outfits[0].id}`, {
    token: second.json.token,
  });
  assert.equal(removed.status, 200);
  const firstList = await api('GET', '/api/outfits', { token: account.token });
  assert.equal(firstList.json.length, 11);
});

test('clothing ownership and saved outfits follow the account across devices', async () => {
  const account = await newAccount();
  const bought = await api('POST', '/api/economy/purchase', {
    token: account.token,
    body: { catalogId: 'hoodie', idempotencyKey: `buy_hoodie_${uniq()}` },
  });
  assert.equal(bought.status, 200, JSON.stringify(bought.json));

  const saved = await api('POST', '/api/outfits', {
    token: account.token,
    body: { name: 'Hoodie Day', config: { ...starterOutfit, topStyle: 'hoodie' } },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));

  const second = await api('POST', '/api/auth/login', {
    body: { identifier: account.email, password: account.password },
  });
  const me = await api('GET', '/api/auth/me', { token: second.json.token });
  assert.ok(me.json.inventory.some((entry) => entry.catalogId === 'hoodie'));
  assert.equal(me.json.outfits[0].name, 'Hoodie Day');

  const wear = await api('PATCH', '/api/profile', {
    token: second.json.token,
    body: { avatar: { ...me.json.profile.avatar, topStyle: 'hoodie' } },
  });
  assert.equal(wear.status, 200, JSON.stringify(wear.json));
});
