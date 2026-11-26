/**
 * Runtime platform and input recognition.
 *
 * The HUD, camera and movement systems must agree on three separate questions:
 *   1. Where is the game running? (desktop web, installed desktop, Windows EXE,
 *      Android APK, iOS app, mobile browser, tablet)
 *   2. What can the device do? (touch, mouse/trackpad, hover, keyboard)
 *   3. Which input is the player actually using right now? (touch vs keyboard/mouse)
 *
 * Screen width is deliberately *not* used to pick the interface. A narrow
 * desktop window keeps the keyboard/mouse HUD; a tablet in landscape is still a
 * touch device. Width only contributes to tablet classification for touch-only
 * devices whose user agent lies, and even then never flips a desktop to mobile.
 *
 * Detection is split into a pure builder (`buildDeviceProfile`) and a browser
 * reader (`readRuntimeEnvironment`) so the classification table can be checked
 * without a device farm.
 */

export type RuntimePlatform =
  | 'desktop-web'
  | 'desktop-installed'
  | 'windows-exe'
  | 'android-apk'
  | 'ios-app'
  | 'android-web'
  | 'ios-web'
  | 'mobile-web';

export type DeviceClass = 'desktop' | 'mobile' | 'tablet';

export type InputMode = 'keyboard-mouse' | 'touch';

export type InputSource = 'touch' | 'mouse' | 'keyboard';

export type DisplayMode =
  | 'browser'
  | 'minimal-ui'
  | 'standalone'
  | 'fullscreen'
  | 'window-controls-overlay';

export interface InputCapabilities {
  /** Any touchscreen at all (phones, tablets, touch laptops). */
  hasTouch: boolean;
  /** A precise pointer (mouse, trackpad, some pens). */
  hasFinePointer: boolean;
  hasCoarsePointer: boolean;
  hasHover: boolean;
  /** A keyboard is plausible; phones only report true with an attached one. */
  hasKeyboard: boolean;
  maxTouchPoints: number;
}

export interface DeviceProfile {
  platform: RuntimePlatform;
  deviceClass: DeviceClass;
  /** Human readable runtime label, e.g. "LoftLife Android app". */
  label: string;
  isNativeApp: boolean;
  isInstalledApp: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isWindows: boolean;
  isMobileBrowser: boolean;
  isTablet: boolean;
  /** Touchscreen plus mouse/keyboard: support both, show one HUD at a time. */
  isHybrid: boolean;
  displayMode: DisplayMode;
  capabilities: InputCapabilities;
  /** Input used for the current frame/HUD. Changes as the player switches. */
  inputMode: InputMode;
  /** Best guess before the player touches anything. */
  primaryInput: InputMode;
  orientation: 'portrait' | 'landscape';
  /** Mobile/tablet runtime: use reduced renderer settings. */
  lowPowerGraphics: boolean;
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
}

export interface RuntimeEnvironment {
  userAgent: string;
  /** User-Agent Client Hints `mobile`, when the browser exposes it. */
  uaMobile: boolean | null;
  platform: string;
  maxTouchPoints: number;
  touchEventSupported: boolean;
  finePointer: boolean;
  anyFinePointer: boolean;
  coarsePointer: boolean;
  anyCoarsePointer: boolean;
  hover: boolean;
  anyHover: boolean;
  displayMode: DisplayMode;
  /** iOS Safari's non-standard installed flag. */
  standaloneNavigator: boolean;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  orientation: 'portrait' | 'landscape';
  keyboardHint: boolean;
  capacitorPlatform: string | null;
  cordova: boolean;
  electron: boolean;
  tauri: boolean;
  loftLifeAndroidApp: boolean;
  loftLifeIOSApp: boolean;
  loftLifeDesktopApp: boolean;
}

interface UADataLike {
  mobile?: boolean;
  platform?: string;
}

interface NativeBridgeWindow {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
    Plugins?: Record<string, unknown>;
  };
  cordova?: unknown;
  electronAPI?: unknown;
  process?: { versions?: { electron?: string } };
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  LoftLifeAndroidApp?: unknown;
  LoftLifeIOSApp?: unknown;
  LoftLifeDesktopApp?: unknown;
}

const MOBILE_USER_AGENT =
  /Android|iPhone|iPod|iPad|Windows Phone|Mobile|Silk|Kindle|Opera Mini|IEMobile/i;
