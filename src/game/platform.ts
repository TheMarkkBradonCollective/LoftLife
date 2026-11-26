import { useEffect, useState } from 'react';
import { detectPlatform, type PlatformInput } from '../../shared/device-platform.mjs';

export type InputMode = 'keyboard-mouse' | 'touch';

export interface DeviceEnvironment {
  platform: string;
  deviceClass: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  label: string;
  gameplayAllowed: boolean;
  /** HUD selection for the current input. */
  controls: 'keyboard-mouse' | 'touch' | 'none';
  /** Which input the player used last (desktop hybrids can switch live). */
  inputMode: InputMode;
  primaryInput: InputMode | 'none';
  mobileBrowser: boolean;
  androidApp: boolean;
  iosApp: boolean;
  desktop: boolean;
  installed: boolean;
  dashboardAllowed: boolean;
  isTablet: boolean;
  /** Touchscreen plus mouse/keyboard: one HUD at a time, switch as input changes. */
  isHybrid: boolean;
  hasTouch: boolean;
  hasFinePointer: boolean;
  isNativeApp: boolean;
  /** Mobile/tablet runtimes use the reduced renderer budget. */
  lowPowerGraphics: boolean;
}

interface NativeBridge {
  isNative?: boolean;
  platform?: string;
  version?: string;
  minimizeApp?: () => void;
}

interface WindowWithBridges extends Window {
  LoftLifeAndroid?: NativeBridge;
  LoftLifeAndroidApp?: NativeBridge;
  LoftLifeIOSApp?: NativeBridge;
  LoftLifeDesktop?: NativeBridge;
  LoftLifeDesktopApp?: NativeBridge;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  chrome?: { app?: { runtime?: { id?: string } } };
  process?: { versions?: { electron?: string } };
}

function standaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const matches = (query: string) => window.matchMedia?.(query).matches === true;
  return (
    matches('(display-mode: standalone)') ||
    matches('(display-mode: minimal-ui)') ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function media(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.(query).matches === true;
}

/**
 * The last input type the player touched. Module-level so switching screens
 * does not forget it; `resolveDeviceEnvironment` reads it on every call.
 */
let liveInput: InputMode | null = null;

export function reportInputSource(source: InputMode | null): void {
  liveInput = source;
}

/**
 * Read the live runtime. Bridges are checked on every call, so an APK/EXE
 * wrapper that injects after load is picked up by the subscription below.
 */
export function resolveDeviceEnvironment(): DeviceEnvironment {
  if (typeof window === 'undefined') {
    return detectPlatform({}) as DeviceEnvironment;
  }
  const w = window as WindowWithBridges;
  const nav = window.navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
    keyboard?: unknown;
  };
  const capacitorNative = w.Capacitor?.isNativePlatform?.() === true;
  const capacitorPlatform = w.Capacitor?.getPlatform?.();
  const androidBridge =
    w.LoftLifeAndroid?.isNative === true ||
    w.LoftLifeAndroid?.platform === 'android' ||
    Boolean(w.LoftLifeAndroidApp) ||
    (capacitorNative && capacitorPlatform === 'android');
  const iosBridge =
    Boolean(w.LoftLifeIOSApp) || (capacitorNative && capacitorPlatform === 'ios');
  const desktopBridge =
    w.LoftLifeDesktop?.isNative === true ||
    Boolean(w.LoftLifeDesktopApp) ||
    Boolean(w.process?.versions?.electron) ||
    Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__) ||
    w.chrome?.app?.runtime?.id !== undefined;

  const input: PlatformInput = {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    hasTouch: (nav.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window,
    hasFinePointer: media('(pointer: fine)') || media('(any-pointer: fine)'),
    hasCoarsePointer: media('(pointer: coarse)') || media('(any-pointer: coarse)'),
    hasHover: media('(hover: hover)') || media('(any-hover: hover)'),
    keyboardHint: typeof nav.keyboard !== 'undefined',
    standalone: standaloneDisplay(),
    androidApp: androidBridge,
    iosApp: iosBridge,
    desktopApp: desktopBridge,
    chromeApp: w.chrome?.app?.runtime?.id !== undefined,
    explicitMobile: nav.userAgentData?.mobile === true,
  };
  const raw = detectPlatform(input) as DeviceEnvironment;
  const desktopRuntime = raw.deviceClass === 'desktop';

  // A phone/tablet always keeps its touch HUD even with a Bluetooth keyboard.
  // A hybrid desktop switches between both HUDs based on the last input.
  let inputMode: InputMode;
  if (!desktopRuntime) {
    inputMode = 'touch';
  } else if (liveInput === 'touch' && raw.hasTouch) {
    inputMode = 'touch';
  } else if (liveInput === 'keyboard-mouse' && raw.hasFinePointer) {
    inputMode = 'keyboard-mouse';
  } else {
    inputMode = raw.primaryInput === 'touch' ? 'touch' : 'keyboard-mouse';
  }

  return {
    ...raw,
    inputMode,
    controls: raw.gameplayAllowed
      ? desktopRuntime
        ? inputMode
        : 'touch'
      : 'none',
    lowPowerGraphics: raw.deviceClass === 'mobile' || raw.deviceClass === 'tablet',
  };
}

function signature(env: DeviceEnvironment): string {
  return `${env.platform}:${env.label}:${env.controls}:${env.inputMode}:${
    env.gameplayAllowed ? 1 : 0
  }:${env.lowPowerGraphics ? 1 : 0}`;
}

function remember(source: InputMode, update: () => void) {
  liveInput = source;
  update();
}

/**
 * Recheck on input, launch, resize, orientation, display-mode changes, tab
 * focus and app resume. Width alone never changes the classification.
 */
export function useDeviceEnvironment(): DeviceEnvironment {
  const [env, setEnv] = useState<DeviceEnvironment>(() => resolveDeviceEnvironment());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let current = signature(env);
    const update = () => {
      const next = resolveDeviceEnvironment();
      const nextSignature = signature(next);
      if (nextSignature === current) return;
      current = nextSignature;
      setEnv(next);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        remember('touch', update);
      } else if (event.pointerType === 'mouse') {
        remember('keyboard-mouse', update);
      }
    };
    // Pointer events cover real touches and clicks. touchstart is kept for
    // older WebViews, and mousemove lets a hybrid laptop return to keyboard
    // controls as soon as the mouse moves again.
    const onTouchStart = () => remember('touch', update);
    const onKeyDown = () => remember('keyboard-mouse', update);
    const onMouseMove = (event: MouseEvent) => {
      // Compatibility mouse events synthesized from a tap must not flip a
      // hybrid HUD back to keyboard controls right after the player touched.
      const source = (event as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean };
      }).sourceCapabilities;
      if (source?.firesTouchEvents || liveInput === 'keyboard-mouse') return;
      remember('keyboard-mouse', update);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    displayMode?.addEventListener?.('change', update);
    // Native bridges can be injected a moment after the first paint.
    const timer = window.setInterval(update, 750);
    const stopPolling = window.setTimeout(() => window.clearInterval(timer), 5000);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
      displayMode?.removeEventListener?.('change', update);
      window.clearInterval(timer);
      window.clearTimeout(stopPolling);
    };
    // The initial env only seeds the comparison; the subscription is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return env;
}
