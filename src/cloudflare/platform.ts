import { sanitizeSettings } from '../../shared/settings-core.mjs';

type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type User = { id: string; handle: string; role: string };
type Row = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
function fail(message: string, status: number, code: string) {
  return json({ error: message, code }, status);
}

/** Settings for any account, defaulting to the shared defaults. */
export async function settingsFor(sql: Sql, userId: string) {
  try {
    const rows = (await sql.query(
      'SELECT data_json FROM ll_account_settings WHERE user_id=$1 LIMIT 1',
      [userId]
    )) as Array<{ data_json: string }>;
    if (!rows[0]) return sanitizeSettings(null);
    return sanitizeSettings(JSON.parse(rows[0].data_json));
  } catch {
    return sanitizeSettings(null);
  }
}

export async function canViewProfileWith(
  sql: Sql,
  viewerId: string | null,
  targetId: string
): Promise<boolean> {
  if (viewerId && viewerId === targetId) return true;
  const settings = await settingsFor(sql, targetId);
  if (settings.privacy.profileVisibility === 'public') return true;
  if (settings.privacy.profileVisibility !== 'friends' || !viewerId) return false;
  const rows = await sql.query(
    "SELECT 1 FROM ll_friendships WHERE status='accepted' AND ((a=$1 AND b=$2) OR (a=$2 AND b=$1)) LIMIT 1",
    [viewerId, targetId]
  );
  return rows.length > 0;
}

export async function invitationsAllowedWith(sql: Sql, targetId: string): Promise<boolean> {
  return (await settingsFor(sql, targetId)).privacy.invitations === 'everyone';
}

/** GET/PUT settings, GET conversation inbox and POST read markers. */
export async function handlePlatformRoute(
  request: Request,
  sql: Sql,
  user: User | null
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/settings') && !path.startsWith('/api/messages/')) return null;
  if (!user) return fail('Sign in to continue.', 401, 'unauthorized');

  if (path === '/api/settings' && request.method === 'GET') {
    return json({ settings: await settingsFor(sql, user.id) });
  }

  if (path === '/api/settings' && request.method === 'PUT') {
    const body = (await request.json().catch(() => ({}))) as Row;
    const source = body && Object.prototype.hasOwnProperty.call(body, 'settings') ? body.settings : body;
    const clean = sanitizeSettings(source);
    if (JSON.stringify(clean).length > 24_000) {
      return fail('Settings are too large.', 400, 'bad_request');
    }
    await sql.query(
      `INSERT INTO ll_account_settings (user_id, data_json, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET data_json=EXCLUDED.data_json, updated_at=EXCLUDED.updated_at`,
      [user.id, JSON.stringify(clean), Date.now()]
    );
    return json({ settings: clean });
  }

  if (path === '/api/messages/conversations' && request.method === 'GET') {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 50));
    const rows = (await sql.query(
      `SELECT scope_id, body, created_at, user_id FROM ll_chat_messages
       WHERE scope='dm' AND (scope_id LIKE $1 OR scope_id LIKE $2)
       ORDER BY created_at DESC LIMIT 500`,
      [`${user.id}|%`, `%|${user.id}`]
    )) as Row[];

    const latest = new Map<string, Row>();
    for (const row of rows) {
      if (!latest.has(String(row.scope_id))) latest.set(String(row.scope_id), row);
    }

    const reads = (await sql.query(
      'SELECT peer_id, last_read_at FROM ll_dm_reads WHERE user_id=$1',
      [user.id]
    )) as Row[];
    const readAt = new Map(reads.map((row) => [String(row.peer_id), Number(row.last_read_at)]));

    const scoped = [...latest.entries()].slice(0, limit);
    const peerIds = new Set<string>();
    for (const [scopeId] of scoped) {
      const [a, b] = scopeId.split('|');
      const peerId = a === user.id ? b : a;
      if (peerId && peerId !== user.id) peerIds.add(peerId);
    }
    const peers = peerIds.size
      ? ((await sql.query(
          `SELECT a.id, a.handle, COALESCE(p.display_name,a.handle) AS display_name, p.avatar_json
           FROM ll_accounts a LEFT JOIN ll_profiles p ON p.user_id=a.id
           WHERE a.id IN (${[...peerIds].map((_, index) => `$${index + 1}`).join(',')})`,
          [...peerIds]
        )) as Row[])
      : [];
    const partner = new Map(peers.map((row) => [String(row.id), row]));

    const blockedRows = (await sql.query(
      'SELECT blocked_id FROM ll_blocks WHERE user_id=$1 UNION SELECT user_id FROM ll_blocks WHERE blocked_id=$1',
      [user.id]
    )) as Row[];
    const blocked = new Set(blockedRows.map((row) => String(row.blocked_id ?? row.user_id)));

    const conversations = [];
    for (const [scopeId, last] of scoped) {
      const [a, b] = scopeId.split('|');
      const peerId = a === user.id ? b : a;
      const person = partner.get(peerId);
      if (!peerId || peerId === user.id || !person || blocked.has(peerId)) continue;
      const unreadRows = (await sql.query(
        "SELECT COUNT(*)::int AS n FROM ll_chat_messages WHERE scope='dm' AND scope_id=$1 AND user_id=$2 AND created_at>$3",
        [scopeId, peerId, readAt.get(peerId) ?? 0]
      )) as Array<{ n: number }>;
      let avatar = null;
      try {
        avatar = person.avatar_json ? JSON.parse(String(person.avatar_json)) : null;
      } catch {
        avatar = null;
      }
      conversations.push({
        userId: peerId,
        handle: person.handle,
        displayName: person.display_name,
        avatar,
        unread: Number(unreadRows[0]?.n ?? 0),
        lastMessage: {
          body: last.body,
          createdAt: Number(last.created_at),
          fromMe: last.user_id === user.id,
        },
      });
    }
    return json({ conversations });
  }

  if (path === '/api/messages/read' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as Row;
    const handle = String(body.handle ?? '').toLowerCase();
    const targets = (await sql.query('SELECT id FROM ll_accounts WHERE handle=$1 LIMIT 1', [
      handle,
    ])) as Array<{ id: string }>;
    if (!targets[0]) return fail('No player with that handle.', 404, 'not_found');
    const blocked = await sql.query(
      'SELECT 1 FROM ll_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1) LIMIT 1',
      [user.id, targets[0].id]
    );
    if (blocked.length) return fail('This conversation is unavailable.', 403, 'forbidden');
    await sql.query(
      `INSERT INTO ll_dm_reads (user_id, peer_id, last_read_at) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, peer_id) DO UPDATE SET last_read_at=EXCLUDED.last_read_at`,
      [user.id, targets[0].id, Date.now()]
    );
    return json({ ok: true, handle });
  }

  return null;
}
