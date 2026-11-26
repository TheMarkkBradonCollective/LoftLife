import { neon } from '@neondatabase/serverless';
import type { LoftLifeRealtime } from './realtime';
import {
  hashPassword,
  sha256Hex,
  signAuthToken,
  validateDisplayName,
  validateEmail,
  validateHandle,
  validatePassword,
  verifyAuthToken,
  verifyPassword,
} from '../../shared/auth-core.mjs';

/**
 * Cloudflare Worker: static assets, identity, and a proxy to the game server.
 *
 *   browser ──► Worker ──► Neon Postgres   (accounts, password hashes, sessions)
 *                  └────► GAME_ORIGIN      (/api/* and /ws: rooms, economy, realtime)
 *
 * Passwords are PBKDF2-SHA256 via Web Crypto, session tokens are HMAC-signed
 * with LOFTLIFE_SESSION_SECRET. The Node game server verifies the same token
 * with the same secret (server/edge-auth.mjs), so one sign-in works across both
 * runtimes without a database lookup on every request.
 */

interface WorkerFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface CloudflareEnv {
  DATABASE_URL?: string;
  LOFTLIFE_SESSION_SECRET?: string;
  GAME_ORIGIN?: string;
  REALTIME?: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
  ASSETS?: WorkerFetcher;
}