const TABLET_USER_AGENT = /iPad|Tablet|PlayBook|Silk/i;
const DESKTOP_OS = /Windows|Macintosh|Mac OS X|Linux|CrOS/i;

function safeMatchMedia(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function readDisplayMode(standaloneNavigator: boolean): DisplayMode {
  if (standaloneNavigator) return 'standalone';
  if (safeMatchMedia('(display-mode: fullscreen)')) return 'fullscreen';
  if (safeMatchMedia('(display-mode: window-controls-overlay)')) return 'window-controls-overlay';
  if (safeMatchMedia('(display-mode: standalone)')) return 'standalone';
  if (safeMatchMedia('(display-mode: minimal-ui)')) return 'minimal-ui';
  return 'browser';
}

/** Snapshot of the browser/host environment. Pure data, safe to fabricate. */
export function readRuntimeEnvironment(): RuntimeEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      userAgent: '',
      uaMobile: null,
      platform: '',
      maxTouchPoints: 0,
      touchEventSupported: false,
      finePointer: false,
      anyFinePointer: false,
      coarsePointer: false,
      anyCoarsePointer: false,
      hover: false,
      anyHover: false,
      displayMode: 'browser',
      standaloneNavigator: false,
      screenWidth: 1280,
      screenHeight: 800,
      viewportWidth: 1280,
      viewportHeight: 800,
      orientation: 'landscape',
      keyboardHint: true,
      capacitorPlatform: null,
      cordova: false,
      electron: false,
      tauri: false,
      loftLifeAndroidApp: false,
      loftLifeIOSApp: false,
      loftLifeDesktopApp: false,
    };
  }

  const nav = navigator as Navigator & {
    userAgentData?: UADataLike;
    standalone?: boolean;
    keyboard?: unknown;
    platform?: string;
    maxTouchPoints?: number;
  };
  const win = window as unknown as NativeBridgeWindow & Window;
  const userAgent = nav.userAgent ?? '';
  const platform = nav.platform ?? '';
  const screenWidth = window.screen?.width ?? window.innerWidth;
  const screenHeight = window.screen?.height ?? window.innerHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const screenOrientation = window.screen?.orientation?.type;
  // The HUD adapts to the space it actually has: viewport aspect first, with
  // screen.orientation only breaking ties (some WebViews report stale values).
  const orientation: 'portrait' | 'landscape' =
    viewportWidth === viewportHeight
      ? screenOrientation?.startsWith('portrait')
        ? 'portrait'
        : 'landscape'
      : viewportHeight > viewportWidth
      ? 'portrait'
      : 'landscape';
  const standaloneNavigator = nav.standalone === true;
  const capacitorPlatform = win.Capacitor?.getPlatform?.() ?? null;

  return {
    userAgent,
    uaMobile:
      typeof nav.userAgentData?.mobile === 'boolean' ? nav.userAgentData.mobile : null,
    platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    touchEventSupported: 'ontouchstart' in window,
    finePointer: safeMatchMedia('(pointer: fine)'),
    anyFinePointer: safeMatchMedia('(any-pointer: fine)'),
    coarsePointer: safeMatchMedia('(pointer: coarse)'),
    anyCoarsePointer: safeMatchMedia('(any-pointer: coarse)'),
    hover: safeMatchMedia('(hover: hover)'),
    anyHover: safeMatchMedia('(any-hover: hover)'),
    displayMode: readDisplayMode(standaloneNavigator),
    standaloneNavigator,
    screenWidth,
    screenHeight,
    viewportWidth,
    viewportHeight,
    orientation,
    keyboardHint: typeof nav.keyboard !== 'undefined',
    capacitorPlatform:
      capacitorPlatform && capacitorPlatform !== 'web' ? capacitorPlatform : null,
    cordova: Boolean(win.cordova),
    electron: Boolean(win.process?.versions?.electron) || /Electron/i.test(userAgent),
    tauri: Boolean(win.__TAURI_INTERNALS__ || win.__TAURI__),
    loftLifeAndroidApp: Boolean(win.LoftLifeAndroidApp),
    loftLifeIOSApp: Boolean(win.LoftLifeIOSApp),
    loftLifeDesktopApp: Boolean(win.LoftLifeDesktopApp),
  };
}

