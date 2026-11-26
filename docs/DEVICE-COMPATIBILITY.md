# Device Recognition, Gameplay Access & Responsive HUD

LoftLife is one web game (React + Three.js) with one movement/camera system. The
interface around it is chosen from the runtime environment and the input the
player is actually using — never from window width alone.

Implementation: [`src/game/platform.ts`](../src/game/platform.ts) (detection),
[`src/components/useDeviceProfile.ts`](../src/components/useDeviceProfile.ts)
(live React binding), [`src/components/TouchControls.tsx`](../src/components/TouchControls.tsx)
(touch HUD), [`src/App.tsx`](../src/App.tsx) (HUD selection) and
[`src/components/RoomViewport.tsx`](../src/components/RoomViewport.tsx)
(shared movement/camera and mobile renderer budget).

---

## 1. Supported gameplay runtimes

| Runtime | Detected as | Gameplay |
| --- | --- | --- |
| Desktop website (PC/Mac/Linux) | `desktop-web` | Full keyboard/mouse HUD, pointer lock, camera, voice, chat |
| Installed desktop experience / PWA | `desktop-installed` | Same as desktop web, standalone display mode |
| Windows desktop EXE | `windows-exe` | Same desktop HUD; native back handled when the shell exposes it |
| Chrome desktop browser | `desktop-web` | Same desktop HUD |
| Android APK | `android-apk` | Touch HUD, safe-area layout, native back button |
| Android mobile browser | `android-web` | Touch HUD |
| iOS / iPadOS browser | `ios-web` | Touch HUD |
| Tablet (Android/iPad) | `android-web` / `ios-web`, `deviceClass: tablet` | Touch HUD, sized for larger screens and both orientations |
| Hybrid touch laptop / Surface | `desktop-web` or `windows-exe`, `isHybrid: true` | Desktop HUD until the screen is touched, then touch HUD; both work |

There is no allow/deny list that blocks a runtime. World access remains a backend
decision (`canEnter`, access mode, collaborator/membership checks), not a UI
decision.

## 2. What is inspected

Input capabilities:

- `navigator.maxTouchPoints` and `ontouchstart`
- `(pointer: fine|coarse)`, `(any-pointer: fine|coarse)`, `(hover: hover)`,
  `(any-hover: hover)`
- presence of a keyboard hint (`navigator.keyboard`) or a desktop-class user agent

Runtime identity:

- User-Agent Client Hints `userAgentData.mobile` when available, else UA tokens
- iPadOS 13+ desktop UA (`Macintosh` + multiple touch points)
- Android tablet (Android UA without `Mobile`, or `Tablet`/`Silk`)
- Installed state: `display-mode` (`standalone`, `fullscreen`,
  `window-controls-overlay`, `minimal-ui`) and iOS `navigator.standalone`
- Native shells: Capacitor `getPlatform()`, Cordova, Electron
  (`process.versions.electron` / `Electron` UA), Tauri (`__TAURI_INTERNALS__`),
  and optional `window.LoftLifeAndroidApp` / `LoftLifeIOSApp` /
  `LoftLifeDesktopApp` markers for custom WebView wrappers

Width is only a last-resort tablet heuristic for **touch-only** devices with a
large physical screen. A 600 px-wide desktop window stays `desktop-web`.

Changing input does not reset anything: pointer/keyboard events only change
`inputMode`, never the camera yaw/pitch, movement state or world location.

## 3. HUD rules

| Situation | HUD |
| --- | --- |
| Desktop, any window width | Keyboard/mouse HUD: top mode bar, bottom dock, keyboard shortcuts, pointer-lock look, no touch controls mounted |
| Touch in use (phone, tablet, APK, or touch laptop) | Touch HUD: left movement stick, right camera-look area, contextual Action button, sprint/jump/emote, mic, chat/map/menu bar |
| Hybrid device | One HUD at a time. Touch HUD only while touch is the last input; moving the mouse or pressing a key returns the desktop HUD. |
| Builder (Edit Room) | Bottom catalog dock on every platform; the gameplay stick/look area is unmounted so it cannot intercept catalog taps |

Desktop HUD contains no joystick, no on-screen direction pad and no mobile camera
pad. The touch layer unmounts completely (`active === false` returns `null`), so
no invisible element keeps intercepting input.

Touch HUD details:

- Movement joystick → `touchInput.moveX/moveZ` → the same movement code as WASD
- Right-side drag area → the same `playCam.yaw/pitch` values as mouse look
- Action button shows the live proximity prompt (e.g. "Board the LoftLine") and
  is dimmed when nothing is nearby
