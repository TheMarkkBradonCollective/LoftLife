import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type TouchLayoutPreferences } from '../net/api';
import {
  DEFAULT_BINDINGS,
  DEFAULT_TOUCH_LAYOUT,
  KEYBINDING_STORAGE_KEY,
  type BindingAction,
  assignBinding,
  findConflicts,
  normalizeBindings,
  normalizeTouchLayout,
  resetAllBindings,
  resetBinding,
} from '../../shared/keybindings.mjs';

export interface ControlsState {
  bindings: Record<string, string>;
  touch: TouchLayoutPreferences;
  updatedAt: number;
}

const STORAGE_VERSION = 1;

function readLocal(): ControlsState {
  try {
    const raw = localStorage.getItem(KEYBINDING_STORAGE_KEY);
    if (!raw) return { bindings: { ...DEFAULT_BINDINGS }, touch: { ...DEFAULT_TOUCH_LAYOUT }, updatedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<ControlsState> | null;
    return {
      bindings: normalizeBindings(parsed?.bindings),
      touch: normalizeTouchLayout(parsed?.touch),
      updatedAt: Number(parsed?.updatedAt) || 0,
    };
  } catch {
    return { bindings: { ...DEFAULT_BINDINGS }, touch: { ...DEFAULT_TOUCH_LAYOUT }, updatedAt: 0 };
  }
}

/** Module-level copy the 3D render loop reads without React re-renders. */
let activeBindings: Record<string, string> = readLocal().bindings;

export function getBinding(actionId: string): string {
  return activeBindings[actionId] ?? '';
}

export function getBindings(): Record<string, string> {
  return activeBindings;
}

function writeLocal(state: ControlsState) {
  activeBindings = state.bindings;
  try {
    localStorage.setItem(
      KEYBINDING_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, ...state })
    );
  } catch {
    // Private mode: in-memory bindings still work for this session.
  }
}

/**
 * Local-first controls with account sync.
 *
 * `online` changes from false to true when a session connects. A local copy
 * newer than the server copy is pushed (offline edits survive); an older local
 * copy adopts the account values. Changes are debounced before syncing.
 */
export function useKeybindings(options: {
  online: boolean;
  userId?: string | null;
}) {
  const [state, setState] = useState<ControlsState>(readLocal);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastSynced = useRef(0);

  // Keep the render loop's map current.
  useEffect(() => {
    activeBindings = state.bindings;
  }, [state.bindings]);

  const persist = useCallback((next: ControlsState) => {
    writeLocal(next);
    setState(next);
  }, []);

  const push = useCallback(
    async (next: ControlsState) => {
      if (!options.online) return;
      setSyncing(true);
      try {
        const saved = await api.saveControls({
          bindings: next.bindings,
          touch: next.touch,
          updatedAt: next.updatedAt,
        });
        const merged = {
          bindings: normalizeBindings(saved.bindings),
          touch: normalizeTouchLayout(saved.touch),
          updatedAt: saved.updatedAt || Date.now(),
        };
        lastSynced.current = merged.updatedAt;
        writeLocal(merged);
        setState((prev) => ({ ...prev, updatedAt: merged.updatedAt }));
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Controls not synced');
      } finally {
        setSyncing(false);
      }
    },
    [options.online]
  );

  // Pull once per signed-in account, resolving by timestamp.
  useEffect(() => {
    if (!options.online || !options.userId) return;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const remote = await api.getControls();
        if (cancelled) return;
        const local = readLocal();
        if (!remote.updatedAt || local.updatedAt > remote.updatedAt) {
          if (local.updatedAt > remote.updatedAt) await push(local);
          else {
            const seeded = { ...local, updatedAt: remote.updatedAt || Date.now() };
            writeLocal(seeded);
            setState(seeded);
          }
        } else {
          const adopted = {
            bindings: normalizeBindings(remote.bindings),
            touch: normalizeTouchLayout(remote.touch),
            updatedAt: remote.updatedAt,
          };
          lastSynced.current = adopted.updatedAt;
          writeLocal(adopted);
          setState(adopted);
        }
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : 'Controls not synced');
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `push` depends on online; this effect is keyed by account identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.online, options.userId]);

  const schedulePush = useCallback(
    (next: ControlsState) => {
      if (!options.online) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void push(next);
      }, 700);
    },
    [options.online, push]
  );

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    []
  );

  const update = useCallback(
    (mutator: (current: ControlsState) => ControlsState) => {
      setState((prev) => {
        const next = mutator(prev);
        const stamped = { ...next, updatedAt: Date.now() };
        writeLocal(stamped);
        schedulePush(stamped);
        return stamped;
      });
    },
    [schedulePush]
  );

  const setBinding = useCallback(
    (action: BindingAction, code: string, replace = false) => {
      const current = getBindings();
      const preview = assignBinding(current, action.id, code, { replace });
      if (preview.error) return { error: preview.error, conflicts: [] as BindingAction[] };
      if (preview.conflicts && !replace) return { error: null, conflicts: preview.conflicts };
      update((prev) => ({ ...prev, bindings: preview }));
      return { error: null, conflicts: [] as BindingAction[] };
    },
    [update]
  );

  const conflictsFor = useCallback(
    (actionId: string, code: string) => findConflicts(getBindings(), actionId, code),
    []
  );

  const resetOne = useCallback(
    (actionId: string) => {
      update((prev) => ({ ...prev, bindings: resetBinding(prev.bindings, actionId) }));
    },
    [update]
  );

  const resetAll = useCallback(() => {
    update((prev) => ({ ...prev, bindings: resetAllBindings() }));
  }, [update]);

  const setTouch = useCallback(
    (patch: Partial<TouchLayoutPreferences>) => {
      update((prev) => ({
        ...prev,
        touch: normalizeTouchLayout({ ...prev.touch, ...patch }),
      }));
    },
    [update]
  );

  const resetTouch = useCallback(() => {
    update((prev) => ({ ...prev, touch: { ...DEFAULT_TOUCH_LAYOUT } }));
  }, [update]);

  return {
    ...state,
    setBinding,
    conflictsFor,
    resetOne,
    resetAll,
    setTouch,
    resetTouch,
    syncing: syncing && options.online,
    syncError,
    lastSynced: lastSynced.current,
  };
}
