import React from 'react';
import { TopHud, type TopHudProps } from '../TopHud';
import type { HudState } from '../types';

interface DesktopHudProps {
  presentation: 'desktop-browser' | 'desktop-app';
  state: HudState;
  top: TopHudProps;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * Desktop gameplay HUD: keyboard and mouse first.
 *
 * There are no on-screen gameplay buttons on desktop. Keyboard and mouse
 * handle movement, camera and actions; the top bar remains for navigation.
 */
export const DesktopHud: React.FC<DesktopHudProps> = ({
  presentation,
  state,
  top,
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
  </>
);
