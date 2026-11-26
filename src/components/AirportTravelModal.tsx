import React from 'react';
import { PlaneTakeoff, X } from 'lucide-react';

interface AirportTravelModalProps {
  open: boolean;
  guest: boolean;
  onClose: () => void;
  onTakeFlight: () => void;
}

export const AirportTravelModal: React.FC<AirportTravelModalProps> = ({ open, guest, onClose, onTakeFlight }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="airport-departure-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"><PlaneTakeoff className="h-5 w-5" /></span>
            <div><h2 id="airport-departure-title" className="font-bold">TheCity Airport</h2><p className="text-xs text-slate-500">Departures</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close departure dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-3 px-5 py-5">
          <p className="text-sm leading-6 text-slate-600">Ready to leave TheCity? Your visit will end here and you’ll return to the LoftLife home screen.</p>
          {guest && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Your guest visit will end. Your guest room data remains saved locally on this device.</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">Stay in TheCity</button>
            <button type="button" onClick={onTakeFlight} className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700">Take a flight</button>
          </div>
        </div>
      </section>
    </div>
  );
};
