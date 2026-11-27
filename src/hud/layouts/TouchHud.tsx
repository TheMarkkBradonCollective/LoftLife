import React from 'react';
import { Map, MessageCircle, Users } from 'lucide-react';
import { Joystick } from '../Joystick';
import { ActionLayer } from '../ActionLayer';
import { TopHud, type TopHudProps } from '../TopHud';
import { hudShowsMovement } from '../../../shared/hud-presentation.mjs';
import type {
  CameraHudState,
  EmoteHudState,
  HudContextAction,
  HudPresentation,
  HudState,
} from '../types';
import type { TouchLayoutPreferences } from '../../net/api';
import type { ViewMode } from '../../game/types';

interface TouchHudProps {
  presentation: HudPresentation;
  viewMode: ViewMode;
  state: HudState;
  layout: TouchLayoutPreferences;
  top: TopHudProps;
  camera: CameraHudState;
  emote: EmoteHudState;
  primary: HudContextAction | null;
  onJump: () => void;
  onOpenSocial: (intent: 'chat' | 'people') => void;
  socialBadge: boolean;
}

/**
 * Touch gameplay HUD.
 *
 * Third-person movement lives in one thumb's corner. Isometric movement is
 * tap-to-walk directly on the world, leaving the play surface unobstructed.
 * Camera gestures stay on the world itself, and contextual actions sit in the
 * opposite corner. Tablets get wider spacing, labels and a small social rail;
 * phones stay icon-first. Handedness mirrors the third-person arrangement.
 */
export const TouchHud: React.FC<TouchHudProps> = ({
  presentation,
  viewMode,
  state,
  layout,
  top,
  camera,
  emote,
  primary,
  onJump,
  onOpenSocial,
  socialBadge,
}) => {
  const tablet = presentation === 'tablet-portrait' || presentation === 'tablet-landscape';
  const landscapePhone = presentation === 'mobile-landscape';
  const portraitPhone = presentation === 'mobile-portrait';

  const requested = layout.size === 'sm' ? 0.88 : layout.size === 'lg' ? 1.12 : 1;
  const scale = tablet ? Math.min(requested, 1.08) : landscapePhone ? Math.min(requested, 0.92) : requested;
  const opacity = Math.max(0.55, Math.min(1, layout.opacity / 100));

  const leftHanded = layout.handedness === 'left';
  const stickSide: 'left' | 'right' = leftHanded ? 'right' : 'left';
  const actionSide: 'left' | 'right' = leftHanded ? 'left' : 'right';

  const columns: 1 | 2 = landscapePhone ? 2 : 1;
  const labels = tablet || (!portraitPhone && !landscapePhone);
  const popoverBottom = tablet ? 330 : portraitPhone ? 110 : 84;
  const popoverWide = portraitPhone || landscapePhone;

  return (
    <>
      <TopHud {...top} compact={!tablet} dense={landscapePhone} />

      {/* Isometric uses tap-to-walk; never cover the world with a movement stick. */}
      {viewMode !== 'isometric' && hudShowsMovement(state) && (
        <Joystick
          side={stickSide}
          scale={scale}
          opacity={opacity}
          label="Move"
        />
      )}

      <ActionLayer
        state={state}
        viewMode={viewMode}
        riding={state === 'vehicle'}
        primary={primary}
        side={actionSide}
        scale={scale}
        opacity={opacity}
        showLabels={labels}
        columns={columns}
        popoverBottom={popoverBottom}
        popoverWide={popoverWide}
        camera={camera}
        emote={emote}
        onJump={onJump}
      />

      {/* Tablets have room for a compact social rail without covering the world. */}
      {tablet && (state === 'exploration' || state === 'nearby') && (
        <nav
          aria-label="Social shortcuts"
          className="fixed z-40 flex flex-col gap-2"
          style={{
            [stickSide]: `calc(16px + var(--ll-safe-${stickSide}, 0px))`,
            bottom: 'calc(210px + var(--ll-safe-bottom, 0px))',
          }}
        >
          <button
            type="button"
            onClick={() => onOpenSocial('chat')}
            aria-label="Open nearby chat"
            className="ll-focus ll-surface relative flex h-11 w-11 items-center justify-center rounded-xl text-white"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            {socialBadge && (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#6ee787] ring-2 ring-[#161a1f]"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => onOpenSocial('people')}
            aria-label="Open people and friends"
            className="ll-focus ll-surface flex h-11 w-11 items-center justify-center rounded-xl text-white"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={top.onOpenMenu}
            aria-label="Open map"
            className="ll-focus ll-surface flex h-11 w-11 items-center justify-center rounded-xl text-white"
          >
            <Map className="w-4 h-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </>
  );
};
