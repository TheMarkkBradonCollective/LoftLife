#!/usr/bin/env node
/**
 * Live edge-identity check: real Worker code -> Neon Postgres -> signed token ->
 * Node game server.
 *
 * This runs `src/cloudflare/worker.ts` itself (bundled for Node) instead of a
 * reimplementation, so it exercises the exact fetch handler that ships to
 * Cloudflare: schema creation, PBKDF2 hashing, session rows, token signing and
 * the `/api/*` proxy. The game server runs in-process with the same
 * LOFTLIFE_SESSION_SECRET, so it proves the cross-runtime identity hand-off.
 *
 * Requires two environment variables and never prints either of them:
 *   DATABASE_URL               Neon pooled connection string
 *   LOFTLIFE_SESSION_SECRET    >= 32 characters, same value on Worker and server
 *
 * Run with: npm run verify:edge
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
const secret = process.env.LOFTLIFE_SESSION_SECRET ?? '';

function abort(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!databaseUrl) {
  abort(
    'DATABASE_URL is not set. Add the Neon pooled connection string to this project\'s ' +
      'secrets (Settings → Project settings → Secrets) and re-run; do not paste it into chat.'
  );
}
if (secret.length < 32) {
  abort(
    'LOFTLIFE_SESSION_SECRET must be at least 32 characters. Add it to this project\'s secrets ' +
      'and use the same value on the deployed Worker.'
  );
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-edge-verify-'));
process.env.LOFTLIFE_DATA_DIR = path.join(workDir, 'data');
process.env.LOFTLIFE_AUTH_RATE_MAX = '500';
process.env.LOFTLIFE_SESSION_SECRET = secret;

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✔ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✖ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Bundle the shipping Worker source for Node; same file, same behaviour. */
function buildWorker() {
  const out = path.join(workDir, 'worker.mjs');
  const esbuild = path.join(ROOT, 'node_modules', '.bin', 'esbuild');
  execFileSync(
    esbuild,
    [
      path.join(ROOT, 'src/cloudflare/worker.ts'),
      '--bundle',
      '--format=esm',
      '--platform=node',
      '--log-level=warning',
      `--outfile=${out}`,
    ],
    { cwd: ROOT, stdio: 'inherit' }
  );
  return out;
}

const workerModule = await import(pathToFileURL(buildWorker()).href);
const worker = workerModule.default;

const { startServer } = await import('../server/index.mjs');
const started = await startServer({ port: 0 });
const gameOrigin = `http://127.0.0.1:${started.port}`;
const env = { DATABASE_URL: databaseUrl, LOFTLIFE_SESSION_SECRET: secret, GAME_ORIGIN: gameOrigin };

const handle = `edge${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 20);
const password = 'edge-verify-password-1';
const displayName = 'Edge Verifier';

function edge(pathname, init = {}) {
  return worker.fetch(new Request(`https://edge.verify${pathname}`, init), env);
}

function jsonPost(pathname, body, token) {
  return edge(pathname, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-loftlife-client': '1',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

let loginToken = '';
try {
  console.log(`\nEdge identity check (${handle})\n`);

  const health = await edge('/api/health');
  const healthBody = await health.json();
  check('Worker health reports Neon', health.status === 200 && healthBody.storageEngine === 'neon');
  check('Worker sees the session secret', healthBody.edgeAuth === true);

  const register = await jsonPost('/api/auth/register', {
    handle,
    email: `${handle}@verify.test`,
    password,
    displayName,
  });
  const registered = await register.json();
  check('register returns 201', register.status === 201, `status ${register.status}`);
  check('register returns a signed token', typeof registered.token === 'string' && registered.token.startsWith('llt1.'));
  check('register returns the account', registered.user?.handle === handle);

  const me = await edge('/api/auth/me', {
    headers: { authorization: `Bearer ${registered.token}` },
  });
  const meBody = await me.json();
  check('proxied /api/auth/me returns 200', me.status === 200, `status ${me.status}`);
  check('game server provisioned the same account id', meBody.user?.id === registered.user?.id);
  check('welcome grant applied (500 元子 / 25 通宝)', meBody.wallet?.yuanzi === 500 && meBody.wallet?.tongbao === 25);
  check('furnished suite 402 created', meBody.suite?.number === '402');
  check('display name survives the edge token', meBody.profile?.displayName === displayName, meBody.profile?.displayName);

  const login = await jsonPost('/api/auth/login', { identifier: handle, password });
  const loggedIn = await login.json();
  loginToken = loggedIn.token ?? '';
  check('login returns 200', login.status === 200, `status ${login.status}`);
  check('login issues a token', loginToken.startsWith('llt1.'));

  const meAgain = await edge('/api/auth/me', {
    headers: { authorization: `Bearer ${loginToken}` },
  });
  check('login token authenticates the game server', meAgain.status === 200, `status ${meAgain.status}`);

  const wrongPassword = await jsonPost('/api/auth/login', { identifier: handle, password: 'not-the-password' });
  check('wrong password is rejected', wrongPassword.status === 401, `status ${wrongPassword.status}`);

  const tampered = await edge('/api/auth/me', {
    headers: { authorization: `Bearer ${registered.token}x` },
  });
  check('tampered token is rejected', tampered.status === 401, `status ${tampered.status}`);

  const logout = await jsonPost('/api/auth/logout', {}, loginToken);
  check('logout returns ok', logout.status === 200, `status ${logout.status}`);
} finally {
  if (loginToken) {
    await jsonPost('/api/auth/logout', {}, loginToken).catch(() => {});
  }
  // Remove the test account (sessions cascade). Handles are unique to this run.
  try {
    const { neon } = await import('@neondatabase/serverless');
    await neon(databaseUrl).query('DELETE FROM ll_accounts WHERE handle = $1', [handle]);
  } catch (error) {
    console.error('  ! could not remove the test account:', error instanceof Error ? error.message : error);
  }
  await new Promise((resolve) => started.server.close(resolve));
  fs.rmSync(workDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n✖ ${failures} check(s) failed\n`);
  process.exit(1);
}
console.log('\n✔ Edge identity round-trip passed\n');
