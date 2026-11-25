import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Building2, Home, X } from 'lucide-react';
import { sfx } from '../game/audio';
import { HOTEL_RESIDENTS, PLAYER_SUITE_FLOOR, PLAYER_SUITE_NUMBER } from '../game/catalog';
import type { ActiveResident, WorldLocation } from '../game/types';

interface ElevatorPanelModalProps {
  open: boolean;
  currentLocation: WorldLocation;
  currentFloor: number;
  playerName: string;
  targetVisitResident: ActiveResident | null;
  onArriveFloor: (floor: 'L' | 2 | 3 | 4) => void;
  onClose: () => void;
}

const ELEVATOR_STOPS: {
  id: 'L' | 2 | 3 | 4;
  label: string;
  floorNum: number;
  description: string;
}[] = [
  { id: 4, label: 'Floor 4', floorNum: 4, description: 'Penthouse Suites 401 – 404' },
  { id: 3, label: 'Floor 3', floorNum: 3, description: 'Skyline Suites 301 – 304' },
  { id: 2, label: 'Floor 2', floorNum: 2, description: 'Garden Suites 201 – 204' },
  { id: 'L', label: 'Lobby (L)', floorNum: 1, description: 'Concierge & Main Street Exit' },
];

export const ElevatorPanelModal: React.FC<ElevatorPanelModalProps> = ({
  open,
  currentLocation,
  currentFloor,
  playerName,
  targetVisitResident,
  onArriveFloor,
  onClose,
}) => {
  const [travelingTo, setTravelingTo] = useState<'L' | 2 | 3 | 4 | null>(null);
  const [displayFloor, setDisplayFloor] = useState<string>('L');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setTravelingTo(null);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }
    setDisplayFloor(currentLocation === 'lobby' ? 'L' : String(currentFloor));
  }, [open, currentLocation, currentFloor]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activeStopId: 'L' | 2 | 3 | 4 =
    currentLocation === 'lobby' ? 'L' : (Math.max(2, Math.min(4, currentFloor)) as 2 | 3 | 4);

  const handleSelectFloor = (stopId: 'L' | 2 | 3 | 4) => {
    if (travelingTo) return;
    if (stopId === activeStopId) {
      onClose();
      return;
    }
    sfx.playClick();
    setTravelingTo(stopId);
    const startNum = currentLocation === 'lobby' ? 1 : currentFloor;
    const endNum = stopId === 'L' ? 1 : stopId;
    const midNum = startNum < endNum ? startNum + 1 : Math.max(1, startNum - 1);

    window.setTimeout(() => setDisplayFloor(midNum === 1 ? 'L' : String(midNum)), 300);
    timerRef.current = window.setTimeout(() => {
      setDisplayFloor(String(stopId));
      sfx.playElevatorDing();
      setTravelingTo(null);
      onArriveFloor(stopId);
    }, 850);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 pointer-events-auto">
      <div className="w-[min(450px,94vw)] rounded-2xl bg-[#0b100d] border border-[#39ff14]/40 text-slate-100 neon-panel-glow overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#39ff14]/15 flex items-center justify-between bg-[#0f1612]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#39ff14]/12 border border-[#39ff14]/50 flex items-center justify-center font-mono-tabular text-base font-bold text-[#39ff14]">
              {displayFloor}
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-1.5">
                <ArrowUpDown className="w-4 h-4 text-[#39ff14]" />
                LoftLife Hotel Elevator
              </h2>
              <p className="text-xs text-slate-400">
                {travelingTo
                  ? `Riding to ${travelingTo === 'L' ? 'Main Lobby' : `Floor ${travelingTo}`}...`
                  : targetVisitResident
                  ? `Visit cleared: ${targetVisitResident.name} is on Floor ${targetVisitResident.floor} (Suite ${targetVisitResident.roomNumber})`
                  : 'Select a floor to ride'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close elevator panel"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Floor Buttons */}
        <div className="p-4 space-y-2">
          {ELEVATOR_STOPS.map((stop) => {
            const isHere = activeStopId === stop.id && !travelingTo;
            const isTargetVisit = targetVisitResident?.floor === stop.id;
            const floorResidents = HOTEL_RESIDENTS.filter((r) => r.floor === stop.id);

            return (
              <button
                key={String(stop.id)}
                type="button"
                disabled={Boolean(travelingTo)}
                onClick={() => handleSelectFloor(stop.id)}
                className={`w-full p-3.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-3 ${
                  travelingTo === stop.id
                    ? 'bg-[#39ff14] text-[#051205] border-[#39ff14]'
                    : isHere
                    ? 'bg-[#142618] border-[#39ff14]/60 text-white'
                    : isTargetVisit
                    ? 'bg-[#1a2e16] border-[#39ff14] text-white hover:bg-[#223d1c]'
                    : 'bg-[#101613] border-white/10 text-slate-200 hover:bg-[#161f1a]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono-tabular text-sm font-bold shrink-0 ${
                      travelingTo === stop.id
                        ? 'bg-black/15 text-[#051205]'
                        : isHere || isTargetVisit
                        ? 'bg-[#39ff14] text-[#051205]'
                        : 'bg-white/8 text-[#39ff14]'
                    }`}
                  >
                    {stop.id}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <span>{stop.label}</span>
                      {stop.id === PLAYER_SUITE_FLOOR && (
                        <span
                          className={`text-[11px] font-medium inline-flex items-center gap-1 ${
                            travelingTo === stop.id ? 'text-[#051205]' : 'text-[#39ff14]'
                          }`}
                        >
                          · <Home className="w-3 h-3" /> {playerName} ({PLAYER_SUITE_NUMBER})
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-xs truncate ${
                        travelingTo === stop.id ? 'text-[#0b240b]' : 'text-slate-400'
                      }`}
                    >
                      {floorResidents.length > 0
                        ? floorResidents.map((r) => `${r.roomNumber} ${r.name}`).join(' · ')
                        : stop.description}
                    </div>
                  </div>
                </div>

                <span
                  className={`text-xs font-semibold shrink-0 whitespace-nowrap ${
                    travelingTo === stop.id
                      ? 'text-[#051205]'
                      : isHere || isTargetVisit
                      ? 'text-[#39ff14]'
                      : 'text-slate-400'
                  }`}
                >
                  {travelingTo === stop.id ? (
                    'Moving...'
                  ) : isHere ? (
                    'Current Floor'
                  ) : isTargetVisit ? (
                    'Go Here'
                  ) : (
                    <Building2 className="w-4 h-4" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
