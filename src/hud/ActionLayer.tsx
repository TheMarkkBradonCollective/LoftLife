import React, { useEffect, useState } from 'react';
import { ArrowUp, Camera, FastForward, Sparkles } from 'lucide-react';
import { touchInput } from '../game/touchInput';
import { ActionCluster } from './ActionCluster';
import { CameraPopover, EmotePopover } from './popovers';
import { hudShowsActions } from '../../shared/hud-presentation.mjs';
import type { CameraHudState, EmoteHudState, HudAction, HudContextAction, HudState } from './types';

interface ActionLayerProps {
  state: HudState;
  riding: boolean;
  primary: HudContextAction | null;
  side: 'left' | 'right';
  scale: number;
  opacity: number;
  showLabels: boolean;
  columns: 1 | 2;
  /** How far above the bottom edge the popovers open. */
  popoverBottom: number;
  camera: CameraHudState;
  emote: EmoteHudState;
  onJump: () => void;
  /** Phones open a full-width popover instead of a floating card. */
  popoverWide?: boolean;
}

/**
 * Composes the in-game action layer: sprint/jump/emote/camera plus whatever
 * contextual action is currently in reach. It owns no game rules — every
 * callback is the same one the keyboard and the viewport use.
 */
export const ActionLayer: React.FC<ActionLayerProps> = ({
  state,
  riding,
  primary,
  side,
  scale,
  opacity,
  showLabels,
  columns,
  popoverBottom,
  camera,
  emote,
  onJump,
  popoverWide = false,
}) => {
  const [sprint, setSprint] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);

  // Leaving exploration (chat, menu, editing, vehicle) drops every held input.
  useEffect(() => {
    if (state === 'exploration' || state === 'nearby') return;
    setSprint(false);
    touchInput.sprint = false;
    setCameraOpen(false);
    setEmoteOpen(false);
  }, [state]);

  useEffect(() => {
    if (!hudShowsActions(state)) {
      setCameraOpen(false);
      setEmoteOpen(false);
    }
  }, [state]);

  useEffect(
    () => () => {
      touchInput.sprint = false;
    },
    []
  );

  if (!hudShowsActions(state)) return null;

  const actions: HudAction[] = [];
  if (!riding) {
    actions.push(
      {
        id: 'camera',
        label: 'Camera',
        icon: <Camera />,
        onPress: () => {
          setEmoteOpen(false);
          setCameraOpen((open) => !open);
        },
        pressed: cameraOpen,
        hint: 'Follow, zoom and view',
      },
      {
        id: 'emote',
        label: 'Emote',
        icon: <Sparkles />,
        onPress: () => {
          setCameraOpen(false);
          setEmoteOpen((open) => !open);
        },
        pressed: emoteOpen,
        hint: 'Wave, dance, cheer',
      },
      {
        id: 'sprint',
        label: sprint ? 'Sprint on' : 'Sprint',
        icon: <FastForward />,
        onPress: () => {
          const next = !sprint;
          setSprint(next);
          touchInput.sprint = next;
        },
        pressed: sprint,
        hint: 'Move faster while walking',
      },
      {
        id: 'jump',
        label: 'Jump',
        icon: <ArrowUp />,
        onPress: onJump,
      }
    );
  } else {
    actions.push({
      id: 'camera',
      label: 'Camera',
      icon: <Camera />,
      onPress: () => setCameraOpen((open) => !open),
      pressed: cameraOpen,
    });
  }

  const sideEdge = side === 'left' ? 'left' : 'right';

  return (
    <>
      <ActionCluster
        primary={primary}
        actions={actions}
        side={side}
        scale={scale}
        opacity={opacity}
        showLabels={showLabels}
        columns={columns}
      />
      <CameraPopover
        open={cameraOpen}
        side={sideEdge}
        bottom={popoverBottom}
        camera={camera}
        onClose={() => setCameraOpen(false)}
        touch
        wide={popoverWide}
      />
      <EmotePopover
        open={emoteOpen}
        side={sideEdge}
        bottom={popoverBottom}
        emote={emote}
        onClose={() => setEmoteOpen(false)}
        wide={popoverWide}
      />
    </>
  );
};
