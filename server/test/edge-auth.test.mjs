/**
 * Cloudflare-issued identity tests.
 *
 * The Worker stores accounts in Neon and signs session tokens; this suite
 * proves the Node game server verifies those tokens with the shared secret and
 * provisions a matching account, so one sign-in spans both runtimes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-edge-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
process.env.LOFTLIFE_AUTH_RATE_MAX = '500';
// Must match the secret configured on the Worker (wrangler secret put).
process.env.LOFTLIFE_SESSION_SECRET = 'edge-suite-secret-0123456789abcdef0123456789abcdef';

const secret = process.env.LOFTLIFE_SESSION_SECRET;
const otherSecret = 'a-different-secret-0123456789abcdef0123456789abcdef';

const { hashPassword, signAuthToken, verifyAuthToken, verifyPassword } = await import(
  '../../shared/auth-core.mjs'
);

let startServer;
let closeDb;
let server;
let base;
let counter = 0;

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function edgeToken(overrides = {}) {
  const { secret: signingSecret = secret, ...claims } = overrides;
  counter += 1;
  return signAuthToken(
    {
      sub: `usr_edge_${counter}_${Date.now().toString(36)}`,
      handle: `edge${counter}`,
      role: 'player',
      name: `Edge ${counter}`,
      sid: `sess-${counter}`,
      iat: nowSeconds(),
      exp: nowSeconds() + 3600,
      ...claims,
    },
    signingSecret
  );
}

function me(token) {
  return fetch(`${base}/api/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

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

test('edge auth: password hashing round-trips and rejects wrong input', async () => {
  const stored = await hashPassword('correct-horse-battery');
  assert.match(stored, /^pbkdf2\$\d+\$/);
  assert.equal(await verifyPassword('correct-horse-battery', stored), true);
  assert.equal(await verifyPassword('wrong-password-here', stored), false);
  assert.equal(await verifyPassword('correct-horse-battery', 'garbage'), false);
});

test('edge auth: tokens verify by signature and expire', async () => {
  const valid = await edgeToken({ sub: 'usr_token_check' });
  const payload = await verifyAuthToken(valid, secret);
  assert.equal(payload?.sub, 'usr_token_check');

  assert.equal(await verifyAuthToken(`${valid}tampered`, secret), null);
  assert.equal(await verifyAuthToken(valid, otherSecret), null);

  const expired = await edgeToken({ sub: 'usr_expired', exp: nowSeconds() - 5 });
  assert.equal(await verifyAuthToken(expired, secret), null);
});

test('edge auth: a Cloudflare token signs into the game server and provisions an account', async () => {
  const token = await edgeToken({ sub: 'usr_edge_provision', handle: 'edgekate', name: 'Kate' });
  const response = await me(token);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.user.id, 'usr_edge_provision');
  assert.equal(body.user.handle, 'edgekate');
  assert.equal(body.profile.displayName, 'Kate');
  // New accounts still start with the welcome grant and the furnished suite.
  assert.equal(body.wallet.yuanzi, 500);
  assert.equal(body.wallet.tongbao, 25);
  assert.equal(body.wallet.cubits, 250);
  assert.equal(body.wallet.cash, 100);
  assert.equal(body.suite.number, '402');
  assert.ok(body.inventory.length >= 1);

  // A repeat request reuses the linked account instead of creating another.
  const again = await me(token);
  assert.equal(again.status, 200);
  const second = await again.json();
  assert.equal(second.user.id, 'usr_edge_provision');
  assert.equal(second.profile.displayName, 'Kate');
});

test('edge auth: invalid, expired and foreign-signed tokens are rejected', async () => {
  for (const token of [
    await edgeToken({ sub: 'usr_bad_sig' }) + 'x',
    await edgeToken({ sub: 'usr_expired_token', exp: nowSeconds() - 60 }),
    await edgeToken({ sub: 'usr_foreign', secret: otherSecret }),
    'llt1.not-a-token',
    '',
  ]) {
    const response = await me(token);
    assert.equal(response.status, 401);
  }
});

test('edge auth: local registration and its own sessions still work', async () => {
  const handle = `local${Date.now().toString(36).slice(-8)}`;
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      handle,
      email: `${handle}@example.test`,
      password: 'correct-horse-battery',
    }),
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.user.handle, handle);

  const session = await fetch(`${base}/api/auth/me`, {
    headers: { authorization: `Bearer ${created.token}` },
  });
  assert.equal(session.status, 200);
  const body = await session.json();
  assert.equal(body.user.id, created.user.id);
});
