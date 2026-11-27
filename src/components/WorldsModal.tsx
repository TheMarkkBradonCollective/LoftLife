import React, { useCallback, useEffect, useState } from 'react';
import { DoorOpen, Globe2, Hammer, Loader2, Lock, Plus, Trash2, UserPlus, X } from 'lucide-react';
import {
  api,
  ApiError,
  type WorldAccess,
  type WorldFoundationId,
  type WorldKind,
  type WorldRole,
  type WorldStatus,
  type WorldSummary,
} from '../net/api';
import { MOBILE_GAMEPLAY_MESSAGE } from '../../shared/device-platform.mjs';
import { useSession } from '../session';

const panel = 'bg-[#15181c]/97 text-slate-100 border-white/20';

const KINDS: WorldKind[] = [
  'hangout',
  'house',
  'apartment',
  'club',
  'restaurant',
  'shop',
  'park',
  'venue',
  'neighborhood',
];

const STATUS_LABEL: Record<WorldStatus, string> = {
  live: 'Live',
  available: 'Available',
  offline: 'Offline',
  build_mode: 'Build Mode',
  build_pending: 'Waiting for players to leave',
  maintenance: 'Maintenance',
};

const ROLE_LABEL: Record<Exclude<WorldRole, 'owner'>, string> = {
  co_owner: 'Co-Owner',
  moderator: 'Moderator',
  builder: 'Builder',
  member: 'Member',
};

const ACCESS_LABEL: Record<WorldAccess, string> = {
  public: 'Public',
  private: 'Private',
  invite: 'Invite only',
  friends: 'Friends only',
  collab: 'Collaborative',
};

interface WorldsModalProps {
  open: boolean;
  onClose: () => void;
  onEnter: (worldId: string) => void;
  /** Open the visual city-building studio for a world the player can build in. */
  onOpenStudio?: (worldId: string) => void;
  /** Unsupported runtimes can browse/manage but never launch a world. */
  gameplayAllowed?: boolean;
}

