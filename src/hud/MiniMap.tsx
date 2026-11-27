import React from 'react';
import { MapPinned } from 'lucide-react';

interface MiniMapProps {
  currentStreet: string;
  locationLabel: string;
  poseRef: React.MutableRefObject<{ x: number; z: number; yaw: number; known: boolean }>;
  presentation: 'mobile-portrait' | 'mobile-landscape' | 'tablet-portrait' | 'tablet-landscape' | 'desktop-browser' | 'desktop-app';
  onOpenMap: () => void;
}

/** Persistent, live-position minimap. Opens the full City Map on activation. */
export const MiniMap: React.FC<MiniMapProps> = ({ currentStreet, locationLabel, poseRef, presentation, onOpenMap }) => {
  const tablet = presentation.startsWith('tablet');
  const desktop = presentation.startsWith('desktop');
  const size = desktop ? 'w-44 h-32' : tablet ? 'w-40 h-32' : 'w-[116px] h-[94px]';
  const pose = poseRef.current;
  return (
    <button
      type="button"
      onClick={onOpenMap}
      aria-label={`Open city map. Current location: ${locationLabel}. Street: ${currentStreet}.`}
      title="Open full map"
      className={`ll-focus ll-surface fixed z-40 overflow-hidden rounded-2xl border border-white/20 text-left shadow-xl ${size}`}
      style={{
        top: desktop ? '64px' : 'calc(82px + var(--ll-safe-top, 0px))',
        left: 'calc(12px + var(--ll-safe-left, 0px))',
      }}
    >
      <div className="absolute inset-0 bg-[#101914]">
        <div className="absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(28deg, transparent 46%, rgba(170,190,178,.45) 47%, rgba(170,190,178,.45) 51%, transparent 52%), linear-gradient(118deg, transparent 43%, rgba(170,190,178,.28) 44%, rgba(170,190,178,.28) 49%, transparent 50%), linear-gradient(90deg, transparent 48%, rgba(170,190,178,.22) 49%, rgba(170,190,178,.22) 52%, transparent 53%), linear-gradient(0deg, transparent 46%, rgba(170,190,178,.2) 47%, rgba(170,190,178,.2) 51%, transparent 52%)' }} />
        <div className="absolute left-[8%] top-[13%] h-2 w-2 rounded-sm bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
        <div className="absolute right-[14%] top-[22%] h-2 w-2 rounded-sm bg-amber-300" />
        <div className="absolute left-[23%] bottom-[16%] h-2 w-2 rounded-sm bg-pink-400" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="relative block h-4 w-4 rounded-full border-2 border-[#07100b] bg-[#39ff14] shadow-[0_0_12px_#39ff14]" style={{ transform: `rotate(${pose.yaw}rad)` }}>
            <span className="absolute -top-1 left-1/2 h-2 w-1 -translate-x-1/2 rounded-full bg-white" />
          </span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-[#070b09]/85 px-2 py-1.5 backdrop-blur-sm">
        <span className="min-w-0 truncate text-[9px] font-semibold text-white">{currentStreet || locationLabel}</span>
        <MapPinned className="h-3.5 w-3.5 shrink-0 text-[#9aff82]" aria-hidden="true" />
      </div>
      <span className="absolute right-2 top-1.5 rounded bg-black/55 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/75">Map</span>
    </button>
  );
};