function buildCapabilities(environment: RuntimeEnvironment): InputCapabilities {
  const maxTouchPoints = environment.maxTouchPoints;
  const hasTouch = maxTouchPoints > 0 || environment.touchEventSupported;
  const hasFinePointer = environment.finePointer || environment.anyFinePointer;
  const hasCoarsePointer =
    environment.coarsePointer || environment.anyCoarsePointer || (hasTouch && !hasFinePointer);
  const hasHover = environment.hover || environment.anyHover;
  const desktopUserAgent =
    DESKTOP_OS.test(environment.userAgent) && !MOBILE_USER_AGENT.test(environment.userAgent);
  const hasKeyboard = environment.keyboardHint || hasFinePointer || desktopUserAgent;

  return {
    hasTouch,
    hasFinePointer,
    hasCoarsePointer,
    hasHover,
    hasKeyboard,
    maxTouchPoints,
  };
}

function resolvePrimaryInput(capabilities: InputCapabilities): InputMode {
  if (capabilities.hasFinePointer && capabilities.hasHover) return 'keyboard-mouse';
  if (capabilities.hasCoarsePointer && !capabilities.hasFinePointer) return 'touch';
  if (capabilities.hasTouch && !capabilities.hasFinePointer) return 'touch';
  return 'keyboard-mouse';
}

function resolveInputMode(
  capabilities: InputCapabilities,
  primaryInput: InputMode,
  requested: InputMode | null
): InputMode {
  if (!requested) return primaryInput;
  if (requested === 'touch') return capabilities.hasTouch ? 'touch' : primaryInput;
  // Keyboard/mouse only when a precise pointer exists. A phone with a Bluetooth
  // keyboard keeps its touch HUD so movement is never lost.
  return capabilities.hasFinePointer ? 'keyboard-mouse' : primaryInput;
}

function isTabletRuntime(
  environment: RuntimeEnvironment,
  capabilities: InputCapabilities
): boolean {
  const userAgent = environment.userAgent;
  if (/iPad/i.test(userAgent)) return true;
  // iPadOS 13+ reports a Macintosh user agent but exposes multiple touch points.
  if (/Macintosh|MacIntel/i.test(`${userAgent} ${environment.platform}`) &&
    capabilities.maxTouchPoints > 1) {
    return true;
  }
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return true;
  if (TABLET_USER_AGENT.test(userAgent)) return true;
  // Last resort for touch-only devices with a large physical screen, never used
  // for devices that also have a mouse/trackpad. Both dimensions are checked so
  // a tall phone (e.g. 412 x 915) is not mistaken for a tablet.
  const shortSide = Math.min(environment.screenWidth, environment.screenHeight);
  const longSide = Math.max(environment.screenWidth, environment.screenHeight);
  return (
    !capabilities.hasFinePointer &&
    capabilities.hasTouch &&
    shortSide >= 600 &&
    longSide >= 900
  );
}

