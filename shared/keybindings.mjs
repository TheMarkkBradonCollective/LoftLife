/**
 * Player keybindings, shared by the browser, the server and the tests.
 *
 * Movement is context-specific: `isometric` bindings pan the camera, `play`
 * bindings move the avatar. The same physical key (WASD) is therefore a
 * legitimate default in both contexts and is not reported as a conflict.
 * Every other action is global.
 */

export const BINDING_SCOPES = /** @type {const} */ (['isometric', 'play', 'global']);

/**
 * @typedef {'isometric'|'play'|'global'} BindingScope
 * @typedef {{
 *   id: string,
 *   label: string,
 *   category: string,
 *   scope: BindingScope,
 *   detail: string,
 * }} BindingAction
 */

/** @type {BindingAction[]} */
export const BINDING_ACTIONS = [
  { id: 'isoForward', label: 'Move forward', category: 'Isometric movement', scope: 'isometric', detail: 'Moves the avatar relative to the isometric camera.' },
  { id: 'isoBack', label: 'Move backward', category: 'Isometric movement', scope: 'isometric', detail: 'Moves the avatar relative to the isometric camera.' },
  { id: 'isoLeft', label: 'Move left', category: 'Isometric movement', scope: 'isometric', detail: 'Moves the avatar relative to the isometric camera.' },
  { id: 'isoRight', label: 'Move right', category: 'Isometric movement', scope: 'isometric', detail: 'Moves the avatar relative to the isometric camera.' },
  { id: 'follow', label: 'Follow character', category: 'Isometric camera', scope: 'isometric', detail: 'Toggles the isometric camera following your character.' },

  { id: 'playForward', label: 'Walk forward', category: 'Third-Person movement', scope: 'play', detail: 'Moves the avatar relative to the camera.' },
  { id: 'playBack', label: 'Walk backward', category: 'Play View movement', scope: 'play', detail: 'Moves the avatar relative to the camera.' },
  { id: 'playLeft', label: 'Strafe left', category: 'Play View movement', scope: 'play', detail: 'Moves the avatar relative to the camera.' },
  { id: 'playRight', label: 'Strafe right', category: 'Play View movement', scope: 'play', detail: 'Moves the avatar relative to the camera.' },
  { id: 'sprint', label: 'Sprint', category: 'Play View movement', scope: 'play', detail: 'Hold to run.' },
  { id: 'jump', label: 'Jump / stand up', category: 'Play View movement', scope: 'play', detail: 'Jumps, or stands from a seat.' },

  { id: 'zoom', label: 'Close / wide zoom', category: 'Camera', scope: 'global', detail: 'Changes distance only; follow state is untouched.' },
  { id: 'playToggle', label: 'Switch camera mode', category: 'Camera', scope: 'global', detail: 'Isometric ↔ Third-Person (V by default).' },
  { id: 'menu', label: 'Map & World Menu', category: 'Map & World', scope: 'global', detail: 'Opens the central map, world and controls menu.' },
  { id: 'interact', label: 'Interact', category: 'Interaction', scope: 'global', detail: 'Doors, lifts, seats, NPCs and transit stops.' },
  { id: 'voice', label: 'Microphone (push to talk)', category: 'Voice & Microphone', scope: 'global', detail: 'Hold in push-to-talk, tap in other modes.' },
  { id: 'voiceRange', label: 'Cycle voice range', category: 'Voice & Microphone', scope: 'global', detail: 'Whisper → Talk → Shout → Off.' },
  { id: 'chat', label: 'Open / close chat', category: 'Chat', scope: 'global', detail: 'Focus moves to the chat composer.' },
];

/** Defaults are physical `KeyboardEvent.code` values. */
export const DEFAULT_BINDINGS = Object.freeze({
  isoForward: 'KeyW',
  isoBack: 'KeyS',
  isoLeft: 'KeyA',
  isoRight: 'KeyD',
  follow: 'KeyF',
  playForward: 'KeyW',
  playBack: 'KeyS',
  playLeft: 'KeyA',
  playRight: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  zoom: 'KeyZ',
  playToggle: 'KeyV',
  menu: 'KeyM',
  interact: 'KeyE',
  voice: 'KeyT',
  voiceRange: 'KeyR',
  chat: 'KeyC',
});

export const TOUCH_SIZES = /** @type {const} */ (['sm', 'md', 'lg']);
export const TOUCH_HANDEDNESS = /** @type {const} */ (['right', 'left']);

export const DEFAULT_TOUCH_LAYOUT = Object.freeze({
  size: 'md',
  handedness: 'right',
  opacity: 100,
});

/** Codes a player must not be able to steal from the browser/OS. */
const RESERVED_CODES = new Set([
  'F5',
  'F11',
  'F12',
  'Tab',
  'Escape',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
  'PrintScreen',
]);

const CODE_PATTERN = /^(?:(?:Ctrl|Alt|Shift|Meta)\+)*(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Space|Enter|Numpad[0-9]|NumpadEnter|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Minus|Equal|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Backquote|Home|End|PageUp|PageDown|Insert|Delete)$/;

