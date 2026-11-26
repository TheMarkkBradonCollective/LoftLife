import React from 'react';
import { ActionLayer } from '../ActionLayer';
import { TopHud, type TopHudProps } from '../TopHud';
import type { CameraHudState, EmoteHudState, HudContextAction, HudState } from '../types';

interface DesktopHudProps {
  presentation: 'desktop-browser' | 'desktop-app';
  state: HudState;
  top: TopHudProps;
  camera: CameraHudState;
  emote: EmoteHudState;
  primary: HudContextAction | null;
  onJump: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * Desktop gameplay HUD: keyboard and mouse first.
 *
 * There is deliberately no joystick, no touch camera strip and no touch-size
 * control. A compact action cluster handles emotes/camera and the contextual
 * action, while the world keeps almost the entire screen.
 */
export const DesktopHud: React.FC<DesktopHudProps> = ({
  presentation,
  state,
  top,
  camera,
  emote,
  primary,
  onJump,
  fullscreen,
  onToggleFullscreen,
}) => (
  <>
    <TopHud
      {...top}
      compact={false}
      dense={false}
      installedApp={presentation === 'desktop-app'}
      appBar={presentation === 'desktop-app'}
      fullscreen={fullscreen}
      onToggleFullscreen={onToggleFullscreen}
    />
    <ActionLayer
      state={state}
      riding={state === 'vehicle'}
      primary={primary}
      side="right"
      scale={presentation === 'desktop-app' ? 1.04 : 1}
      opacity={1}
      showLabels
      columns={1}
      popoverBottom={150}
      camera={camera}
      emote={emote}
      onJump={onJump}
    />
  </>
);
