# Device Recognition, Gameplay Access & Responsive HUD

LoftLife is one web game (React + Three.js) with one movement/camera system. The
interface around it is chosen from the runtime environment and the input the
player is actually using — never from window width alone.

Implementation: [`shared/device-platform.mjs`](../shared/device-platform.mjs)
(pure classification), [`src/game/platform.ts`](../src/game/platform.ts) (live
input/React binding), [`src/components/TouchControls.tsx`](../src/components/TouchControls.tsx)
(touch HUD), [`src/App.tsx`](../src/App.tsx) (HUD selection and native back) and
[`src/components/RoomViewport.tsx`](../src/components/RoomViewport.tsx) (shared
movement/camera and the mobile renderer budget).

---

## 1. Supported gameplay runtimes

| Runtime | Detected as | Gameplay |
| --- | --- | --- |
| Desktop website (PC/Mac/Linux) | `desktop-web` | Full keyboard/mouse HUD, pointer lock, camera, voice, chat |
| Installed desktop experience / PWA | `desktop-app` | Same as desktop web, standalone display mode |
| Windows desktop EXE | `windows-exe` | Same desktop HUD; native back handled when the shell exposes it |
| Android APK | `android-app` | Touch HUD, safe-area layout, native back button |
| iOS app shell | `ios-app` | Touch HUD, safe-area layout |
| Android mobile browser | `android-web` | Touch HUD |
| iOS / iPadOS browser | `ios-web` | Touch HUD |
| Android/iPad tablet | `android-web` / `ios-web`, `deviceClass: tablet` | Touch HUD, both orientations |
| Other mobile browser | `mobile-web` | Touch HUD |
| Hybrid touch laptop / Surface | `desktop-web` or `windows-exe`, `isHybrid: true` | Desktop HUD until the screen is touched, then touch HUD; both work |

Mobile browsers are no longer dashboard-only. There is no allow/deny list in the
UI that blocks a runtime; world access remains a backend decision (`canEnter`,
access mode, collaborator/membership checks).

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
  (`process.versions.electron`), Tauri (`__TAURI_INTERNALS__`), and optional
  `window.LoftLifeAndroid` / `LoftLifeAndroidApp` / `LoftLifeIOSApp` /
  `LoftLifeDesktopApp` markers for custom WebView wrappers

A narrow desktop window stays `desktop-web`. A tablet in landscape is still a
touch device. Changing input does not reset anything: pointer/keyboard events
only change `inputMode`, never camera yaw/pitch, movement state or location.

## 3. HUD rules

| Situation | HUD |
| --- | --- |
| Desktop, any window width | Keyboard/mouse HUD: top utility bar, bottom dock, keyboard shortcuts, pointer-lock look, no touch controls mounted |
| Touch in use (phone, tablet, APK) | Touch HUD: movement stick on the preferred side, camera controls, contextual Action, sprint/jump/emote, grouped voice bubble, chat and map/menu |
| Hybrid device | One HUD at a time. Touch HUD only while touch is the last input; moving the mouse or pressing a key returns the desktop HUD. |
| Play View on touch | A compact **Look** strip on the left edge rotates the camera; the rest of the canvas stays free for taps and drag gestures |
| Touch header | One horizontally scrollable row, so lighting, avatar, sound, settings and Exit stay reachable without a second row covering the game |
| Builder (Edit Room) | Gameplay touch layer is unmounted; catalog and placement use the same taps as before |

Desktop HUD contains no joystick, direction pad or mobile look pad. The touch
layer unmounts completely (`active === false` returns `null`), so no invisible
element keeps intercepting input. Desktop-only camera and map controls are
hidden while a hybrid device is using touch.

Touch HUD details:

- Movement joystick → `touchInput.moveX/moveZ` → the same movement code as WASD
- Look strip (Play View) and canvas drag → the same `playCam.yaw/pitch` values as
  mouse look
- Action button uses the live proximity prompt and is disabled/dimmed when
  nothing is in reach; it calls the same interaction path as `E`/tap
- Jump, sprint toggle, emote, push-to-talk (or turn voice on), chat, map/menu,
  camera zoom and follow
- Safe-area insets keep controls clear of notches and system bars
- Portrait stacks the camera/action row above the stick; landscape places it in
  the free bottom-center band between the stick and the context buttons
- Right- and left-handed layouts are both measured: the camera row and voice
  bubble move to the free edge rather than overlapping the stick
- Large control size is capped to Standard in narrow portrait, where four
  enlarged context buttons cannot fit beside the stick
- Portrait renders isometric and landscape renders Play View; neither blocks
  access, so no forced-rotation wall is needed

World entry, travel, chat, voice and editing use the same session/API code on
every runtime. The backend permission model is unchanged.

