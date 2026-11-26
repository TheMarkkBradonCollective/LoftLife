import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOBILE_GAMEPLAY_MESSAGE,
  PLATFORMS,
  canStartGameplay,
  detectPlatform,
  usesDesktopControls,
  usesTouchControls,
} from '../../shared/device-platform.mjs';

const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

test('desktop browsers get keyboard/mouse gameplay', () => {
  for (const ua of [WINDOWS_CHROME, MAC_SAFARI]) {
    const env = detectPlatform({ userAgent: ua, platform: 'Win32', hasHover: true });
    assert.equal(env.platform, PLATFORMS.DESKTOP_WEB);
    assert.equal(env.deviceClass, 'desktop');
    assert.equal(env.gameplayAllowed, true);
    assert.equal(env.controls, 'keyboard-mouse');
    assert.equal(env.primaryInput, 'keyboard-mouse');
    assert.equal(usesDesktopControls(env), true);
    assert.equal(usesTouchControls(env), false);
    assert.equal(env.mobileBrowser, false);
    assert.equal(env.isHybrid, false);
  }
});

test('a narrow desktop window is not mistaken for a phone', () => {
  const env = detectPlatform({
    userAgent: WINDOWS_CHROME,
    platform: 'Win32',
    maxTouchPoints: 10,
    hasTouch: true,
    hasFinePointer: true,
    hasCoarsePointer: true,
    hasHover: true,
    // Width is deliberately absent: the detector must not need it.
  });
  assert.equal(env.platform, PLATFORMS.DESKTOP_WEB);
  assert.equal(env.gameplayAllowed, true);
  assert.equal(env.controls, 'keyboard-mouse');
  assert.equal(env.isHybrid, true);
  assert.equal(env.hasTouch, true);
});

test('a touch-only desktop uses the touch HUD', () => {
  const env = detectPlatform({
    userAgent: WINDOWS_CHROME,
    platform: 'Win32',
    maxTouchPoints: 10,
    hasTouch: true,
    hasFinePointer: false,
    hasCoarsePointer: true,
    hasHover: false,
  });
  assert.equal(env.platform, PLATFORMS.DESKTOP_WEB);
  assert.equal(env.controls, 'touch');
  assert.equal(env.primaryInput, 'touch');
});

test('mobile browsers can play and get the touch HUD', () => {
  for (const [ua, platform, maxTouchPoints, expected] of [
    [IPHONE_SAFARI, 'iPhone', 5, PLATFORMS.IOS_WEB],
    [ANDROID_CHROME, 'Linux armv8l', 5, PLATFORMS.ANDROID_WEB],
    [IPAD_DESKTOP_UA, 'MacIntel', 5, PLATFORMS.IOS_WEB],
  ]) {
    const env = detectPlatform({ userAgent: ua, platform, maxTouchPoints });
    assert.equal(env.platform, expected);
    assert.equal(env.gameplayAllowed, true);
    assert.equal(env.controls, 'touch');
    assert.equal(env.mobileBrowser, true);
    assert.equal(env.desktop, false);
    assert.equal(usesTouchControls(env), true);
    assert.equal(usesDesktopControls(env), false);
    assert.equal(canStartGameplay(env), true);
    assert.equal(env.dashboardAllowed, true);
  }
});

