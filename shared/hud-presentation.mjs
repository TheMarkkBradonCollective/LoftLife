/**
 * Pure gameplay-HUD presentation rules.
 *
 * The HUD is designed for six distinct presentations. Which one applies comes
 * from the runtime (desktop browser, installed desktop app, phone, tablet) and
 * the current orientation — never from a hardcoded width. The device detection
 * itself lives in ./device-platform.mjs; this module only decides how the game
 * interface is composed, so it can be unit tested without a browser.
 */

export const HUD_PRESENTATIONS = Object.freeze([
  'mobile-portrait',
  'mobile-landscape',
  'tablet-portrait',
  'tablet-landscape',
  'desktop-browser',
  'desktop-app',
]);

export const HUD_PRESENTATION_INFO = Object.freeze({
  'mobile-portrait': {label: 'Mobile portrait', touch: true, tablet: false, desktop: false},
  'mobile-landscape': {label: 'Mobile landscape', touch: true, tablet: false, desktop: false},
  'tablet-portrait': {label: 'Tablet portrait', touch: true, tablet: true, desktop: false},
  'tablet-landscape': {label: 'Tablet landscape', touch: true, tablet: true, desktop: false},
  'desktop-browser': {label: 'Desktop browser', touch: false, tablet: false, desktop: true},
  'desktop-app': {label: 'Desktop app', touch: false, tablet: false, desktop: true},
});

/** HUD states: each one shows only the controls that belong to it. */
export const HUD_STATES = Object.freeze([
  'exploration',
  'nearby',
  'social',
  'chat',
  'vehicle',
  'editing',
  'menu',
]);

/**
 * @param {{
 *   deviceClass?: 'desktop'|'mobile'|'tablet'|'unknown',
 *   touch?: boolean,
 *   installed?: boolean,
 *   portrait?: boolean,
 * }} input
 * @returns {typeof HUD_PRESENTATIONS[number]}
 */
export function resolveHudPresentation(input = {}) {
  const deviceClass = input.deviceClass ?? 'desktop';
  const touch = input.touch === true;
  const installed = input.installed === true;
  const portrait = input.portrait === true;

  if (touch && deviceClass === 'tablet') {
    return portrait ? 'tablet-portrait' : 'tablet-landscape';
  }
  if (touch && deviceClass === 'mobile') {
    return portrait ? 'mobile-portrait' : 'mobile-landscape';
  }
  // A hybrid laptop using its touchscreen gets the tablet-scale touch HUD.
  if (touch) {
    return portrait ? 'tablet-portrait' : 'tablet-landscape';
  }
  return installed ? 'desktop-app' : 'desktop-browser';
}

/**
 * Priority order matters: a menu hides gameplay controls even when the player
 * is standing next to an interactable object.
 *
 * @param {{
 *   menuOpen?: boolean,
 *   chatOpen?: boolean,
 *   editing?: boolean,
 *   riding?: boolean,
 *   nearby?: boolean,
 * }} input
 */
export function hudStateFor(input = {}) {
  if (input.menuOpen) return 'menu';
  if (input.chatOpen) return 'chat';
  if (input.editing) return 'editing';
  if (input.riding) return 'vehicle';
  if (input.nearby) return 'nearby';
  return 'exploration';
}

/** True when the joystick / walking actions should be on screen. */
export function hudShowsMovement(state) {
  return state === 'exploration' || state === 'nearby' || state === 'social';
}

/** True when the contextual action cluster should be on screen. */
export function hudShowsActions(state) {
  return state === 'exploration' || state === 'nearby' || state === 'vehicle';
}

const PROMPT_PREFIX = /^(?:Tap|Press\s+\S+)\s*·\s*/i;

/**
 * The viewport reports one string for whatever is in reach, e.g.
 * `Tap · Ride Elevator` or `Press E · Turn Off Table Lamp`. The HUD turns that
 * into a compact contextual action: a clean label, an icon family and a state.
 *
 * @param {unknown} raw
 * @returns {{label: string, kind: string, keyHint: string|null}|null}
 */
export function parseContextPrompt(raw) {
  if (typeof raw !== 'string') return null;
  const label = raw.replace(PROMPT_PREFIX, '').trim();
  if (!label) return null;
  const lower = label.toLowerCase();
  let kind = 'interact';
  if (/^stand up/.test(lower)) kind = 'stand';
  else if (/^sit\b/.test(lower)) kind = 'sit';
  else if (/^turn (on|off)/.test(lower)) kind = 'toggle';
  else if (/^(talk|chat)\b/.test(lower)) kind = 'talk';
  else if (/^(step off|exit|leave)\b/.test(lower)) kind = 'exit';
  // "Enter Keycard (Suite 402)" is an unlock, not a doorway.
  else if (/keycard|unlock/.test(lower)) kind = 'key';
  else if (/^(ride|board|enter|go to|take)\b/.test(lower)) kind = 'enter';
  else if (/^(open|ring|intercom|use)\b/.test(lower)) kind = 'open';
  const keyHint = /^press\s+\S+/i.test(raw) ? (raw.match(/^press\s+(\S+)/i)?.[1] ?? null) : null;
  return {label, kind, keyHint: keyHint ? keyHint.toUpperCase() : null};
}

/** Short verb shown on the large contextual button, derived from its label. */
export function contextActionVerb(kind) {
  switch (kind) {
    case 'sit':
      return 'Sit';
    case 'stand':
      return 'Stand';
    case 'toggle':
      return 'Use';
    case 'talk':
      return 'Talk';
    case 'exit':
      return 'Exit';
    case 'enter':
      return 'Enter';
    case 'key':
      return 'Unlock';
    case 'open':
      return 'Open';
    default:
      return 'Interact';
  }
}
