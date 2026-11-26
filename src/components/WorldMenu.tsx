import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Crown,
  Globe2,
  Home,
  Keyboard,
  Loader2,
  Lock,
  LogOut,
  Map as MapIcon,
  MapPin,
  Pencil,
  RotateCcw,
  Save,
  Shield,
  Smartphone,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  BINDING_ACTIONS,
  DEFAULT_BINDINGS,
  TOUCH_HANDEDNESS,
  TOUCH_SIZES,
  eventToBinding,
  isReservedBinding,
  keyLabel,
} from '../../shared/keybindings.mjs';
import type { PlacedItem, ViewMode, WorldLocation } from '../game/types';
import type { SuiteState, TouchLayoutPreferences, WorldAccess, WorldSummary } from '../net/api';
import { api, ApiError } from '../net/api';
import { CITY_LAYOUT, worldToU } from '../game/cityLayout';
import { GRID_SIZE } from '../game/catalog';

type MenuTab = 'map' | 'world' | 'manage' | 'controls';

interface WorldMenuProps {
  open: boolean;
  onClose: () => void;
  location: WorldLocation;
  world: WorldSummary | null;
  suite: SuiteState | null;
  roomName: string;
  items: PlacedItem[];
  userHandle: string;
  userRole: 'player' | 'admin';
  viewMode: ViewMode;
  closeZoom: boolean;
  followCharacter: boolean;
  playerPoseRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  instance?: { id: string; kind: string; worldId: string | null; count: number; capacity: number } | null;
  players: { handle: string; displayName: string }[];
  bindings: Record<string, string>;
  touch: TouchLayoutPreferences;
  syncing: boolean;
  syncError: string | null;
  onSetBinding: (
    action: (typeof BINDING_ACTIONS)[number],
    code: string,
    replace?: boolean
  ) => { error: string | null; conflicts: (typeof BINDING_ACTIONS)[number][] };
  onResetBinding: (actionId: string) => void;
  onResetAllBindings: () => void;
  onSetTouch: (patch: Partial<TouchLayoutPreferences>) => void;
  onResetTouch: () => void;
  onWorldUpdated: (world: WorldSummary) => void;
  onLeaveWorld: () => Promise<void>;
  onOpenCityMap: () => void;
  onEditRoom: () => void;
}

const panel = 'bg-[#0b100d] text-slate-100 border-[#39ff14]/30';

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({
  label,
  children,
  hint,
}) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
    {children}
    {hint && <span className="block text-[10px] leading-snug text-slate-500">{hint}</span>}
  </label>
);

const inputClass =
  'w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-[#39ff14]/60';

