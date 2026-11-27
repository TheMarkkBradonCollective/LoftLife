import React, { useEffect, useState } from 'react';
import { ArrowUpDown, Bus, CarTaxiFront, Plane, TrainFront, X } from 'lucide-react';

export type TransitionMode = 'rail' | 'air' | 'elevator' | 'taxi' | 'bus';

interface TravelTransitionProps {
  open: boolean;
  mode: TransitionMode;
  label: string;
  detail?: string | null;
  phase: 'boarding' | 'enroute' | 'arrived';
  startedAt: number;
  arriveAt: number;
  onCancel?: () => void;
}

const MODE_META: Record<
  TransitionMode,
  { icon: typeof TrainFront; kicker: string; accent: string; track: string }
> = {
  rail: {
    icon: TrainFront,
    kicker: 'LoftLife Intercity',
    accent: '#22c55e',
    track: 'linear-gradient(90deg,#052e16,#14532d,#22c55e)',
  },
  air: {
    icon: Plane,
    kicker: 'LoftLife Air',
    accent: '#38bdf8',
    track: 'linear-gradient(180deg,#0c4a6e,#075985,#38bdf8)',
  },
  elevator: {
    icon: ArrowUpDown,
    kicker: 'Grand Hotel Elevator',
    accent: '#d4af37',
    track: 'linear-gradient(180deg,#14100a,#3f3213,#d4af37)',
  },
  taxi: {
    icon: CarTaxiFront,
    kicker: 'Autonomous Taxi',
    accent: '#f5b718',
    track: 'linear-gradient(90deg,#1c1404,#4a3608,#f5b718)',
  },
  bus: {
    icon: Bus,
    kicker: 'LoftLine Bus',
    accent: '#39ff14',
    track: 'linear-gradient(90deg,#06140a,#0f3d1d,#39ff14)',
  },
};

export const TravelTransition: React.FC<TravelTransitionProps> = ({
  open,
  mode,
  label,
  detail,
  phase,
  startedAt,
  arriveAt,
  onCancel,
}) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 120);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const meta = MODE_META[mode];
  const Icon = meta.icon;
  const total = Math.max(1, arriveAt - startedAt);
  const progress =
    phase === 'arrived' ? 1 : Math.max(0.02, Math.min(0.98, (now - startedAt) / total));
  const status =
    phase === 'boarding'
      ? mode === 'elevator'
        ? 'Doors closing'
        : 'Boarding · doors closing'
      : phase === 'arrived'
      ? 'Arriving'
      : mode === 'elevator'
      ? 'Ascending'
      : 'En route';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden bg-[#050806] p-6 text-slate-100"
      role="status"
      aria-live="polite"
      aria-label={`${meta.kicker}: ${status}, ${label}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: meta.track }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_60%_30%,rgba(255,255,255,0.12),transparent_55%)]" />

      <div className="relative w-full max-w-md text-center">
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-black/40 shadow-2xl"
          style={{ color: meta.accent }}
        >
          <Icon className="h-9 w-9" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/50">
          {meta.kicker}
        </p>
        <h2 className="mt-2 text-2xl font-bold">{label}</h2>
        {detail && <p className="mt-1 text-sm text-white/60">{detail}</p>}

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/35 p-4 backdrop-blur">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>{status}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-150 ease-linear"
              style={{ width: `${progress * 100}%`, background: meta.accent }}
            />
          </div>
          <div className="relative mt-4 h-5 overflow-hidden">
            <div
              className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-white/15"
              aria-hidden
            />
            <div
              className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full shadow-[0_0_12px_currentColor] transition-[left] duration-150 ease-linear"
              style={{
                left: `calc(${progress * 100}% - 4px)`,
                background: meta.accent,
                color: meta.accent,
              }}
              aria-hidden
            />
          </div>
        </div>

        {phase === 'boarding' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            <X className="h-4 w-4" /> Cancel boarding
          </button>
        )}
        <p className="mt-6 text-[11px] text-white/35">
          Loading and session transfer are handled by the travel server.
        </p>
      </div>
    </div>
  );
};
