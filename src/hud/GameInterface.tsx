import React, { useMemo } from 'react';
import {
  ArrowUp,
  DoorOpen,
  Hand,
  KeyRound,
  LogOut,
  MessageCircle,
  Power,
  Armchair,
} from 'lucide-react';
import { Notifications } from './Notifications';
import { BuildPanel } from './BuildPanel';
import { DesktopHud } from './layouts/DesktopHud';
import { TouchHud } from './layouts/TouchHud';
import { useHudPresentation } from './presentation';
import {
  contextActionVerb,
  hudShowsActions,
  hudStateFor,
  parseContextPrompt,
} from '../../shared/hud-presentation.mjs';
import type { DeviceEnvironment } from '../game/platform';
import type { VoiceSnapshot } from '../session';
import type { TouchLayoutPreferences } from '../net/api';
import type {
  BuildController,
  CameraHudState,
  EmoteHudState,
  HudContextAction,
  HudState,
} from './types';

function contextIcon(kind: string) {
  switch (kind) {
    case 'sit':
      return <Armchair />;
    case 'stand':
      return <ArrowUp />;
    case 'toggle':
      return <Power />;
    case 'talk':
      return <MessageCircle />;
    case 'exit':
      return <LogOut />;
    case 'enter':
      return <DoorOpen />;
    case 'key':
      return <KeyRound />;
    case 'open':
      return <Hand />;
    default:
      return <Hand />;
  }
}

export interface GameInterfaceProps {
  device: DeviceEnvironment;
  portrait: boolean;
  menuOpen: boolean;
  chatOpen: boolean;
  editing: boolean;
  riding: boolean;
  nearbyLabel: string | null;

  locationTitle: string;
  locationSub: string;
  presence: number;
  connection: string;
  online: boolean;
  syncState: 'local' | 'saving' | 'synced' | 'error';
  syncError: string | null;
  conflict: boolean;
  partyInvite: boolean;

  voice: VoiceSnapshot;
  layout: TouchLayoutPreferences;
  camera: CameraHudState;
  emote: EmoteHudState;
  build: BuildController | null;

  hint: string | null;
  npcChat: { speaker: string; message: string } | null;
  onDismissNpc: () => void;

  onOpenMenu: () => void;
  onOpenChat: () => void;
  onOpenPeople: () => void;
  onRetrySync: () => void;
  onCycleRange: () => void;
  onRangeChange: (range: VoiceSnapshot['range']) => void;
  onMicPress: () => void;
  onMicRelease: () => void;
  onOpenVoiceSettings: () => void;
  onInteract: () => void;
  onJump: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * The entire in-game HUD. It is the only component that knows about all five
 * HUD systems, and it delegates each one: presentation → layout, state →
 * visibility, actions → ActionLayer, building → BuildPanel.
 */
export const GameInterface: React.FC<GameInterfaceProps> = ({
  device,
  portrait,
  menuOpen,
  chatOpen,
  editing,
  riding,
  nearbyLabel,
  locationTitle,
  locationSub,
  presence,
  connection,
  online,
  syncState,
  syncError,
  conflict,
  partyInvite,
  voice,
  layout,
  camera,
  emote,
  build,
  hint,
  npcChat,
  onDismissNpc,
  onOpenMenu,
  onOpenChat,
  onOpenPeople,
  onRetrySync,
  onCycleRange,
  onRangeChange,
  onMicPress,
  onMicRelease,
  onOpenVoiceSettings,
  onInteract,
  onJump,
  fullscreen,
  onToggleFullscreen,
}) => {
  const presentation = useHudPresentation(device, portrait);
  const state: HudState = hudStateFor({ menuOpen, chatOpen, editing, riding, nearby: Boolean(nearbyLabel) });
  const context = useMemo(() => parseContextPrompt(nearbyLabel), [nearbyLabel]);

  const primary: HudContextAction | null =
    context && hudShowsActions(state)
      ? {
          id: `action:${context.label}`,
          label: context.label,
          verb: contextActionVerb(context.kind),
          icon: contextIcon(context.kind),
          onPress: onInteract,
          hint: context.keyHint ?? undefined,
        }
      : null;

  const top = {
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
    compact: false,
    dense: false,
    onOpenMenu,
    onOpenChat,
    onOpenPeople,
    onRetrySync,
    onCycleRange,
    onRangeChange,
    onMicPress,
    onMicRelease,
    onOpenVoiceSettings,
  };

  const touch = presentation.startsWith('mobile') || presentation.startsWith('tablet');

  return (
    <>
      {state !== 'menu' &&
        (touch ? (
          <TouchHud
            presentation={presentation}
            state={state}
            layout={layout}
            top={top}
            camera={camera}
            emote={emote}
            primary={primary}
            onJump={onJump}
            onOpenSocial={(intent) => (intent === 'chat' ? onOpenChat() : onOpenPeople())}
            socialBadge={partyInvite}
          />
        ) : (
          <DesktopHud
            presentation={presentation as 'desktop-browser' | 'desktop-app'}
            top={top}
            fullscreen={fullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        ))}

      {editing && build && (
        <BuildPanel build={build} presentation={presentation} touch={touch} />
      )}

      <Notifications
        hint={hint}
        npcChat={npcChat}
        onDismissNpc={onDismissNpc}
        offset={state === 'menu' ? 'none' : 'hud'}
      />
    </>
  );
};
