import React from 'react';
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  Loader2,
  Maximize2,
  Menu as MenuIcon,
  MessageCircle,
  Minimize2,
  Users,
} from 'lucide-react';
import type { VoiceSnapshot } from '../session';
import { VoiceControl } from './VoiceControl';
import { cx } from './primitives';

export interface TopHudProps {
  locationTitle: string;
  locationSub: string;
  presence: number;
  connection: string;
  online: boolean;
  syncState: 'local' | 'saving' | 'synced' | 'error';
  syncError?: string | null;
  conflict: boolean;
  partyInvite: boolean;
  chatOpen: boolean;
  voice: VoiceSnapshot;
  compact: boolean;
  dense: boolean;
  onOpenMenu: () => void;
  onOpenChat: () => void;
  onOpenPeople: () => void;
  onRetrySync: () => void;
  onCycleRange: () => void;
  onRangeChange: (range: VoiceSnapshot['range']) => void;
  onMicPress: () => void;
  onMicRelease: () => void;
  onOpenVoiceSettings: () => void;
  /** Installed desktop builds get a window control in the dock. */
  installedApp?: boolean;
  /** Installed builds use a full-width window bar instead of floating pills. */
  appBar?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const CONNECTION_LABEL: Record<string, string> = {
  connected: 'Live',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  disconnected: 'Offline',
  idle: 'Offline',
};

/**
 * Minimal gameplay top HUD: where you are, who is here, how to talk, and one
 * menu entry point. Everything else (travel, lighting, camera, account, exit)
 * lives inside the game menu.
 */
export const TopHud: React.FC<TopHudProps> = ({
  locationTitle,
  locationSub,
  presence,
  connection,
  online,
  syncState,
  syncError,
  conflict,
  partyInvite,
  chatOpen,
  voice,
  compact,
  dense,
  onOpenMenu,
  onOpenChat,
  onOpenPeople,
  onRetrySync,
  onCycleRange,
  onRangeChange,
  onMicPress,
  onMicRelease,
  onOpenVoiceSettings,
  installedApp = false,
  appBar = false,
  fullscreen = false,
  onToggleFullscreen,
}) => {
  // Offline play is normal; "Solo" says so without looking like a failure.
  const connectionLabel = online ? CONNECTION_LABEL[connection] ?? 'Live' : 'Solo';

  if (appBar) {
    return (
      <header
        className="pointer-events-none fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#14171b]/85 backdrop-blur-md"
        style={{
          paddingTop: 'var(--ll-safe-top, 0px)',
          paddingLeft: 'var(--ll-safe-left, 0px)',
          paddingRight: 'var(--ll-safe-right, 0px)',
        }}
        data-hud="top"
      >
        <div className="flex h-12 items-center gap-2.5 px-3">
          <span className="ll-brand-dot shrink-0" aria-hidden="true" />
          <span className="font-display text-[13px] font-bold tracking-tight text-white">LoftLife</span>
          <span aria-hidden="true" className="h-4 w-px bg-white/20" />
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[12px] font-semibold text-white">{locationTitle}</span>
            <span className="hidden truncate text-[10px] text-white/45 xl:inline">{locationSub}</span>
          </div>
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1.5">
            {conflict && (
              <button
                type="button"
                onClick={onOpenMenu}
                className="ll-pill px-2.5 text-amber-200"
                aria-label="Fix sync conflict"
                title="Your device suite differs from your account"
              >
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                <span className="text-[11px] font-semibold">Sync paused</span>
              </button>
            )}
            {syncState === 'error' && !conflict && (
              <button
                type="button"
                onClick={onRetrySync}
                className="ll-pill px-2.5 text-red-200"
                aria-label="Save failed. Retry saving."
                title={syncError ?? 'Saving failed'}
              >
                <CloudOff className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {online && (
              <span className="ll-pill px-2.5 text-white/65" title={`${presence} online`}>
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="text-[10px] font-semibold">{presence}</span>
                <span className="text-[10px] font-semibold">{connectionLabel}</span>
              </span>
            )}
            {partyInvite && (
              <button
                type="button"
                onClick={onOpenPeople}
                className="ll-pill px-2.5 text-white"
                aria-label="Party invitation — open people"
              >
                <Users className="w-4 h-4" aria-hidden="true" />
                <span className="text-[11px] font-semibold">Invite</span>
              </button>
            )}
            <VoiceControl
              voice={voice}
              onCycleRange={onCycleRange}
              onRangeChange={onRangeChange}
              onMicPress={onMicPress}
              onMicRelease={onMicRelease}
              onOpenSettings={onOpenVoiceSettings}
              showLabel
            />
            <button
              type="button"
              onClick={onOpenChat}
              aria-pressed={chatOpen}
              aria-label={chatOpen ? 'Close chat' : 'Open chat'}
              className={cx(
                'll-focus ll-pill w-11 justify-center px-0',
                chatOpen && 'bg-white text-[#15181b]'
              )}
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
            </button>
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                aria-pressed={fullscreen}
                aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                className="ll-focus ll-pill w-11 justify-center px-0 hover:bg-white/15"
              >
                {fullscreen ? (
                  <Minimize2 className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open game menu"
              aria-haspopup="dialog"
              className="ll-focus ll-pill w-11 justify-center px-0 hover:bg-white/15"
            >
              <MenuIcon className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start justify-between gap-2 px-3"
      style={{
        paddingTop: 'calc(var(--ll-safe-top, 0px) + 10px)',
        paddingLeft: 'calc(12px + var(--ll-safe-left, 0px))',
        paddingRight: 'calc(12px + var(--ll-safe-right, 0px))',
      }}
      data-hud="top"
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <div
          className={cx(
            'll-surface flex min-w-0 items-center gap-2.5 rounded-2xl',
            compact ? 'h-11 px-3' : 'px-3.5 py-2'
          )}
        >
          <span className="ll-brand-dot shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              {!compact && (
                <span className="font-display text-[13px] font-bold tracking-tight text-white shrink-0">
                  LoftLife
                </span>
              )}
              <span className="truncate text-[12px] font-semibold leading-tight text-white">
                {locationTitle}
              </span>
            </div>
            {!dense && (
              <div className="flex items-center gap-2 text-[10px] leading-tight text-white/55">
                <span className="truncate">{compact ? locationSub : locationSub}</span>
                {online && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Users className="w-3 h-3" aria-hidden="true" />
                      <span aria-label={`${presence} players online`}>{presence}</span>
                    </span>
                  </>
                )}
                <span
                  className="flex shrink-0 items-center gap-1"
                  title={online ? `Connection: ${connectionLabel}` : 'Playing locally on this device'}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'h-1.5 w-1.5 rounded-full',
                      online && connection === 'connected'
                        ? 'bg-[#6ee787]'
                        : online
                        ? 'bg-amber-300'
                        : 'bg-white/45'
                    )}
                  />
                  {connectionLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
        {conflict ? (
          <button
            type="button"
            onClick={onOpenMenu}
            title="Your device suite differs from your account. Open the menu to choose."
            aria-label="Fix sync conflict"
            className="ll-pill px-2.5 text-amber-200"
          >
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {!compact && <span className="text-[11px] font-semibold">Sync paused</span>}
          </button>
        ) : syncState === 'error' ? (
          <button
            type="button"
            onClick={onRetrySync}
            title={syncError ?? 'Saving to your account failed. Retry.'}
            aria-label="Save failed. Retry saving."
            className="ll-pill px-2.5 text-red-200"
          >
            <CloudOff className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : !compact && syncState !== 'local' ? (
          <span
            className="ll-pill px-2.5 text-white/70"
            title={syncState === 'saving' ? 'Saving to your account' : 'Saved to your account'}
          >
            {syncState === 'saving' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span className="text-[10px] font-semibold">
              {syncState === 'saving' ? 'Saving' : 'Saved'}
            </span>
          </span>
        ) : null}

        {partyInvite && (
          <button
            type="button"
            onClick={onOpenPeople}
            className="ll-pill px-2.5 text-white"
            aria-label="Party invitation — open people"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            {!compact && <span className="text-[11px] font-semibold">Invite</span>}
            <span className="ll-brand-dot" aria-hidden="true" />
          </button>
        )}

        <VoiceControl
          voice={voice}
          onCycleRange={onCycleRange}
          onRangeChange={onRangeChange}
          onMicPress={onMicPress}
          onMicRelease={onMicRelease}
          onOpenSettings={onOpenVoiceSettings}
          showLabel={!compact}
        />

        <button
          type="button"
          onClick={onOpenChat}
          aria-pressed={chatOpen}
          aria-label={chatOpen ? 'Close chat' : 'Open chat'}
          className={cx(
            'll-focus ll-pill relative w-11 justify-center px-0',
            chatOpen && 'bg-white text-[#15181b]'
          )}
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
        </button>

        {installedApp && onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="ll-focus ll-pill w-11 justify-center px-0 hover:bg-white/15"
          >
            {fullscreen ? (
              <Minimize2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open game menu"
          aria-haspopup="dialog"
          className="ll-focus ll-pill w-11 justify-center gap-1.5 px-0 hover:bg-white/15"
        >
          <MenuIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