test('iPhones, Android phones and tablets keep their runtime label', () => {
  const iphone = detectPlatform({ userAgent: IPHONE_SAFARI, platform: 'iPhone', maxTouchPoints: 5 });
  assert.equal(iphone.deviceClass, 'mobile');
  assert.equal(iphone.isTablet, false);
  assert.equal(iphone.label, 'iOS mobile browser');

  const android = detectPlatform({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 });
  assert.equal(android.deviceClass, 'mobile');
  assert.equal(android.label, 'Android mobile browser');

  const ipad = detectPlatform({ userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
  assert.equal(ipad.deviceClass, 'tablet');
  assert.equal(ipad.isTablet, true);
  assert.equal(ipad.label, 'iPad browser');

  const tablet = detectPlatform({ userAgent: ANDROID_TABLET, maxTouchPoints: 10 });
  assert.equal(tablet.platform, PLATFORMS.ANDROID_WEB);
  assert.equal(tablet.deviceClass, 'tablet');
  assert.equal(tablet.isTablet, true);
  assert.equal(tablet.label, 'Android tablet browser');
});

test('the installed Android app is distinguished from Android Chrome', () => {
  const browser = detectPlatform({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l' });
  assert.equal(browser.mobileBrowser, true);
  assert.equal(browser.platform, PLATFORMS.ANDROID_WEB);

  const apk = detectPlatform({
    userAgent: ANDROID_CHROME,
    platform: 'Linux armv8l',
    androidApp: true,
  });
  assert.equal(apk.platform, PLATFORMS.ANDROID_APP);
  assert.equal(apk.gameplayAllowed, true);
  assert.equal(apk.controls, 'touch');
  assert.equal(apk.mobileBrowser, false);
  assert.equal(apk.installed, true);
  assert.equal(apk.isNativeApp, true);

  const uaFlagged = detectPlatform({
    userAgent: `${ANDROID_CHROME} LoftLifeAndroid/1.0`,
    platform: 'Linux armv8l',
  });
  assert.equal(uaFlagged.platform, PLATFORMS.ANDROID_APP);
});

test('Windows EXE, installed desktop apps and installed desktop PWAs are supported', () => {
  const exe = detectPlatform({
    userAgent: WINDOWS_CHROME,
    platform: 'Win32',
    desktopApp: true,
  });
  assert.equal(exe.platform, PLATFORMS.WINDOWS_EXE);
  assert.equal(exe.label, 'Windows desktop app');
  assert.equal(exe.gameplayAllowed, true);
  assert.equal(exe.desktop, true);

  const mac = detectPlatform({
    userAgent: MAC_SAFARI,
    platform: 'MacIntel',
    desktopApp: true,
  });
  assert.equal(mac.platform, PLATFORMS.DESKTOP_APP);
  assert.equal(mac.installed, true);

  const chromeApp = detectPlatform({ userAgent: WINDOWS_CHROME, chromeApp: true });
  assert.equal(chromeApp.platform, PLATFORMS.DESKTOP_APP);

  const pwa = detectPlatform({ userAgent: WINDOWS_CHROME, standalone: true });
  assert.equal(pwa.platform, PLATFORMS.DESKTOP_APP);
  assert.equal(pwa.controls, 'keyboard-mouse');
});

test('an Android WebView running a desktop-style wrapper is the Android app', () => {
  const env = detectPlatform({
    userAgent: ANDROID_CHROME,
    platform: 'Linux armv8l',
    desktopApp: true,
  });
  assert.equal(env.platform, PLATFORMS.ANDROID_APP);
  assert.equal(env.controls, 'touch');
});

test('mobile PWAs stay mobile browsers, not native apps', () => {
  for (const ua of [ANDROID_CHROME, IPHONE_SAFARI]) {
    const env = detectPlatform({
      userAgent: ua,
      platform: ua === ANDROID_CHROME ? 'Linux armv8l' : 'iPhone',
      maxTouchPoints: 5,
      standalone: true,
    });
    assert.equal(env.installed, false);
    assert.equal(env.isNativeApp, false);
    assert.equal(env.gameplayAllowed, true);
    assert.equal(env.controls, 'touch');
  }
});

test('TV and console browsers are unsupported gameplay environments', () => {
  const tv = detectPlatform({
    userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36',
    platform: 'Linux',
  });
  assert.equal(tv.platform, PLATFORMS.UNSUPPORTED);
  assert.equal(tv.gameplayAllowed, false);
  assert.equal(tv.controls, 'none');
});

test('unknown runtimes fail closed to dashboard access', () => {
  const env = detectPlatform({});
  assert.equal(env.platform, PLATFORMS.UNSUPPORTED);
  assert.equal(env.gameplayAllowed, false);
  assert.equal(env.dashboardAllowed, true);
});

test('only supported platforms can start gameplay, and a destination is required', () => {
  const desktop = detectPlatform({ userAgent: WINDOWS_CHROME });
  const mobile = detectPlatform({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 });
  const unsupported = detectPlatform({});
  assert.equal(canStartGameplay(desktop, 'world'), true);
  assert.equal(canStartGameplay(desktop, 'lobby'), true);
  assert.equal(canStartGameplay(desktop, ''), false);
  assert.equal(canStartGameplay(mobile, 'world'), true);
  assert.equal(canStartGameplay(unsupported, 'world'), false);
});

test('the unsupported-runtime notice no longer claims mobile gameplay is blocked', () => {
  assert.match(MOBILE_GAMEPLAY_MESSAGE, /desktop browsers/);
  assert.match(MOBILE_GAMEPLAY_MESSAGE, /phones and tablets/);
  assert.match(MOBILE_GAMEPLAY_MESSAGE, /manage your loft/i);
  assert.doesNotMatch(MOBILE_GAMEPLAY_MESSAGE, /requires the LoftLife Android app/i);
});
