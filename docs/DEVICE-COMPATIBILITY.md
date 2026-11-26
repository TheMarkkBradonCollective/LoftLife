# Device Recognition, Gameplay Access & Responsive HUD

LoftLife is one web game (React + Three.js) with one movement/camera system. The
interface around it is chosen from the runtime environment and the input the
player is actually using — never from window width alone.

Implementation: [`shared/device-platform.mjs`](../shared/device-platform.mjs)
(pure classification), [`src/game/platform.ts`](../src/game/platform.ts) (live
input/React binding), [`src/hud/GameInterface.tsx`](../src/hud/GameInterface.tsx)
(presentation/state and layout choice), [`src/hud/layouts/TouchHud.tsx`](../src/hud/layouts/TouchHud.tsx)
and [`src/hud/layouts/DesktopHud.tsx`](../src/hud/layouts/DesktopHud.tsx),
[`shared/hud-presentation.mjs`](../shared/hud-presentation.mjs) (pure HUD rules),
[`src/App.tsx`](../src/App.tsx) (session wiring and native back) and
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

The HUD is one system, not a stack of permanent toolbars. It renders only the
controls for the current state and keeps the world dominant.

| Situation | HUD |
| --- | --- |
| Desktop, any window width | Keyboard/mouse HUD: compact floating world/status pill, voice + chat + menu, labeled action cluster, no touch controls mounted |
| Installed desktop app | Same controls inside a full-width app bar, with a fullscreen/window control |
| Touch (phone, tablet, APK, mobile browser) | One joystick opposite the 44 px action cluster, camera drag on the world, compact top pill, safe-area insets |
| Portrait | Isometric view, joystick pans the camera, action cluster stacked lower-right |
| Landscape | Play View, joystick walks, 2×2 action grid lower-right, controls clear of gesture edges |
| Tablet | Labeled actions, social shortcut rail above the joystick, wider spacing — not a stretched phone layout |
| Hybrid device | One HUD at a time. Touch HUD only while touch is the last input; moving the mouse or pressing a key returns the desktop HUD. |
| Near an object/player | The primary contextual action (Interact/Open/Use/Sit/Unlock/View profile) replaces nothing else; utility actions stay in place |
| Social sheet or chat open | Joystick and action cluster are unmounted; the sheet owns the screen and typing never moves the avatar |
| Game menu open | All gameplay HUD hidden, world input paused, camera state preserved; closing restores the previous state |
| Editing | Walking controls replaced by the build panel: catalog, surfaces, layouts, selection, done |
| Vehicle | While `session.riding` (LoftLine transit), walking actions are replaced by ride controls; not exercised offline |

Desktop HUD contains no joystick or look strip. The touch layer only mounts on
touch presentations, so a narrow desktop window stays keyboard/mouse.

Touch HUD details:

- One joystick writes `touchInput.moveX/moveZ`, the same singleton WASD uses
- Camera orbit is a drag on the world (the old permanent LOOK strip is gone);
  Camera/Emote/Sprint/Jump sit in the compact action layer, with follow, zoom
  and isometric/play mode in the Camera popover and the menu
- The primary action uses the live proximity prompt, is dimmed/disabled when
  nothing is in reach, shows its label and key hint, and runs the same
  interaction path as `E`/tap
- Voice (range, push-to-talk, status), chat and the central menu are always one
  tap away without a second toolbar row
- Safe-area insets keep controls clear of notches and system bars; control size
  (small/standard/large) and handedness live in Settings → Controls
- Portrait renders isometric and landscape renders Play View; neither blocks
  access, so no forced-rotation wall is needed
- System reduced motion/transparency and the explicit accessibility settings
  are respected; all icon buttons carry accessible labels and 44 px targets

World entry, travel, chat, voice and editing use the same session/API code on
every runtime. The backend permission model is unchanged. Full detail:
[`docs/HUD-REDESIGN.md`](HUD-REDESIGN.md).

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

All browser runs used the dev server and Chromium with CDP device emulation
(viewport, mobile flag, touch points and user agent) in this workspace.

