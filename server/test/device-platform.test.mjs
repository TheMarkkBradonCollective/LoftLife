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

test('desktop browsers get keyboard/mouse gameplay', () => {
  for (const ua of [WINDOWS_CHROME, MAC_SAFARI]) {
    const env = detectPlatform({ userAgent: ua, platform: 'Win32', hasHover: true });
    assert.equal(env.platform, PLATFORMS.DESKTOP_WEB);
    assert.equal(env.gameplayAllowed, true);
    assert.equal(env.controls, 'keyboard-mouse');
    assert.equal(usesDesktopControls(env), true);
    assert.equal(usesTouchControls(env), false);
    assert.equal(env.mobileBrowser, false);
  }
});

test('a narrow desktop window is not mistaken for a phone', () => {
  const env = detectPlatform({
    userAgent: WINDOWS_CHROME,
    platform: 'Win32',
    maxTouchPoints: 10,
    hasCoarsePointer: true,
    hasHover: true,
    // Width is deliberately absent: the detector must not need it.
  });
  assert.equal(env.platform, PLATFORMS.DESKTOP_WEB);
  assert.equal(env.gameplayAllowed, true);
  assert.equal(env.controls, 'keyboard-mouse');
});

test('mobile browsers are dashboard-only with no touch game HUD', () => {
  for (const [ua, platform, maxTouchPoints] of [
    [IPHONE_SAFARI, 'iPhone', 5],
    [ANDROID_CHROME, 'Linux armv8l', 5],
    [IPAD_DESKTOP_UA, 'MacIntel', 5],
  ]) {
    const env = detectPlatform({ userAgent: ua, platform, maxTouchPoints });
    assert.equal(env.platform, PLATFORMS.MOBILE_WEB);
    assert.equal(env.gameplayAllowed, false);
    assert.equal(env.controls, 'none');
    assert.equal(env.mobileBrowser, true);
    assert.equal(usesTouchControls(env), false);
    assert.equal(canStartGameplay(env), false);
    assert.equal(env.dashboardAllowed, true);
  }
});

test('the installed Android app is distinguished from Android Chrome', () => {
  const browser = detectPlatform({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l' });
  assert.equal(browser.mobileBrowser, true);

  const apk = detectPlatform({
    userAgent: ANDROID_CHROME,
    platform: 'Linux armv8l',
    androidApp: true,
  });
  assert.equal(apk.platform, PLATFORMS.ANDROID_APP);
  assert.equal(apk.gameplayAllowed, true);
  assert.equal(apk.controls, 'touch');
  assert.equal(usesTouchControls(apk), true);
  assert.equal(usesDesktopControls(apk), false);
  assert.equal(apk.mobileBrowser, false);

  const uaFlagged = detectPlatform({
    userAgent: `${ANDROID_CHROME} LoftLifeAndroid/1.0`,
    platform: 'Linux armv8l',
  });
  assert.equal(uaFlagged.platform, PLATFORMS.ANDROID_APP);
});

test('Windows EXE, Chrome App and installed desktop builds are supported desktops', () => {
  for (const extra of [{ desktopApp: true }, { chromeApp: true }, { standalone: true }]) {
    const env = detectPlatform({ userAgent: WINDOWS_CHROME, platform: 'Win32', ...extra });
    assert.equal(env.platform, PLATFORMS.DESKTOP_APP);
    assert.equal(env.gameplayAllowed, true);
    assert.equal(env.controls, 'keyboard-mouse');
    assert.equal(env.installed, true);
  }
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

test('a mobile PWA is still a mobile browser, not the Android app', () => {
  const env = detectPlatform({
    userAgent: ANDROID_CHROME,
    platform: 'Linux armv8l',
    standalone: true,
  });
  assert.equal(env.platform, PLATFORMS.MOBILE_WEB);
  assert.equal(env.gameplayAllowed, false);
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
  const mobile = detectPlatform({ userAgent: IPHONE_SAFARI });
  assert.equal(canStartGameplay(desktop, 'world'), true);
  assert.equal(canStartGameplay(desktop, 'lobby'), true);
  assert.equal(canStartGameplay(desktop, ''), false);
  assert.equal(canStartGameplay(mobile, 'world'), false);
});

test('the mobile notice explains the requirement', () => {
  assert.match(MOBILE_GAMEPLAY_MESSAGE, /Android app/);
  assert.match(MOBILE_GAMEPLAY_MESSAGE, /desktop browser/);
  assert.match(MOBILE_GAMEPLAY_MESSAGE, /manage your loft/i);
});
