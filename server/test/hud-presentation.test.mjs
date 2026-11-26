import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HUD_PRESENTATIONS,
  contextActionVerb,
  hudShowsActions,
  hudShowsMovement,
  hudStateFor,
  parseContextPrompt,
  resolveHudPresentation,
} from '../../shared/hud-presentation.mjs';

test('six presentation targets are declared', () => {
  assert.deepEqual(
    [...HUD_PRESENTATIONS],
    [
      'mobile-portrait',
      'mobile-landscape',
      'tablet-portrait',
      'tablet-landscape',
      'desktop-browser',
      'desktop-app',
    ]
  );
});

test('touch devices resolve from runtime class and orientation, not width', () => {
  assert.equal(
    resolveHudPresentation({deviceClass: 'mobile', touch: true, portrait: true}),
    'mobile-portrait'
  );
  assert.equal(
    resolveHudPresentation({deviceClass: 'mobile', touch: true, portrait: false}),
    'mobile-landscape'
  );
  assert.equal(
    resolveHudPresentation({deviceClass: 'tablet', touch: true, portrait: true}),
    'tablet-portrait'
  );
  assert.equal(
    resolveHudPresentation({deviceClass: 'tablet', touch: true, portrait: false}),
    'tablet-landscape'
  );
});

test('desktop splits browser from installed app and never uses a touch layout', () => {
  assert.equal(
    resolveHudPresentation({deviceClass: 'desktop', touch: false, portrait: true}),
    'desktop-browser'
  );
  assert.equal(
    resolveHudPresentation({deviceClass: 'desktop', touch: false, installed: true}),
    'desktop-app'
  );
  // A hybrid laptop that just used its touchscreen keeps a touch HUD.
  assert.equal(
    resolveHudPresentation({deviceClass: 'desktop', touch: true}),
    'tablet-landscape'
  );
});

test('HUD state priority hides gameplay controls behind menus and chat', () => {
  assert.equal(hudStateFor({}), 'exploration');
  assert.equal(hudStateFor({nearby: true}), 'nearby');
  assert.equal(hudStateFor({nearby: true, riding: true}), 'vehicle');
  assert.equal(hudStateFor({nearby: true, riding: true, editing: true}), 'editing');
  assert.equal(hudStateFor({editing: true, chatOpen: true}), 'chat');
  assert.equal(hudStateFor({chatOpen: true, menuOpen: true}), 'menu');
});

test('movement and actions are hidden in editing, chat and menus', () => {
  for (const state of ['editing', 'chat', 'menu']) {
    assert.equal(hudShowsMovement(state), false, state);
    assert.equal(hudShowsActions(state), false, state);
  }
  assert.equal(hudShowsMovement('nearby'), true);
  assert.equal(hudShowsActions('vehicle'), true);
});

test('context prompts become a labelled action without the platform prefix', () => {
  assert.deepEqual(parseContextPrompt('Tap · Ride Elevator'), {
    label: 'Ride Elevator',
    kind: 'enter',
    keyHint: null,
  });
  assert.deepEqual(parseContextPrompt('Press E · Turn Off Table Lamp'), {
    label: 'Turn Off Table Lamp',
    kind: 'toggle',
    keyHint: 'E',
  });
  assert.equal(parseContextPrompt('Press E · Sit on Plush Sofa')?.kind, 'sit');
  assert.equal(parseContextPrompt('Tap · Enter Keycard (Suite 402)')?.kind, 'key');
  assert.equal(parseContextPrompt('Tap · Step off LoftLine A')?.kind, 'exit');
  assert.equal(parseContextPrompt(null), null);
  assert.equal(parseContextPrompt('   '), null);
  assert.equal(parseContextPrompt('Tap · Stand Up')?.label, 'Stand Up');
});

test('action verbs stay short enough for a circular button label', () => {
  assert.equal(contextActionVerb('sit'), 'Sit');
  assert.equal(contextActionVerb('enter'), 'Enter');
  assert.equal(contextActionVerb('toggle'), 'Use');
  assert.equal(contextActionVerb('anything-else'), 'Interact');
});
