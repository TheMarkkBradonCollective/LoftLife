import { useEffect, useState } from 'react';
import { detectPlatform, type PlatformInput } from '../../shared/device-platform.mjs';

export interface DeviceEnvironment {
  platform: string;
  label: string;
  gameplayAllowed: boolean;
  controls: 'keyboard-mouse' | 'touch' | 'none';
  mobileBrowser: boolean;
  androidApp: boolean;
  desktop: boolean;
  installed: boolean;
  dashboardAllowed: boolean;
}

interface NativeBridge {
  isNative?: boolean;
  platform?: string;
  version?: string;
}

interface WindowWithBridges extends Window {
  LoftLifeAndroid?: NativeBridge;
  LoftLifeDesktop?: NativeBridge;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
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

/**
 * Read the live runtime. Bridges are checked on every call, so an APK/EXE
 * wrapper that injects after load is picked up by the subscription below.
 */
export function resolveDeviceEnvironment(): DeviceEnvironment {
  if (typeof window === 'undefined') {
    return detectPlatform({}) as DeviceEnvironment;
  }
  const w = window as WindowWithBridges;
  const nav = window.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const capacitorNative = w.Capacitor?.isNativePlatform?.() === true;
  const capacitorPlatform = w.Capacitor?.getPlatform?.();
  const androidBridge =
    w.LoftLifeAndroid?.isNative === true ||
    w.LoftLifeAndroid?.platform === 'android' ||
    (capacitorNative && capacitorPlatform === 'android');
  const desktopBridge =
    w.LoftLifeDesktop?.isNative === true ||
    Boolean(w.process?.versions?.electron) ||
    Boolean(w.__TAURI_INTERNALS__) ||
    w.chrome?.app?.runtime?.id !== undefined;

  const input: PlatformInput = {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    hasCoarsePointer: window.matchMedia?.('(pointer: coarse)').matches === true,
    hasHover: window.matchMedia?.('(hover: hover)').matches === true,
    standalone: standaloneDisplay(),
    androidApp: androidBridge,
    desktopApp: desktopBridge,
    chromeApp: w.chrome?.app?.runtime?.id !== undefined,
    explicitMobile: nav.userAgentData?.mobile === true,
  };
  return detectPlatform(input) as DeviceEnvironment;
}

function signature(env: DeviceEnvironment): string {
  return `${env.platform}:${env.controls}:${env.gameplayAllowed ? 1 : 0}`;
}

/**
 * Recheck on launch, resize, orientation, display-mode changes, tab focus and
 * app resume. Width alone never changes the classification.
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
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    displayMode?.addEventListener?.('change', update);
    // Native bridges can be injected a moment after the first paint.
    const timer = window.setInterval(update, 400);
    const stopPolling = window.setTimeout(() => window.clearInterval(timer), 4000);
    return () => {
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
