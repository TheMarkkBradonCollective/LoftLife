import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Clock, DoorOpen, X } from 'lucide-react';
import { sfx } from '../game/audio';

export interface DoorbellRequest {
  requestId: string;
  roomNumber: string;
  from: { userId: string; handle: string; name: string };
}

interface HotelDoorbellModalProps {
  request: DoorbellRequest | null;
  onAnswer: (accept: boolean) => void;
  /** Seconds before the request expires on the server. */
  timeoutSeconds?: number;
}

/**
 * The owner's side of the hotel doorbell. It only appears while the owner is
 * physically inside their suite, because the gateway only routes a ring to an
 * owner whose live location is 'room'. Accepting unlocks visitor access for the
 * visitor who rang; declining leaves the door locked.
 */
export const HotelDoorbellModal: React.FC<HotelDoorbellModalProps> = ({
  request,
  onAnswer,
  timeoutSeconds = 45,
}) => {
  const [remaining, setRemaining] = useState(timeoutSeconds);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!request) return;
    startedAt.current = Date.now();
    setRemaining(timeoutSeconds);
    sfx.playIntercomRing();
    const timer = window.setInterval(() => {
      const left = Math.max(
        0,
        timeoutSeconds - Math.floor((Date.now() - startedAt.current) / 1000)
      );
      setRemaining(left);
      if (left === 0) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [request, timeoutSeconds]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sfx.playKeycardBeep();
        onAnswer(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        sfx.playClick();
        onAnswer(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, onAnswer]);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 pointer-events-auto">
      <div className="w-[min(440px,94vw)] rounded-2xl bg-[#0b100d] border border-[#39ff14]/45 text-slate-100 neon-panel-glow overflow-hidden">
        <div className="px-5 py-4 border-b border-[#39ff14]/15 flex items-center justify-between bg-[#0f1612]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#39ff14]/12 border border-[#39ff14]/50 flex items-center justify-center text-[#39ff14]">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">Someone is at your door</h2>
              <p className="text-xs text-slate-400">
                Suite {request.roomNumber} · LoftLife Grand Hotel
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-[#39ff14] font-mono-tabular">
            <Clock className="w-3.5 h-3.5" /> {remaining}s
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3.5 rounded-xl bg-[#111914] border border-[#39ff14]/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#39ff14]/12 border border-[#39ff14]/40 flex items-center justify-center font-bold text-[#39ff14]">
              {request.from.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{request.from.name}</div>
              <div className="text-xs text-slate-400 truncate">
                @{request.from.handle} wants to visit your suite
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            They can look around and sit down, but they cannot move, remove or recolour your
            furniture. Only you can edit this room.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                sfx.playKeycardBeep();
                onAnswer(true);
              }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#39ff14] hover:bg-[#5bff3b] text-[#051205] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors neon-btn-glow"
            >
              <DoorOpen className="w-4 h-4" /> Accept visit (Enter)
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.playClick();
                onAnswer(false);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#131c16] border border-white/10 hover:bg-[#1a261e] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <X className="w-4 h-4" /> Decline
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Check className="w-3.5 h-3.5 text-[#39ff14]" />
            Accepting approves only this visitor, for this visit.
          </div>
        </div>
      </div>
    </div>
  );
};
