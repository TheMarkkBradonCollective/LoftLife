/**
 * Runtime environment detection and gameplay access rules.
 *
 * Detection is based on the user agent, runtime bridges and display mode — never
 * on window width. A desktop browser resized to phone width is still desktop.
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
  ANDROID_APP: 'android-app',
  MOBILE_WEB: 'mobile-web',
  UNSUPPORTED: 'unsupported',
};

export const PLATFORM_LABELS = {
  'desktop-web': 'Desktop browser',
  'desktop-app': 'Installed desktop app',
  'android-app': 'LoftLife Android app',
  'mobile-web': 'Mobile browser',
  unsupported: 'Unsupported device',
};

export const MOBILE_GAMEPLAY_MESSAGE =
  'Gameplay requires the LoftLife Android app or a supported desktop browser (PC/Mac). You can still manage your loft, chat, explore destinations and change settings here.';

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
 * @property {boolean} [hasCoarsePointer]
 * @property {boolean} [hasHover]
 * @property {boolean} [standalone]
 * @property {boolean} [androidApp]
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
  const androidApp = input.androidApp === true || /LoftLifeAndroid/i.test(ua);
  const desktopApp = input.desktopApp === true;
  const chromeApp = input.chromeApp === true;
  const standalone = input.standalone === true;

  const android = /Android/i.test(ua) || runtimePlatform === 'Android';
  // iPadOS reports a desktop Mac UA; multi-touch is the reliable difference.
  const ipadDesktopUa = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  const mobileUa =
    input.explicitMobile === true || MOBILE_UA.test(ua) || ipadDesktopUa;
  const tvOrConsole = TV_OR_CONSOLE_UA.test(ua);
  const desktopUa = DESKTOP_UA.test(ua) && !mobileUa;

  // 1. Native Android wrapper (wins over the WebView's Android UA).
  if (androidApp || (desktopApp && android)) {
    return result(PLATFORMS.ANDROID_APP, 'touch');
  }

  // 2. Mobile/tablet browsers and TV/console browsers get dashboard access only.
  if (mobileUa) return result(PLATFORMS.MOBILE_WEB, 'none');
  if (tvOrConsole) return result(PLATFORMS.UNSUPPORTED, 'none');

  // 3. Supported desktop experiences: browser, Windows/macOS app, Chrome App,
  //    installed PWA. A desktop UA is required; width is never consulted.
  if (desktopUa) {
    if (desktopApp || chromeApp || standalone) return result(PLATFORMS.DESKTOP_APP, 'keyboard-mouse');
    return result(PLATFORMS.DESKTOP_WEB, 'keyboard-mouse');
  }

  // 4. Anything else is dashboard-only until it identifies itself.
  return result(PLATFORMS.UNSUPPORTED, 'none');
}

function result(platform, controls) {
  const gameplayAllowed =
    platform === PLATFORMS.DESKTOP_WEB ||
    platform === PLATFORMS.DESKTOP_APP ||
    platform === PLATFORMS.ANDROID_APP;
  return {
    platform,
    label: PLATFORM_LABELS[platform],
    gameplayAllowed,
    controls,
    mobileBrowser: platform === PLATFORMS.MOBILE_WEB,
    androidApp: platform === PLATFORMS.ANDROID_APP,
    desktop:
      platform === PLATFORMS.DESKTOP_WEB || platform === PLATFORMS.DESKTOP_APP,
    installed: platform === PLATFORMS.DESKTOP_APP || platform === PLATFORMS.ANDROID_APP,
    /** Account, chat, worlds browsing and loft management stay available. */
    dashboardAllowed: true,
  };
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