const CODE_LABELS = {
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** Human label for a binding such as `Ctrl+KeyW` or `ShiftLeft`. */
export function keyLabel(binding) {
  if (!binding) return 'Unbound';
  return String(binding)
    .split('+')
    .map((part) => {
      if (CODE_LABELS[part]) return CODE_LABELS[part];
      if (/^Key[A-Z]$/.test(part)) return part.slice(3);
      if (/^Digit[0-9]$/.test(part)) return part.slice(5);
      if (/^Numpad[0-9]$/.test(part)) return `Num${part.slice(6)}`;
      return part;
    })
    .join(' + ');
}

export function isReservedBinding(code) {
  return !code || RESERVED_CODES.has(String(code).split('+').pop());
}

export function isValidBinding(code) {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

/** Canonical binding string from a keyboard event. */
export function eventToBinding(event) {
  const code = String(event?.code ?? '');
  if (!code) return '';
  if (/^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code)) return code;
  const mods = [];
  if (event.ctrlKey) mods.push('Ctrl');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');
  if (event.metaKey) mods.push('Meta');
  return [...mods, code].join('+');
}

export function bindingMatchesEvent(binding, event) {
  return Boolean(binding) && binding === eventToBinding(event);
}

/** Whether a held-code set satisfies a binding (modifier-aware). */
export function bindingHeld(binding, keys) {
  if (!binding || !keys) return false;
  const parts = String(binding).split('+');
  const code = parts.pop();
  if (!keys[code]) return false;
  const mods = new Set(parts);
  if (mods.has('Ctrl') && !(keys.ControlLeft || keys.ControlRight)) return false;
  if (mods.has('Alt') && !(keys.AltLeft || keys.AltRight)) return false;
  if (mods.has('Meta') && !(keys.MetaLeft || keys.MetaRight)) return false;
  if (mods.has('Shift')) {
    // A modifier-only binding (ShiftLeft) is already checked as its own code.
    if (!keys.ShiftLeft && !keys.ShiftRight) return false;
  }
  return true;
}

/** Keep only known actions with valid codes; fill gaps with defaults. */
export function normalizeBindings(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  /** @type {Record<string,string>} */
  const result = {};
  for (const action of BINDING_ACTIONS) {
    const candidate = source[action.id];
    result[action.id] =
      isValidBinding(candidate) && !isReservedBinding(candidate)
        ? candidate
        : DEFAULT_BINDINGS[action.id];
  }
  return result;
}

export function normalizeTouchLayout(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const size = TOUCH_SIZES.includes(source.size) ? source.size : DEFAULT_TOUCH_LAYOUT.size;
  const handedness = TOUCH_HANDEDNESS.includes(source.handedness)
    ? source.handedness
    : DEFAULT_TOUCH_LAYOUT.handedness;
  const opacity = Math.max(55, Math.min(100, Number(source.opacity) || DEFAULT_TOUCH_LAYOUT.opacity));
  return { size, handedness, opacity };
}

export function normalizeControlsPayload(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    bindings: normalizeBindings(source.bindings),
    touch: normalizeTouchLayout(source.touch),
    updatedAt: Number(source.updatedAt) || 0,
  };
}

/** Actions whose binding overlaps the changed action's context. */
export function findConflicts(bindings, actionId, code) {
  if (!code) return [];
  const target = BINDING_ACTIONS.find((action) => action.id === actionId);
  if (!target) return [];
  return BINDING_ACTIONS.filter((action) => {
    if (action.id === actionId) return false;
    if (bindings[action.id] !== code) return false;
    if (target.scope === 'global' || action.scope === 'global') return true;
    return target.scope === action.scope;
  });
}

/**
 * Assign `code`; when `replace` is true, conflicting actions in the same
 * context are unbound (the UI normally asks first). Returns the new map.
 */
export function assignBinding(bindings, actionId, code, { replace = false } = {}) {
  if (!isValidBinding(code) || isReservedBinding(code)) return { ...bindings, error: 'reserved' };
  const conflicts = findConflicts(bindings, actionId, code);
  if (conflicts.length > 0 && !replace) return { ...bindings, conflicts };
  const next = { ...bindings, [actionId]: code };
  for (const conflict of conflicts) next[conflict.id] = '';
  return next;
}

export function resetBinding(bindings, actionId) {
  return { ...bindings, [actionId]: DEFAULT_BINDINGS[actionId] };
}

export function resetAllBindings() {
  return { ...DEFAULT_BINDINGS };
}

/** Locate the action a binding belongs to inside one camera context. */
export function actionForBinding(bindings, code, mode) {
  const match = BINDING_ACTIONS.find((action) => {
    if (bindings[action.id] !== code) return false;
    return action.scope === 'global' || action.scope === mode;
  });
  return match?.id ?? null;
}

export const KEYBINDING_STORAGE_KEY = 'loftlife_keybindings_v1';
