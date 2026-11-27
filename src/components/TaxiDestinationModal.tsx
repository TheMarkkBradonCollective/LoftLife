import React, { useEffect, useState } from 'react';
import { ArrowRight, MapPin, Navigation, X } from 'lucide-react';
import type { TaxiDestination } from '../net/realtime';

interface TaxiDestinationModalProps {
  open: boolean;
  destinations: TaxiDestination[];
  onChoose: (destinationId: string) => void;
  onCancelRide: () => void;
}

export const TaxiDestinationModal: React.FC<TaxiDestinationModalProps> = ({
  open,
  destinations,
  onChoose,
  onCancelRide,
}) => {
  const [selected, setSelected] = useState<string | null>(destinations[0]?.id ?? null);

  useEffect(() => {
    if (open) setSelected(destinations[0]?.id ?? null);
  }, [open, destinations]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="taxi-destination-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0b100d] text-slate-100 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5b718]/15 text-[#f5b718]">
              <Navigation className="h-5 w-5" />
            </span>
            <div>
              <h2 id="taxi-destination-title" className="font-bold">
                Autonomous Taxi
              </h2>
              <p className="text-xs text-slate-400">Choose a destination · no driver</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelRide}
            aria-label="Cancel taxi ride"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto px-5 py-4">
          {destinations.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              No destinations are available right now.
            </p>
          )}
          {destinations.map((destination) => (
            <button
              key={destination.id}
              type="button"
              aria-pressed={selected === destination.id}
              onClick={() => setSelected(destination.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                selected === destination.id
                  ? 'border-[#f5b718]/70 bg-[#f5b718]/10'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#f5b718]">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{destination.label}</span>
                <span className="block text-[11px] text-slate-400">
                  {Math.max(1, Math.round(Math.hypot(destination.x, destination.z) / 90))} min · metered city ride
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-slate-500" />
            </button>
          ))}
        </div>

        <footer className="flex gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onCancelRide}
            className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-slate-300"
          >
            Cancel ride
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onChoose(selected)}
            className="flex-1 rounded-xl bg-[#f5b718] px-4 py-3 text-sm font-bold text-black hover:bg-[#e0a510] disabled:opacity-40"
          >
            Start ride
          </button>
        </footer>
      </section>
    </div>
  );
};
