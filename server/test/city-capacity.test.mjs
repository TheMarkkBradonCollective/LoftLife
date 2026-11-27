/**
 * The Main City is one shared logical city with a 64-player capacity.
 *
 * Runs in its own process (node:test isolates test files) so the default
 * capacity is read without the suite's LOFTLIFE_INSTANCE_CAPACITY override.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import WebSocket from 'ws';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-capacity-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
process.env.LOFTLIFE_AUTH_RATE_MAX = '2000';
delete process.env.LOFTLIFE_CITY_CAPACITY;
delete process.env.LOFTLIFE_INSTANCE_CAPACITY;

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

async function guestSession(index) {
  const response = await fetch(`${base}/api/guest/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: `Capacity Guest ${index}` }),
  });
  const text = await response.text();
  assert.equal(response.status, 201, text);
  return JSON.parse(text);
}

/** Connect a client and resolve with its `ready` payload or the rejecting error. */
function openClient(token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?instance=city`);
  const messages = [];
  let closeInfo = null;
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  ws.on('close', (code) => {
    closeInfo = code;
  });
  const settled = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('client did not settle')), 10_000);
    const poll = setInterval(() => {
      const ready = messages.find((message) => message.t === 'ready');
      const error = messages.find((message) => message.t === 'error');
      if (ready || (error && closeInfo !== null)) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve({ ready, error, closeInfo, messages, ws });
      }
    }, 20);
  });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    opened,
    settled,
    get closeInfo() {
      return closeInfo;
    },
  };
}

test('the shared city holds 64 players and rejects the 65th', async () => {
  const presence = await fetch(`${base}/api/presence`).then((response) => response.json());
  assert.equal(presence.cityCapacity, 64, 'default capacity is 64 players');

  const sessions = await Promise.all(Array.from({ length: 65 }, (_, index) => guestSession(index)));
  const clients = [];
  const rejections = [];

  // Join in waves so the server is not hit with 64 upgrades at once.
  for (let offset = 0; offset < 64; offset += 8) {
    const wave = sessions.slice(offset, offset + 8).map((session) => {
      const client = openClient(session.token);
      clients.push(client);
      return client.opened.then(() => {
        client.ws.send(JSON.stringify({ t: 'hello', token: session.token, place: { kind: 'city' } }));
        return client.settled;
      });
    });
    const results = await Promise.all(wave);
    for (const result of results) {
      assert.ok(result.ready, `a player inside the capacity must be admitted: ${JSON.stringify(result.messages)}`);
      assert.equal(result.ready.instance.id, 'city:main');
      assert.equal(result.ready.instance.capacity, 64);
    }
  }

  const last = sessions[64];
  const overflow = openClient(last.token);
  await overflow.opened;
  overflow.ws.send(JSON.stringify({ t: 'hello', token: last.token, place: { kind: 'city' } }));
  const result = await overflow.settled;
  rejections.push(result);

  assert.equal(result.ready, undefined, 'the 65th player must not be admitted');
  assert.equal(result.error?.code, 'instance_full');
  assert.equal(result.closeInfo, 1013);

  const full = await fetch(`${base}/api/presence`).then((response) => response.json());
  const city = full.instances.find((entry) => entry.id === 'city:main');
  assert.equal(city.count, 64, 'the city reports exactly its capacity, never more');

  for (const client of clients) client.ws.close();
});
