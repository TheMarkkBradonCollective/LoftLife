import React from 'react';
import { Cloud, HardDrive, ShieldCheck, X } from 'lucide-react';
import { sfx } from '../game/audio';

export interface SyncSnapshotSummary {
  roomName: string;
  itemCount: number;
  avatarName: string;
  /** Lighting mood, so a difference in finishes is visible at a glance. */
  moodLabel: string;
}

interface SyncConflictModalProps {
  open: boolean;
  device: SyncSnapshotSummary;
  account: SyncSnapshotSummary;
  onKeepDevice: () => void;
  onUseAccount: () => void;
  onDecideLater: () => void;
}

const Card: React.FC<{
  icon: React.ReactNode;
  title: string;
  snapshot: SyncSnapshotSummary;
  accent: string;
}> = ({ icon, title, snapshot, accent }) => (
  <div className="rounded-xl border border-white/10 bg-[#101713] px-3.5 py-3">
    <div className="flex items-center gap-2">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{title}</span>
    </div>
    <p className="mt-2 text-sm font-semibold text-slate-100 truncate">{snapshot.roomName}</p>
    <p className="text-[11px] text-slate-400">
      {snapshot.itemCount} {snapshot.itemCount === 1 ? 'item' : 'items'} · {snapshot.avatarName}
    </p>
    <p className="text-[11px] text-slate-500 capitalize">{snapshot.moodLabel} lighting</p>
  </div>
);

/**
 * Shown when an explicit sign-in finds a suite on this device that differs from
 * the account's. Nothing is uploaded or replaced until the player picks a side.
 */
export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  open,
  device,
  account,
  onKeepDevice,
  onUseAccount,
  onDecideLater,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-conflict-title"
    >
      <button
        type="button"
        aria-label="Decide later"
        onClick={() => {
          sfx.playClick();
          onDecideLater();
        }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />

      <div className="relative w-full max-w-[440px] max-h-[90vh] overflow-y-auto bg-[#0b100d] text-slate-100 rounded-2xl border border-amber-400/45 neon-panel-glow">
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div>
              <h2 id="sync-conflict-title" className="font-display text-lg font-semibold text-white">
                Two suites, one account
              </h2>
              <p className="text-xs text-slate-400">
                This device and your account both have progress saved.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Decide later"
            onClick={() => {
              sfx.playClick();
              onDecideLater();
            }}
            className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Card
              icon={<HardDrive className="w-3.5 h-3.5" />}
              title="On this device"
              snapshot={device}
              accent="bg-[#39ff14]/12 text-[#39ff14]"
            />
            <Card
              icon={<Cloud className="w-3.5 h-3.5" />}
              title="In your account"
              snapshot={account}
              accent="bg-sky-400/12 text-sky-300"
            />
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            Nothing is uploaded or replaced until you choose. The copy you do not pick stays on this
            device as a backup.
          </p>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => {
                sfx.playClick();
                onKeepDevice();
              }}
              className="w-full px-4 py-3 rounded-xl bg-[#39ff14] text-[#051205] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#5bff3b] transition-colors neon-btn-glow"
            >
              <HardDrive className="w-4 h-4" />
              Keep this device&apos;s suite
            </button>
            <p className="text-[11px] text-center text-slate-500">
              Uploads the device suite and outfit to your account.
            </p>

            <button
              type="button"
              onClick={() => {
                sfx.playClick();
                onUseAccount();
              }}
              className="w-full px-4 py-3 rounded-xl bg-white/8 border border-white/12 text-slate-100 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/14 transition-colors"
            >
              <Cloud className="w-4 h-4" />
              Use my account suite
            </button>
            <p className="text-[11px] text-center text-slate-500">
              Loads the account suite and saves this device&apos;s copy first.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