- **Typecheck / build / unit tests:** `npx tsc --noEmit` passes, `npm test`
  passes 108/108 (including 7 new HUD presentation tests), `npm run build`
  succeeds with only the pre-existing chunk-size warning, and
  `npx wrangler deploy --dry-run` bundles the Worker and assets.
- **Desktop Chrome (1440×900):** `desktop-web`, keyboard/mouse HUD, no
  joystick mounted, menu and social sheet open and close with the HUD hidden
  while open.
- **Desktop app (Windows bridge marker, 1440×900):** `windows-exe`,
  `installed: true`, full-width app bar, fullscreen control, keyboard/mouse HUD.
- **iOS mobile portrait (390×844):** `ios-web`, `mobile`, gameplay allowed,
  `touch` input. Joystick 132 px at x=18, action stack 48 px at x=324; no
  overlap, all inside the viewport (top pill 54 px high).
- **iOS mobile landscape (844×390):** `ios-web`, Play View, joystick 121 px,
  actions a 2×2 grid ending 18 px from the edge. A joystick drag moved the
  avatar **2.91 m**; a separate 140 px canvas drag orbited the camera without
  opening the menu, social sheet or an action.
- **iPad portrait (820×1180):** labeled action cluster, social rail above the
  joystick, no overlap; top pill shows brand, suite, floor/items, `Solo` and
  voice.
- **iPad landscape (1180×820):** same zones with wider spacing; top pill 60 px.
- **Orientation change:** 390×844 → 844×390 and 820×1180 → 1180×820 resized
  live; HUD re-composed without a reload or layout overlap.
- **Contextual action (desktop):** walking into the studio stool radius showed
  primary `Sit on Studio Stool` with the `E` hint.
- **Central menu (desktop and mobile):** all 10 sections reachable; mobile uses
  wrapped section chips; Settings exposes camera, lighting, touch size,
  handedness, opacity, audio, graphics, accessibility and display.
- **Social sheet:** opens from the chat button; joystick and action cluster are
  absent from the DOM while it is open.
- **Editing:** menu → World → Furnish this suite mounts the build panel and
  unmounts the walking controls.
- **Visual review:** the screenshots in [`artifacts/hud`](../artifacts/hud) were
  inspected for control overlap, clipping, contrast and safe margins.

### Not tested here

- Physical Android/iOS/tablet hardware, notch/cutout insets and a real hybrid
  touch laptop. Emulation reports zero safe-area insets; the CSS uses
  `env(safe-area-inset-*)` regardless.
- Vehicle controls with a live city/transit nearby, and a live multiplayer
  session with other players/collaborators.
- Real fullscreen window behavior and the Windows EXE/iOS shells.
- The dev preview has no game backend, so world entry/travel, permissions,
  voice and save sync were not re-exercised; they are unchanged server-side.
- Every screen size. Legacy 568×320 short landscape remains a known tight case.
- Automated visual regression or pixel-by-pixel spacing on hardware.

## 6. Manual verification checklist

1. Desktop browser: play in a 500 px-wide window — desktop HUD only, no
   joystick, and the game menu stays usable.
2. Touch laptop: use the mouse (desktop HUD), tap the canvas (touch HUD), then
   move the mouse (desktop HUD). Camera must not jump or reset.
3. Android/iOS browser: enter a world, walk with the joystick, drag the world
   to orbit, walk to the hotel door and use the primary action to open the
   keycard terminal.
4. Same on the APK; hardware back should close the menu/modal or, with nothing
   open, minimize the app rather than losing the session.
5. Tablet portrait and landscape: controls stay inside safe areas; opening the
   menu or chat hides movement/actions and closing restores them.
6. Open Settings → Controls: change size and handedness and confirm the stick
   and action cluster swap sides without overlapping.
7. Enter a private world you own and a friends-only world you are entitled to;
   confirm a world you lack access to is still refused by the API.
8. Landscape phone: check the HUD clear of the notch/safe area in the installed
   APK and in Safari standalone mode.
