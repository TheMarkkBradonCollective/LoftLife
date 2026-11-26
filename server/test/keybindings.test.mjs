import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BINDINGS,
  DEFAULT_TOUCH_LAYOUT,
  actionForBinding,
  assignBinding,
  bindingHeld,
  bindingMatchesEvent,
  eventToBinding,
  findConflicts,
  keyLabel,
  normalizeBindings,
  normalizeControlsPayload,
  normalizeTouchLayout,
  resetAllBindings,
  resetBinding,
} from '../../shared/keybindings.mjs';

test('defaults keep Isometric and Play View movement distinct but share WASD physically', () => {
  assert.equal(DEFAULT_BINDINGS.isoForward, 'KeyW');
  assert.equal(DEFAULT_BINDINGS.playForward, 'KeyW');
  assert.equal(findConflicts(DEFAULT_BINDINGS, 'isoForward', 'KeyW').length, 0);
  assert.equal(findConflicts(DEFAULT_BINDINGS, 'playForward', 'KeyW').length, 0);
});

test('conflicts are detected inside a context and through global actions', () => {
  const isoConflict = findConflicts(DEFAULT_BINDINGS, 'isoRight', DEFAULT_BINDINGS.isoLeft);
  assert.deepEqual(isoConflict.map((action) => action.id), ['isoLeft']);

  const globalConflict = findConflicts(DEFAULT_BINDINGS, 'zoom', DEFAULT_BINDINGS.menu);
  assert.ok(globalConflict.some((action) => action.id === 'menu'));

  assert.equal(findConflicts(DEFAULT_BINDINGS, 'isoForward', 'KeyQ').length, 0);
  assert.equal(findConflicts(DEFAULT_BINDINGS, 'playForward', 'KeyQ').length, 0);
  assert.equal(findConflicts(DEFAULT_BINDINGS, 'playForward', 'KeyF').length, 0, 'Isometric-only keys do not conflict with Play View');
});

test('assignment requires explicit replacement and then frees the old binding', () => {
  const pending = assignBinding(DEFAULT_BINDINGS, 'isoForward', 'KeyS');
  assert.ok(Array.isArray(pending.conflicts));
  assert.equal(pending.isoForward, 'KeyW', 'nothing changes before confirmation');

  const replaced = assignBinding(DEFAULT_BINDINGS, 'isoForward', 'KeyS', { replace: true });
  assert.equal(replaced.isoForward, 'KeyS');
  assert.equal(replaced.isoBack, '');
  assert.equal(replaced.playForward, 'KeyW', 'other context is untouched');
});

test('reserved system shortcuts and malformed codes are refused', () => {
  assert.equal(assignBinding(DEFAULT_BINDINGS, 'menu', 'F5').error, 'reserved');
  assert.equal(assignBinding(DEFAULT_BINDINGS, 'menu', 'Escape').error, 'reserved');
  assert.equal(assignBinding(DEFAULT_BINDINGS, 'menu', 'NotAKey').error, 'reserved');
  assert.notEqual(assignBinding(DEFAULT_BINDINGS, 'menu', 'Ctrl+KeyM').error, 'reserved');
});

test('individual and full reset return to the documented presets', () => {
  const custom = { ...DEFAULT_BINDINGS, menu: 'KeyN', zoom: 'Ctrl+KeyZ' };
  assert.equal(resetBinding(custom, 'menu').menu, 'KeyM');
  assert.deepEqual(resetAllBindings(), { ...DEFAULT_BINDINGS });
});

test('modifier combinations round-trip and match held state', () => {
  const combo = eventToBinding({ code: 'KeyW', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false });
  assert.equal(combo, 'Ctrl+KeyW');
  assert.equal(bindingMatchesEvent('Ctrl+KeyW', { code: 'KeyW', ctrlKey: true }), true);
  assert.equal(bindingMatchesEvent('Ctrl+KeyW', { code: 'KeyW' }), false);
  assert.equal(bindingHeld('Ctrl+KeyW', { KeyW: true, ControlLeft: true }), true);
  assert.equal(bindingHeld('Ctrl+KeyW', { KeyW: true }), false);
  assert.equal(bindingHeld('ShiftLeft', { ShiftLeft: true }), true);
  assert.equal(bindingHeld('Shift+KeyA', { KeyA: true, ShiftRight: true }), true);
});

test('labels are human readable', () => {
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('ShiftLeft'), 'Shift');
  assert.equal(keyLabel('Ctrl+KeyZ'), 'Ctrl + Z');
  assert.equal(keyLabel('Space'), 'Space');
});

test('stored payloads are normalized and drop unknown actions', () => {
  const normalized = normalizeControlsPayload({
    bindings: { menu: 'KeyN', madeUp: 'KeyX' },
    touch: { size: 'xl', handedness: 'left', opacity: 999 },
    updatedAt: 42,
  });
  assert.equal(normalized.bindings.menu, 'KeyN');
  assert.equal(normalized.bindings.isoForward, 'KeyW');
  assert.equal(normalized.touch.size, DEFAULT_TOUCH_LAYOUT.size);
  assert.equal(normalized.touch.handedness, 'left');
  assert.equal(normalized.touch.opacity, 100);
  assert.equal(normalized.updatedAt, 42);
  assert.equal(normalizeBindings({ menu: 'F5' }).menu, 'KeyM');
});

test('action lookup respects the active camera context', () => {
  assert.equal(actionForBinding(DEFAULT_BINDINGS, 'KeyW', 'isometric'), 'isoForward');
  assert.equal(actionForBinding(DEFAULT_BINDINGS, 'KeyW', 'play'), 'playForward');
  assert.equal(actionForBinding(DEFAULT_BINDINGS, 'KeyM', 'isometric'), 'menu');
  assert.equal(actionForBinding(DEFAULT_BINDINGS, 'KeyM', 'play'), 'menu');
});

test('touch layout normalizes size, handedness and opacity', () => {
  assert.deepEqual(normalizeTouchLayout({ size: 'lg', handedness: 'left', opacity: 80 }), {
    size: 'lg',
    handedness: 'left',
    opacity: 80,
  });
});
