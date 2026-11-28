type Sql = { query(query: string, params?: unknown[]): Promise<unknown[]> };
type User = { id: string; handle: string; role: string };
type Row = Record<string, unknown>;
type StaffRole = 'founder' | 'director' | 'management' | 'administrator' | 'moderator' | 'support';
const ROLES: StaffRole[] = ['founder','director','management','administrator','moderator','support'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function fail(message: string, status: number, code: string) { return json({ error: message, code }, status); }
function parseList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 12) : [];
}
function safeDetail(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
async function audit(sql: Sql, actorId: string, targetId: string | null, action: string, detail: Row = {}) {
  await sql.query(
    'INSERT INTO ll_admin_audit(id,actor_id,target_id,action,detail_json,created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [crypto.randomUUID(), actorId, targetId, action, JSON.stringify(detail), Date.now()]
  );
}
async function founderBootstrap(sql: Sql, rawEmails?: string) {
  const emails = (rawEmails ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (emails.length !== 2 || emails[0] === emails[1] || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { configured: false, count: 0 };
  const { hashPassword } = await import('../../shared/auth-core.mjs');
  let count = 0;
  for (const email of emails) {
    let rows = await sql.query('SELECT id,handle FROM ll_accounts WHERE lower(email)=$1 LIMIT 1',[email]) as Array<{id:string;handle:string}>;
    if (!rows[0]) {
      const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,20);
      const handle = base.length >= 3 ? base : `founder${count+1}`;
      const hash = await hashPassword('1234567890');
      const id = 'usr_' + crypto.randomUUID();
      const now = Date.now();
      await sql.query('INSERT INTO ll_accounts(id,handle,email,password_hash,role,created_at,display_name,must_change_password) VALUES($1,$2,$3,$4,\'player\',$5,$6,TRUE) ON CONFLICT DO NOTHING',[id,handle,email,hash,now,handle]);
      rows = await sql.query('SELECT id,handle FROM ll_accounts WHERE lower(email)=$1 LIMIT 1',[email]) as Array<{id:string;handle:string}>;
    }
    if (!rows[0]) continue;
    await sql.query(
      `INSERT INTO ll_staff_assignments(user_id,role,departments_json,active,appointed_at,updated_at)
       VALUES($1,'founder','["executive"]',TRUE,$2,$2)
       ON CONFLICT(user_id) DO UPDATE SET role='founder',departments_json='["executive"]',active=TRUE,updated_at=EXCLUDED.updated_at`,
      [rows[0].id, Date.now()]
    );
    count++;
  }
  return { configured: true, count };
}
async function staffFor(sql: Sql, userId: string) {
  const rows = await sql.query(
    'SELECT role,departments_json,active FROM ll_staff_assignments WHERE user_id=$1 LIMIT 1',
    [userId]
  ) as Array<{role:StaffRole;departments_json:string;active:boolean}>;
  const row = rows[0];
  if (!row || !row.active || !ROLES.includes(row.role)) return null;
  let departments: string[] = [];
  try { departments = parseList(JSON.parse(row.departments_json)); } catch { /* empty */ }
  return { role: row.role, departments };
}
function canManageRole(actor: StaffRole, target: StaffRole) {
  if (actor === 'founder') return true;
  if (actor === 'director') return ['management','administrator','moderator','support'].includes(target);
  if (actor === 'management') return ['moderator','support'].includes(target);
  return false;
}
function canModerate(role: StaffRole) { return ['founder','director','management','administrator','moderator'].includes(role); }

/** Founder-led platform administration. Founder identities are bootstrapped only from the two exact handles in LOFTLIFE_FOUNDER_HANDLES. */
export async function handleAdminRoute(request: Request, sql: Sql, user: User | null, founderEmails?: string): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/admin/console')) return null;
  const bootstrap = await founderBootstrap(sql, founderEmails);
  if (!user) return fail('Founder accounts are ready. Sign in with the temporary password.', 401, 'unauthorized');
  const actor = await staffFor(sql, user.id);
  if (!actor) {
    if (!bootstrap.configured) return fail('Founder setup is required. Configure exactly two account handles in LOFTLIFE_FOUNDER_HANDLES.', 503, 'founder_setup_required');
    return fail('LoftLife staff access required.', 403, 'forbidden');
  }

  if (url.pathname === '/api/admin/console/accounts' && request.method === 'POST') {
    if (actor.role !== 'founder') return fail('Only Founders can create accounts.',403,'forbidden');
    const body = safeDetail(await request.json().catch(() => ({})));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawHandle = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0,32) : rawHandle;
    const role = body.role === 'player' ? 'player' : body.role as StaffRole;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-z0-9_]{3,20}$/.test(rawHandle) || !displayName || (role !== 'player' && !ROLES.includes(role))) return fail('Provide a valid email, 3–20 character handle, display name and role.',400,'invalid_input');
    const existing = await sql.query('SELECT id FROM ll_accounts WHERE lower(email)=$1 OR lower(handle)=$2 LIMIT 1',[email,rawHandle]) as Array<{id:string}>;
    if (existing.length) return fail('That email or handle is already registered.',409,'conflict');
    const { hashPassword } = await import('../../shared/auth-core.mjs');
    const id = 'usr_' + crypto.randomUUID();
    const now = Date.now();
    const hash = await hashPassword('1234567890');
    await sql.query('INSERT INTO ll_accounts(id,handle,email,password_hash,role,created_at,display_name,must_change_password) VALUES($1,$2,$3,$4,$5,$6,$7,TRUE)',[id,rawHandle,email,hash,'player',now,displayName]);
    if (role !== 'player') {
      const departments = parseList(body.departments).map((d) => d.toLowerCase()).filter((d) => /^[a-z0-9-]{2,32}$/.test(d));
      await sql.query("INSERT INTO ll_staff_assignments(user_id,role,departments_json,active,appointed_by,appointed_at,updated_at) VALUES($1,$2,$3,TRUE,$4,$5,$5)",[id,role,JSON.stringify(departments),user.id,now]);
    }
    await audit(sql,user.id,id,'account.created',{email,handle:rawHandle,role});
    return json({ok:true,account:{id,handle:rawHandle,email,role},temporaryPassword:'1234567890'});
  }

  if (url.pathname === '/api/admin/console/access' && request.method === 'GET') {
    return json({ actor: { userId: user.id, handle: user.handle, role: actor.role, departments: actor.departments } });
  }

  if (url.pathname === '/api/admin/console' && request.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
    const [staffRows, reportRows, accountCount, openReports, playerRows, auditRows] = await Promise.all([
      sql.query(`SELECT a.id,a.handle,a.display_name,s.role,s.departments_json,s.active,s.appointed_at
        FROM ll_staff_assignments s JOIN ll_accounts a ON a.id=s.user_id
        WHERE s.active=TRUE ORDER BY CASE s.role WHEN 'founder' THEN 0 WHEN 'director' THEN 1 WHEN 'management' THEN 2 WHEN 'administrator' THEN 3 WHEN 'moderator' THEN 4 ELSE 5 END,a.handle`) as Promise<Array<Row>>,
      sql.query(`SELECT r.id,r.reason,r.details,r.status,r.created_at,
        reporter.handle AS reporter_handle,target.handle AS target_handle,target.id AS target_id
        FROM ll_reports r JOIN ll_accounts reporter ON reporter.id=r.reporter_id
        JOIN ll_accounts target ON target.id=r.target_user_id
        ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`) as Promise<Array<Row>>,
      sql.query('SELECT COUNT(*) AS total FROM ll_accounts') as Promise<Array<{total:string|number}>>,
      sql.query("SELECT COUNT(*) AS total FROM ll_reports WHERE status='open'") as Promise<Array<{total:string|number}>>,
      sql.query(`SELECT a.id,a.handle,a.display_name,a.created_at,COALESCE(a.suspended_until,0) AS suspended_until,
        COALESCE(s.role,'player') AS staff_role
        FROM ll_accounts a LEFT JOIN ll_staff_assignments s ON s.user_id=a.id AND s.active=TRUE
        WHERE ($1='' OR a.handle ILIKE $2 OR a.display_name ILIKE $2)
        ORDER BY a.created_at DESC LIMIT 100`, [q, `%${q}%`]) as Promise<Array<Row>>,
      sql.query(`SELECT l.id,l.action,l.detail_json,l.created_at,a.handle AS actor_handle,t.handle AS target_handle
        FROM ll_admin_audit l LEFT JOIN ll_accounts a ON a.id=l.actor_id
        LEFT JOIN ll_accounts t ON t.id=l.target_id ORDER BY l.created_at DESC LIMIT 80`) as Promise<Array<Row>>,
    ]);
    const scopedReports = canModerate(actor.role) ? reportRows : [];
    const scopedAudit = ['founder','director','management','administrator'].includes(actor.role) ? auditRows : [];
    const staff = staffRows.map((row) => ({
      userId: String(row.id), handle: String(row.handle), displayName: String(row.display_name ?? row.handle),
      role: String(row.role), departments: (() => { try { return parseList(JSON.parse(String(row.departments_json ?? '[]'))); } catch { return []; } })(),
      appointedAt: Number(row.appointed_at),
    }));
    return json({
      actor: { userId: user.id, handle: user.handle, role: actor.role, departments: actor.departments },
      stats: { accounts: Number(accountCount[0]?.total ?? 0), staff: staff.length, openReports: Number(openReports[0]?.total ?? 0) },
      staff,
      reports: scopedReports.map((row) => ({ id: String(row.id), reason: String(row.reason), details: String(row.details ?? ''), status: String(row.status), createdAt: Number(row.created_at), reporter: String(row.reporter_handle), target: String(row.target_handle), targetId: String(row.target_id) })),
      players: playerRows.map((row) => ({ id: String(row.id), handle: String(row.handle), displayName: String(row.display_name ?? row.handle), createdAt: Number(row.created_at), suspendedUntil: Number(row.suspended_until ?? 0), staffRole: String(row.staff_role) })),
      audit: scopedAudit.map((row) => ({ id: String(row.id), action: String(row.action), detail: safeDetail(JSON.parse(String(row.detail_json ?? '{}'))), createdAt: Number(row.created_at), actor: String(row.actor_handle ?? 'System'), target: row.target_handle ? String(row.target_handle) : null })),
      founderSetup: bootstrap,
    });
  }

  if (url.pathname === '/api/admin/console/staff' && request.method === 'POST') {
    const body = safeDetail(await request.json().catch(() => ({})));
    const handle = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '';
    const role = body.role as StaffRole;
    const departments = parseList(body.departments).map((item) => item.trim().toLowerCase()).filter((item) => /^[a-z0-9-]{2,32}$/.test(item));
    if (!handle || !ROLES.includes(role) || role === 'founder' || !canManageRole(actor.role, role)) return fail('You cannot assign that staff role.', 403, 'forbidden');
    const accounts = await sql.query('SELECT id,handle FROM ll_accounts WHERE lower(handle)=$1 LIMIT 1', [handle]) as Array<{id:string;handle:string}>;
    if (!accounts[0]) return fail('Player account not found.', 404, 'not_found');
    if (accounts[0].id === user.id) return fail('You cannot change your own staff assignment.', 400, 'self_change');
    const existing = await staffFor(sql, accounts[0].id);
    if (existing?.role === 'founder') return fail('Founder appointments are immutable and cannot be changed through staff management.', 403, 'founder_protected');
    if (existing && !canManageRole(actor.role, existing.role)) return fail('You cannot modify this staff member.', 403, 'forbidden');
    if (actor.role !== 'founder' && (!departments.length || departments.some((department) => !actor.departments.includes(department)))) {
      return fail('You can only assign staff within your own departments.', 403, 'department_scope');
    }
    const now = Date.now();
    await sql.query(`INSERT INTO ll_staff_assignments(user_id,role,departments_json,active,appointed_by,appointed_at,updated_at)
      VALUES($1,$2,$3,TRUE,$4,$5,$5)
      ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,departments_json=EXCLUDED.departments_json,active=TRUE,appointed_by=EXCLUDED.appointed_by,updated_at=EXCLUDED.updated_at`,
      [accounts[0].id, role, JSON.stringify(departments), user.id, now]);
    await audit(sql, user.id, accounts[0].id, 'staff.role_assigned', { handle: accounts[0].handle, role, departments });
    return json({ ok: true });
  }

  const staffMatch = url.pathname.match(/^\/api\/admin\/console\/staff\/([^/]+)$/);
  if (staffMatch && request.method === 'DELETE') {
    const targetId = decodeURIComponent(staffMatch[1]);
    if (targetId === user.id) return fail('You cannot remove your own staff assignment.', 400, 'self_change');
    const target = await staffFor(sql, targetId);
    if (!target || target.role === 'founder' || !canManageRole(actor.role, target.role)) return fail('You cannot remove this staff member.', 403, 'forbidden');
    await sql.query('UPDATE ll_staff_assignments SET active=FALSE,updated_at=$2 WHERE user_id=$1', [targetId, Date.now()]);
    await audit(sql, user.id, targetId, 'staff.removed', { previousRole: target.role });
    return json({ ok: true });
  }

  const reportMatch = url.pathname.match(/^\/api\/admin\/console\/reports\/([^/]+)$/);
  if (reportMatch && request.method === 'POST') {
    if (!canModerate(actor.role)) return fail('Moderation access required.', 403, 'forbidden');
    const body = safeDetail(await request.json().catch(() => ({})));
    const status = body.status;
    if (status !== 'reviewed' && status !== 'actioned') return fail('Invalid report status.', 400, 'invalid_input');
    const id = decodeURIComponent(reportMatch[1]);
    const result = await sql.query('UPDATE ll_reports SET status=$2 WHERE id=$1 RETURNING id', [id, status]) as Array<{id:string}>;
    if (!result.length) return fail('Report not found.', 404, 'not_found');
    await audit(sql, user.id, null, 'report.status_changed', { reportId: id, status });
    return json({ ok: true });
  }

  const suspendMatch = url.pathname.match(/^\/api\/admin\/console\/players\/([^/]+)\/suspension$/);
  if (suspendMatch && request.method === 'POST') {
    if (!canModerate(actor.role)) return fail('Moderation access required.', 403, 'forbidden');
    const targetId = decodeURIComponent(suspendMatch[1]);
    if (targetId === user.id) return fail('You cannot suspend your own account.', 400, 'self_change');
    const body = safeDetail(await request.json().catch(() => ({})));
    const hours = Number(body.hours);
    if (!Number.isInteger(hours) || hours < 0 || hours > 720) return fail('Suspension must be between 0 and 720 hours.', 400, 'invalid_input');
    const target = await sql.query(`SELECT a.id,a.handle,s.role AS staff_role FROM ll_accounts a LEFT JOIN ll_staff_assignments s ON s.user_id=a.id AND s.active=TRUE WHERE a.id=$1 LIMIT 1`, [targetId]) as Array<{id:string;handle:string;staff_role:string|null}>;
    if (!target.length) return fail('Player not found.', 404, 'not_found');
    if (target[0].staff_role) return fail('Staff accounts cannot be suspended through player moderation.', 403, 'staff_protected');
    const until = hours === 0 ? 0 : Date.now() + hours * 60 * 60 * 1000;
    await sql.query('UPDATE ll_accounts SET suspended_until=$2 WHERE id=$1', [targetId, until]);
    await audit(sql, user.id, targetId, hours ? 'player.suspended' : 'player.unsuspended', { hours, until });
    return json({ ok: true, suspendedUntil: until });
  }

  return fail('Admin action not found.', 404, 'not_found');
}