/** Pure classification: environment snapshot -> runtime profile. */
export function buildDeviceProfile(
  environment: RuntimeEnvironment,
  requestedInputMode: InputMode | null = null
): DeviceProfile {
  const capabilities = buildCapabilities(environment);
  const userAgent = environment.userAgent;
  // A desktop operating system in the UA wins over a mobile Client Hint: a
  // Windows/Mac/Linux touchscreen is a hybrid desktop, not a phone (and some
  // embedded browsers report `mobile: true` on touch laptops).
  const desktopUserAgent =
    /Windows NT|Macintosh|Mac OS X|X11|CrOS/i.test(userAgent) &&
    !/Mobile|Android|iPhone|iPad|Tablet|Silk|Kindle/i.test(userAgent);
  const uaMobile =
    !desktopUserAgent &&
    (environment.uaMobile === true ||
      (MOBILE_USER_AGENT.test(userAgent) && !/iPad|Tablet/i.test(userAgent)));
  // iPadOS 13+ masquerades as desktop Safari: Macintosh UA plus touch points.
  // Desktop Chrome/Edge/Firefox on a touchscreen Mac must stay a desktop, so
  // only Safari-like user agents are treated as iPadOS.
  const isMacLike = /Macintosh|MacIntel/i.test(`${userAgent} ${environment.platform}`);
  const isSafariLike =
    /Safari\//i.test(userAgent) &&
    /Version\//i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(userAgent);
  const isIPadOS = isMacLike && isSafariLike && capabilities.maxTouchPoints > 1;
  const isIOSUserAgent = /iPhone|iPod|iPad/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent) || environment.capacitorPlatform === 'android';
  const isIPhone = /iPhone|iPod/i.test(userAgent) || environment.capacitorPlatform === 'ios';
  const isTablet = isTabletRuntime(environment, capabilities);
  const isWindows = /Windows/i.test(userAgent) || /^Win/i.test(environment.platform);

  const packagedAndroid =
    environment.loftLifeAndroidApp ||
    environment.capacitorPlatform === 'android' ||
    (environment.cordova && isAndroid);
  const packagedIOS =
    environment.loftLifeIOSApp ||
    environment.capacitorPlatform === 'ios' ||
    (environment.cordova && isIPhone);
  const packagedDesktop =
    environment.loftLifeDesktopApp || environment.electron || environment.tauri;

  let platform: RuntimePlatform;
  let deviceClass: DeviceClass;

  if (packagedAndroid) {
    platform = 'android-apk';
    deviceClass = isTablet ? 'tablet' : 'mobile';
  } else if (packagedIOS) {
    platform = 'ios-app';
    deviceClass = isTablet ? 'tablet' : 'mobile';
  } else if (packagedDesktop) {
    platform = isWindows ? 'windows-exe' : 'desktop-installed';
    deviceClass = 'desktop';
  } else if (isIPadOS || isIOSUserAgent) {
    platform = 'ios-web';
    deviceClass = isTablet ? 'tablet' : 'mobile';
  } else if (isAndroid) {
    platform = 'android-web';
    deviceClass = isTablet ? 'tablet' : 'mobile';
  } else if (uaMobile || (isTablet && !desktopUserAgent)) {
    platform = 'mobile-web';
    deviceClass = isTablet ? 'tablet' : 'mobile';
  } else {
    deviceClass = 'desktop';
    platform = environment.displayMode === 'browser' ? 'desktop-web' : 'desktop-installed';
  }

  const label = (() => {
    switch (platform) {
      case 'windows-exe':
        return 'Windows desktop app';
      case 'desktop-installed':
        return 'Installed desktop app';
      case 'android-apk':
        return 'LoftLife Android app';
      case 'ios-app':
        return 'LoftLife iOS app';
      case 'android-web':
        return deviceClass === 'tablet' ? 'Android tablet browser' : 'Android mobile browser';
      case 'ios-web':
        return deviceClass === 'tablet' ? 'iPad browser' : 'iOS mobile browser';
      case 'mobile-web':
        return deviceClass === 'tablet' ? 'Tablet browser' : 'Mobile browser';
      case 'desktop-web':
      default:
        return 'Desktop browser';
    }
  })();

  const primaryInput = resolvePrimaryInput(capabilities);
  const inputMode = resolveInputMode(capabilities, primaryInput, requestedInputMode);

  return {
    platform,
    deviceClass,
    label,
    isNativeApp: packagedAndroid || packagedIOS || packagedDesktop,
    isInstalledApp:
      packagedAndroid || packagedIOS || packagedDesktop || environment.displayMode !== 'browser',
    isAndroid,
    isIOS: isIPhone || isIPadOS || isIOSUserAgent,
    isWindows,
    isMobileBrowser:
      platform === 'android-web' || platform === 'ios-web' || platform === 'mobile-web',
    isTablet,
    isHybrid: capabilities.hasTouch && capabilities.hasFinePointer,
    displayMode: environment.displayMode,
    capabilities,
    inputMode,
    primaryInput,
    orientation: environment.orientation,
    lowPowerGraphics: deviceClass !== 'desktop',
    viewport: { width: environment.viewportWidth, height: environment.viewportHeight },
    screen: { width: environment.screenWidth, height: environment.screenHeight },
  };
}

// ---------------------------------------------------------------------------
// Live profile: module singleton so the render loop and React share one view.
// ---------------------------------------------------------------------------

type ProfileListener = (profile: DeviceProfile) => void;

const listeners = new Set<ProfileListener>();
let cachedProfile: DeviceProfile | null = null;
let requestedInputMode: InputMode | null = null;
let lastSignature = '';
let detachGlobalListeners: (() => void) | null = null;
let refreshFrame = 0;

function applyDocumentAttributes(profile: DeviceProfile) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.loftPlatform = profile.platform;
  root.dataset.loftDevice = profile.deviceClass;
  root.dataset.loftInput = profile.inputMode;
  root.dataset.loftOrientation = profile.orientation;
  root.dataset.loftDisplay = profile.displayMode;
}