## 4. Mobile performance budget

The platform Graphics quality setting (`low` / `medium` / `high`) is the
baseline. On a phone or tablet (`deviceClass: mobile | tablet`) it is capped at
`medium`, so mobile gets:

- max device pixel ratio 1.5 instead of 2
- MSAA off
- no shadow pass (also true for the explicit `low` setting on any device)
- the same scene graph, assets, gameplay and collision code (no separate levels)

An explicit `low` setting is never raised, and desktop/installed builds keep
their full setting. The budget is chosen from the runtime, not from the current
input, so touching a desktop screen cannot reduce desktop quality.

## 5. Testing report

### Environments actually exercised

- **Typecheck / build:** `npx tsc --noEmit` and `npm run build` pass.
- **Classification table (Node, pure detector):** 13 tests covering Windows/Mac
  desktop, a narrow desktop with touch, a touch-only desktop, iPhone, Android
  phone, iPadOS desktop-Safari UA, Android tablet, APK bridge, Android PWA,
  Windows EXE, installed desktop app/PWA, Chrome App, TV, unknown runtime and
  `canStartGameplay`. All returned the expected platform, device class, controls
  and access.
- **Desktop Chrome (cloud browser, 1280×800):** `desktop-web`, keyboard/mouse
  HUD, map button present, zero sticks/look areas/action buttons in the DOM.
- **Android mobile browser (Pixel UA, mobile + touch, 390×844):**
  `android-web`, gameplay allowed, touch HUD with movement stick, Action button
  and map/menu. No desktop Play View switcher.
- **Android portrait and landscape (390×844, 844×390):** `android-web`,
  gameplay allowed. Portrait showed the stick, Action and map/menu; landscape
  added the Play View Look strip. Camera/action, voice bubble, stick, context
  buttons and Look strip were measured with zero overlap and fully inside the
  viewport for right- and left-handed layouts at Standard and Large size.
- **Visual review:** portrait and landscape screenshots were inspected after
  the layout pass. The touch header stays on one scrollable row; in landscape
  the camera/action row sits between the stick and context buttons, clear of the
  header, voice bubble and Look strip.
- **Hybrid touch laptop (desktop UA, fine pointer, touch points):** started on
  the desktop HUD; a touch pointer switched to the touch HUD in place (stick
  mounted); a mouse move switched back (stick unmounted). No reload.
- **Android APK bridge (mobile context with `window.LoftLifeAndroid`):**
  `android-app`/`LoftLife Android app`, gameplay allowed, touch HUD. Native back
  closed the open Map & World menu; with nothing open it called `minimizeApp`.
- **TV browser UA:** `unsupported`, gameplay refused, no stick, "Gameplay
  unavailable" notice shown.
- **Phone portrait and landscape screenshots:** reviewed the touch HUD
  visually; stick, Action, camera row, voice bubble, action row and map stayed
  inside the viewport.

### Not tested here

- Physical Android/iOS/tablet hardware and a real hybrid touch laptop; browser
  runs used emulated viewports and input events.
- The Windows EXE/iOS shells (no wrapper in this repository) and their
  back/close behaviour.
- Walking to an interactable and pressing Action; camera drag distance; world
  entry, travel and permissions against the live backend. The dev preview has no
  game server, so those flows were not re-exercised here and remain server-enforced.
- Every screen size and orientation. A legacy 568×320 short landscape still
  needs a dedicated compact HUD: at that height the stick meets the Look strip
  and the centered camera row meets the context buttons. Modern 390×844 and
  844×390 layouts were measured clean.
- Pixel-by-pixel spacing on physical hardware; the browser runs used emulated
  viewports and input events.

These need a manual pass on target hardware or a device farm. Native wrappers
and store builds are outside this repository; only their detection and
native-back hooks live here.

## 6. Manual verification checklist

1. Desktop browser: play in a 500 px-wide window — the desktop HUD must remain,
   and no stick/look area may appear.
2. Touch laptop: use the mouse (desktop HUD), tap the canvas (touch HUD), then
   move the mouse (desktop HUD). Camera must not jump or reset.
3. Android/iOS browser: sign in, walk to the hotel door, use Action to open the
   keycard terminal, enter the lobby and ride the elevator.
4. Same on the APK; hardware back should close the menu/modal or, with nothing
   open, minimize the app rather than losing the session.
5. Tablet in portrait and landscape: controls stay inside safe areas; the Look
   strip does not cover actions, and the canvas still receives taps.
6. Enter a private world you own and a friends-only world you are entitled to;
   confirm a world you lack access to is still refused by the API.
7. Landscape phone: check the HUD clear of the notch/safe area in the installed
   APK and in Safari standalone mode.
