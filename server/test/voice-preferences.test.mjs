/**
 * Account voice preferences: saved with the profile, returned on the next
 * sign-in, and never clobbered by an outfit save. Runs its own server and
 * SQLite file so it cannot interfere with the other suites.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-voice-test-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
process.env.LOFTLIFE_AUTH_RATE_MAX = '500';

let server;
let base;
let closeDb;

before(async () => {
  const index = await import('../index.mjs');
  ({ closeDb } = await import('../db.mjs'));
  const started = await index.startServer({ port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb?.();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(method, route, { token, body } = {}) {
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

test('voice preferences save to the account and sync back on sign-in', async () => {
  const handle = `voice${Date.now().toString(36)}`;
  const registered = await call('POST', '/api/auth/register', {
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'correct-horse-battery',
      displayName: handle,
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.json));
  const token = registered.json.token;

  const me = await call('GET', '/api/auth/me', { token });
  assert.equal(me.status, 200);
  assert.deepEqual(me.json.profile.voice, {
    range: 'off',
    micMode: 'push-to-talk',
    sensitivity: 0.55,
  });

  const saved = await call('PATCH', '/api/profile', {
    token,
    body: { voice: { range: 'shout', micMode: 'push-to-mute', sensitivity: 0.9 } },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.deepEqual(saved.json.voice, {
    range: 'shout',
    micMode: 'push-to-mute',
    sensitivity: 0.9,
  });

  // A fresh sign-in receives the stored settings (the reconnect sync path).
  const login = await call('POST', '/api/auth/login', {
    body: { identifier: handle, password: 'correct-horse-battery' },
  });
  const after = await call('GET', '/api/auth/me', { token: login.json.token });
  assert.deepEqual(after.json.profile.voice.range, 'shout');
  assert.deepEqual(after.json.profile.voice.micMode, 'push-to-mute');
  assert.equal(after.json.profile.voice.sensitivity, 0.9);
});

test('invalid voice preferences are normalised, not rejected', async () => {
  const handle = `voicebad${Date.now().toString(36)}`;
  const registered = await call('POST', '/api/auth/register', {
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'correct-horse-battery',
      displayName: handle,
    },
  });
  const token = registered.json.token;
  const saved = await call('PATCH', '/api/profile', {
    token,
    body: { voice: { range: 'screaming', micMode: 42, sensitivity: 9 } },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.voice.range, 'off');
  assert.equal(saved.json.voice.micMode, 'push-to-talk');
  assert.equal(saved.json.voice.sensitivity, 1);
});

test('an outfit save leaves the stored voice preferences alone', async () => {
  const handle = `voicekeep${Date.now().toString(36)}`;
  const registered = await call('POST', '/api/auth/register', {
    body: {
      handle,
      email: `${handle}@example.test`,
      password: 'correct-horse-battery',
      displayName: handle,
    },
  });
  const token = registered.json.token;
  await call('PATCH', '/api/profile', {
    token,
    body: { voice: { range: 'whisper', micMode: 'toggle-to-talk', sensitivity: 0.4 } },
  });
  const saved = await call('PATCH', '/api/profile', {
    token,
    body: { bio: 'Just changing my bio.' },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.voice.range, 'whisper');
  assert.equal(saved.json.voice.micMode, 'toggle-to-talk');
  assert.equal(saved.json.voice.sensitivity, 0.4);
});

test('voice preferences require a signed-in account', async () => {
  const res = await call('PATCH', '/api/profile', {
    body: { voice: { range: 'talk', micMode: 'open-mic', sensitivity: 0.5 } },
  });
  assert.equal(res.status, 401);
});
