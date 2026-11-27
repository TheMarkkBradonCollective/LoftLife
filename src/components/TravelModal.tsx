import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Globe2, MapPin, PlaneTakeoff, TrainFront, X } from 'lucide-react';
import type { TravelDestination } from '../net/api';

interface TravelModalProps {
  open: boolean;
  mode: 'rail' | 'air';
  destinations: { city: TravelDestination[]; worlds: TravelDestination[] };
  loading?: boolean;
  error?: string | null;
  guest: boolean;
  onStart: (mode: 'rail' | 'air', destinationId: string) => void;
  onClose: () => void;
}

const MODE_COPY = {
  rail: {
    title: 'LoftLife Central Station',
    subtitle: 'Intercity Rail · Departures',
    action: 'Board train',
    icon: TrainFront,
  },
  air: {
    title: 'TheCity International Airport',
    subtitle: 'Terminal 1 · Departures',
    action: 'Board flight',
    icon: PlaneTakeoff,
  },
};

function DestinationRow({
  destination,
  selected,
  onSelect,
}: {
  destination: TravelDestination;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          selected ? 'bg-white/15' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {destination.kind === 'world' ? <Globe2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{destination.label}</span>
        <span className={`block truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
          {destination.kind === 'world'
            ? `Player world · @${destination.ownerHandle ?? 'resident'}`
            : destination.blurb ?? 'Main City destination'}
        </span>
      </span>
      <ArrowRight className={`h-4 w-4 shrink-0 ${selected ? 'text-white' : 'text-slate-400'}`} />
    </button>
  );
}

export const TravelModal: React.FC<TravelModalProps> = ({
  open,
  mode,
  destinations,
  loading = false,
  error = null,
  guest,
  onStart,
  onClose,
}) => {
  const copy = MODE_COPY[mode];
  const Icon = copy.icon;
  const [tab, setTab] = useState<'city' | 'worlds'>('city');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('city');
    setSelected(destinations.city[0]?.id ?? null);
  }, [open, mode, destinations.city]);

  useEffect(() => {
    if (tab === 'city') setSelected(destinations.city[0]?.id ?? null);
    else setSelected(destinations.worlds[0]?.id ?? null);
  }, [tab, destinations]);

  const options = useMemo(
    () => (tab === 'city' ? destinations.city : destinations.worlds),
    [tab, destinations]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="travel-departure-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2 id="travel-departure-title" className="font-bold">
                {copy.title}
              </h2>
              <p className="text-xs text-slate-500">{copy.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close departure dialog"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {mode === 'rail'
              ? 'Autonomous train · no conductor · departs Platform 1'
              : 'Cabin crew on board · gate closes before departure'}
          </div>

          <div className="flex gap-2" role="tablist" aria-label="Destination type">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'city'}
              onClick={() => setTab('city')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                tab === 'city' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Main City
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'worlds'}
              onClick={() => setTab('worlds')}
              disabled={guest}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${
                tab === 'worlds' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Player worlds
            </button>
          </div>

          {loading && <p className="py-6 text-center text-sm text-slate-500">Checking available destinations…</p>}
          {!loading && error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
          {!loading && !error && options.length === 0 && (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              {tab === 'worlds'
                ? 'No player worlds are available to you right now.'
                : 'No destinations are available from here.'}
            </p>
          )}
          {!loading && !error && options.length > 0 && (
            <div className="space-y-2">
              {options.map((destination) => (
                <DestinationRow
                  key={destination.id}
                  destination={destination}
                  selected={selected === destination.id}
                  onSelect={() => setSelected(destination.id)}
                />
              ))}
            </div>
          )}

          {guest && tab === 'city' && (
            <p className="text-[11px] leading-5 text-slate-500">
              Guest visits can travel inside the Main City. Player worlds require a signed-in account.
            </p>
          )}
        </div>

        <footer className="flex gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Stay here
          </button>
          <button
            type="button"
            disabled={!selected || loading}
            onClick={() => selected && onStart(mode, selected)}
            className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy.action}
          </button>
        </footer>
      </section>
    </div>
  );
};
