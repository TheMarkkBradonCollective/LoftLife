import { neon } from '@neondatabase/serverless';
import { handleWorldRoute } from './worlds';
import { handleSocialRoute } from './social';
import { handleEconomyRoute } from './economy';
import { handleTransitRoute } from './transit';
import { handlePlatformRoute } from './platform';
export { LoftLifeRealtime } from './realtime';
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
import { normalizeVoicePreferences } from '../../shared/voice-controls.mjs';
import { resolveInstance } from '../../shared/instance.mjs';
import { normalizeControlsPayload } from '../../shared/keybindings.mjs';

/**
 * Cloudflare Worker: static assets, Neon-backed game APIs and Durable Object realtime.
 *
 *   browser ──► Worker ──► Neon Postgres (identity and persistent game state)
 *                  └────► Durable Objects (city/world sockets, parties and transit)
 *
 * Passwords are PBKDF2-SHA256 via Web Crypto. Session tokens are HMAC-signed
 * with LOFTLIFE_SESSION_SECRET and verified against Neon sessions on API and socket joins.
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
  suspended_until?: number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const STARTER_SUITE = {
  name: 'Grand Hotel Suite',
  surfaces: { floor: 'oak_parquet', wall: 'warm_chalk' },
  mood: 'morning',
  items: [
    { uid: 'p1', catalogId: 'woven_rug', gx: 4, gz: 5, rot: 0, color: '#e7dfd1' },
    { uid: 'p2', catalogId: 'plush_sofa', gx: 5, gz: 3, rot: 0, color: '#7c9a82' },
    { uid: 'p3', catalogId: 'coffee_table', gx: 5, gz: 5, rot: 0, color: '#c89e6d' },
    { uid: 'p4', catalogId: 'lounge_chair', gx: 3, gz: 5, rot: 1, color: '#d49a45' },
    { uid: 'p5', catalogId: 'arc_lamp', gx: 7, gz: 3, rot: 0, color: '#d4af5a', active: true },
    { uid: 'p6', catalogId: 'record_console', gx: 5, gz: 0, rot: 0, color: '#9e6238', active: true },
    { uid: 'p7', catalogId: 'monstera_plant', gx: 1, gz: 1, rot: 0, color: '#c46c4e' },
    { uid: 'p8', catalogId: 'bookshelf', gx: 12, gz: 0, rot: 0, color: '#c2925e' },
    { uid: 'p9', catalogId: 'cozy_bed', gx: 10, gz: 10, rot: 3, color: '#8aa8c7' },
    { uid: 'p10', catalogId: 'media_tv', gx: 9, gz: 0, rot: 0, color: '#353942', active: true },
    { uid: 'p11', catalogId: 'side_desk', gx: 10, gz: 5, rot: 3, color: '#d8be98' },
    { uid: 'p12', catalogId: 'bar_stool', gx: 9, gz: 5, rot: 1, color: '#a66238' },
    { uid: 'p13', catalogId: 'wall_art', gx: 5, gz: 0, rot: 0, wall: 'north', color: '#d87a56' },
    { uid: 'p14', catalogId: 'wall_shelf', gx: 2, gz: 0, rot: 0, wall: 'north', color: '#c59867' },
  ],
};
const DEFAULT_AVATAR = {
  name: 'Newcomer', skinTone: '#e8b48f', hairStyle: 'bob', hairColor: '#2f2119',
  topStyle: 'tee', topColor: '#e6dfd3', bottomColor: '#2b3a2a',
  shoeColor: '#1b1b1b', accessory: 'none',
};
const DEFAULT_CLOTHING = ['tee', 'none'];
const AVATAR_ENUMS = {
  hairStyle: ['bob', 'afro', 'ponytail', 'sidepart', 'buns', 'spiky'],
  topStyle: ['hoodie', 'blazer', 'tee', 'turtleneck'],
  accessory: ['none', 'glasses', 'headphones', 'beanie'],
};
function safeAvatar(input: unknown, name: string) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const hex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
  const pick = (key: keyof typeof AVATAR_ENUMS, fallback: string) => typeof raw[key] === 'string' && AVATAR_ENUMS[key].includes(raw[key] as string) ? raw[key] as string : fallback;
  return {
    name: typeof raw.name === 'string' && raw.name.trim().length >= 2 ? raw.name.trim().slice(0, 24) : name,
    skinTone: hex(raw.skinTone, DEFAULT_AVATAR.skinTone),
    hairStyle: pick('hairStyle', DEFAULT_AVATAR.hairStyle),
    hairColor: hex(raw.hairColor, DEFAULT_AVATAR.hairColor),
    makeupStyle: ['natural','soft','bold'].includes(String(raw.makeupStyle)) ? raw.makeupStyle as 'natural'|'soft'|'bold' : 'natural',
    topStyle: pick('topStyle', DEFAULT_AVATAR.topStyle),
    topColor: hex(raw.topColor, DEFAULT_AVATAR.topColor),
    bottomColor: hex(raw.bottomColor, DEFAULT_AVATAR.bottomColor),
    shoeColor: hex(raw.shoeColor, DEFAULT_AVATAR.shoeColor),
    accessory: pick('accessory', DEFAULT_AVATAR.accessory),
  };
}
async function provisionGameAccount(sql: Sql, account: AccountRow, avatarInput?: unknown) {
  const at = Number(account.created_at) || Date.now();
  const avatar = safeAvatar(avatarInput, account.display_name || account.handle);
  await sql.query(
    'INSERT INTO ll_profiles (user_id, display_name, avatar_json, bio, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO NOTHING',
    [account.id, account.display_name || account.handle, JSON.stringify(avatar), '', at]
  );
  const createdWallet = await sql.query(
    'INSERT INTO ll_wallets (user_id, yuanzi, tongbao) VALUES ($1,500,25) ON CONFLICT (user_id) DO NOTHING RETURNING user_id',
    [account.id]
  ) as Array<{ user_id: string }>;
  if (createdWallet.length) {
    await sql.query(
      'INSERT INTO ll_ledger (id,user_id,currency,delta,balance_after,reason,ref,idempotency_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8),($9,$2,$10,$11,$12,$6,NULL,$13,$8) ON CONFLICT DO NOTHING',
      [crypto.randomUUID(), account.id, 'yuanzi', 500, 500, 'welcome_grant', `welcome:${account.id}:yuanzi`, at, crypto.randomUUID(), 'tongbao', 25, 25, `welcome:${account.id}:tongbao`]
    );
  }
  await sql.query(
    'INSERT INTO ll_hotel_room_allocations (owner_id, created_at) VALUES ($1,$2) ON CONFLICT (owner_id) DO NOTHING',
    [account.id, at]
  );
  const allocationRows = await sql.query(
    'SELECT room_index FROM ll_hotel_room_allocations WHERE owner_id=$1 LIMIT 1',
    [account.id]
  ) as Array<{ room_index: number | string }>;
  const roomIndex = Math.max(1, Number(allocationRows[0]?.room_index) || 1);
  const suiteFloor = 5 + Math.floor((roomIndex - 1) / 10);
  const suiteDoor = ((roomIndex - 1) % 10) + 1;
  const suiteNumber = `${suiteFloor}${String(suiteDoor).padStart(2, '0')}`;
  await sql.query(
    'INSERT INTO ll_suites (id,owner_id,number,floor,name,items_json,surfaces_json,mood,is_public,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9) ON CONFLICT (owner_id) DO NOTHING',
    [crypto.randomUUID(), account.id, suiteNumber, suiteFloor, STARTER_SUITE.name, JSON.stringify(STARTER_SUITE.items), JSON.stringify(STARTER_SUITE.surfaces), STARTER_SUITE.mood, at]
  );
  for (const item of DEFAULT_CLOTHING) {
    await sql.query(
      "INSERT INTO ll_inventory (id,user_id,kind,catalog_id,qty,acquired_at) VALUES ($1,$2,'clothing',$3,1,$4) ON CONFLICT (user_id,kind,catalog_id) DO NOTHING",
      [crypto.randomUUID(), account.id, item, at]
    );
  }
}

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
  `ALTER TABLE ll_accounts ADD COLUMN IF NOT EXISTS suspended_until BIGINT NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS ll_sessions (
     jti_hash TEXT PRIMARY KEY,
     account_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
     created_at BIGINT NOT NULL,
     expires_at BIGINT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ll_sessions_account ON ll_sessions(account_id)`,
  `CREATE TABLE IF NOT EXISTS ll_guest_sessions (jti_hash TEXT PRIMARY KEY, guest_id TEXT NOT NULL, display_name TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ll_guest_sessions_expiry ON ll_guest_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS ll_hotel_room_allocations (room_index BIGSERIAL PRIMARY KEY, owner_id TEXT NOT NULL UNIQUE REFERENCES ll_accounts(id) ON DELETE CASCADE, created_at BIGINT NOT NULL)`,
  `INSERT INTO ll_hotel_room_allocations (owner_id, created_at) SELECT owner_id, updated_at FROM ll_suites ORDER BY owner_id ON CONFLICT (owner_id) DO NOTHING`,
  `UPDATE ll_suites s SET floor=5+((a.room_index-1)/10)::INTEGER, number=(5+((a.room_index-1)/10))::TEXT || lpad((((a.room_index-1)%10)+1)::TEXT,2,'0') FROM ll_hotel_room_allocations a WHERE a.owner_id=s.owner_id`,
  `CREATE TABLE IF NOT EXISTS ll_account_settings (
     user_id TEXT PRIMARY KEY REFERENCES ll_accounts(id) ON DELETE CASCADE,
     data_json TEXT NOT NULL,
     updated_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS ll_dm_reads (
     user_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
     peer_id TEXT NOT NULL REFERENCES ll_accounts(id) ON DELETE CASCADE,
     last_read_at BIGINT NOT NULL,
     PRIMARY KEY (user_id, peer_id)
   )`,
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

function fail(message: string, status: number, code: string, detail?: unknown): Response {
  return json({ error: message, code, ...(detail === undefined ? {} : { detail }) }, status);
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

  const accountCount = await sql.query('SELECT COUNT(*) AS total FROM ll_accounts') as Array<{total:string|number}>;
  const account: AccountRow = {
    id: `usr_${crypto.randomUUID()}`,
    handle,
    email,
    password_hash: await hashPassword(password),
    role: Number(accountCount[0]?.total ?? 0) === 0 ? 'admin' : 'player',
    created_at: Date.now(),
    display_name: displayName,
  };

  await sql.query(
    'INSERT INTO ll_accounts (id, handle, email, password_hash, role, created_at, display_name) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [account.id, account.handle, account.email, account.password_hash, account.role, account.created_at, account.display_name]
  );

  await provisionGameAccount(sql, account, body.avatar);
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
    'SELECT id, handle, email, password_hash, role, created_at, display_name, suspended_until FROM ll_accounts WHERE handle = $1 OR email = $1 LIMIT 1',
    [identifier]
  )) as AccountRow[];
  const account = rows[0];
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    return fail('Incorrect handle/email or password.', 401, 'invalid_credentials');
  }
  if (Number(account.suspended_until ?? 0) > Date.now()) return fail('This account is temporarily suspended.',403,'account_suspended',{suspendedUntil:Number(account.suspended_until)});

  await provisionGameAccount(sql, account);
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


const GUEST_SESSION_TTL_SECONDS = 60 * 60 * 12;

async function handleGuestSession(request: Request, env: CloudflareEnv): Promise<Response> {
  const secret = secretFor(env);
  if (!secret) return fail('Guest sessions are not configured.', 503, 'unconfigured');
  const sql = await database(env);
  if (!sql) return fail('DATABASE_URL is not configured.', 503, 'unconfigured');
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (request.method === 'POST') {
    const body = await readJson(request);
    const rawName = typeof body.displayName === 'string'
      ? body.displayName.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
      : '';
    if (rawName.length < 2 || rawName.length > 32) {
      return fail('Choose a display name between 2 and 32 characters.', 400, 'invalid_input');
    }
    const displayName = validateDisplayName(rawName, '');
    const guestId = `gst_${crypto.randomUUID()}`;
    const jti = crypto.randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + GUEST_SESSION_TTL_SECONDS;
    await sql.query(
      'INSERT INTO ll_guest_sessions (jti_hash, guest_id, display_name, created_at, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [await sha256Hex(jti), guestId, displayName, Date.now(), expiresAt * 1000]
    );
    const guestToken = await signAuthToken(
      { sub: guestId, kind: 'guest', name: displayName, sid: jti, iat: issuedAt, exp: expiresAt },
      secret
    );
    return json({ guest: { id: guestId, displayName }, token: guestToken, expiresAt: expiresAt * 1000 }, 201);
  }

  if (request.method === 'DELETE') {
    const payload = token ? await verifyAuthToken(token, secret) : null;
    if (!payload || payload.kind !== 'guest' || typeof payload.sid !== 'string') {
      return fail('Guest session is invalid or expired.', 401, 'unauthorized');
    }
    await sql.query('DELETE FROM ll_guest_sessions WHERE jti_hash=$1', [await sha256Hex(payload.sid)]);
    return json({ ok: true });
  }

  return fail('Method not allowed.', 405, 'method_not_allowed');
}

async function currentAccount(request: Request, env: CloudflareEnv) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const secret = secretFor(env);
  if (!token || !secret) return null;
  const payload = await verifyAuthToken(token, secret);
  if (!payload || typeof payload.sid !== 'string' || typeof payload.sub !== 'string') return null;
  const sql = await database(env);
  if (!sql) return null;
  const rows = await sql.query(
    'SELECT a.id,a.handle,a.email,a.password_hash,a.role,a.created_at,a.display_name FROM ll_sessions s JOIN ll_accounts a ON a.id=s.account_id WHERE s.jti_hash=$1 AND s.account_id=$2 AND s.expires_at>$3 AND COALESCE(a.suspended_until,0)<=$4 LIMIT 1',
    [await sha256Hex(payload.sid), payload.sub, Date.now(), Date.now()]
  ) as AccountRow[];
  return rows[0] ? { sql, account: rows[0] } : null;
}
function parseJsonField(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function profileView(account: AccountRow, row?: Record<string, unknown>) {
  return {
    userId: account.id,
    handle: account.handle,
    displayName: String(row?.display_name ?? account.display_name ?? account.handle),
    bio: String(row?.bio ?? ''),
    avatar: parseJsonField(row?.avatar_json, safeAvatar(undefined, account.display_name || account.handle)),
    voice: normalizeVoicePreferences(parseJsonField(row?.voice_json, {})),
  };
}
function suiteView(row?: Record<string, unknown>) {
  if (!row) return null;
  return {
    id: row.id, number: row.number, floor: Number(row.floor), name: row.name,
    items: parseJsonField(row.items_json, []), surfaces: parseJsonField(row.surfaces_json, {}),
    mood: row.mood, isPublic: Boolean(row.is_public), updatedAt: Number(row.updated_at),
  };
}
const FURNITURE_PRICES: Record<string, number> = {
  plush_sofa:120, sectional_sofa:210, lounge_chair:85, bar_stool:45, cozy_bed:260,
  dining_set:240, espresso_bar:320, dual_desk:190, coffee_table:95, side_desk:70,
  record_console:150, media_tv:300, fireplace:340, bookshelf:130, arc_lamp:60,
  table_lamp:35, monstera_plant:40, olive_tree:75, woven_rug:55, wall_art:65,
  wall_shelf:50, floor_mirror:110, neon_sign:90,
};
const CLOTHING_DEFS: Record<string, { label: string; price: number; currency: string }> = {
  hoodie:{label:'Everyday Hoodie',price:80,currency:'yuanzi'},
  blazer:{label:'Tailored Blazer',price:6,currency:'tongbao'},
  turtleneck:{label:'Merino Turtleneck',price:120,currency:'yuanzi'},
  glasses:{label:'Wire Glasses',price:60,currency:'yuanzi'},
  headphones:{label:'Studio Headphones',price:5,currency:'tongbao'},
  beanie:{label:'Ribbed Beanie',price:45,currency:'yuanzi'},
};
const FLOOR_STYLES = ['oak_parquet','walnut_herringbone','terrazzo','concrete','boucle_carpet'];
const WALL_STYLES = ['warm_chalk','sage_plaster','terracotta','slate_blue','charcoal_loft','soft_blush'];
const MOODS = ['morning','golden','night'];


async function handleGameRead(request: Request, env: CloudflareEnv, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const handled = new Set([
    '/api/shop','/api/auth/me','/api/profile','/api/inventory',
    '/api/economy/wallet','/api/economy/history','/api/suite','/api/suite/visibility',
    '/api/mod/reports','/api/mod/suspend',
  ]);
  const suiteMatch = path.match(/^\/api\/suites\/([^/]+)$/);
  if (!handled.has(path) && !suiteMatch) return null;
  const isPublic = path === '/api/shop';
  const auth = isPublic ? null : await currentAccount(request, env);
  if (!isPublic && !auth) return fail('Sign in to continue.', 401, 'unauthorized');
  const sql = auth?.sql ?? await database(env);
  const account = auth?.account;
  if (!sql) return fail('DATABASE_URL is not configured.',503,'unconfigured');
  if (suiteMatch && request.method === 'GET' && sql && account) {
    const targetRows = await sql.query('SELECT id,handle,display_name FROM ll_accounts WHERE handle=$1 LIMIT 1',[decodeURIComponent(suiteMatch[1]).toLowerCase()]) as Array<{id:string;handle:string;display_name:string}>;
    if (!targetRows[0]) return fail('No player with that handle.',404,'not_found');
    const target = targetRows[0];
    const suites = await sql.query('SELECT * FROM ll_suites WHERE owner_id=$1 LIMIT 1',[target.id]) as Array<Record<string,unknown>>;
    const suite = suites[0];
    if (!suite) return fail('Suite not found.',404,'not_found');
    let allowed = target.id===account.id || Boolean(suite.is_public);
    if (!allowed) {
      const [friends,invite] = await Promise.all([
        sql.query("SELECT 1 FROM ll_friendships WHERE status='accepted' AND ((a=$1 AND b=$2) OR (a=$2 AND b=$1)) LIMIT 1",[account.id,target.id]),
        sql.query('SELECT 1 FROM ll_world_invites WHERE world_id=$1 AND user_id=$2 LIMIT 1',[suite.id,account.id]),
      ]);
      allowed = friends.length>0 || invite.length>0;
    }
    if (!allowed) return fail('This suite is private.',403,'forbidden');
    return json({...suiteView(suite),ownerId:target.id,ownerHandle:target.handle,ownerName:target.display_name,isOwner:target.id===account.id});
  }
  if (path === '/api/mod/reports' || path === '/api/mod/suspend') {
    if (!account || account.role !== 'admin') return fail('Administrator access required.',403,'forbidden');
    if (path === '/api/mod/reports' && request.method === 'GET') {
      const reports = await sql.query(
        "SELECT r.id,r.reason,r.details,r.created_at,reporter.handle AS reporter,target.handle AS target FROM ll_reports r JOIN ll_accounts reporter ON reporter.id=r.reporter_id JOIN ll_accounts target ON target.id=r.target_user_id WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 100"
      ) as Array<Record<string,unknown>>;
      return json(reports);
    }
    if (path === '/api/mod/suspend' && request.method === 'POST') {
      const body = await readJson(request);
      const target = await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1',[String(body.handle??'').toLowerCase()]) as Array<{id:string}>;
      if (!target[0]) return fail('No player with that handle.',404,'not_found');
      const hours = Math.max(0,Math.min(720,Number(body.hours)||0));
      const suspendedUntil = hours>0 ? Date.now()+hours*60*60*1000 : 0;
      await sql.query('UPDATE ll_accounts SET suspended_until=$1 WHERE id=$2',[suspendedUntil,target[0].id]);
      await sql.query('DELETE FROM ll_sessions WHERE account_id=$1',[target[0].id]);
      return json({userId:target[0].id,suspendedUntil});
    }
  }
  if (path === '/api/shop' && request.method === 'GET') {
    return json({
      furniture: Object.entries(FURNITURE_PRICES).map(([id, price]) => ({ id, kind:'furniture', price, currency:'yuanzi' })),
      clothing: Object.entries(CLOTHING_DEFS).map(([id, item]) => ({ id, kind:'clothing', ...item })),
    });
  }
  if (path === '/api/auth/me' && request.method === 'GET' && sql && account) {
    const [profiles,wallets,inventory,suites] = await Promise.all([
      sql.query('SELECT * FROM ll_profiles WHERE user_id=$1 LIMIT 1',[account.id]),
      sql.query('SELECT yuanzi,tongbao FROM ll_wallets WHERE user_id=$1 LIMIT 1',[account.id]),
      sql.query('SELECT kind,catalog_id,qty,acquired_at FROM ll_inventory WHERE user_id=$1 ORDER BY acquired_at DESC',[account.id]),
      sql.query('SELECT * FROM ll_suites WHERE owner_id=$1 LIMIT 1',[account.id]),
    ]) as [Array<Record<string,unknown>>,Array<Record<string,unknown>>,Array<Record<string,unknown>>,Array<Record<string,unknown>>];
    return json({
      user: publicAccount(account), profile: profileView(account,profiles[0]),
      wallet: wallets[0] ?? {yuanzi:0,tongbao:0},
      inventory: inventory.map(row=>({kind:row.kind,catalogId:row.catalog_id,qty:Number(row.qty),acquiredAt:Number(row.acquired_at)})),
      suite: suiteView(suites[0]),
    });
  }
  if (path === '/api/profile' && request.method === 'GET' && sql && account) {
    const rows = await sql.query('SELECT * FROM ll_profiles WHERE user_id=$1 LIMIT 1',[account.id]) as Array<Record<string,unknown>>;
    return json(profileView(account,rows[0]));
  }
  if (path === '/api/profile' && request.method === 'PATCH' && sql && account) {
    const body = await readJson(request);
    const displayName = validateDisplayName(body.displayName ?? account.display_name, account.handle);
    const bio = typeof body.bio === 'string' ? body.bio.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,160) : undefined;
    const rows = await sql.query('SELECT avatar_json,bio,voice_json FROM ll_profiles WHERE user_id=$1 LIMIT 1',[account.id]) as Array<Record<string,unknown>>;
    const avatar = body.avatar === undefined ? parseJsonField(rows[0]?.avatar_json,safeAvatar(undefined,displayName)) : safeAvatar(body.avatar,displayName);
    // Voice preferences are only written when the client sends them, so an
    // outfit save cannot reset the microphone mode.
    const voice = body.voice === undefined
      ? normalizeVoicePreferences(parseJsonField(rows[0]?.voice_json, {}))
      : normalizeVoicePreferences(body.voice);
    await Promise.all([
      sql.query('UPDATE ll_accounts SET display_name=$1 WHERE id=$2',[displayName,account.id]),
      sql.query('UPDATE ll_profiles SET display_name=$1,avatar_json=$2,bio=$3,voice_json=$4,updated_at=$5 WHERE user_id=$6',[displayName,JSON.stringify(avatar),bio ?? String(rows[0]?.bio ?? ''),JSON.stringify(voice),Date.now(),account.id]),
    ]);
    return json({userId:account.id,handle:account.handle,displayName,bio:bio ?? String(rows[0]?.bio ?? ''),avatar,voice});
  }
  if (path === '/api/preferences/controls' && sql && account) {
    if (request.method === 'GET') {
      const rows = await sql.query(
        'SELECT controls_json,controls_updated_at FROM ll_profiles WHERE user_id=$1 LIMIT 1',
        [account.id]
      ) as Array<Record<string, unknown>>;
      let stored: Record<string, unknown> = {};
      try { stored = parseJsonField(rows[0]?.controls_json, {}); } catch { stored = {}; }
      return json(normalizeControlsPayload({ ...stored, updatedAt: Number(rows[0]?.controls_updated_at) || 0 }));
    }
    if (request.method === 'PUT') {
      const body = await readJson(request);
      const normalized = normalizeControlsPayload(body);
      const updatedAt = Date.now();
      await sql.query(
        'UPDATE ll_profiles SET controls_json=$1,controls_updated_at=$2 WHERE user_id=$3',
        [JSON.stringify({ bindings: normalized.bindings, touch: normalized.touch }), updatedAt, account.id]
      );
      return json({ ...normalized, updatedAt });
    }
  }
  if (path === '/api/inventory' && request.method === 'GET' && sql && account) {
    const rows = await sql.query('SELECT kind,catalog_id,qty,acquired_at FROM ll_inventory WHERE user_id=$1 ORDER BY acquired_at DESC',[account.id]) as Array<Record<string,unknown>>;
    return json(rows.map(row=>({kind:row.kind,catalogId:row.catalog_id,qty:Number(row.qty),acquiredAt:Number(row.acquired_at)})));
  }
  if (path === '/api/economy/wallet' && request.method === 'GET' && sql && account) {
    const rows = await sql.query('SELECT yuanzi,tongbao FROM ll_wallets WHERE user_id=$1 LIMIT 1',[account.id]) as Array<Record<string,unknown>>;
    return json(rows[0] ?? {yuanzi:0,tongbao:0});
  }
  if (path === '/api/economy/history' && request.method === 'GET' && sql && account) {
    const limit = Math.max(1,Math.min(200,Number(url.searchParams.get('limit'))||50));
    const rows = await sql.query('SELECT id,currency,delta,balance_after,reason,ref,created_at FROM ll_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',[account.id,limit]) as Array<Record<string,unknown>>;
    return json(rows.map(row=>({id:row.id,currency:row.currency,delta:Number(row.delta),balanceAfter:Number(row.balance_after),reason:row.reason,ref:row.ref,createdAt:Number(row.created_at)})));
  }
  if (path === '/api/suite' && request.method === 'GET' && sql && account) {
    const rows = await sql.query('SELECT * FROM ll_suites WHERE owner_id=$1 LIMIT 1',[account.id]) as Array<Record<string,unknown>>;
    return json(suiteView(rows[0]));
  }
  if (path === '/api/suite' && request.method === 'PUT' && sql && account) {
    const body = await readJson(request);
    if (!Array.isArray(body.items) || body.items.length>200) return fail('Room items must be an array with at most 200 entries.',400,'invalid_input');
    const seen = new Set<string>();
    const items = [];
    for (let i=0;i<body.items.length;i++) {
      const raw = body.items[i] as Record<string,unknown>;
      if (!raw || typeof raw!=='object' || typeof raw.catalogId!=='string' || !(raw.catalogId in FURNITURE_PRICES)) return fail(`Invalid furniture item at index ${i}.`,400,'invalid_input');
      const uid = typeof raw.uid==='string' ? raw.uid.slice(0,64) : `it_${i}`;
      if (seen.has(uid)) return fail('Duplicate item uid.',400,'invalid_input');
      seen.add(uid);
      if (![raw.gx,raw.gz,raw.rot].every(Number.isInteger) || Number(raw.gx)<0 || Number(raw.gx)>14 || Number(raw.gz)<0 || Number(raw.gz)>14 || Number(raw.rot)<0 || Number(raw.rot)>3) return fail(`Invalid placement at index ${i}.`,400,'invalid_input');
      const color = typeof raw.color==='string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color.toLowerCase() : '#e6dfd3';
      const item: Record<string,unknown> = {uid,catalogId:raw.catalogId,gx:raw.gx,gz:raw.gz,rot:raw.rot,color};
      if (raw.wall==='north'||raw.wall==='south'||raw.wall==='east'||raw.wall==='west') item.wall=raw.wall;
      if (typeof raw.active==='boolean') item.active=raw.active;
      items.push(item);
    }
    const surfaces = body.surfaces && typeof body.surfaces==='object' ? body.surfaces as Record<string,unknown> : {};
    if (!FLOOR_STYLES.includes(String(surfaces.floor)) || !WALL_STYLES.includes(String(surfaces.wall)) || !MOODS.includes(String(body.mood ?? 'morning'))) return fail('Invalid room surface or lighting mood.',400,'invalid_input');
    const name = typeof body.name==='string' ? body.name.trim().slice(0,48) : 'Grand Suite 402';
    const at=Date.now();
    const rows = await sql.query('UPDATE ll_suites SET name=$1,items_json=$2,surfaces_json=$3,mood=$4,updated_at=$5 WHERE owner_id=$6 RETURNING *',[name,JSON.stringify(items),JSON.stringify({floor:surfaces.floor,wall:surfaces.wall}),body.mood??'morning',at,account.id]) as Array<Record<string,unknown>>;
    let row=rows[0];
    if (!row) {
      const created=await sql.query('INSERT INTO ll_suites (id,owner_id,number,floor,name,items_json,surfaces_json,mood,is_public,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9) RETURNING *',[crypto.randomUUID(),account.id,'402',4,name,JSON.stringify(items),JSON.stringify({floor:surfaces.floor,wall:surfaces.wall}),body.mood??'morning',at]) as Array<Record<string,unknown>>;
      row=created[0];
    }
    return json(suiteView(row));
  }
  if (path === '/api/suite/visibility' && request.method === 'POST' && sql && account) {
    const body=await readJson(request);
    const rows=await sql.query('UPDATE ll_suites SET is_public=$1,updated_at=$2 WHERE owner_id=$3 RETURNING *',[Boolean(body.isPublic),Date.now(),account.id]) as Array<Record<string,unknown>>;
    return rows[0] ? json(suiteView(rows[0])) : fail('Suite not found.',404,'not_found');
  }
  return null;
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
    gameApi: env.GAME_ORIGIN ? 'legacy-fallback-configured' : 'edge-routes',
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

      if (url.pathname === '/api/guest/session') {
        if (!isSameOrigin(request)) return fail('Cross-origin request rejected.', 403, 'forbidden');
        if (request.method === 'POST' && rateLimited(request)) return fail('Too many attempts. Try again shortly.', 429, 'rate_limited');
        return await handleGuestSession(request, env);
      }

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

      if (url.pathname === '/api/party' && request.method === 'GET') {
        const auth = await currentAccount(request, env);
        if (!auth) return fail('Sign in to continue.',401,'unauthorized');
        if (!env.REALTIME) return fail('Party service is not configured.',503,'party_unavailable');
        const partyId = env.REALTIME.idFromName('party:global');
        return env.REALTIME.get(partyId).fetch(new Request('https://loftlife-internal/internal/party/state',{
          method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:auth.account.id}),
        }));
      }

      if (url.pathname === '/api/transit') {
        const transitResponse = handleTransitRoute(request);
        if (transitResponse) return transitResponse;
      }
      if (url.pathname === '/api/presence' && request.method === 'GET') {
        if (!env.REALTIME) return fail('Realtime Durable Object binding is not configured.',503,'realtime_unconfigured');
        const id = env.REALTIME.idFromName('party:global');
        return env.REALTIME.get(id).fetch(new Request('https://loftlife-internal/internal/party/presence-snapshot'));
      }

      if (url.pathname === '/api/settings' || url.pathname.startsWith('/api/messages/')) {
        const auth = await currentAccount(request, env);
        const sql = auth?.sql ?? (await database(env));
        if (!sql) return fail('DATABASE_URL is not configured.', 503, 'unconfigured');
        const platformResponse = await handlePlatformRoute(request, sql, auth?.account ?? null);
        if (platformResponse) return platformResponse;
      }

      if (url.pathname.startsWith('/api/')) {
        const gameResponse = await handleGameRead(request, env, url);
        if (gameResponse) return gameResponse;
      }

      if (url.pathname === '/api/economy/purchase' || url.pathname === '/api/economy/daily') {
        const auth = await currentAccount(request, env);
        const sql = auth?.sql ?? await database(env);
        if (!sql) return fail('DATABASE_URL is not configured.', 503, 'unconfigured');
        const economyResponse = await handleEconomyRoute(request, sql, auth?.account ?? null);
        if (economyResponse) return economyResponse;
      }

      if (url.pathname === '/api/worlds' || url.pathname.startsWith('/api/worlds/')) {
        const auth = await currentAccount(request, env);
        const sql = auth?.sql ?? await database(env);
        if (!sql) return fail('DATABASE_URL is not configured.', 503, 'unconfigured');
        const worldResponse = await handleWorldRoute(request, sql, auth?.account ?? null, env.REALTIME);
        if (worldResponse) return worldResponse;
      }

      if (
        url.pathname.startsWith('/api/friends') ||
        url.pathname.startsWith('/api/blocks') ||
        url.pathname.startsWith('/api/players') ||
        url.pathname.startsWith('/api/chat/history') ||
        url.pathname.startsWith('/api/reports') ||
        url.pathname.startsWith('/api/profiles/')
      ) {
        const auth = await currentAccount(request, env);
        const sql = auth?.sql ?? await database(env);
        if (!sql) return fail('DATABASE_URL is not configured.', 503, 'unconfigured');
        const socialResponse = await handleSocialRoute(request, sql, auth?.account ?? null);
        if (socialResponse) return socialResponse;
      }

      if (url.pathname === '/ws') {
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          return fail('A WebSocket upgrade is required.', 426, 'upgrade_required');
        }
        if (!env.REALTIME) return fail('Realtime Durable Object binding is not configured.', 503, 'realtime_unconfigured');
        // Clients ask for `city`; only the canonical city and explicit world
        // ids are routed. Arbitrary city:* shards are rejected here so they
        // cannot create ghost Durable Objects.
        const instance = resolveInstance(url.searchParams.get('instance'));
        if (!instance) return fail('Unknown realtime instance.', 400, 'invalid_instance');
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