interface AccountRow {
  id: string;
  handle: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: number;
  display_name: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const COOKIE_NAME = 'loftlife_edge';
const ATTEMPT_WINDOW_MS = 60_000;
const ATTEMPT_MAX = 12;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS ll_accounts (
     id TEXT PRIMARY KEY,
     handle TEXT NOT NULL UNIQUE,
     email TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'player',
     created_at BIGINT NOT NULL,
     display_name TEXT NOT NULL DEFAULT ''
   )`,
  `ALTER TABLE ll_accounts ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS ll_sessions (
     jti_hash TEXT PRIMARY KEY,
     account_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
     created_at BIGINT NOT NULL,
     expires_at BIGINT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ll_sessions_account ON ll_sessions(account_id)`,
];

let schemaReady: Promise<void> | null = null;
const attempts = new Map<string, { count: number; resetAt: number }>();

/** The subset of the Neon client this Worker relies on (HTTP, array results). */
type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

function fail(message: string, status: number, code: string): Response {
  return json({ error: message, code }, status);
}

function secretFor(env: CloudflareEnv): string | null {
  const secret = env.LOFTLIFE_SESSION_SECRET ?? '';
  return secret.length >= 32 ? secret : null;
}

async function database(env: CloudflareEnv): Promise<Sql | null> {
  if (!env.DATABASE_URL) return null;
  const sql = neon(env.DATABASE_URL);
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await sql.query(statement);
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return sql;
}

function isSameOrigin(request: Request): boolean {
  if (request.headers.get('x-loftlife-client') === '1') return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function rateLimited(request: Request): boolean {
  const key =
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'anonymous';
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > ATTEMPT_MAX;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

function publicAccount(row: AccountRow) {
  return {
    id: row.id,
    handle: row.handle,
    role: row.role === 'admin' ? 'admin' : 'player',
    displayName: row.display_name || row.handle,
    createdAt: Number(row.created_at),
  };
}

interface IssuedSession {
  token: string;
  expiresAt: number;
}

async function issueSession(sql: Sql, account: AccountRow, secret: string): Promise<IssuedSession> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + SESSION_TTL_SECONDS;
  const jti = crypto.randomUUID();
  await sql.query(
    'INSERT INTO ll_sessions (jti_hash, account_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [await sha256Hex(jti), account.id, Date.now(), expiresAtSeconds * 1000]
  );
  const token = await signAuthToken(
    {
      sub: account.id,
      handle: account.handle,
      role: account.role === 'admin' ? 'admin' : 'player',
      name: account.display_name || account.handle,
      sid: jti,
      iat: issuedAt,
      exp: expiresAtSeconds,
    },
    secret
  );
  return { token, expiresAt: expiresAtSeconds * 1000 };
}

function authResponse(account: AccountRow, session: IssuedSession): Response {
  return json(
    { user: publicAccount(account), token: session.token, expiresAt: session.expiresAt },
    200,
    { 'set-cookie': sessionCookie(session.token, SESSION_TTL_SECONDS) }
  );
}

async function handleRegister(request: Request, env: CloudflareEnv): Promise<Response> {
  const secret = secretFor(env);
  if (!secret) return fail('Edge authentication is not configured.', 503, 'unconfigured');
  const sql = await database(env);
  if (!sql) return fail('DATABASE_URL is not configured.', 503, 'unconfigured');

  const body = await readJson(request);
  const handle = validateHandle(body.handle);
  const email = validateEmail(body.email);
  const password = validatePassword(body.password);
  if (!handle || !email || !password) {
    return fail(
      'Handle must be 3–20 lowercase characters, email must be valid, password at least 10 characters.',
      400,
      'invalid_input'
    );
  }
  const displayName = validateDisplayName(body.displayName ?? handle, handle);

  const existing = (await sql.query(
    'SELECT id FROM ll_accounts WHERE handle = $1 OR email = $2 LIMIT 1',
    [handle, email]
  )) as Array<{ id: string }>;
  if (existing.length > 0) {
    return fail('That handle or email is already registered.', 409, 'conflict');
  }

  const account: AccountRow = {
    id: `usr_${crypto.randomUUID()}`,
    handle,
    email,
    password_hash: await hashPassword(password),
    role: 'player',
    created_at: Date.now(),
    display_name: displayName,
  };

  await sql.query(
    'INSERT INTO ll_accounts (id, handle, email, password_hash, role, created_at, display_name) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [account.id, account.handle, account.email, account.password_hash, account.role, account.created_at, account.display_name]
  );

  const session = await issueSession(sql, account, secret);
  return new Response(
    JSON.stringify({
      user: publicAccount(account),
      token: session.token,
      expiresAt: session.expiresAt,
      displayName,
    }),
    {
      status: 201,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'set-cookie': sessionCookie(session.token, SESSION_TTL_SECONDS),
      },
    }
  );
}

async function handleLogin(request: Request, env: CloudflareEnv): Promise<Response> {
  const secret = secretFor(env);
  if (!secret) return fail('Edge authentication is not configured.', 503, 'unconfigured');
  const sql = await database(env);
  if (!sql) return fail('DATABASE_URL is not configured.', 503, 'unconfigured');

  const body = await readJson(request);
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || !password) return fail('Handle/email and password are required.', 400, 'invalid_input');

  const rows = (await sql.query(
    'SELECT id, handle, email, password_hash, role, created_at, display_name FROM ll_accounts WHERE handle = $1 OR email = $1 LIMIT 1',
    [identifier]
  )) as AccountRow[];
  const account = rows[0];
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    return fail('Incorrect handle/email or password.', 401, 'invalid_credentials');
  }

  const session = await issueSession(sql, account, secret);
  return authResponse(account, session);
}

async function handleLogout(request: Request, env: CloudflareEnv): Promise<Response> {
  const secret = secretFor(env);
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (secret && token) {
    const payload = await verifyAuthToken(token, secret);
    if (payload && typeof payload.sid === 'string') {
      const sql = await database(env);
      if (sql) {
        await sql.query('DELETE FROM ll_sessions WHERE jti_hash = $1', [await sha256Hex(payload.sid)]);
      }
    }
  }
  return json(
    { ok: true },
    200,
    { 'set-cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }
  );
}

async function handleHealth(env: CloudflareEnv): Promise<Response> {
  let storageEngine = 'unconfigured';
  if (env.DATABASE_URL) {
    const sql = await database(env);
    if (sql) {
      await sql.query('SELECT 1');
      storageEngine = 'neon';
    }
  }
  return json({
    ok: true,
    runtime: 'cloudflare-worker',
    storageEngine,
    edgeAuth: Boolean(secretFor(env)),
    realtime: Boolean(env.REALTIME),
    gameApi: env.GAME_ORIGIN ? 'legacy-proxy' : 'not-yet-migrated',
  });
}

async function proxyToGame(request: Request, env: CloudflareEnv, url: URL): Promise<Response> {
  if (!env.GAME_ORIGIN) {
    return fail('The game server origin is not configured.', 503, 'no_game_origin');
  }
  const target = new URL(url.pathname + url.search, env.GAME_ORIGIN);
  return fetch(new Request(target, request));
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/health') return await handleHealth(env);

      const isAuthRoute = ['/api/auth/register', '/api/auth/login', '/api/auth/logout'].includes(
        url.pathname
      );
      if (isAuthRoute) {
        if (request.method !== 'POST') return fail('Method not allowed.', 405, 'method_not_allowed');
        if (!isSameOrigin(request)) return fail('Cross-origin request rejected.', 403, 'forbidden');
        if (rateLimited(request)) return fail('Too many attempts. Try again shortly.', 429, 'rate_limited');
        if (url.pathname === '/api/auth/register') return await handleRegister(request, env);
        if (url.pathname === '/api/auth/login') return await handleLogin(request, env);
        return await handleLogout(request, env);
      }

      if (url.pathname === '/ws') {
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          return fail('A WebSocket upgrade is required.', 426, 'upgrade_required');
        }
        if (!env.REALTIME) return fail('Realtime Durable Object binding is not configured.', 503, 'realtime_unconfigured');
        const instance = url.searchParams.get('instance') ?? 'city:main';
        return env.REALTIME.get(env.REALTIME.idFromName(instance)).fetch(request);
      }

      if (url.pathname.startsWith('/api/')) {
        return await proxyToGame(request, env, url);
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('LoftLife edge is running.', { status: 200 });
    } catch (error) {
      console.error('Worker request failed:', error);
      return fail('Unexpected edge error.', 500, 'internal_error');
    }
  },
};
