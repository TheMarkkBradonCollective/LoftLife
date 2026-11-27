import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Hammer,
  History,
  Loader2,
  Lock,
  Redo2,
  RotateCw,
  Save,
  Trash2,
  Undo2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  WORLD_GRID,
  WORLD_TOOLS,
  WORLD_TOOL_MAP,
  TOOL_CATEGORIES,
  APPROVED_TERRAIN_COLORS,
  WORLD_SETTINGS_OPTIONS,
  foundationById,
  foundationRoads,
  foundationWater,
  footprint,
  rectsOverlap,
} from '../../shared/world-layout.mjs';
import {
  api,
  ApiError,
  type WorldBuildOp,
  type WorldBuildState,
  type WorldLayout,
  type WorldLayoutObject,
  type WorldPlot,
} from '../net/api';

const TILE_W = 32;
const TILE_H = 16;
const CANVAS_W = 960;
const CANVAS_H = 640;

interface WorldStudioProps {
  worldId: string;
  onClose: () => void;
  onWorldChanged?: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Tile {
  x: number;
  z: number;
}

function iso(tileX: number, tileZ: number, zoom: number, origin: Point): Point {
  return {
    x: origin.x + (tileX - tileZ) * (TILE_W / 2) * zoom,
    y: origin.y + (tileX + tileZ) * (TILE_H / 2) * zoom,
  };
}

function unIso(point: Point, zoom: number, origin: Point): Tile {
  const u = (point.x - origin.x) / ((TILE_W / 2) * zoom);
  const v = (point.y - origin.y) / ((TILE_H / 2) * zoom);
  return { x: Math.floor((u + v) / 2), z: Math.floor((v - u) / 2) };
}

function diamond(ctx: CanvasRenderingContext2D, a: Point, b: Point, c: Point, d: Point, fill: string) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function tileDiamond(ctx: CanvasRenderingContext2D, x: number, z: number, zoom: number, origin: Point, fill: string, w = 1, d = 1) {
  diamond(
    ctx,
    iso(x, z, zoom, origin),
    iso(x + w, z, zoom, origin),
    iso(x + w, z + d, zoom, origin),
    iso(x, z + d, zoom, origin),
    fill
  );
}

function shade(hex: string, amount: number) {
  const value = hex.replace('#', '');
  const num = parseInt(value.length === 3 ? value.split('').map((c) => c + c).join('') : value, 16);
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const r = clamp(((num >> 16) & 255) + amount);
  const g = clamp(((num >> 8) & 255) + amount);
  const b = clamp((num & 255) + amount);
  return `rgb(${r},${g},${b})`;
}

function frameRect(layout: WorldLayout) {
  return layout.objects.filter((object) => WORLD_TOOL_MAP[object.tool]?.layer === 'ground');
}

export const WorldStudio: React.FC<WorldStudioProps> = ({ worldId, onClose, onWorldChanged }) => {
  const [state, setState] = useState<WorldBuildState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toolId, setToolId] = useState('house');
  const [rot, setRot] = useState(0);
  const [color, setColor] = useState<string>(WORLD_TOOL_MAP.house.defaultColor);
  const [material, setMaterial] = useState<string>(WORLD_TOOL_MAP.house.defaultMaterial);
  const [category, setCategory] = useState('buildings');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [hover, setHover] = useState<Tile | null>(null);
  const [zoom, setZoom] = useState(0.3);
  const [plotStart, setPlotStart] = useState<Tile | null>(null);
  const [plotForm, setPlotForm] = useState({ name: 'Build area', x: 8, z: 8, w: 12, d: 12 });
  const [showHistory, setShowHistory] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(false);
  const stateRef = useRef<WorldBuildState | null>(null);
  const pollRef = useRef<number | null>(null);

  busyRef.current = busy;
  stateRef.current = state;
  const tool = WORLD_TOOL_MAP[toolId];
  const origin = { x: CANVAS_W / 2, y: 34 };
  const editable = Boolean(state?.permissions.canBuild) && state?.world.status === 'build_mode';
  const displayLayout = state
    ? state.world.status === 'build_mode'
      ? state.layout
      : state.publishedLayout
    : null;
  const selected = useMemo(
    () => state?.layout.objects.find((object) => object.id === selectedId) ?? null,
    [state, selectedId]
  );

