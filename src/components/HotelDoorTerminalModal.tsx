import React, { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, CreditCard, DoorOpen, KeyRound, X } from 'lucide-react';
import { sfx } from '../game/audio';
import { HOTEL_RESIDENTS } from '../game/catalog';
import type { ActiveResident } from '../game/types';

interface HotelDoorTerminalModalProps {
  open: boolean;
  playerName: string;
  playerSuiteNumber: string;
  playerSuiteFloor: number;
  mainDoorUnlocked: boolean;
  onUnlockWithKeycard: () => void;
  onUnlockFromResident: (resident: ActiveResident) => void;
  onClose: () => void;
}

export const HotelDoorTerminalModal: React.FC<HotelDoorTerminalModalProps> = ({
  open,
  playerName,
  playerSuiteNumber,
  playerSuiteFloor,
  mainDoorUnlocked,
  onUnlockWithKeycard,
  onUnlockFromResident,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [ringingResident, setRingingResident] = useState<ActiveResident | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setRingingResident(null);
      setStatusMessage(null);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open]);

  const handleRingResident = (resident: ActiveResident) => {
    if (ringingResident) return;
    sfx.playIntercomRing();
    setRingingResident(resident);
    setStatusMessage(`Calling Suite ${resident.roomNumber} (Floor ${resident.floor})...`);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      sfx.playKeycardBeep();
      setRingingResident(null);
      setStatusMessage(
        `${resident.name} buzzed you in! Doors unlocked for Main Lobby & Suite ${resident.roomNumber}.`
      );
      onUnlockFromResident(resident);
    }, 850);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        sfx.playClick();
        setSelectedIndex((i) => (i - 1 + HOTEL_RESIDENTS.length) % HOTEL_RESIDENTS.length);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sfx.playClick();
        setSelectedIndex((i) => (i + 1) % HOTEL_RESIDENTS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleRingResident(HOTEL_RESIDENTS[selectedIndex]);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        sfx.playKeycardBeep();
        onUnlockWithKeycard();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, selectedIndex, ringingResident, onUnlockWithKeycard, onClose]);

  if (!open) return null;

  const focusedResident = HOTEL_RESIDENTS[selectedIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 pointer-events-auto">
      <div className="w-[min(540px,95vw)] rounded-2xl bg-[#0b100d] border border-[#39ff14]/40 text-slate-100 neon-panel-glow overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#39ff14]/15 flex items-center justify-between bg-[#0f1612]">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-[#39ff14]" />
            <div>
              <h2 className="font-display text-base font-bold tracking-tight text-white">
                LoftLife Grand Hotel · Main Entrance
              </h2>
              <p className="text-xs text-slate-400">
                Tap your suite keycard or use Up/Down arrows to ring an active guest
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hotel intercom"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Option 1: Player Keycard */}
          <div className="p-3.5 rounded-xl bg-[#111914] border border-[#39ff14]/35 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#39ff14]/12 border border-[#39ff14]/40 flex items-center justify-center text-[#39ff14]">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {playerName}&apos;s Keycard · Suite {playerSuiteNumber}
                </div>
                <div className="text-xs text-slate-400">
                  Floor {playerSuiteFloor} · Unlocks Main Lobby &amp; your suite door
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                sfx.playKeycardBeep();
                onUnlockWithKeycard();
              }}
              className="px-4 py-2 rounded-xl bg-[#39ff14] hover:bg-[#5bff3b] text-[#051205] text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap neon-btn-glow"
            >
              <DoorOpen className="w-3.5 h-3.5" />
              {mainDoorUnlocked ? 'Walk In (K)' : 'Enter Keycard (K)'}
            </button>
          </div>

          {/* Option 2: Active Guest Intercom Directory */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-[#39ff14]">
                Active Users in Rooms · {HOTEL_RESIDENTS.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous active resident"
                  onClick={() => {
                    sfx.playClick();
                    setSelectedIndex(
                      (i) => (i - 1 + HOTEL_RESIDENTS.length) % HOTEL_RESIDENTS.length
                    );
                  }}
                  className="p-1.5 rounded-lg bg-[#131c16] hover:bg-[#1a261e] border border-[#39ff14]/25 text-slate-200"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Next active resident"
                  onClick={() => {
                    sfx.playClick();
                    setSelectedIndex((i) => (i + 1) % HOTEL_RESIDENTS.length);
                  }}
                  className="p-1.5 rounded-lg bg-[#131c16] hover:bg-[#1a261e] border border-[#39ff14]/25 text-slate-200"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {HOTEL_RESIDENTS.map((res, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={res.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setSelectedIndex(idx);
                    }}
                    onDoubleClick={() => handleRingResident(res)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#16241a] border-[#39ff14] text-white'
                        : 'bg-[#101613] border-white/10 text-slate-300 hover:bg-[#151e19]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-mono-tabular text-xs font-bold shrink-0 ${
                          isSelected ? 'text-[#39ff14]' : 'text-slate-300'
                        }`}
                      >
                        #{res.roomNumber}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {res.name}{' '}
                          <span className="text-xs font-normal text-slate-400">
                            · Floor {res.floor}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate">{res.status}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-[#39ff14] shrink-0">
                      In Room
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className="px-3.5 py-2 rounded-xl bg-[#39ff14]/12 border border-[#39ff14]/40 text-xs text-[#c8ffbe]">
              {statusMessage}
            </div>
          )}

          {/* Ring Footer */}
          <div className="pt-1 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              Use ↑ / ↓ arrows to scroll · Enter to ring
            </span>
            <button
              type="button"
              disabled={Boolean(ringingResident)}
              onClick={() => handleRingResident(focusedResident)}
              className="px-4 py-2 rounded-xl bg-[#39ff14] hover:bg-[#5bff3b] text-[#051205] text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap neon-btn-glow"
            >
              <Bell className="w-3.5 h-3.5" />
              Ring {focusedResident.name} · Suite {focusedResident.roomNumber} (Enter)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