- Jump, sprint toggle, emote, push-to-talk (or turn voice on), community chat,
  city map (in the city) and a game menu with view switch, build mode, avatar,
  camera zoom, sound, voice, lighting and travel
- Safe-area insets keep controls clear of notches and system bars
- Portrait shows a dismissible "Rotate for a wider view" tip; it never blocks play

## 4. Mobile performance budget

`deviceClass !== 'desktop'` selects a lighter renderer at mount:

- max device pixel ratio 1.5 instead of 2
- MSAA off, shadow map off, 4× anisotropy instead of 8×
- the same scene graph, gameplay and assets (no separate levels)

Desktop and software-GL paths are unchanged.

## 5. Testing report

### Environments actually exercised

- **Typecheck / build:** `npx tsc --noEmit` and `npm run build` pass.
- **Classification table (Node, pure builder):** 16 fabricated environments —
  Windows Chrome desktop; touch laptop with fine pointer; Windows touch-only
  tablet; narrow 600 px desktop; Android phone; Android APK bridge; Android
  tablet; iPadOS desktop-Safari UA; iPad Safari UA with `mobile: false` Client
  Hint; iPhone Safari; installed desktop PWA; Windows Electron shell; hybrid
  with touch requested; hybrid with keyboard/mouse requested; phone with
  Bluetooth keyboard; mouse-only device ignoring a touch request. All matched
  the expected platform, device class and input mode.
- **Desktop Chrome (cloud browser, 1280×800):** `desktop-web`, keyboard/mouse
  HUD, no joystick/look pad/mobile chat buttons in the DOM. Pressing `H` still
  toggled the dock, proving keyboard shortcuts survived the HUD split.
- **Desktop Chrome, 600×900 window:** still `desktop-web` with the keyboard/mouse
  HUD and no touch layer.
- **Hybrid touch laptop (desktop UA, fine pointer, touch points):** started on
  the desktop HUD; a touch pointer switched to the touch HUD in place; a mouse
  pointer switched back. No page reload, no world/camera reset.
- **Android mobile browser (Pixel user agent, mobile + touch context):**
  `android-web`/`mobile`, touch HUD with stick, look area, contextual Action
  button, chat and menu. Joystick and action buttons did not overlap, the look
  area stopped above the actions, all controls stayed inside the viewport, the
  game menu opened (and unmounted the stick), chat opened, and the portrait
  rotation tip appeared.
- **iOS mobile browser (iPhone user agent, mobile + touch context):** same
  checks as Android, `ios-web`/`mobile`.
- **iPad browser (820×1180, tablet context):** `ios-web`/`tablet`, touch HUD,
  portrait rotation tip, no desktop bar, controls inside the viewport.
- **Android APK bridge (Capacitor stub in a mobile context):** `android-apk`
  (distinct from `android-web`), touch HUD, native `backButton` listener
  registered. Hardware back closed the open game menu and restored the stick;
  with nothing open it called `minimizeApp` instead of dropping the session.

### Not tested here

- The Windows EXE shell (no wrapper in this repository) and its back/close
  behaviour.
- Physical Android/iOS devices, a real tablet, and a real hybrid touch laptop;
  the browser runs used emulated viewports/input, not hardware.
- End-to-end walking, camera dragging and world entry against the live backend.
  Browser runs used offline mode (`Play offline`) because the dev preview has no
  game server; world access and permission checks were not re-exercised here and
  remain server-enforced.
- Visual layout at every screen size; geometry was asserted programmatically and
  the layouts were not reviewed pixel-by-pixel.

These need a manual pass on the target hardware or a device farm. The native
wrappers and store builds are outside this repository; only their detection and
native-back hooks live here.

## 6. Manual verification checklist

1. Desktop browser: play in a 500 px-wide window — the desktop HUD must remain,
   and no stick/look pad may appear.
2. Touch laptop: use the mouse (desktop HUD), then tap the canvas (touch HUD),
   then move the mouse (desktop HUD). Camera must not jump or reset.
3. Android/iOS browser: sign in, walk to the hotel door, use the Action button to
   open the keycard terminal, enter the lobby and ride the elevator.
4. Same on the APK; hardware back should close the menu/modal or, with nothing
   open, minimize the app rather than losing the session.
5. Tablet in portrait and landscape: controls stay inside safe areas, the
   rotation tip is dismissible, and the camera look area does not cover actions.
6. Enter a private world you own and a friends-only world you are entitled to;
   confirm a world you lack access to is still refused by the API.
7. Landscape phone: check the HUD does not overlap the notch/safe area in the
   installed APK and in Safari standalone mode.