const SmallBadge: React.FC<{ children: React.ReactNode; tone?: 'green' | 'amber' | 'slate' }> = ({
  children,
  tone = 'slate',
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
      tone === 'green'
        ? 'bg-[#39ff14]/15 text-[#8dff74]'
        : tone === 'amber'
        ? 'bg-amber-400/15 text-amber-200'
        : 'bg-white/8 text-slate-300'
    }`}
  >
    {children}
  </span>
);

/** Live room plan: boundary, placed furniture and the player's own marker. */
const SuiteMiniMap: React.FC<{
  items: PlacedItem[];
  playerPoseRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
}> = ({ items, playerPoseRef }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const size = canvas.width;
      const pad = 18;
      const scale = (size - pad * 2) / GRID_SIZE;
      const px = (gx: number) => pad + gx * scale;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#0a100c';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(57,255,20,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(pad, pad, GRID_SIZE * scale, GRID_SIZE * scale);
      ctx.strokeStyle = 'rgba(148,184,158,0.18)';
      ctx.lineWidth = 1;
      for (let i = 1; i < GRID_SIZE; i += 2) {
        ctx.beginPath();
        ctx.moveTo(px(i), pad);
        ctx.lineTo(px(i), pad + GRID_SIZE * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pad, px(i));
        ctx.lineTo(pad + GRID_SIZE * scale, px(i));
        ctx.stroke();
      }
      for (const item of items) {
        ctx.fillStyle = item.color || '#7c9a82';
        ctx.globalAlpha = item.wall ? 0.45 : 0.8;
        ctx.fillRect(px(item.gx), px(item.gz), Math.max(4, scale * 1), Math.max(4, scale * 1));
      }
      ctx.globalAlpha = 1;
      const pose = playerPoseRef.current;
      const x = px(Math.max(0, Math.min(GRID_SIZE, pose.x + GRID_SIZE / 2)));
      const z = px(Math.max(0, Math.min(GRID_SIZE, pose.z + GRID_SIZE / 2)));
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-pose.yaw);
      ctx.fillStyle = '#39ff14';
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.lineTo(-5, -5);
      ctx.lineTo(0, -2);
      ctx.lineTo(5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [items, playerPoseRef]);
  return <canvas ref={ref} width={320} height={320} className="w-full max-w-[320px] rounded-xl border border-[#39ff14]/20" />;
};

/** Compact live city plan; the full interactive map is one tap away. */
const CityMiniMap: React.FC<{
  playerPoseRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
}> = ({ playerPoseRef }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const { bounds, blocks, loftCenter, uLines, zLines } = CITY_LAYOUT;
      const minU = bounds.uMin;
      const maxU = bounds.uMax;
      const minZ = bounds.zMin;
      const maxZ = bounds.zMax;
      const pad = 14;
      const sx = (w - pad * 2) / (maxU - minU);
      const sz = (h - pad * 2) / (maxZ - minZ);
      const toX = (u: number) => pad + (u - minU) * sx;
      const toY = (z: number) => pad + (z - minZ) * sz;
      ctx.fillStyle = '#090e0b';
      ctx.fillRect(0, 0, w, h);
      for (const block of blocks) {
        ctx.fillStyle = block.kind === 'loft_plaza' ? '#39ff14' : block.kind === 'loft_hotel' ? '#9a784b' : block.kind === 'airport' ? '#477b99' : block.kind === 'park' ? '#1d4d28' : '#1a231e';
        ctx.beginPath();
        ctx.moveTo(toX(block.uMin), toY(block.zMin));
        ctx.lineTo(toX(block.uMax), toY(block.zMin));
        ctx.lineTo(toX(block.uMax), toY(block.zMax));
        ctx.lineTo(toX(block.uMin), toY(block.zMax));
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(148,184,158,0.22)';
      ctx.lineWidth = 1;
      for (const u of uLines) {
        ctx.beginPath();
        ctx.moveTo(toX(u), toY(minZ));
        ctx.lineTo(toX(u), toY(maxZ));
        ctx.stroke();
      }
      for (const z of zLines) {
        ctx.beginPath();
        ctx.moveTo(toX(minU), toY(z));
        ctx.lineTo(toX(maxU), toY(z));
        ctx.stroke();
      }
      const pose = playerPoseRef.current;
      const u = Math.max(minU, Math.min(maxU, worldToU(pose.x, pose.z)));
      const px = toX(u);
      const py = toY(Math.max(minZ, Math.min(maxZ, pose.z)));
      ctx.fillStyle = '#39ff14';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#051205';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#d9ffd0';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('HOTEL', toX(worldToU(CITY_LAYOUT.loftDoorPos.x, CITY_LAYOUT.loftDoorPos.z)) + 6, toY(CITY_LAYOUT.loftDoorPos.z));
      ctx.fillStyle = '#8fd4ff';
      ctx.fillText('AIRPORT', toX(worldToU(CITY_LAYOUT.airportCenter.x, CITY_LAYOUT.airportCenter.z)) + 6, toY(CITY_LAYOUT.airportCenter.z));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playerPoseRef]);
  return <canvas ref={ref} width={420} height={280} className="w-full rounded-xl border border-[#39ff14]/20" />;
};

export const WorldMenu: React.FC<WorldMenuProps> = ({
  open,
  onClose,
  location,
  world,
  suite,
  roomName,
  items,
  userHandle,
  userRole,
  viewMode,
  closeZoom,
  followCharacter,
  playerPoseRef,
  instance,
  players,
  bindings,
  touch,
  syncing,
  syncError,
  onSetBinding,
  onResetBinding,
  onResetAllBindings,
  onSetTouch,
  onResetTouch,
  onWorldUpdated,
  onLeaveWorld,
  onOpenCityMap,
  onEditRoom,
}) => {
  const [tab, setTab] = useState<MenuTab>('map');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [waitingAction, setWaitingAction] = useState<(typeof BINDING_ACTIONS)[number] | null>(null);
  const [conflict, setConflict] = useState<{
    action: (typeof BINDING_ACTIONS)[number];
    code: string;
    conflicts: (typeof BINDING_ACTIONS)[number][];
  } | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [controlMode, setControlMode] = useState<'isometric' | 'play'>(
    viewMode === 'play' ? 'play' : 'isometric'
  );

  const canEdit = Boolean(world?.canEdit);
  const isOwner = Boolean(world && world.ownerHandle === userHandle);
  // "Administrator" means an editor on this world; a site-wide admin has no
  // implicit build rights, matching the API's owner/collaborator checks.
  const isAdmin = userRole === 'admin';
  const canManage = canEdit;
  const worldName = world?.name ?? (location === 'world' ? 'Main City' : roomName);
  const ownerHandle = world?.ownerHandle ?? suite?.ownerHandle ?? userHandle;
  const memberCount = 1 + players.length;
  const capacity = instance?.capacity ?? world?.maxVisitors ?? null;

  const [form, setForm] = useState({
    name: '',
    description: '',
    access: 'public' as WorldAccess,
    maxVisitors: 30,
    published: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [inviteHandle, setInviteHandle] = useState('');
  const [editorHandle, setEditorHandle] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ userId: string; handle: string } | null>(null);

  useEffect(() => {
    if (!world) return;
    setForm({
      name: world.name,
      description: world.description,
      access: world.access,
      maxVisitors: world.maxVisitors,
      published: world.published,
    });
  }, [world?.id, world?.updatedAt]);

  // A fresh lookup fills collaborators and the latest owner-controlled values.
  useEffect(() => {
    if (!open || !world) return;
    let cancelled = false;
    api
      .world(world.id)
      .then((fresh) => {
        if (!cancelled) onWorldUpdated(fresh);
      })
      .catch(() => {
        // Keep the snapshot we already have; the menu still works offline.
      });
    return () => {
      cancelled = true;
    };
    // Only refresh when the menu opens for a different world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, world?.id]);

  useEffect(() => {
    if (!open) {
      setConfirmLeave(false);
      setWaitingAction(null);
      setConflict(null);
      setBindingError(null);
      setSaveMessage(null);
      setManageError(null);
    }
  }, [open]);

  // Capture the next key press while a binding row is armed. Nothing is
  // written until the player presses a key here.
  useEffect(() => {
    if (!waitingAction || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        setWaitingAction(null);
        return;
      }
      const code = eventToBinding(event);
      if (!code || isReservedBinding(code)) {
        setBindingError('That key is reserved by the browser. Choose another.');
        return;
      }
      const result = onSetBinding(waitingAction, code, false);
      setWaitingAction(null);
      setBindingError(result.error === 'reserved' ? 'That key is reserved by the browser.' : null);
      if (result.conflicts.length > 0) {
        setConflict({ action: waitingAction, code, conflicts: result.conflicts });
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [waitingAction, open, onSetBinding]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof BINDING_ACTIONS>();
    for (const action of BINDING_ACTIONS) {
      if (action.scope !== 'global' && action.scope !== controlMode) continue;
      const list = groups.get(action.category) ?? [];
      list.push(action);
      groups.set(action.category, list);
    }
    return [...groups.entries()];
  }, [controlMode]);

  const saveWorld = async () => {
    if (!world || !canEdit) return;
    setSaving(true);
    setManageError(null);
    setSaveMessage(null);
    try {
      const updated = await api.updateWorld(world.id, {
        name: form.name,
        description: form.description,
        access: form.access,
        maxVisitors: form.maxVisitors,
        ...(isOwner ? { published: form.published } : {}),
      });
      onWorldUpdated(updated);
      setSaveMessage('World settings saved');
    } catch (error) {
      setManageError(error instanceof ApiError ? error.message : 'Could not save world settings');
    } finally {
      setSaving(false);
    }
  };

  const invite = async () => {
    if (!world || !inviteHandle.trim()) return;
    setMemberBusy(true);
    setManageError(null);
    try {
      await api.inviteToWorld(world.id, inviteHandle.trim());
      setInviteHandle('');
      setSaveMessage('Invitation sent');
    } catch (error) {
      setManageError(error instanceof ApiError ? error.message : 'Could not send invitation');
    } finally {
      setMemberBusy(false);
    }
  };

  const addEditor = async () => {
    if (!world || !editorHandle.trim()) return;
    setMemberBusy(true);
    setManageError(null);
    try {
      const updated = await api.addCollaborator(world.id, editorHandle.trim());
      onWorldUpdated(updated);
      setEditorHandle('');
      setSaveMessage('Editor added');
    } catch (error) {
      setManageError(error instanceof ApiError ? error.message : 'Could not add editor');
    } finally {
      setMemberBusy(false);
    }
  };

  const removeEditor = async () => {
    if (!world || !removeTarget) return;
    setMemberBusy(true);
    setManageError(null);
    try {
      const updated = await api.removeCollaborator(world.id, removeTarget.userId);
      onWorldUpdated(updated);
      setRemoveTarget(null);
      setSaveMessage('Editor removed');
    } catch (error) {
      setManageError(error instanceof ApiError ? error.message : 'Could not remove editor');
    } finally {
      setMemberBusy(false);
    }
  };

  const leave = async () => {
    setLeaving(true);
    setLeaveError(null);
    try {
      await onLeaveWorld();
      onClose();
    } catch (error) {
      setLeaveError(error instanceof Error ? error.message : 'Could not leave the world');
    } finally {
      setLeaving(false);
    }
  };

  const tabs: { id: MenuTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'map', label: 'Map', icon: <MapIcon className="w-3.5 h-3.5" />, show: true },
    { id: 'world', label: 'World', icon: <Globe2 className="w-3.5 h-3.5" />, show: true },
    { id: 'manage', label: 'Manage', icon: <Shield className="w-3.5 h-3.5" />, show: Boolean(world && canManage) },
    { id: 'controls', label: 'Controls', icon: <Keyboard className="w-3.5 h-3.5" />, show: true },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Map and World Menu"
        className={`w-full max-w-4xl max-h-[94vh] flex flex-col rounded-2xl border overflow-hidden ${panel} neon-panel-glow`}
      >
        <header className="px-4 py-3 border-b border-[#39ff14]/15 bg-[#0f1612] flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#39ff14]/12 text-[#39ff14] flex items-center justify-center shrink-0">
            <MapIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold leading-tight text-white truncate">
              Map &amp; World Menu
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {world ? `${world.name} · ${world.access}` : location === 'world' ? 'Main City · LoftLife Plaza' : `${roomName} · Suite`} · Press M to close
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#39ff14]" />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Map and World Menu"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-300 hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <nav className="px-3 py-2 border-b border-white/8 flex items-center gap-1 overflow-x-auto shrink-0">
          {tabs.filter((entry) => entry.show).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                tab === entry.id ? 'bg-[#39ff14] text-[#051205]' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
          <span className="ml-auto hidden sm:flex items-center gap-1.5 text-[10px] text-slate-500 pr-1">
            <Lock className="w-3 h-3" /> Gameplay input paused
          </span>
        </nav>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {tab === 'map' && (
            <>
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                    Current world / server
                  </span>
                  <p className="text-lg font-bold text-white">{worldName}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#39ff14]" />
                    {location === 'world'
                      ? 'Main City · LoftLife Plaza grid'
                      : location === 'room'
                      ? `Suite ${suite?.number ?? '402'} · Floor ${suite?.floor ?? 4}`
                      : location.replace('_', ' ')}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                  {location !== 'world' && (
                    <button
                      type="button"
                      onClick={() => {
                        onTravelCity();
                        onClose();
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-[#39ff14] text-[#051205] flex items-center gap-1.5"
                    >
                      <Building2 className="w-3.5 h-3.5" /> Travel to Main City
                    </button>
                  )}
                  {location !== 'room' && (
                    <button
                      type="button"
                      onClick={() => {
                        onTravelSuite();
                        onClose();
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 text-slate-100 flex items-center gap-1.5"
                    >
                      <Home className="w-3.5 h-3.5" /> Return to Suite
                    </button>
                  )}
                  {location === 'world' && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenCityMap();
                        onClose();
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 text-slate-100 flex items-center gap-1.5"
                    >
                      <MapIcon className="w-3.5 h-3.5" /> Full city map
                    </button>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-white/10 bg-black/20 p-3">
                {location === 'world' ? (
                  <div className="space-y-2">
                    <CityMiniMap playerPoseRef={playerPoseRef} />
                    <p className="text-[10px] text-slate-500">
                      Live marker · Hotel, plaza, diagonal A–Z streets and 1st–30th streets. Open the
                      full map for the interactive grid.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <SuiteMiniMap items={items} playerPoseRef={playerPoseRef} />
                    <p className="text-[10px] text-slate-500">
                      Live suite plan · furniture and your marker. Room editing stays available from
                      the HUD.
                    </p>
                  </div>
                )}
              </section>

              <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">Camera</span>
                  <p className="text-xs font-semibold">
                    {viewMode === 'play' ? 'Play View' : 'Isometric'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">Zoom</span>
                  <p className="text-xs font-semibold">{closeZoom ? 'Close' : 'Wide'}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">Follow</span>
                  <p className="text-xs font-semibold">
                    {viewMode === 'play' ? 'Always on' : followCharacter ? 'On' : 'Free camera'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">Here now</span>
                  <p className="text-xs font-semibold">
                    {memberCount}
                    {capacity ? ` / ${capacity}` : ''}
                  </p>
                </div>
              </section>
            </>
          )}

          {tab === 'world' && (
            <>
              <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                  World information
                </h3>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-slate-500">Name</dt>
                    <dd className="font-semibold text-white">{worldName}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-slate-500">Owner</dt>
                    <dd className="font-semibold flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-300" /> @{ownerHandle}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-slate-500">Your access</dt>
                    <dd className="font-semibold">
                      {world
                        ? isOwner
                          ? 'Owner'
                          : canEdit
                          ? 'Editor / administrator'
                          : isAdmin
                          ? 'Site admin · no world edit rights'
                          : 'Visitor'
                        : 'Suite owner'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-slate-500">Members</dt>
                    <dd className="font-semibold">
                      {memberCount}
                      {capacity ? ` / ${capacity}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-slate-500">Privacy</dt>
                    <dd className="font-semibold">
                      {world
                        ? `${world.access}${world.published ? ' · published' : ' · unpublished'}`
                        : suite?.isPublic
                        ? 'Public suite'
                        : 'Private suite'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-widest text-slate-500">Status</dt>
                    <dd className="font-semibold">
                      {instance ? `Live · ${instance.count} in instance` : 'Saved'}
                    </dd>
                  </div>
                </dl>
                {world?.description && (
                  <p className="text-xs leading-relaxed text-slate-300 border-t border-white/8 pt-2">
                    {world.description}
                  </p>
                )}
                {world && (
                  <p className="text-[10px] text-slate-500">
                    World ID {world.id} · {world.kind} · capacity {world.maxVisitors}
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                  People here
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  <SmallBadge tone="green">@{userHandle} · you</SmallBadge>
                  {players.map((player) => (
                    <SmallBadge key={player.handle}>
                      @{player.handle}
                      {player.displayName ? ` · ${player.displayName}` : ''}
                    </SmallBadge>
                  ))}
                  {players.length === 0 && (
                    <span className="text-[11px] text-slate-500">No other players in this scene.</span>
                  )}
                </div>
              </section>

              {world && (
                <section className="rounded-xl border border-amber-300/25 bg-amber-400/5 p-3.5 space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
                    Leave World
                  </h3>
                  <p className="text-[11px] leading-snug text-amber-100/80">
                    Return to your hotel suite. The world, its furniture and its settings stay saved,
                    including when you are the owner and other players remain.
                  </p>
                  {!confirmLeave ? (
                    <button
                      type="button"
                      onClick={() => setConfirmLeave(true)}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-[#ffb878] text-[#1a1005] flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Leave {world.name}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 border-t border-amber-300/20 pt-2">
                      <span className="text-[11px] text-amber-100 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Leave this world now?
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmLeave(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={leaving}
                        onClick={() => void leave()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#ffb878] text-[#1a1005] disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {leaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                        Confirm leave
                      </button>
                      {leaveError && <span className="text-[11px] text-red-300">{leaveError}</span>}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {tab === 'manage' && world && (
            <>
              {!canManage && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Only the owner or an authorized editor can change this
                  world.
                </div>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                    General
                  </h3>
                  <Field label="World name">
                    <input
                      className={inputClass}
                      maxLength={48}
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </Field>
                  <Field label="Description" hint="Up to 280 characters.">
                    <textarea
                      className={`${inputClass} min-h-[72px] resize-y`}
                      maxLength={280}
                      value={form.description}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                  </Field>
                </section>

                <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                    Privacy &amp; Access
                  </h3>
                  <Field label="Who can enter">
                    <select
                      className={inputClass}
                      value={form.access}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, access: event.target.value as WorldAccess }))
                      }
                    >
                      <option value="public">Public — listed when published</option>
                      <option value="private">Private — owner only</option>
                      <option value="friends">Friends</option>
                      <option value="invite">Invited players</option>
                      <option value="collab">Invited + editors</option>
                    </select>
                  </Field>
                  <Field label="Capacity" hint="2–60 visitors. The server enforces this on entry.">
                    <input
                      type="number"
                      min={2}
                      max={60}
                      className={inputClass}
                      value={form.maxVisitors}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, maxVisitors: Number(event.target.value) }))
                      }
                    />
                  </Field>
                  <label className="flex items-center justify-between gap-3 text-xs">
                    <span>
                      Published
                      <span className="block text-[10px] text-slate-500">
                        {isOwner
                          ? 'Listed in Worlds when access is public.'
                          : 'Only the owner can publish or unpublish.'}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      disabled={!isOwner}
                      checked={form.published}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, published: event.target.checked }))
                      }
                    />
                  </label>
                </section>

                <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                    Members &amp; Permissions
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Owner @{world.ownerHandle}. Editors can build and save this world; they cannot
                    publish it, remove editors or delete it. Permissions are enforced by the API.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(world.collaborators ?? []).map((entry) => (
                      <span
                        key={entry.userId}
                        className="inline-flex items-center gap-1 rounded-md bg-white/8 px-2 py-1 text-[11px]"
                      >
                        <Shield className="w-3 h-3 text-[#39ff14]" /> @{entry.handle}
                        {isOwner && (
                          <button
                            type="button"
                            aria-label={`Remove editor ${entry.handle}`}
                            onClick={() => setRemoveTarget(entry)}
                            className="text-slate-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                    {(world.collaborators ?? []).length === 0 && (
                      <span className="text-[11px] text-slate-500">No editors yet.</span>
                    )}
                  </div>
                  {isOwner && (
                    <div className="flex gap-2">
                      <input
                        className={inputClass}
                        placeholder="Editor handle"
                        value={editorHandle}
                        onChange={(event) => setEditorHandle(event.target.value)}
                      />
                      <button
                        type="button"
                        disabled={memberBusy || !editorHandle.trim()}
                        onClick={() => void addEditor()}
                        className="px-3 rounded-lg text-xs font-bold bg-white/10 disabled:opacity-40 flex items-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  )}
                  {removeTarget && (
                    <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-[11px]">
                      Remove @{removeTarget.handle} as an editor?
                      <div className="flex gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(null)}
                          className="px-2 py-1 rounded bg-white/10"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeEditor()}
                          className="px-2 py-1 rounded bg-red-400 text-[#1a0505] font-bold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                    Invitations
                  </h3>
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      placeholder="Player handle"
                      value={inviteHandle}
                      onChange={(event) => setInviteHandle(event.target.value)}
                    />
                    <button
                      type="button"
                      disabled={memberBusy || !inviteHandle.trim()}
                      onClick={() => void invite()}
                      className="px-3 rounded-lg text-xs font-bold bg-white/10 disabled:opacity-40"
                    >
                      Invite
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Invitations matter for invite-only and collaborator worlds. The server checks the
                    target account and the sender's edit permission.
                  </p>
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70 pt-1">
                    World Editing
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {canEdit
                      ? 'You can edit and save this world. Editing access follows the owner/editor role above.'
                      : 'Visitors cannot build here. Ask the owner for editor access.'}
                  </p>
                  <button
                    type="button"
                    disabled={!canEdit || location !== 'room'}
                    onClick={() => {
                      onEditRoom();
                      onClose();
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Open build mode
                  </button>
                </section>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canEdit || saving}
                  onClick={() => void saveWorld()}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[#39ff14] text-[#051205] disabled:opacity-40 flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save world settings
                </button>
                {!isOwner && (
                  <span className="text-[10px] text-slate-500">
                    Publishing and editor removal are owner-only; the API rejects them.
                  </span>
                )}
                {saveMessage && <SmallBadge tone="green"><Check className="w-3 h-3" /> {saveMessage}</SmallBadge>}
                {manageError && <span className="text-[11px] text-red-300">{manageError}</span>}
              </div>
            </>
          )}

          {tab === 'controls' && (
            <>
              <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                      Controls &amp; Keybindings
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      {syncing ? 'Syncing with your account…' : 'Saved locally; synced to your account when online.'}
                    </p>
                  </div>
                  <div className="ml-auto flex rounded-lg overflow-hidden border border-white/10">
                    {(['isometric', 'play'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setControlMode(mode)}
                        className={`px-3 py-1.5 text-[11px] font-bold ${
                          controlMode === mode ? 'bg-[#39ff14] text-[#051205]' : 'text-slate-300'
                        }`}
                      >
                        {mode === 'isometric' ? 'Isometric' : 'Play View'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                  <SmallBadge tone="green">Isometric: WASD pans · F follow · Z zoom · M menu</SmallBadge>
                  <SmallBadge>Play: WASD moves · mouse looks · Z zoom · M menu</SmallBadge>
                </div>
                {bindingError && <p className="text-[11px] text-amber-300">{bindingError}</p>}
                {syncError && <p className="text-[11px] text-amber-300">Account sync: {syncError}</p>}
              </section>

              {grouped.map(([category, actions]) => (
                <section key={category} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                  <h4 className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-white/5">
                    {category}
                  </h4>
                  <div className="divide-y divide-white/5">
                    {actions.map((action) => (
                      <div key={action.id} className="px-3 py-2 flex items-center gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-100">{action.label}</p>
                          <p className="text-[10px] text-slate-500 truncate">{action.detail}</p>
                        </div>
                        <div className="ml-auto flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setConflict(null);
                              setBindingError(null);
                              setWaitingAction(action);
                            }}
                            className={`min-w-[64px] px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${
                              waitingAction?.id === action.id
                                ? 'border-amber-300 bg-amber-400/15 text-amber-200 animate-pulse'
                                : 'border-white/15 bg-black/30 text-slate-100 hover:border-[#39ff14]/50'
                            }`}
                          >
                            {waitingAction?.id === action.id ? 'Press a key…' : keyLabel(bindings[action.id])}
                          </button>
                          <button
                            type="button"
                            aria-label={`Reset ${action.label}`}
                            title="Restore this action's default"
                            onClick={() => onResetBinding(action.id)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/10"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {waitingAction && (
                <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100 flex items-center justify-between gap-2">
                  <span>Waiting for a new key for {waitingAction.label}. Escape cancels.</span>
                  <button
                    type="button"
                    onClick={() => setWaitingAction(null)}
                    className="px-2 py-1 rounded bg-white/10 text-amber-100 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {conflict && (
                <div className="rounded-xl border border-amber-300/40 bg-amber-400/10 p-3 space-y-2">
                  <p className="text-[11px] text-amber-100">
                    {keyLabel(conflict.code)} is already used by{' '}
                    <strong>{conflict.conflicts.map((entry) => entry.label).join(', ')}</strong> in
                    this context.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConflict(null)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetBinding(conflict.action, conflict.code, true);
                        setConflict(null);
                        setBindingError(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-400 text-[#1a1005]"
                    >
                      Replace existing binding
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onResetAllBindings}
                  className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset all controls
                </button>
                <span className="text-[10px] text-slate-500">
                  Defaults: Isometric W/A/S/D pans camera, F follow, Z zoom, M menu. Play View
                  W/A/S/D moves, mouse looks, Z zoom.
                </span>
              </div>

              <section className="rounded-xl border border-white/10 bg-black/20 p-3.5 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#39ff14]" />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                    Touch Controls
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">Control size</span>
                    <div className="flex gap-1.5 mt-1">
                      {TOUCH_SIZES.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => onSetTouch({ size })}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                            touch.size === size
                              ? 'border-[#39ff14] bg-[#39ff14]/15 text-[#8dff74]'
                              : 'border-white/10 text-slate-300'
                          }`}
                        >
                          {size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">Stick side</span>
                    <div className="flex gap-1.5 mt-1">
                      {TOUCH_HANDEDNESS.map((side) => (
                        <button
                          key={side}
                          type="button"
                          onClick={() => onSetTouch({ handedness: side })}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                            touch.handedness === side
                              ? 'border-[#39ff14] bg-[#39ff14]/15 text-[#8dff74]'
                              : 'border-white/10 text-slate-300'
                          }`}
                        >
                          {side === 'right' ? 'Right-handed' : 'Left-handed'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Touch layout applies to the Android app. Repositioning individual buttons is limited
                  to the supported size and stick-side layouts so controls never cover the voice or
                  camera cluster.
                </p>
                <button
                  type="button"
                  onClick={onResetTouch}
                  className="px-3 py-2 rounded-lg text-xs font-bold bg-white/10 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore default touch layout
                </button>
              </section>

              <section className="rounded-xl border border-white/10 bg-black/20 p-3.5">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
                  Current game bindings
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BINDING_ACTIONS.map((action) => (
                    <SmallBadge key={action.id}>
                      {action.label}: {keyLabel((DEFAULT_BINDINGS as Record<string, string>)[action.id])}
                    </SmallBadge>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  Your custom keys above override these defaults. Modifier combinations such as
                  Ctrl/Alt/Shift + key are supported; reserved browser shortcuts cannot be assigned.
                </p>
              </section>
            </>
          )}
        </div>

        <footer className="px-4 py-2.5 border-t border-white/8 bg-[#0f1612] flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
          <ChevronRight className="w-3 h-3 text-[#39ff14]" />
          Map, world management, leave world and controls live here so the HUD stays clean. Gameplay
          is paused while this menu is open.
        </footer>
      </div>
    </div>
  );
};
