import React, { useEffect } from 'react';
import { Bell, CreditCard, DoorOpen, KeyRound, X } from 'lucide-react';
import { sfx } from '../game/audio';

interface HotelDoorTerminalModalProps {
  open: boolean;
  playerName: string;
  playerSuiteNumber: string;
  playerSuiteFloor: number;
  mainDoorUnlocked: boolean;
  onUnlockWithKeycard: () => void;
  onClose: () => void;
}

/**
 * The lobby entrance terminal. It is deliberately keycard-only: a suite door
 * is opened either by its owner's keycard or by a doorbell the owner accepts
 * from inside the suite. The old "ring a demo resident" shortcut was removed
 * because it could open a room without the owner being present.
 */
export const HotelDoorTerminalModal: React.FC<HotelDoorTerminalModalProps> = ({
  open,
  playerName,
  playerSuiteNumber,
  playerSuiteFloor,
  mainDoorUnlocked,
  onUnlockWithKeycard,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' || event.key === 'K' || event.key === 'Enter') {
        event.preventDefault();
        sfx.playKeycardBeep();
        onUnlockWithKeycard();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onUnlockWithKeycard, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 pointer-events-auto">
      <div className="w-[min(470px,94vw)] rounded-2xl bg-[#0b100d] border border-[#39ff14]/40 text-slate-100 neon-panel-glow overflow-hidden">
        <div className="px-5 py-4 border-b border-[#39ff14]/15 flex items-center justify-between bg-[#0f1612]">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-[#39ff14]" />
            <div>
              <h2 className="font-display text-base font-bold tracking-tight text-white">
                LoftLife Grand Hotel · Main Entrance
              </h2>
              <p className="text-xs text-slate-400">Tap your suite keycard to enter the lobby</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hotel keycard terminal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
                  Floor {playerSuiteFloor} · Unlocks the lobby and your own suite door
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

          <div className="rounded-xl bg-[#101613] border border-white/10 p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#39ff14]">
              <Bell className="w-3.5 h-3.5" /> Visiting another resident?
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Take the elevator to their floor and ring the doorbell at their suite door. The owner
              must be online and inside their room to answer — there is no way to summon an absent
              resident, and only an accepted visit unlocks the door.
            </p>
          </div>

          <div className="text-[11px] text-slate-500">
            Keys K / Enter insert the keycard · Esc closes this terminal
          </div>
        </div>
      </div>
    </div>
  );
};
