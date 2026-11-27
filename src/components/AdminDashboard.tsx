import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Building2, Check, Clock3, Crown, FileText,
  Headset, Loader2, RefreshCw, Search, Shield, ShieldCheck, UserCog, Users, X,
} from 'lucide-react';
import { api, ApiError, type AdminConsoleData, type LoftStaffRole } from '../net/api';

type Tab = 'overview' | 'staff' | 'players' | 'reports' | 'audit';
const ROLE_LABEL: Record<LoftStaffRole, string> = {
  founder: 'Founder', director: 'Director', management: 'Management',
  administrator: 'Administrator', moderator: 'Moderator', support: 'Support',
};
const ROLE_OPTIONS: Exclude<LoftStaffRole, 'founder'>[] = [
  'director','management','administrator','moderator','support',
];
const DEPARTMENTS = ['development','community','operations','marketing','finance','player-support','executive'];
const dateLabel = (value: number) => value ? new Date(value).toLocaleString() : '—';

export const AdminDashboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<AdminConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [staffHandle, setStaffHandle] = useState('');
  const [staffRole, setStaffRole] = useState<Exclude<LoftStaffRole, 'founder'>>('support');
  const [departments, setDepartments] = useState<string[]>(['player-support']);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (search = '') => {
    setLoading(true); setError('');
    try { setData(await api.adminConsole(search)); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not load administration data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(''); }, [load]);

  const refresh = async () => { await load(query); };
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(message); await load(query); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  };

  const canAssign = data?.actor.role === 'founder' || data?.actor.role === 'director' || data?.actor.role === 'management';
  const visibleTabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity size={16}/> },
    { id: 'staff', label: 'Staff & roles', icon: <UserCog size={16}/> },
    { id: 'players', label: 'Players', icon: <Users size={16}/> },
    { id: 'reports', label: 'Moderation', icon: <Shield size={16}/> },
    { id: 'audit', label: 'Audit logs', icon: <FileText size={16}/> },
  ];
  const staffCountByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const person of data?.staff ?? []) counts[person.role] = (counts[person.role] ?? 0) + 1;
    return counts;
  }, [data]);

  return (
    <div className="fixed inset-0 z-[120] flex items-stretch justify-center bg-[#07090c]/85 p-0 backdrop-blur-md sm:p-4">
      <section className="flex h-full w-full max-w-[1500px] flex-col overflow-hidden border border-white/10 bg-[#101419] text-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#39ff14]/10 text-[#39ff14]"><Crown size={21}/></div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#39ff14]">LoftLife · Control Center</p>
            <h1 className="truncate text-lg font-bold">Administration</h1>
          </div>
          {data && <span className="ml-auto hidden rounded-full border border-[#39ff14]/25 bg-[#39ff14]/10 px-3 py-1 text-xs font-semibold text-[#a9ff98] sm:inline-flex">{ROLE_LABEL[data.actor.role]}</span>}
          <button onClick={() => void refresh()} disabled={loading || busy} className="ml-auto rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 disabled:opacity-40 sm:ml-0" aria-label="Refresh"><RefreshCw size={17}/></button>
          <button onClick={onClose} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5" aria-label="Close administration"><X size={18}/></button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 sm:w-56 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3" aria-label="Admin sections">
            {visibleTabs.map((item) => (
              <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${tab === item.id ? 'bg-[#39ff14]/12 text-[#a9ff98]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                {item.icon}<span>{item.label}</span>
              </button>
            ))}
            <div className="mt-auto hidden border-t border-white/10 pt-3 text-[10px] leading-relaxed text-slate-500 sm:block">
              Signed in as <span className="font-semibold text-slate-300">@{data?.actor.handle ?? '—'}</span><br/>
              Founder-led staff permissions
            </div>
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200"><AlertTriangle size={17} className="mt-0.5 shrink-0"/>{error}</div>}
            {notice && <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#39ff14]/20 bg-[#39ff14]/10 p-3 text-sm text-[#c5ffbc]"><Check size={16}/>{notice}</div>}
            {loading && !data ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="animate-spin" size={18}/>Loading administration…</div> : null}
            {data && <>
              {tab === 'overview' && <div className="space-y-6">
                <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-500">Platform overview</p><h2 className="mt-1 text-2xl font-bold">Welcome, {data.actor.handle}</h2><p className="mt-1 text-sm text-slate-400">Your current access: {ROLE_LABEL[data.actor.role]}.</p></div>
                {!data.founderSetup.configured && <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100"><strong>Founder setup required.</strong><p className="mt-1 text-amber-100/75">Set the two exact account handles in the Cloudflare Worker secret LOFTLIFE_FOUNDER_HANDLES (comma-separated) to activate Markk and Alijah's founder seats.</p></div>}
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Registered accounts', value: data.stats.accounts, icon: <Users size={19}/> },
                    { label: 'Active staff', value: data.stats.staff, icon: <ShieldCheck size={19}/> },
                    { label: 'Open reports', value: data.stats.openReports, icon: <AlertTriangle size={19}/> },
                  ].map((stat) => <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-center justify-between text-slate-400"><span className="text-xs">{stat.label}</span>{stat.icon}</div><p className="mt-3 text-3xl font-bold tabular-nums">{stat.value}</p></div>)}
                </div>
                <section className="rounded-xl border border-white/10 p-4"><h3 className="font-semibold">Leadership structure</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ROLE_OPTIONS.map((role) => <div key={role} className="flex items-center justify-between rounded-lg bg-white/[.04] px-3 py-2.5"><span className="text-sm text-slate-300">{ROLE_LABEL[role]}</span><span className="text-sm font-bold tabular-nums">{staffCountByRole[role] ?? 0}</span></div>)}<div className="flex items-center justify-between rounded-lg bg-[#39ff14]/10 px-3 py-2.5"><span className="text-sm text-[#baffad]">Founders</span><span className="text-sm font-bold tabular-nums">{staffCountByRole.founder ?? 0}/2</span></div></div></section>
                <section className="rounded-xl border border-white/10 p-4"><h3 className="font-semibold">Departments</h3><div className="mt-3 flex flex-wrap gap-2">{DEPARTMENTS.map((dept) => <span key={dept} className="rounded-full border border-white/10 px-3 py-1.5 text-xs capitalize text-slate-300">{dept.replace(/-/g,' ')}</span>)}</div></section>
              </div>}

              {tab === 'staff' && <div className="space-y-5">
                <div><h2 className="text-xl font-bold">Staff & roles</h2><p className="mt-1 text-sm text-slate-400">Appoint staff, assign departments and manage active appointments.</p></div>
                {canAssign && <form className="grid gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void run(() => api.assignStaff({ handle: staffHandle, role: staffRole, departments }), 'Staff appointment saved.'); setStaffHandle(''); }}>
                  <label className="text-xs text-slate-400">Player username<input value={staffHandle} onChange={(event) => setStaffHandle(event.target.value)} placeholder="username" className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090d11] px-3 py-2.5 text-sm text-white outline-none focus:border-[#39ff14]/60"/></label>
                  <label className="text-xs text-slate-400">Staff role<select value={staffRole} onChange={(event) => setStaffRole(event.target.value as typeof staffRole)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#090d11] px-3 py-2.5 text-sm text-white">{ROLE_OPTIONS.filter((role) => data.actor.role === 'founder' || (data.actor.role === 'director' ? role !== 'director' : ['moderator','support'].includes(role))).map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></label>
                  <fieldset className="sm:col-span-2"><legend className="mb-2 text-xs text-slate-400">Departments</legend><div className="flex flex-wrap gap-2">{DEPARTMENTS.filter((dept) => dept !== 'executive').map((dept) => <label key={dept} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-slate-300"><input type="checkbox" checked={departments.includes(dept)} onChange={(event) => setDepartments((current) => event.target.checked ? [...current,dept] : current.filter((item) => item !== dept))}/><span className="capitalize">{dept.replace(/-/g,' ')}</span></label>)}</div></fieldset>
                  <button disabled={busy || !staffHandle.trim()} className="rounded-lg bg-[#39ff14] px-4 py-2.5 text-sm font-bold text-black disabled:opacity-40 sm:col-span-2">{busy ? 'Saving…' : 'Appoint staff member'}</button>
                </form>}
                <div className="overflow-hidden rounded-xl border border-white/10"><div className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/10 bg-white/[.03] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500"><span>Staff member</span><span>Role / action</span></div>
                  {data.staff.map((person) => <div key={person.userId} className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.displayName} <span className="font-normal text-slate-500">@{person.handle}</span></p><p className="mt-1 text-[11px] capitalize text-slate-500">{person.departments.join(' · ').replace(/-/g,' ') || 'No department assigned'}</p></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300">{ROLE_LABEL[person.role]}</span>{person.role !== 'founder' && canAssign && <button disabled={busy || (data.actor.role !== 'founder' && (person.role === 'director' || person.role === 'management' || person.role === 'administrator'))} onClick={() => void run(() => api.removeStaff(person.userId), 'Staff appointment removed.')} className="rounded-lg border border-red-400/20 p-2 text-red-300 hover:bg-red-400/10 disabled:opacity-30" aria-label={`Remove ${person.handle}`}><X size={14}/></button>}</div></div>)}
                  {!data.staff.length && <p className="p-4 text-sm text-slate-500">No staff appointments yet.</p>}
                </div>
              </div>}

              {tab === 'players' && <div className="space-y-4">
                <div><h2 className="text-xl font-bold">Player accounts</h2><p className="mt-1 text-sm text-slate-400">Search accounts and manage temporary suspensions.</p></div>
                <form onSubmit={(event) => { event.preventDefault(); void load(query); }} className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username or display name" className="w-full rounded-lg border border-white/10 bg-white/[.03] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#39ff14]/50"/></div><button className="rounded-lg border border-white/10 px-4 text-sm">Search</button></form>
                <div className="space-y-2">{data.players.map((player) => <div key={player.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><div><p className="text-sm font-semibold">{player.displayName} <span className="font-normal text-slate-500">@{player.handle}</span></p><p className="mt-1 text-[11px] text-slate-500">Joined {dateLabel(player.createdAt)}{player.suspendedUntil > Date.now() ? ` · Suspended until ${dateLabel(player.suspendedUntil)}` : ''}</p></div>{player.staffRole === 'player' && <div className="flex gap-2">{player.suspendedUntil > Date.now() ? <button disabled={busy} onClick={() => void run(() => api.setPlayerSuspension(player.id,0),'Account suspension lifted.')} className="rounded-lg border border-[#39ff14]/25 px-3 py-2 text-xs text-[#baffad]">Unsuspend</button> : <button disabled={busy || !['founder','director','management','administrator','moderator'].includes(data.actor.role)} onClick={() => { const value = window.prompt('Suspension duration in hours (1–720):'); if (value !== null) { const hours = Number(value); if (Number.isInteger(hours) && hours >= 1 && hours <= 720) void run(() => api.setPlayerSuspension(player.id,hours),'Account suspended.'); else setError('Enter a whole number from 1 to 720.'); } }} className="rounded-lg border border-amber-400/20 px-3 py-2 text-xs text-amber-200 disabled:opacity-30">Suspend</button>}</div>}</div>)}</div>
              </div>}

              {tab === 'reports' && <div className="space-y-4"><div><h2 className="text-xl font-bold">Moderation queue</h2><p className="mt-1 text-sm text-slate-400">Review player-submitted reports and record outcomes.</p></div>{data.reports.map((report) => <article key={report.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{report.reason}</span><span className={`rounded-full px-2.5 py-1 text-[10px] uppercase ${report.status === 'open' ? 'bg-amber-400/10 text-amber-200' : 'bg-white/5 text-slate-400'}`}>{report.status}</span></div><p className="mt-2 text-xs text-slate-400">Reported by @{report.reporter} · Target @{report.target} · {dateLabel(report.createdAt)}</p>{report.details && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{report.details}</p>}{report.status === 'open' && ['founder','director','management','administrator','moderator'].includes(data.actor.role) && <div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => void run(() => api.updateAdminReport(report.id,'reviewed'),'Report marked reviewed.')} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Mark reviewed</button><button disabled={busy} onClick={() => void run(() => api.updateAdminReport(report.id,'actioned'),'Report marked actioned.')} className="rounded-lg bg-[#39ff14]/15 px-3 py-2 text-xs text-[#baffad]">Action taken</button></div>}</article>)}{!data.reports.length && <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-500">No reports have been submitted.</p>}</div>}

              {tab === 'audit' && <div className="space-y-4"><div><h2 className="text-xl font-bold">Administrative audit log</h2><p className="mt-1 text-sm text-slate-400">Recent staff appointments, moderation and account actions.</p></div><div className="space-y-2">{data.audit.map((entry) => <article key={entry.id} className="rounded-xl border border-white/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{entry.action.replace(/[._]/g,' ')}</p><p className="mt-1 text-xs text-slate-400">By @{entry.actor}{entry.target ? ` · Target @${entry.target}` : ''}</p></div><time className="shrink-0 text-[10px] text-slate-500">{dateLabel(entry.createdAt)}</time></div><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] text-slate-500">{JSON.stringify(entry.detail)}</pre></article>)}{!data.audit.length && <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-500">No administrative actions recorded yet.</p>}</div></div>}
            </>}
          </main>
        </div>
      </section>
    </div>
  );
};
