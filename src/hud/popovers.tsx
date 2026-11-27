import React from 'react';
import {
  ArrowUp,
  Camera,
  Eye,
  Gamepad2,
  Hand,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music,
  Sparkles,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type { EmoteType } from '../game/types';
import type { CameraHudState, EmoteHudState } from './types';
import { HudIconButton, cx } from './primitives';

const cardClass =
  'll-popover ll-animate-pop fixed z-[60] p-3 flex flex-col gap-2 max-h-[calc(100dvh-140px)] overflow-y-auto';

const position = (
  side: 'left' | 'right',
  extraBottom: number,
  wide = false
): React.CSSProperties =>
  wide
    ? {
        left: 'calc(12px + var(--ll-safe-left, 0px))',
        right: 'calc(12px + var(--ll-safe-right, 0px))',
        bottom: `calc(${extraBottom}px + var(--ll-safe-bottom, 0px))`,
        width: 'auto',
      }
    : {
        [side]: `calc(18px + var(--ll-safe-${side}, 0px))`,
        bottom: `calc(${extraBottom}px + var(--ll-safe-bottom, 0px))`,
        width: 'min(268px, calc(100vw - 24px))',
      };

export const EMOTES: { id: EmoteType; label: string; icon: React.ReactNode }[] = [
  { id: 'wave', label: 'Wave', icon: <Hand className="w-4 h-4" /> },
  { id: 'talk', label: 'Talk', icon: <MessageCircle className="w-4 h-4" /> },
  { id: 'gesture', label: 'Gesture', icon: <Hand className="w-4 h-4" /> },
  { id: 'dance', label: 'Dance', icon: <Music className="w-4 h-4" /> },
  { id: 'cheer', label: 'Cheer', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'jump', label: 'Hop', icon: <ArrowUp className="w-4 h-4" /> },
];

interface CameraPopoverProps {
  open: boolean;
  side: 'left' | 'right';
  bottom: number;
  camera: CameraHudState;
  onClose: () => void;
  touch: boolean;
  /** Phones and short landscape viewports get a full-width sheet. */
  wide?: boolean;
}

/** Camera controls live behind one button instead of a permanent toolbar row. */
export const CameraPopover: React.FC<CameraPopoverProps> = ({
  open,
  side,
  bottom,
  camera,
  onClose,
  touch,
  wide = false,
}) => {
  if (!open) return null;
  return (
    <div
      className={cardClass}
      style={position(side, bottom, wide)}
      role="dialog"
      aria-label="Camera controls"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-white">Camera</span>
        <HudIconButton
          label="Close camera controls"
          icon={<X className="w-4 h-4" />}
          size="sm"
          onClick={onClose}
        />
      </div>

      {camera.canChangeView && (
        <div role="group" aria-label="Camera view" className="grid grid-cols-2 gap-1">
          {(
            [
              { id: 'isometric', label: 'Isometric', icon: <Eye className="w-3.5 h-3.5" /> },
              { id: 'play', label: 'Play view', icon: <Gamepad2 className="w-3.5 h-3.5" /> },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={camera.viewMode === option.id}
              onClick={() => camera.onSetView(option.id)}
              className={cx(
                'll-focus flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-colors',
                camera.viewMode === option.id
                  ? 'bg-white text-[#15181b] border-white'
                  : 'bg-white/8 text-white/75 border-white/15 hover:text-white'
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        {camera.viewMode === 'isometric' && (
          <button
            type="button"
            aria-pressed={camera.followCharacter}
            onClick={camera.onToggleFollow}
            className={cx(
              'll-focus flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-colors',
              camera.followCharacter
                ? 'bg-white text-[#15181b] border-white'
                : 'bg-white/8 text-white/75 border-white/15'
            )}
          >
            {camera.followCharacter ? (
              <UserCheck className="w-3.5 h-3.5" />
            ) : (
              <UserX className="w-3.5 h-3.5" />
            )}
            Follow
          </button>
        )}
        <button
          type="button"
          aria-pressed={camera.closeZoom}
          onClick={camera.onToggleZoom}
          className={cx(
            'll-focus flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition-colors',
            camera.closeZoom
              ? 'bg-white text-[#15181b] border-white'
              : 'bg-white/8 text-white/75 border-white/15'
          )}
        >
          {camera.closeZoom ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
          {camera.closeZoom ? 'Close' : 'Wide'}
        </button>
      </div>

      <p className="text-[10px] leading-snug text-white/50">
        {camera.viewMode === 'play'
          ? 'Drag anywhere on the world to rotate the camera.'
          : 'Drag to orbit · pinch or scroll to zoom · the 360° camera keeps working.'}
        {touch && !camera.canChangeView ? ' The view follows device orientation.' : ''}
      </p>
    </div>
  );
};

interface EmotePopoverProps {
  open: boolean;
  side: 'left' | 'right';
  bottom: number;
  emote: EmoteHudState;
  onClose: () => void;
  wide?: boolean;
}

export const EmotePopover: React.FC<EmotePopoverProps> = ({
  open,
  side,
  bottom,
  emote,
  onClose,
  wide = false,
}) => {
  if (!open) return null;
  return (
    <div
      className={cardClass}
      style={position(side, bottom, wide)}
      role="dialog"
      aria-label="Emotes"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-white">Emotes</span>
        <HudIconButton label="Close emotes" icon={<X className="w-4 h-4" />} size="sm" onClick={onClose} />
      </div>
      <div className={wide ? 'grid grid-cols-4 gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
        {EMOTES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={emote.active === entry.id}
            onClick={() => {
              emote.onEmote(entry.id);
              onClose();
            }}
            className={cx(
              'll-focus flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-semibold transition-colors',
              emote.active === entry.id
                ? 'bg-white text-[#15181b] border-white'
                : 'bg-white/8 text-white/80 border-white/15 hover:bg-white/14 hover:text-white'
            )}
          >
            {entry.icon}
            {entry.label}
          </button>
        ))}
      </div>
      {emote.active !== 'idle' && emote.active !== 'walk' && (
        <button
          type="button"
          onClick={() => {
            emote.onEmote('idle');
            onClose();
          }}
          className="ll-focus mt-0.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/10 hover:text-white"
        >
          Stand still
        </button>
      )}
      <p className="flex items-center gap-1 text-[10px] text-white/40">
        <Camera className="w-3 h-3" aria-hidden="true" /> Emotes animate your avatar in the world.
      </p>
    </div>
  );
};
