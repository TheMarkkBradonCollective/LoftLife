import React from 'react';
import { MessageCircle, X } from 'lucide-react';
import { cx } from './primitives';

interface NotificationsProps {
  hint: string | null;
  npcChat: { speaker: string; message: string } | null;
  onDismissNpc: () => void;
  /** Extra top offset when the top HUD is present. */
  offset: 'hud' | 'none';
}

/**
 * Compact, non-blocking notifications. They sit under the top HUD so they never
 * cover the avatar, the joystick or the action cluster.
 */
export const Notifications: React.FC<NotificationsProps> = ({
  hint,
  npcChat,
  onDismissNpc,
  offset,
}) => {
  if (!hint && !npcChat) return null;
  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[55] flex w-[min(440px,calc(100vw-24px))] -translate-x-1/2 flex-col items-center gap-2"
      style={{ top: offset === 'hud' ? 'calc(var(--ll-safe-top, 0px) + 64px)' : 16 }}
      aria-live="polite"
    >
      {hint && (
        <div className="ll-notice ll-animate-rise px-3.5 py-2 text-center text-[12px] font-medium text-white/90">
          {hint}
        </div>
      )}
      {npcChat && (
        <div className="ll-notice ll-animate-rise pointer-events-auto flex w-full items-start gap-2.5 px-3.5 py-2.5">
          <MessageCircle className="mt-0.5 w-4 h-4 shrink-0 text-white/70" aria-hidden="true" />
          <div className="min-w-0 text-[12px] leading-relaxed">
            <span className="mr-1 font-semibold text-white">{npcChat.speaker}</span>
            <span className="text-white/80">{npcChat.message}</span>
          </div>
          <button
            type="button"
            onClick={onDismissNpc}
            aria-label="Dismiss conversation"
            className={cx('ll-focus ml-auto shrink-0 rounded-md p-1 text-white/60 hover:bg-white/12 hover:text-white')}
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
