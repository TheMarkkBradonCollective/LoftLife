import React from 'react';
import { Eye, Footprints, Move, PencilRuler, Smartphone, X } from 'lucide-react';
import { sfx } from '../game/audio';
import type { GameMode } from '../game/types';

interface RoomSettingsModalProps {
  open: boolean;
  roomName: string;
  itemCount: number;
  mode: GameMode;
  canEdit: boolean;
  touchDevice: boolean;
  isPortrait: boolean;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onClose: () => void;
}

const rowClass = 'px-3.5 py-3 flex items-center justify-between gap-3';

const RowLabel: React.FC<{ icon: React.ReactNode; label: string; detail: string }> = ({
  icon,
  label,
  detail,
}) => (
  <div className="flex items-start gap-2.5 min-w-0">
    <span className="w-7 h-7 rounded-lg bg-white/8 text-[#39ff14] flex items-center justify-center shrink-0">
      {icon}
    </span>
    <div className="min-w-0">
      <span className="block text-xs font-semibold text-slate-100">{label}</span>
      <span className="block text-[11px] leading-snug text-slate-400">{detail}</span>
    </div>
  </div>
);

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  open,
  roomName,
  itemCount,
  mode,
  canEdit,
  touchDevice,
  isPortrait,
  onEnterEdit,
  onExitEdit,
  onClose,
}) => {
  if (!open) return null;

  const editing = mode === 'edit';

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Room settings"
    >
      <button
        type="button"
        aria-label="Close room settings"
        onClick={() => {
          sfx.playClick();
          onClose();
        }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
      />

      <div className="relative pointer-events-auto w-full max-w-[420px] max-h-[86vh] flex flex-col bg-[#0b100d] text-slate-100 rounded-2xl border border-[#39ff14]/40 neon-panel-glow overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#39ff14]/15 bg-[#0f1612]">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">
              Room Settings
            </h2>
            <p className="text-xs text-slate-400">
              {roomName} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            aria-label="Close room settings"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* One obvious action for the owner; visitors get the reason instead. */}
        {canEdit ? (
          <div className="px-5 pt-4">
            {editing ? (
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  onExitEdit();
                }}
                className="w-full px-4 py-3 rounded-xl bg-white/10 text-slate-100 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors"
              >
                <Footprints className="w-4 h-4" />
                Back to walking
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  onEnterEdit();
                }}
                className="w-full px-4 py-3 rounded-xl bg-[#39ff14] text-[#051205] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#5bff3b] transition-colors neon-btn-glow"
              >
                <PencilRuler className="w-4 h-4" />
                Edit this suite
              </button>
            )}
          </div>
        ) : (
          <div className="mx-5 mt-4 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-[11px] leading-snug text-slate-400 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-[#39ff14] shrink-0" />
            Visiting · only the owner can furnish this suite
          </div>
        )}

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#39ff14]/70">
              Controls
            </h3>

            <div className="rounded-xl border border-white/10 bg-[#101713] divide-y divide-white/8">
              <div className={rowClass}>
                <RowLabel
                  icon={<Move className="w-3.5 h-3.5" />}
                  label="Movement"
                  detail={
                    touchDevice
                      ? 'On-screen stick, or tap the floor to walk there'
                      : 'WASD or arrow keys, or click the floor to walk there'
                  }
                />
                <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                  {touchDevice ? 'Stick' : 'WASD'}
                </span>
              </div>

              <div className={rowClass}>
                <RowLabel
                  icon={<Smartphone className="w-3.5 h-3.5" />}
                  label="Camera"
                  detail={
                    touchDevice
                      ? 'Follows your device: portrait is isometric, landscape is play view'
                      : 'Switch between isometric and play view with V'
                  }
                />
                <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                  {touchDevice ? (isPortrait ? 'Isometric' : 'Play') : 'V'}
                </span>
              </div>

              <div className={rowClass}>
                <RowLabel
                  icon={<PencilRuler className="w-3.5 h-3.5" />}
                  label="Editing"
                  detail={
                    !canEdit
                      ? 'Only the owner of this room can furnish it'
                      : editing
                      ? 'Catalog, walls, floors and layouts are open'
                      : 'Furnish and decorate this room'
                  }
                />

                <span
                  className={`text-[11px] font-semibold shrink-0 ${
                    canEdit ? 'text-[#39ff14]' : 'text-slate-500'
                  }`}
                >
                  {canEdit ? (editing ? 'Editing' : 'Owner') : 'Visiting'}
                </span>
              </div>
            </div>
          </section>

          <p className="text-[11px] leading-relaxed text-slate-400">
            {editing
              ? 'Drag furniture to move it, R rotates, and the dock below holds the catalog. Choose Back to walking when you are done.'
              : 'Walk the room freely; tap Edit this suite whenever you want to change the furniture or finishes.'}
          </p>
        </div>

        <div className="px-5 py-3 border-t border-[#39ff14]/15 bg-[#0f1612] flex justify-end">
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold bg-[#39ff14] text-[#051205] rounded-lg hover:bg-[#5bff3b] transition-colors neon-btn-glow"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