/** Create, publish, share and enter player-owned worlds. */
export const WorldsModal: React.FC<WorldsModalProps> = ({
  open,
  onClose,
  onEnter,
  onOpenStudio,
  gameplayAllowed = true,
}) => {
  const { status, user } = useSession();
  const online = status === 'online';
  const isStaff = user?.role === 'admin';

  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [mine, setMine] = useState<WorldSummary[]>([]);
  const [publicWorlds, setPublicWorlds] = useState<WorldSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<WorldKind>('hangout');
  const [access, setAccess] = useState<WorldAccess>('private');
  const [foundation, setFoundation] = useState<WorldFoundationId>('TG-MapDefault');
  const [foundationOptions, setFoundationOptions] = useState<
    { id: WorldFoundationId; label: string; description: string }[]
  >([
    { id: 'TG-MapDefault', label: 'TG-MapDefault', description: 'Grass and the street/road grid only' },
  ]);
  const [creating, setCreating] = useState(false);
  const [openingOfficial, setOpeningOfficial] = useState(false);

  const [shareTarget, setShareTarget] = useState<Record<string, string>>({});
  const [shareRole, setShareRole] = useState<Record<string, Exclude<WorldRole, 'owner'>>>({});

  const load = useCallback(async () => {
    if (!online) return;
    setLoading(true);
    setError(null);
    try {
      const [own, published] = await Promise.all([
        api.worlds({ mine: true }),
        api.worlds({ q: '' }),
      ]);
      setMine(own);
      setPublicWorlds(published);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load worlds');
    } finally {
      setLoading(false);
    }
  }, [online]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    api
      .foundations()
      .then((result) => {
        setFoundationOptions(result.foundations);
        setFoundation((current) =>
          result.foundations.some((entry) => entry.id === current) ? current : result.default
        );
      })
      .catch(() => undefined);
  }, [open]);

  if (!open) return null;

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!online) {
      setError('Sign in to create worlds.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const world = await api.createWorld({ name: name.trim(), kind, access, foundation });
      setName('');
      const build = await api.requestWorldBuildMode(world.id);
      await load();
      setTab('mine');
      if (build.status === 'build_mode' && gameplayAllowed) onEnter(world.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create world');
    } finally {
      setCreating(false);
    }
  };

  const patch = async (world: WorldSummary, body: Parameters<typeof api.updateWorld>[1]) => {
    setBusyId(world.id);
    setError(null);
    try {
      await api.updateWorld(world.id, body);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update world');
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (world: WorldSummary, status: Extract<WorldStatus, 'live' | 'available' | 'offline'>) => {
    setBusyId(world.id);
    setError(null);
    try {
      await api.setWorldStatus(world.id, status);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change city status');
    } finally {
      setBusyId(null);
    }
  };

  const requestBuildMode = async (world: WorldSummary) => {
    setBusyId(world.id);
    setError(null);
    try {
      const result = await api.requestWorldBuildMode(world.id);
      await load();
      if (result.status === 'build_mode' && gameplayAllowed) onEnter(world.id);
      else if (result.pending) setError('Build Mode is queued. Current visitors can stay until everyone leaves.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not enter Build Mode');
    } finally {
      setBusyId(null);
    }
  };

  const openOfficial = async () => {
    setOpeningOfficial(true);
    setError(null);
    try {
      const studio = await api.officialMainCity();
      onOpenStudio?.(studio.world.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open the Main City workspace');
    } finally {
      setOpeningOfficial(false);
    }
  };

  const remove = async (world: WorldSummary) => {
    setBusyId(world.id);
    try {
      await api.deleteWorld(world.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete world');
    } finally {
      setBusyId(null);
    }
  };

  const share = async (world: WorldSummary, asCollaborator: boolean) => {
    const handle = (shareTarget[world.id] ?? '').trim().replace(/^@/, '');
    if (!handle) return;
    setBusyId(world.id);
    setError(null);
    try {
      if (asCollaborator) await api.addCollaborator(world.id, handle, shareRole[world.id] ?? 'builder');
      else await api.inviteToWorld(world.id, handle);
      setShareTarget((prev) => ({ ...prev, [world.id]: '' }));
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not share world');
    } finally {
      setBusyId(null);
    }
  };

  const list = tab === 'mine' ? mine : publicWorlds;
  const input =
    'px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/12 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-white/40';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-[min(760px,96vw)] max-h-[86vh] rounded-2xl border overflow-hidden flex flex-col ${panel}`}>
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-white" />
          <h2 className="font-display text-sm font-bold">Worlds</h2>
          <div className="ml-auto flex items-center gap-1">
            {(
              [
                { id: 'mine' as const, label: 'My worlds' },
                { id: 'discover' as const, label: 'Discover' },
              ] as const
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                  tab === entry.id ? 'bg-white text-[#15181b]' : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                {entry.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close worlds"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 text-xs border-b border-red-500/20 bg-red-500/10 text-red-200">
            {error}
          </div>
        )}

        {!gameplayAllowed && (
          <div className="px-4 py-2.5 text-[11px] leading-snug border-b border-amber-300/20 bg-amber-400/10 text-amber-100 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
            <span>{MOBILE_GAMEPLAY_MESSAGE}</span>
          </div>
        )}

        {tab === 'mine' && isStaff && (
          <div className="px-4 py-2 border-b border-amber-300/20 bg-amber-400/5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-amber-100">Official Main City · LoftLife staff workspace</span>
            <button
              type="button"
              onClick={() => void openOfficial()}
              disabled={openingOfficial}
              className="ml-auto px-2.5 py-1 rounded-lg bg-amber-300 text-[#241a05] text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
            >
              {openingOfficial ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hammer className="w-3 h-3" />}
              Open Main City studio
            </button>
          </div>
        )}

        {tab === 'mine' && (
          <form onSubmit={create} className="px-4 py-2.5 border-b border-white/8 flex flex-wrap items-center gap-2">
            <input
              className={`${input} flex-1 min-w-[140px]`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="World name"
              maxLength={48}
              required
            />
            <select
              className={input}
              value={kind}
              onChange={(event) => setKind(event.target.value as WorldKind)}
              aria-label="World type"
            >
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className={input}
              value={access}
              onChange={(event) => setAccess(event.target.value as WorldAccess)}
              aria-label="Who can enter"
            >
              {(Object.keys(ACCESS_LABEL) as WorldAccess[]).map((option) => (
                <option key={option} value={option}>
                  {ACCESS_LABEL[option]}
                </option>
              ))}
            </select>
            <select
              className={input}
              value={foundation}
              onChange={(event) => setFoundation(event.target.value as WorldFoundationId)}
              aria-label="Map foundation"
              title="Map foundation"
            >
              {foundationOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !online}
              className="px-3 py-1.5 rounded-lg bg-white text-[#15181b] text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create
            </button>
          </form>
        )}

        <div className="p-3 overflow-y-auto space-y-2">
          {loading && list.length === 0 && (
            <p className="text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </p>
          )}
          {!loading && list.length === 0 && (
            <p className="text-xs text-slate-500">
              {tab === 'mine'
                ? 'You have not built a world yet. Create one above — it opens straight into build mode.'
                : 'No Live cities yet. Be the first to make a city Live.'}
            </p>
          )}

          {list.map((world) => (
            <div key={world.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
              <div className="flex items-start gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-100 truncate">{world.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] uppercase tracking-wide text-slate-300">
                      {world.kind}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5 ${
                        world.status === 'live'
                          ? 'bg-[#39ff14]/15 text-[#8eff78]'
                          : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {world.status === 'live' ? <Globe2 className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                      {STATUS_LABEL[world.status]}
                    </span>
                    <span className="text-[10px] text-slate-500">{ACCESS_LABEL[world.access]}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    by @{world.ownerHandle}
                    {world.role ? ` · ${world.role === 'owner' ? 'Owner' : ROLE_LABEL[world.role as Exclude<WorldRole, 'owner'>]}` : ' · Visitor'}
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  {gameplayAllowed && world.canEnter && (
                    <button
                      type="button"
                      onClick={() => onEnter(world.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-white text-[#15181b] text-[11px] font-bold flex items-center gap-1 hover:bg-white/90"
                    >
                      <DoorOpen className="w-3.5 h-3.5" /> {world.status === 'build_mode' ? 'Build' : world.canManageStatus && world.status !== 'live' ? 'Enter to Go Live' : 'Enter'}
                    </button>
                  )}
                  {onOpenStudio && (world.canBuild || world.canManageStatus || world.canEdit) && (
                    <button
                      type="button"
                      onClick={() => onOpenStudio(world.id)}
                      className="px-2 py-1 rounded-lg bg-[#39ff14]/15 border border-[#39ff14]/40 text-[#b6ffab] text-[11px] font-semibold flex items-center gap-1"
                    >
                      <Hammer className="w-3 h-3" /> City studio
                    </button>
                  )}
                  {world.canManageStatus && (
                    <>
                      {world.status !== 'available' && (
                        <button type="button" onClick={() => setStatus(world, 'available')} disabled={busyId === world.id}
                          className="px-2 py-1 rounded-lg border border-white/12 text-[11px] text-slate-200 disabled:opacity-50">Set Available</button>
                      )}
                      {!['offline','build_mode','build_pending','maintenance'].includes(world.status) && (
                        <button type="button" onClick={() => setStatus(world, 'offline')} disabled={busyId === world.id}
                          className="px-2 py-1 rounded-lg border border-white/12 text-[11px] text-slate-200 disabled:opacity-50">Set Offline</button>
                      )}
                    </>
                  )}
                  {world.canBuild && world.status === 'offline' && (
                    <button type="button" onClick={() => requestBuildMode(world)} disabled={busyId === world.id}
                      className="px-2 py-1 rounded-lg border border-white/12 text-[11px] text-slate-200 disabled:opacity-50">Build Mode</button>
                  )}
                  {world.status === 'build_pending' && (
                    <span className="text-[10px] text-amber-200">Waiting for current visitors to leave</span>
                  )}
                  {world.canManageStatus && (
                    <>
                      <select
                        value={world.access}
                        onChange={(event) =>
                          patch(world, { access: event.target.value as WorldAccess })
                        }
                        disabled={busyId === world.id}
                        aria-label="Access mode"
                        className="bg-black/40 border border-white/12 rounded px-1.5 py-1 text-[11px] text-slate-200"
                      >
                        {(Object.keys(ACCESS_LABEL) as WorldAccess[]).map((option) => (
                          <option key={option} value={option}>
                            {ACCESS_LABEL[option]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => remove(world)}
                        disabled={busyId === world.id}
                        aria-label={`Delete ${world.name}`}
                        className="p-1.5 rounded-lg text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {world.canManageStatus && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input
                    className={`${input} flex-1 min-w-[120px]`}
                    value={shareTarget[world.id] ?? ''}
                    onChange={(event) =>
                      setShareTarget((prev) => ({ ...prev, [world.id]: event.target.value }))
                    }
                    placeholder="@handle"
                  />
                  <button
                    type="button"
                    onClick={() => share(world, false)}
                    disabled={busyId === world.id}
                    className="px-2 py-1 rounded-lg border border-white/12 text-[11px] text-slate-200 hover:bg-white/10 flex items-center gap-1"
                  >
                    <UserPlus className="w-3 h-3" /> Invite
                  </button>
                  <select
                    value={shareRole[world.id] ?? 'builder'}
                    onChange={(event) => setShareRole(prev => ({...prev,[world.id]:event.target.value as Exclude<WorldRole,'owner'>}))}
                    disabled={busyId === world.id}
                    aria-label="City role"
                    className="bg-black/40 border border-white/12 rounded px-1.5 py-1 text-[11px] text-slate-200"
                  >
                    {(Object.keys(ROLE_LABEL) as Exclude<WorldRole,'owner'>[]).map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => share(world, true)}
                    disabled={busyId === world.id}
                    className="px-2 py-1 rounded-lg border border-white/12 text-[11px] text-slate-200 hover:bg-white/10"
                  >
                    Assign role
                  </button>
                  {world.collaborators && world.collaborators.length > 0 && (
                    <span className="text-[10px] text-slate-500">
                      {world.collaborators.map((entry) => `@${entry.handle} (${ROLE_LABEL[entry.role]})`).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
