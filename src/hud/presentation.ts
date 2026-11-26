import { useMemo } from 'react';
import { HUD_PRESENTATION_INFO, resolveHudPresentation } from '../../shared/hud-presentation.mjs';
import type { DeviceEnvironment } from '../game/platform';
import type { HudPresentation } from './types';

/**
 * Resolve the HUD presentation from the runtime environment + orientation.
 * Pure inputs, so a hybrid laptop can switch live without losing camera state.
 */
export function useHudPresentation(
  device: Pick<DeviceEnvironment, 'deviceClass' | 'installed' | 'controls'>,
  portrait: boolean
): HudPresentation {
  return useMemo(
    () =>
      resolveHudPresentation({
        deviceClass: device.deviceClass,
        touch: device.controls === 'touch',
        installed: device.installed,
        portrait,
      }) as HudPresentation,
    [device.deviceClass, device.controls, device.installed, portrait]
  );
}

export function presentationInfo(presentation: HudPresentation) {
  return HUD_PRESENTATION_INFO[presentation];
}

/** Numeric tween used by interactive feedback, collapsed by reduced motion. */
export function quickTransition(reduceMotion: boolean) {
  return reduceMotion ? { duration: 0.001 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] };
}