function profileSignature(profile: DeviceProfile): string {
  return [
    profile.platform,
    profile.deviceClass,
    profile.inputMode,
    profile.orientation,
    profile.displayMode,
    profile.viewport.width,
    profile.viewport.height,
    profile.capabilities.hasTouch ? 'touch' : 'no-touch',
    profile.capabilities.hasFinePointer ? 'fine' : 'coarse-only',
  ].join('|');
}

function refreshProfile() {
  const profile = buildDeviceProfile(readRuntimeEnvironment(), requestedInputMode);
  const signature = profileSignature(profile);
  cachedProfile = profile;
  applyDocumentAttributes(profile);
  if (signature === lastSignature) return;
  lastSignature = signature;
  for (const listener of listeners) listener(profile);
}

function scheduleRefresh() {
  if (typeof window === 'undefined') return;
  if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
  refreshFrame = window.requestAnimationFrame(() => {
    refreshFrame = 0;
    refreshProfile();
  });
}

/** Latest profile. Reads the environment again if nothing has been cached yet. */
export function getDeviceProfile(): DeviceProfile {
  if (cachedProfile) return cachedProfile;
  cachedProfile = buildDeviceProfile(readRuntimeEnvironment(), requestedInputMode);
  lastSignature = profileSignature(cachedProfile);
  applyDocumentAttributes(cachedProfile);
  return cachedProfile;
}

/**
 * Record what the player just used. Touch input wins while it is in use, then a
 * real mouse movement or keypress hands the HUD back to keyboard/mouse without
 * touching the camera, movement or game state.
 */
export function reportInputSource(source: InputSource) {
  const profile = getDeviceProfile();
  let next: InputMode | null = null;

  if (source === 'touch') {
    if (profile.capabilities.hasTouch) next = 'touch';
  } else if (source === 'mouse') {
    if (profile.capabilities.hasFinePointer) next = 'keyboard-mouse';
  } else if (source === 'keyboard') {
    if (profile.capabilities.hasFinePointer || profile.deviceClass === 'desktop') {
      next = 'keyboard-mouse';
    }
  }

  if (!next) return;
  if (next === profile.inputMode) {
    // Keep the request in sync even when the resolved mode already matches.
    requestedInputMode = next;
    return;
  }
  requestedInputMode = next;
  refreshProfile();
}

/** Subscribe to platform/input/orientation changes. Fires immediately. */
export function subscribeDeviceProfile(listener: ProfileListener): () => void {
  listeners.add(listener);
  if (!detachGlobalListeners) detachGlobalListeners = attachGlobalListeners();
  listener(getDeviceProfile());

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && detachGlobalListeners) {
      detachGlobalListeners();
      detachGlobalListeners = null;
    }
  };
}

function attachGlobalListeners(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      reportInputSource('touch');
    } else if (event.pointerType === 'mouse') {
      reportInputSource('mouse');
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') reportInputSource('mouse');
  };
  const onKeyDown = () => reportInputSource('keyboard');

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  window.addEventListener('keydown', onKeyDown, true);

  const mediaQueries = [
    '(pointer: fine)',
    '(pointer: coarse)',
    '(hover: hover)',
    '(any-pointer: fine)',
    '(any-pointer: coarse)',
    '(any-hover: hover)',
    '(display-mode: standalone)',
    '(display-mode: fullscreen)',
    '(display-mode: window-controls-overlay)',
    '(display-mode: minimal-ui)',
    '(orientation: portrait)',
    '(orientation: landscape)',
  ];
  const mediaList = mediaQueries
    .map((query) => {
      try {
        return window.matchMedia(query);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is MediaQueryList => entry !== null);
  const onMediaChange = () => scheduleRefresh();
  for (const list of mediaList) {
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onMediaChange);
    } else {
      // Safari < 14 fallback.
      list.addListener?.(onMediaChange);
    }
  }

  const onResize = () => scheduleRefresh();
  const onVisibility = () => {
    if (document.visibilityState === 'visible') scheduleRefresh();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('keydown', onKeyDown, true);
    for (const list of mediaList) {
      if (typeof list.removeEventListener === 'function') {
        list.removeEventListener('change', onMediaChange);
      } else {
        list.removeListener?.(onMediaChange);
      }
    }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
    refreshFrame = 0;
  };
}
