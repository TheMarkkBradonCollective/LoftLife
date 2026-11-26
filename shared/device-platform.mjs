/**
 * Runtime environment detection and gameplay access rules.
 *
 * Detection is based on the user agent, runtime bridges and input capabilities —
 * never on window width. A desktop browser resized to phone width is still
 * desktop, and a tablet in landscape is still a touch device.
 *
 * Android APK contract (injected by the native wrapper before the bundle runs):
 *   window.LoftLifeAndroid = { isNative: true, platform: 'android' }
 *   and/or the WebView user agent contains "LoftLifeAndroid".
 * Windows/installed desktop contract:
 *   window.LoftLifeDesktop = { isNative: true, platform: 'win32' } (or Tauri/Electron).
 *
 * Pure so every environment can be exercised in node tests.
 */

export const PLATFORMS = {
  DESKTOP_WEB: 'desktop-web',
  DESKTOP_APP: 'desktop-app',
  WINDOWS_EXE: 'windows-exe',
  ANDROID_APP: 'android-app',
  IOS_APP: 'ios-app',
  ANDROID_WEB: 'android-web',
  IOS_WEB: 'ios-web',
  MOBILE_WEB: 'mobile-web',
  UNSUPPORTED: 'unsupported',
};

export const PLATFORM_LABELS = {
  'desktop-web': 'Desktop browser',
  'desktop-app': 'Installed desktop app',
  'windows-exe': 'Windows desktop app',
  'android-app': 'LoftLife Android app',
  'ios-app': 'LoftLife iOS app',
  'android-web': 'Android mobile browser',
  'ios-web': 'Mobile Safari',
  'mobile-web': 'Mobile browser',
  unsupported: 'Unsupported device',
};

export const MOBILE_GAMEPLAY_MESSAGE =
  'Gameplay is available on desktop browsers, phones and tablets. This runtime is not supported for walking, but you can still manage your loft, chat and change settings here.';

const MOBILE_UA =
  /Android|iPhone|iPod|iPad|Mobile|Tablet|Kindle|Silk|Opera Mini|IEMobile|BlackBerry|webOS|Windows Phone/i;
const DESKTOP_UA = /Windows NT|Macintosh|Mac OS X|Linux|CrOS/i;
const TV_OR_CONSOLE_UA =
  /SmartTV|SMART-TV|Tizen|Web0S|webOS TV|PlayStation|Xbox|Nintendo|BRAVIA|HbbTV|NetCast/i;

/**
 * @typedef {Object} PlatformInput
 * @property {string} [userAgent]
 * @property {string} [platform]
 * @property {number} [maxTouchPoints]
 * @property {boolean} [hasTouch]
 * @property {boolean} [hasFinePointer]
 * @property {boolean} [hasCoarsePointer]
 * @property {boolean} [hasHover]
 * @property {boolean} [keyboardHint]
 * @property {boolean} [standalone]
 * @property {boolean} [androidApp]
 * @property {boolean} [iosApp]
 * @property {boolean} [desktopApp]
 * @property {boolean} [chromeApp]
 * @property {boolean} [explicitMobile]
 */

/**
 * @param {PlatformInput} input
 */
export function detectPlatform(input = {}) {
  const ua = String(input.userAgent ?? '');
  const runtimePlatform = String(input.platform ?? '');
  const maxTouchPoints = Number(input.maxTouchPoints ?? 0) || 0;
  const hasTouch = input.hasTouch === true || maxTouchPoints > 0;
  const hasFinePointer =
    input.hasFinePointer === true ||
    (input.hasCoarsePointer !== true && input.hasHover !== false);
  const hasHover = input.hasHover !== false;

  const androidApp = input.androidApp === true || /LoftLifeAndroid/i.test(ua);
  const iosApp = input.iosApp === true || /LoftLifeIOS/i.test(ua);
  const desktopApp = input.desktopApp === true;
  const chromeApp = input.chromeApp === true;
  const standalone = input.standalone === true;

  const android = /Android/i.test(ua) || runtimePlatform === 'Android';
  // iPadOS reports a desktop Mac UA; multi-touch is the reliable difference.
  const ipadDesktopUa =
    /Macintosh/i.test(ua) && maxTouchPoints > 1 && !/iPhone|iPod|iPad/i.test(ua);
  const iosDevice = /iPhone|iPod|iPad/i.test(ua) || ipadDesktopUa;
  const mobileUa = input.explicitMobile === true || MOBILE_UA.test(ua) || ipadDesktopUa;
  const tvOrConsole = TV_OR_CONSOLE_UA.test(ua);
  const desktopUa = DESKTOP_UA.test(ua) && !mobileUa && !tvOrConsole;

  const androidTablet = android && (!/Mobile/i.test(ua) || /Tablet/i.test(ua));
  const iosTablet = /iPad/i.test(ua) || ipadDesktopUa;
  const otherTablet =
    !android && !iosDevice && /Tablet|PlayBook|Silk/i.test(ua) && !/Mobile/i.test(ua);
  const isTablet = androidTablet || iosTablet || otherTablet;

  // 1. TV and console browsers have no usable game HUD. Check them first: some
  //    TV user agents also contain Mobile/Tablet tokens.
  if (tvOrConsole) return result(PLATFORMS.UNSUPPORTED, { hasTouch, hasFinePointer, isTablet });

  // 2. Native wrappers win over the WebView's browser user agent.
  if (androidApp || (desktopApp && android)) {
    return result(PLATFORMS.ANDROID_APP, { hasTouch, hasFinePointer, isTablet: androidTablet });
  }
  if (iosApp) {
    return result(PLATFORMS.IOS_APP, { hasTouch, hasFinePointer, isTablet: iosTablet });
  }
  if (desktopApp) {
    const windows = /Windows/i.test(ua) || /^Win/i.test(runtimePlatform);
    return result(windows ? PLATFORMS.WINDOWS_EXE : PLATFORMS.DESKTOP_APP, {
      hasTouch,
      hasFinePointer,
      isTablet: false,
    });
  }

  // 3. A mobile PWA remains a mobile browser; only a native bridge makes an APK.
  if (mobileUa) {
    if (iosDevice) {
      return result(PLATFORMS.IOS_WEB, { hasTouch, hasFinePointer, isTablet: iosTablet });
    }
    if (android) {
      return result(PLATFORMS.ANDROID_WEB, { hasTouch, hasFinePointer, isTablet: androidTablet });
    }
    return result(PLATFORMS.MOBILE_WEB, { hasTouch, hasFinePointer, isTablet: otherTablet });
  }

  // 4. Supported desktop experiences: browser, Windows/macOS app, Chrome App,
  //    installed PWA. A desktop UA is required; width is never consulted.
  if (desktopUa) {
    if (chromeApp || standalone) {
      return result(PLATFORMS.DESKTOP_APP, { hasTouch, hasFinePointer, isTablet: false });
    }
    return result(PLATFORMS.DESKTOP_WEB, { hasTouch, hasFinePointer, isTablet: false });
  }

  // 5. Anything else is dashboard-only until it identifies itself.
  return result(PLATFORMS.UNSUPPORTED, { hasTouch, hasFinePointer, isTablet });
}