  const load = useCallback(async (quiet = false) => {
    try {
      const next = await api.worldBuild(worldId);
      setState((previous) => {
        // Never overwrite an in-flight local edit with a stale poll.
        if (previous && next.world.layoutVersion < previous.world.layoutVersion) return previous;
        return next;
      });
      setSyncedAt(Date.now());
      if (!quiet) setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this world studio');
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  useEffect(() => {
    void load();
    pollRef.current = window.setInterval(() => {
      if (!busyRef.current) void load(true);
    }, 2500);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load]);

  useEffect(() => {
    const entry = WORLD_TOOL_MAP[toolId];
    if (!entry) return;
    if (!entry.colors.includes(color)) setColor(entry.defaultColor);
    if (!entry.materials.includes(material)) setMaterial(entry.defaultMaterial);
    setSelectMode(false);
    setMoveId(null);
  }, [toolId, color, material]);

  const run = useCallback(
    async (op: WorldBuildOp) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await api.worldBuildOp(worldId, op);
        setState(result.state);
        setNotice(result.summary);
        setSyncedAt(Date.now());
        onWorldChanged?.();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'The build operation failed');
      } finally {
        setBusy(false);
      }
    },
    [worldId, onWorldChanged]
  );

  const historyAction = useCallback(
    async (kind: 'undo' | 'redo') => {
      setBusy(true);
      setError(null);
      try {
        const result = kind === 'undo'
          ? await api.worldBuildUndo(worldId)
          : await api.worldBuildRedo(worldId);
        setState(result.state);
        setNotice(result.summary);
        onWorldChanged?.();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : `Could not ${kind}`);
      } finally {
        setBusy(false);
      }
    },
    [worldId, onWorldChanged]
  );

  const restore = useCallback(
    async (revision: number) => {
      setBusy(true);
      setError(null);
      try {
        const result = await api.worldBuildRestore(worldId, revision);
        setState(result.state);
        setNotice(result.summary);
        onWorldChanged?.();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not restore that version');
      } finally {
        setBusy(false);
      }
    },
    [worldId, onWorldChanged]
  );

  const publish = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.worldBuildPublish(worldId);
      setState(result.state);
      setNotice(result.summary);
      onWorldChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not publish this city');
    } finally {
      setBusy(false);
    }
  }, [worldId, onWorldChanged]);

  const setStatus = useCallback(
    async (status: 'offline' | 'available' | 'live') => {
      setBusy(true);
      setError(null);
      try {
        await api.setWorldStatus(worldId, status);
        await load(true);
        onWorldChanged?.();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not change city status');
      } finally {
        setBusy(false);
      }
    },
    [worldId, load, onWorldChanged]
  );

  const requestBuildMode = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.requestWorldBuildMode(worldId);
      await load(true);
      setNotice(result.pending ? 'Build Mode queued until the last visitor leaves.' : 'Build Mode is active');
      onWorldChanged?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open Build Mode');
    } finally {
      setBusy(false);
    }
  }, [worldId, load, onWorldChanged]);

  /* ------------------------------- canvas -------------------------------- */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !displayLayout) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#080d09';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const foundation = foundationById(displayLayout.foundation);
    const terrain = displayLayout.settings.terrainColor || foundation.terrainColor;
    for (let x = 0; x < WORLD_GRID; x += 1) {
      for (let z = 0; z < WORLD_GRID; z += 1) {
        const parity = (x + z) % 2 === 0 ? 6 : -4;
        tileDiamond(ctx, x, z, zoom, origin, shade(terrain, parity));
      }
    }

    // Generated foundation water and street network (never player objects).
    for (const water of foundationWater(displayLayout.foundation)) {
      for (let x = water.x; x < water.x + water.w; x += 1) {
        for (let z = water.z; z < water.z + water.d; z += 1) {
          tileDiamond(ctx, x, z, zoom, origin, '#3f6f9a');
        }
      }
    }
    for (const road of foundationRoads(displayLayout.foundation)) {
      for (let x = road.x; x < road.x + road.w; x += 1) {
        for (let z = road.z; z < road.z + road.d; z += 1) {
          const lane = (road.w === WORLD_GRID ? z : x) % 4 === 0;
          tileDiamond(ctx, x, z, zoom, origin, lane ? '#5c6068' : '#474b52');
        }
      }
    }

    for (const object of frameRect(displayLayout)) {
      const entry = WORLD_TOOL_MAP[object.tool];
      if (!entry) continue;
      const [w, d] = footprint(object.tool, object.rot);
      tileDiamond(ctx, object.x, object.z, zoom, origin, object.color, w, d);
    }

    // Build areas.
    for (const plot of state?.plots ?? []) {
      const tone =
        plot.status === 'approved' ? 'rgba(57,255,20,0.18)'
          : plot.status === 'requested' ? 'rgba(255,184,120,0.20)'
          : plot.status === 'denied' ? 'rgba(255,90,90,0.16)'
          : 'rgba(255,255,255,0.10)';
      tileDiamond(ctx, plot.x, plot.z, zoom, origin, tone, plot.w, plot.d);
      const a = iso(plot.x, plot.z, zoom, origin);
      const b = iso(plot.x + plot.w, plot.z + plot.d, zoom, origin);
      ctx.strokeStyle =
        plot.status === 'approved' ? '#39ff14'
          : plot.status === 'requested' ? '#ffb878'
          : plot.status === 'denied' ? '#ff6b6b'
          : 'rgba(255,255,255,0.5)';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
      ctx.fillStyle = plot.status === 'approved' ? '#b6ffab' : '#e8e8e8';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(plot.name, a.x + 4, a.y + 12);
    }

    const objects = [...displayLayout.objects]
      .filter((object) => WORLD_TOOL_MAP[object.tool]?.layer !== 'ground')
      .sort((left, right) => left.x + left.z - (right.x + right.z));
    for (const object of objects) drawObject(ctx, object, zoom, origin, object.id === selectedId);

    if (plotStart && plotStart.x >= 0 && hover) {
      const x = Math.min(plotStart.x, hover.x);
      const z = Math.min(plotStart.z, hover.z);
      const w = Math.max(1, Math.abs(hover.x - plotStart.x) + 1);
      const d = Math.max(1, Math.abs(hover.z - plotStart.z) + 1);
      tileDiamond(ctx, x, z, zoom, origin, 'rgba(57,255,20,0.20)', w, d);
    } else if (hover && editable && !selectMode && !moveId) {
      const [w, d] = footprint(toolId, rot);
      tileDiamond(ctx, hover.x, hover.z, zoom, origin, 'rgba(255,255,255,0.28)', w, d);
    }
    if (moveId && hover) {
      const object = displayLayout.objects.find((entry) => entry.id === moveId);
      if (object) {
        const [w, d] = footprint(object.tool, object.rot);
        tileDiamond(ctx, hover.x, hover.z, zoom, origin, 'rgba(57,255,20,0.28)', w, d);
      }
    }
  }, [displayLayout, state?.plots, selectedId, plotStart, hover, editable, selectMode, moveId, toolId, rot, zoom, origin.x, origin.y]);

  useEffect(() => {
    draw();
  }, [draw]);

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): Tile | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (CANVAS_W / rect.width);
    const py = (event.clientY - rect.top) * (CANVAS_H / rect.height);
    const tile = unIso({ x: px, y: py }, zoom, origin);
    if (tile.x < 0 || tile.z < 0 || tile.x >= WORLD_GRID || tile.z >= WORLD_GRID) return null;
    return tile;
  };

  const objectAt = (tile: Tile): WorldLayoutObject | null => {
    if (!displayLayout) return null;
    const matches = displayLayout.objects.filter((object) => {
      const [w, d] = footprint(object.tool, object.rot);
      return tile.x >= object.x && tile.z >= object.z && tile.x < object.x + w && tile.z < object.z + d;
    });
    matches.sort((left, right) => {
      const leftLayer = WORLD_TOOL_MAP[left.tool]?.layer === 'ground' ? 0 : 1;
      const rightLayer = WORLD_TOOL_MAP[right.tool]?.layer === 'ground' ? 0 : 1;
      return rightLayer - leftLayer || right.x + right.z - (left.x + left.z);
    });
    return matches[0] ?? null;
  };

  const handleClick = (tile: Tile) => {
    if (!state) return;
    if (plotStart) {
      if (plotStart.x < 0 || plotStart.z < 0) {
        setPlotStart(tile);
        return;
      }
      const x = Math.min(plotStart.x, tile.x);
      const z = Math.min(plotStart.z, tile.z);
      const w = Math.abs(tile.x - plotStart.x) + 1;
      const d = Math.abs(tile.z - plotStart.z) + 1;
      setPlotStart(null);
      setPlotForm((value) => ({ ...value, x, z, w, d }));
      return;
    }
    if (!editable) return;
    if (moveId) {
      void run({ action: 'move', id: moveId, x: tile.x, z: tile.z });
      setMoveId(null);
      return;
    }
    if (selectMode) {
      const object = objectAt(tile);
      setSelectedId(object?.id ?? null);
      return;
    }
    if (tool.layer === 'ground' && !state.permissions.canPlaceStreets && ['road', 'street', 'sidewalk', 'path'].includes(tool.id)) {
      setError('Only the owner or co-owner can place the street network.');
      return;
    }
    void run({
      action: 'place',
      tool: tool.id,
      x: tile.x,
      z: tile.z,
      rot,
      color,
      material,
    });
  };

  /* -------------------------------- panels -------------------------------- */

  const tools = WORLD_TOOLS.filter((entry) => entry.category === category);
  const plotBusy = busy;

  const plotAction = (action: 'plot_request' | 'plot_approve' | 'plot_deny' | 'plot_release' | 'plot_remove', plot: WorldPlot) => {
    void run({ action, id: plot.id });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#050806] text-slate-200">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading city studio…
      </div>
    );
  }

  if (!state) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-[#050806] text-slate-200">
        <AlertTriangle className="w-6 h-6 text-amber-300" />
        <p className="text-sm">{error ?? 'This world studio is not available.'}</p>
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-white text-black text-xs font-bold">
          Close
        </button>
      </div>
    );
  }

  const foundation = foundationById(state.world.foundation);
  const canCreatePlot = state.permissions.canApprovePlots && state.world.status === 'build_mode';

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#050806] text-slate-100">
      <header className="px-4 py-2.5 border-b border-white/10 bg-[#0c1410] flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close studio">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm font-bold flex items-center gap-2">
            <Hammer className="w-4 h-4 text-[#39ff14]" />
            {state.world.name} · City Studio
            {state.world.isOfficial && (
              <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 text-[10px] uppercase tracking-wide">
                Official · Staff
              </span>
            )}
          </h1>
          <p className="text-[10px] text-slate-400">
            {foundation.label} · {foundation.description} · rev {state.world.layoutVersion} ·{' '}
            {state.world.status.replace('_', ' ')} · you are {state.role.replace('_', '-')}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {syncedAt && <span className="text-[10px] text-slate-500">Synced {new Date(syncedAt).toLocaleTimeString()}</span>}
          <button
            type="button"
            onClick={() => void historyAction('undo')}
            disabled={!state.canUndo || busy}
            className="px-2 py-1.5 rounded-lg border border-white/12 text-[11px] flex items-center gap-1 disabled:opacity-40"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
          <button
            type="button"
            onClick={() => void historyAction('redo')}
            disabled={!state.canRedo || busy}
            className="px-2 py-1.5 rounded-lg border border-white/12 text-[11px] flex items-center gap-1 disabled:opacity-40"
          >
            <Redo2 className="w-3.5 h-3.5" /> Redo
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className={`px-2 py-1.5 rounded-lg border text-[11px] flex items-center gap-1 ${
              showHistory ? 'border-[#39ff14]/50 text-[#b6ffab]' : 'border-white/12'
            }`}
          >
            <History className="w-3.5 h-3.5" /> History
          </button>
          {state.world.status === 'offline' && state.permissions.canOpenBuildMode && (
            <button type="button" onClick={() => void requestBuildMode()} disabled={busy} className="px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold disabled:opacity-40">
              Open Build Mode
            </button>
          )}
          {state.world.status === 'live' || state.world.status === 'available' ? (
            state.permissions.canManage && (
              <button type="button" onClick={() => void setStatus('offline')} disabled={busy} className="px-2.5 py-1.5 rounded-lg bg-white/10 text-[11px] font-semibold disabled:opacity-40">
                Set Offline
              </button>
            )
          ) : null}
          {state.permissions.canPublish && (
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-[#39ff14] text-[#051205] text-[11px] font-bold flex items-center gap-1 disabled:opacity-40"
            >
              <UploadCloud className="w-3.5 h-3.5" /> Publish city
            </button>
          )}
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Exit studio">
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {(error || notice) && (
        <div className={`px-4 py-1.5 text-[11px] border-b ${error ? 'bg-red-500/10 border-red-500/20 text-red-200' : 'bg-[#39ff14]/10 border-[#39ff14]/20 text-[#b6ffab]'}`}>
          {error ?? notice}
        </div>
      )}

      {state.world.status !== 'build_mode' && (
        <div className="px-4 py-2 text-[11px] border-b border-amber-300/20 bg-amber-400/10 text-amber-100 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          Live/closed view of the published layout. Structural building is disabled unless Build Mode is active
          with zero visitors.
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <aside className="w-[210px] shrink-0 border-r border-white/10 overflow-y-auto p-2.5 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Tools</p>
            <div className="grid grid-cols-2 gap-1">
              {TOOL_CATEGORIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setCategory(entry.id)}
                  className={`px-1.5 py-1 rounded text-[10px] font-semibold ${
                    category === entry.id ? 'bg-[#39ff14] text-[#051205]' : 'bg-white/8 text-slate-300'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {tools.map((entry) => (
              <button
                key={entry.id}
                type="button"
                disabled={!editable || busy}
                onClick={() => {
                  setToolId(entry.id);
                  setColor(entry.defaultColor);
                  setMaterial(entry.defaultMaterial);
                }}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-[11px] text-left disabled:opacity-40 ${
                  toolId === entry.id ? 'border-[#39ff14]/60 bg-[#39ff14]/10 text-[#d8ffd0]' : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <span>{entry.label}</span>
                <span className="text-[9px] text-slate-500">{entry.size[0]}×{entry.size[1]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectMode((value) => !value);
              setMoveId(null);
              setPlotStart(null);
            }}
            className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold border ${
              selectMode ? 'border-[#39ff14]/60 bg-[#39ff14]/10' : 'border-white/12'
            }`}
          >
            Select / move objects
          </button>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Approved colour</p>
            <div className="flex flex-wrap gap-1">
              {tool.colors.map((swatch: string) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Colour ${swatch}`}
                  className={`w-5 h-5 rounded border ${color === swatch ? 'border-white' : 'border-black/40'}`}
                  style={{ background: swatch }}
                />
              ))}
            </div>
            <select
              value={material}
              onChange={(event) => setMaterial(event.target.value)}
              className="w-full bg-black/40 border border-white/12 rounded px-2 py-1 text-[11px]"
              aria-label="Approved material"
            >
              {tool.materials.map((entry: string) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setRot((value) => (value + 1) % 4)}
              className="w-full px-2 py-1 rounded border border-white/12 text-[11px] flex items-center justify-center gap-1"
            >
              <RotateCw className="w-3 h-3" /> Rotate placement ({rot * 90}°)
            </button>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setZoom((value) => Math.max(0.2, value - 0.05))} className="px-2 py-1 rounded border border-white/12 text-[11px]">−</button>
              <span className="text-[10px] text-slate-500 flex-1 text-center">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(0.8, value + 0.05))} className="px-2 py-1 rounded border border-white/12 text-[11px]">+</button>
            </div>
          </div>
          {state.permissions.canManage && state.world.status === 'build_mode' && (
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">World settings</p>
              <label className="block text-[10px] text-slate-400">
                Terrain
                <select
                  value={state.layout.settings.terrain}
                  onChange={(event) => void run({ action: 'settings', settings: { terrain: event.target.value as 'lawn' } })}
                  className="mt-1 w-full bg-black/40 border border-white/12 rounded px-2 py-1 text-[11px]"
                >
                  {WORLD_SETTINGS_OPTIONS.terrain.map((entry: string) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label className="block text-[10px] text-slate-400">
                Climate
                <select
                  value={state.layout.settings.climate}
                  onChange={(event) => void run({ action: 'settings', settings: { climate: event.target.value as 'temperate' } })}
                  className="mt-1 w-full bg-black/40 border border-white/12 rounded px-2 py-1 text-[11px]"
                >
                  {WORLD_SETTINGS_OPTIONS.climate.map((entry: string) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <label className="block text-[10px] text-slate-400">
                Time of day
                <select
                  value={state.layout.settings.timeOfDay}
                  onChange={(event) => void run({ action: 'settings', settings: { timeOfDay: event.target.value as 'day' } })}
                  className="mt-1 w-full bg-black/40 border border-white/12 rounded px-2 py-1 text-[11px]"
                >
                  {WORLD_SETTINGS_OPTIONS.timeOfDay.map((entry: string) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
              </label>
              <div>
                <p className="text-[10px] text-slate-400 mb-1">Terrain colour</p>
                <div className="flex flex-wrap gap-1">
                  {APPROVED_TERRAIN_COLORS.map((swatch: string) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => void run({ action: 'settings', settings: { terrainColor: swatch } })}
                      className={`w-5 h-5 rounded border ${state.layout.settings.terrainColor === swatch ? 'border-white' : 'border-black/40'}`}
                      style={{ background: swatch }}
                      aria-label={`Terrain colour ${swatch}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>

        <div className="flex-1 min-w-0 flex items-start justify-center overflow-auto p-2">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className={`max-w-full rounded-xl border border-white/10 ${moveId || plotStart ? 'cursor-crosshair' : editable ? 'cursor-pointer' : 'cursor-default'}`}
              onPointerMove={(event) => setHover(pointFor(event))}
              onPointerLeave={() => setHover(null)}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const px = (event.clientX - rect.left) * (CANVAS_W / rect.width);
                const py = (event.clientY - rect.top) * (CANVAS_H / rect.height);
                const tile = unIso({ x: px, y: py }, zoom, origin);
                if (tile.x < 0 || tile.z < 0 || tile.x >= WORLD_GRID || tile.z >= WORLD_GRID) return;
                handleClick(tile);
              }}
            />
            {busy && (
              <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-[10px] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </div>
            )}
            {plotStart && (
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/80 text-[10px] text-[#b6ffab]">
                {plotStart.x < 0 ? 'Click the first corner of the build area' : 'Click the opposite corner to size the build area'}
              </div>
            )}
          </div>
        </div>

        <aside className="w-[300px] shrink-0 border-l border-white/10 overflow-y-auto p-3 space-y-3">
          {selected ? (
            <section className="rounded-xl border border-[#39ff14]/30 bg-[#39ff14]/5 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#b6ffab]">Selected</h3>
                <button type="button" onClick={() => setSelectedId(null)} className="text-slate-400"><X className="w-3.5 h-3.5" /></button>
              </div>
              <p className="text-xs font-semibold">{WORLD_TOOL_MAP[selected.tool]?.label ?? selected.tool}</p>
              <p className="text-[10px] text-slate-400">at {selected.x}, {selected.z} · {selected.rot * 90}° · {selected.material}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={!editable || busy} onClick={() => void run({ action: 'rotate', id: selected.id })} className="px-2 py-1 rounded border border-white/12 text-[11px] disabled:opacity-40">Rotate</button>
                <button type="button" disabled={!editable || busy} onClick={() => { setMoveId(selected.id); setSelectedId(null); }} className="px-2 py-1 rounded border border-white/12 text-[11px] disabled:opacity-40">Move</button>
                <button type="button" disabled={!editable || busy} onClick={() => { void run({ action: 'remove', id: selected.id }); setSelectedId(null); }} className="px-2 py-1 rounded border border-red-400/30 text-red-200 text-[11px] disabled:opacity-40">Remove</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {(WORLD_TOOL_MAP[selected.tool]?.colors ?? []).map((swatch: string) => (
                  <button
                    key={swatch}
                    type="button"
                    disabled={!editable || busy}
                    onClick={() => void run({ action: 'recolor', id: selected.id, color: swatch })}
                    className={`w-5 h-5 rounded border ${selected.color === swatch ? 'border-white' : 'border-black/40'}`}
                    style={{ background: swatch }}
                    aria-label={`Recolour ${swatch}`}
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="text-[11px] text-slate-500">Click “Select / move objects”, then click a building to rotate, recolour, move or remove it.</p>
          )}

          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-300">Build areas</h3>
              <span className="text-[10px] text-slate-500">{state.plots.length}</span>
            </div>
            {state.plots.length === 0 && <p className="text-[10px] text-slate-500">No plots yet. Owners draw build areas; builders request one.</p>}
            {state.plots.map((plot) => {
              const mine = plot.assignedTo === state.world.ownerId ? false : Boolean(plot.assignedTo);
              return (
                <div key={plot.id} className="rounded-lg border border-white/10 px-2 py-1.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold truncate">{plot.name}</span>
                    <span
                      className={`px-1 rounded text-[9px] uppercase ${
                        plot.status === 'approved' ? 'bg-[#39ff14]/15 text-[#b6ffab]'
                          : plot.status === 'requested' ? 'bg-amber-400/15 text-amber-200'
                          : plot.status === 'denied' ? 'bg-red-500/15 text-red-200'
                          : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {plot.status}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500">{plot.w}×{plot.d} at {plot.x},{plot.z}{mine ? ' · assigned' : ''}</p>
                  <div className="flex flex-wrap gap-1">
                    {state.permissions.canApprovePlots && plot.status === 'requested' && (
                      <>
                        <button type="button" disabled={plotBusy} onClick={() => plotAction('plot_approve', plot)} className="px-1.5 py-0.5 rounded bg-[#39ff14] text-[#051205] text-[10px] font-bold disabled:opacity-40">Approve</button>
                        <button type="button" disabled={plotBusy} onClick={() => plotAction('plot_deny', plot)} className="px-1.5 py-0.5 rounded border border-white/15 text-[10px] disabled:opacity-40">Deny</button>
                      </>
                    )}
                    {state.permissions.canApprovePlots && plot.status === 'approved' && (
                      <button type="button" disabled={plotBusy} onClick={() => plotAction('plot_release', plot)} className="px-1.5 py-0.5 rounded border border-white/15 text-[10px] disabled:opacity-40">Release</button>
                    )}
                    {state.role === 'builder' && (plot.status === 'available' || plot.status === 'denied') && (
                      <button type="button" disabled={plotBusy} onClick={() => plotAction('plot_request', plot)} className="px-1.5 py-0.5 rounded bg-white text-black text-[10px] font-bold disabled:opacity-40">Request</button>
                    )}
                    {state.permissions.canManage && (
                      <button type="button" disabled={plotBusy} onClick={() => plotAction('plot_remove', plot)} className="px-1.5 py-0.5 rounded text-red-300 text-[10px] disabled:opacity-40">Remove</button>
                    )}
                  </div>
                </div>
              );
            })}
            {canCreatePlot && (
              <div className="space-y-1.5 border-t border-white/10 pt-2">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">New build area</p>
                <input value={plotForm.name} onChange={(event) => setPlotForm((value) => ({ ...value, name: event.target.value }))} className="w-full bg-black/40 border border-white/12 rounded px-2 py-1 text-[11px]" placeholder="Plot name" />
                <div className="grid grid-cols-4 gap-1">
                  {(['x', 'z', 'w', 'd'] as const).map((key) => (
                    <label key={key} className="text-[9px] text-slate-500">
                      {key}
                      <input
                        type="number"
                        value={plotForm[key]}
                        onChange={(event) => setPlotForm((value) => ({ ...value, [key]: Number(event.target.value) }))}
                        className="w-full bg-black/40 border border-white/12 rounded px-1 py-0.5 text-[11px] text-slate-100"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex gap-1">
                  <button type="button" disabled={busy || state.plots.length >= 24} onClick={() => void run({ action: 'plot_create', ...plotForm })} className="flex-1 px-2 py-1 rounded bg-white/10 text-[10px] font-semibold disabled:opacity-40">Add plot</button>
                  <button type="button" onClick={() => setPlotStart({ x: -1, z: -1 })} className="px-2 py-1 rounded border border-white/12 text-[10px]">Draw</button>
                </div>
              </div>
            )}
            {plotForm.w > 0 && state.permissions.canApprovePlots && (
              <p className="text-[9px] text-slate-500">Suggested area {plotForm.w}×{plotForm.d} at {plotForm.x},{plotForm.z}.</p>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-300 mb-1">World settings</h3>
            <dl className="text-[10px] space-y-1 text-slate-400">
              <div className="flex justify-between"><dt>Foundation</dt><dd className="text-slate-200">{state.world.foundation}</dd></div>
              <div className="flex justify-between"><dt>Terrain</dt><dd className="text-slate-200">{state.layout.settings.terrain}</dd></div>
              <div className="flex justify-between"><dt>Climate</dt><dd className="text-slate-200">{state.layout.settings.climate}</dd></div>
              <div className="flex justify-between"><dt>Time</dt><dd className="text-slate-200">{state.layout.settings.timeOfDay}</dd></div>
              <div className="flex justify-between"><dt>Published rev</dt><dd className="text-slate-200">{state.world.publishedVersion}</dd></div>
              <div className="flex justify-between"><dt>Objects</dt><dd className="text-slate-200">{state.layout.objects.length} / 600</dd></div>
            </dl>
          </section>

          {showHistory && (
            <section className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-300">Change history</h3>
              {state.history.length === 0 && <p className="text-[10px] text-slate-500">No revisions yet.</p>}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {state.history.map((entry) => (
                  <div key={entry.id} className="rounded border border-white/8 px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-200">#{entry.revision} {entry.detail}</span>
                      {state.permissions.canManage && state.world.status === 'build_mode' && (
                        <button type="button" disabled={busy} onClick={() => void restore(entry.revision)} className="ml-auto text-[9px] px-1 rounded border border-white/12 disabled:opacity-40">Restore</button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-500">@{entry.actorHandle} · {new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};

/* ------------------------------ iso drawing ------------------------------ */

function drawObject(
  ctx: CanvasRenderingContext2D,
  object: WorldLayoutObject,
  zoom: number,
  origin: Point,
  selected: boolean
) {
  const entry = WORLD_TOOL_MAP[object.tool];
  if (!entry) return;
  const [w, d] = footprint(object.tool, object.rot);
  const edges = [
    iso(object.x, object.z, zoom, origin),
    iso(object.x + w, object.z, zoom, origin),
    iso(object.x + w, object.z + d, zoom, origin),
    iso(object.x, object.z + d, zoom, origin),
  ];
  const height = entry.layer === 'structure' || entry.layer === 'prop'
    ? Math.max(3, (entry.height || 0.5) * 11 * zoom)
    : 1;
  const top = edges.map((point) => ({ x: point.x, y: point.y - height }));

  if (entry.id === 'tree') {
    const base = edges[2];
    ctx.strokeStyle = '#5a3f24';
    ctx.lineWidth = Math.max(1, 2 * zoom);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x, base.y - height);
    ctx.stroke();
    ctx.fillStyle = object.color;
    ctx.beginPath();
    ctx.arc(base.x, base.y - height, Math.max(3, 10 * zoom), 0, Math.PI * 2);
    ctx.fill();
  } else if (entry.id === 'lamp') {
    const base = edges[2];
    ctx.strokeStyle = '#4a4f57';
    ctx.lineWidth = Math.max(1, 1.5 * zoom);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x, base.y - height);
    ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(base.x, base.y - height, Math.max(2, 4 * zoom), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Two visible walls and the roof/top face.
    diamond(ctx, edges[2], edges[3], top[3], top[2], shade(object.color, -28));
    diamond(ctx, edges[1], edges[2], top[2], top[1], shade(object.color, -14));
    diamond(ctx, top[0], top[1], top[2], top[3], object.color);
    if (entry.id === 'park') {
      for (let index = 0; index < 4; index += 1) {
        const px = edges[0].x + ((edges[2].x - edges[0].x) * (index + 1)) / 5;
        const py = edges[0].y + ((edges[2].y - edges[0].y) * (index + 1)) / 5;
        ctx.fillStyle = '#3f6f3a';
        ctx.beginPath();
        ctx.arc(px, py - 3, Math.max(2, 4 * zoom), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (entry.category === 'buildings') {
      // Windows hint at the building's use without extra geometry.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let row = 0; row < 2; row += 1) {
        const t = (row + 1) / 3;
        const x = top[0].x + (top[2].x - top[0].x) * t;
        const y = top[0].y + (top[2].y - top[0].y) * t;
        ctx.fillRect(x - 2, y - 2, 4, 3);
      }
    }
  }

  if (selected) {
    ctx.strokeStyle = '#39ff14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(edges[0].x, edges[0].y);
    for (let index = 1; index < edges.length; index += 1) ctx.lineTo(edges[index].x, edges[index].y);
    ctx.closePath();
    ctx.stroke();
  }
}
