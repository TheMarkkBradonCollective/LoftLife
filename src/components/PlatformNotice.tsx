import React from 'react';
import { Lock, Smartphone } from 'lucide-react';
import { MOBILE_GAMEPLAY_MESSAGE } from '../../shared/device-platform.mjs';

interface PlatformNoticeProps {
  platformLabel: string;
}

/**
 * Persistent notice for runtimes with no usable game HUD (TV/console browsers).
 * Entry points are removed and refused in app logic; this explains why.
 */
export const PlatformNotice: React.FC<PlatformNoticeProps> = ({ platformLabel }) => (
  <aside
    role="status"
    aria-live="polite"
    className="pointer-events-none fixed left-1/2 -translate-x-1/2 top-28 z-40 w-[min(430px,92vw)] rounded-2xl border border-amber-300/40 bg-[#12100a]/95 px-3.5 py-2.5 text-amber-100 shadow-xl backdrop-blur-sm"
  >
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 rounded-lg bg-amber-400/15 p-1.5 text-amber-300">
        <Lock className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
          {platformLabel} · Gameplay unavailable
        </p>
        <p className="mt-1 text-xs leading-snug text-amber-100/90">{MOBILE_GAMEPLAY_MESSAGE}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-200/70">
          <Smartphone className="w-3 h-3" />
          Account, chat, friends, worlds browsing, settings and loft editing stay available.
        </p>
      </div>
    </div>
  </aside>
);