/**
 * @param {string} platform
 * @param {{ hasTouch: boolean, hasFinePointer: boolean, isTablet: boolean }} capabilities
 */
function result(platform, { hasTouch, hasFinePointer, isTablet }) {
  const desktop =
    platform === PLATFORMS.DESKTOP_WEB ||
    platform === PLATFORMS.DESKTOP_APP ||
    platform === PLATFORMS.WINDOWS_EXE;
  const mobile =
    platform === PLATFORMS.ANDROID_APP ||
    platform === PLATFORMS.IOS_APP ||
    platform === PLATFORMS.ANDROID_WEB ||
    platform === PLATFORMS.IOS_WEB ||
    platform === PLATFORMS.MOBILE_WEB;
  const gameApp =
    platform === PLATFORMS.ANDROID_APP || platform === PLATFORMS.IOS_APP;
  const gameplayAllowed = platform !== PLATFORMS.UNSUPPORTED;
  const controls = !gameplayAllowed
    ? 'none'
    : desktop
    ? hasTouch && !hasFinePointer
      ? 'touch'
      : 'keyboard-mouse'
    : 'touch';
  const primaryInput = !gameplayAllowed
    ? 'none'
    : desktop
    ? hasTouch && !hasFinePointer
      ? 'touch'
      : 'keyboard-mouse'
    : 'touch';

  return {
    platform,
    deviceClass: desktop ? 'desktop' : mobile ? (isTablet ? 'tablet' : 'mobile') : 'unknown',
    label: labelFor(platform, isTablet),
    gameplayAllowed,
    controls,
    inputMode: primaryInput,
    primaryInput,
    mobileBrowser:
      platform === PLATFORMS.ANDROID_WEB ||
      platform === PLATFORMS.IOS_WEB ||
      platform === PLATFORMS.MOBILE_WEB,
    androidApp: platform === PLATFORMS.ANDROID_APP,
    iosApp: platform === PLATFORMS.IOS_APP,
    desktop,
    installed:
      platform === PLATFORMS.DESKTOP_APP ||
      platform === PLATFORMS.WINDOWS_EXE ||
      gameApp,
    isNativeApp: gameApp || platform === PLATFORMS.WINDOWS_EXE || platform === PLATFORMS.DESKTOP_APP,
    isTablet,
    isHybrid: desktop && hasTouch && hasFinePointer,
    hasTouch,
    hasFinePointer,
    /** Account, chat, worlds browsing and loft management stay available. */
    dashboardAllowed: true,
  };
}

function labelFor(platform, isTablet) {
  if (platform === PLATFORMS.ANDROID_WEB) {
    return isTablet ? 'Android tablet browser' : 'Android mobile browser';
  }
  if (platform === PLATFORMS.IOS_WEB) {
    return isTablet ? 'iPad browser' : 'iOS mobile browser';
  }
  if (platform === PLATFORMS.MOBILE_WEB) {
    return isTablet ? 'Tablet browser' : 'Mobile browser';
  }
  return PLATFORM_LABELS[platform];
}

/**
 * True when the keyboard/mouse HUD should be used.
 * @param {ReturnType<typeof detectPlatform>} env
 */
export function usesDesktopControls(env) {
  return env.controls === 'keyboard-mouse';
}

/**
 * True when the touch game HUD should be mounted.
 * @param {ReturnType<typeof detectPlatform>} env
 */
export function usesTouchControls(env) {
  return env.controls === 'touch';
}

/**
 * Gameplay transitions are refused (not merely hidden) on unsupported runtimes.
 * @param {ReturnType<typeof detectPlatform>} env
 * @param {string} destination
 */
export function canStartGameplay(env, destination = 'world') {
  if (!env.gameplayAllowed) return false;
  return Boolean(destination);
}
