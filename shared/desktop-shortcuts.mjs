/**
 * Desktop keyboard routing for the voice, chat and camera shortcuts.
 *
 * Pure so the rules (including "never while typing") can be tested without a
 * browser. `mode === 'edit'` keeps the room builder's existing R = rotate.
 */

/** @typedef {'microphone'|'voice-range'|'chat'|'avatar-zoom'|'rotate'} ShortcutAction */

export const SHORTCUT_CODES = {
  microphone: 'KeyT',
  voiceRange: 'KeyR',
  chat: 'KeyC',
  avatarZoom: 'KeyZ',
};

/**
 * @param {{tagName?: string, isContentEditable?: boolean, role?: string|null}|null|undefined} element
 */
export function isEditableElement(element) {
  if (!element) return false;
  const tagName = String(element.tagName ?? '').toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (element.isContentEditable === true) return true;
  return element.role === 'textbox';
}

/**
 * @param {{code?: string, key?: string}} input
 * @returns {string}
 */
function resolveCode(input) {
  if (input.code) return input.code;
  const key = String(input.key ?? '');
  if (key.length === 1 && /[a-z]/i.test(key)) return `Key${key.toUpperCase()}`;
  return '';
}

/**
 * @param {{
 *   code?: string,
 *   key?: string,
 *   typing?: boolean,
 *   modalOpen?: boolean,
 *   mode?: 'walk'|'edit',
 * }} input
 * @returns {ShortcutAction|null}
 */
export function resolveShortcut(input) {
  if (input.typing === true || input.modalOpen === true) return null;
  const code = resolveCode(input);
  switch (code) {
    case SHORTCUT_CODES.microphone:
      return 'microphone';
    case SHORTCUT_CODES.chat:
      return 'chat';
    case SHORTCUT_CODES.avatarZoom:
      return 'avatar-zoom';
    case SHORTCUT_CODES.voiceRange:
      // In the furniture builder R still rotates the selection.
      return input.mode === 'edit' ? 'rotate' : 'voice-range';
    default:
      return null;
  }
}
