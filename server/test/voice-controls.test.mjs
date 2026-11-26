/**
 * Voice policy tests: range cycling, the five microphone modes, the shared
 * transmission rules, indicators and desktop shortcut routing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_VOICE_PREFERENCES,
  MIC_MODES,
  VOICE_RANGES,
  VoiceControlState,
  computeTransmission,
  cycleVoiceRange,
  microphoneIndicator,
  normalizeVoicePreferences,
  rangeToAudibleMode,
  sensitivityToThreshold,
} from '../../shared/voice-controls.mjs';
import { isEditableElement, resolveShortcut } from '../../shared/desktop-shortcuts.mjs';

const ready = (preferences) => new VoiceControlState(preferences).setMicReady(true);

/* ------------------------------ voice range ----------------------------- */

test('voice range cycles Off → Whisper → Talk → Shout → Off', () => {
  const seen = [];
  let range = 'off';
  for (let i = 0; i < 8; i += 1) {
    seen.push(range);
    range = cycleVoiceRange(range);
  }
  assert.deepEqual(seen, [
    'off',
    'whisper',
    'talk',
    'shout',
    'off',
    'whisper',
    'talk',
    'shout',
  ]);
  assert.deepEqual(VOICE_RANGES, ['off', 'whisper', 'talk', 'shout']);
});

test('unknown range values normalise to Off instead of throwing', () => {
  assert.equal(normalizeVoicePreferences({ range: 'screaming' }).range, 'off');
  assert.equal(normalizeVoicePreferences(null).range, DEFAULT_VOICE_PREFERENCES.range);
  assert.equal(rangeToAudibleMode('talk'), 'say');
  assert.equal(rangeToAudibleMode('whisper'), 'whisper');
  assert.equal(rangeToAudibleMode('off'), 'off');
});

test('Voice Range Off blocks transmission in every microphone mode', () => {
  for (const micMode of MIC_MODES) {
    const controls = ready({ range: 'off', micMode });
    controls.held = true;
    controls.toggled = true;
    controls.speaking = true;
    const transmission = controls.transmission;
    assert.equal(transmission.transmitting, false, `${micMode} transmitted while range was Off`);
    assert.equal(transmission.reason, 'range-off');
  }
});

test('range changes are shared: the same state drives the shortcut and the bubble', () => {
  const controls = ready({ range: 'off', micMode: 'open-mic' });
  controls.cycleRange();
  assert.equal(controls.range, 'whisper');
  assert.equal(controls.transmission.transmitting, true);
  controls.cycleRange();
  controls.cycleRange();
  assert.equal(controls.range, 'shout');
  controls.cycleRange();
  assert.equal(controls.range, 'off');
  assert.equal(controls.transmission.transmitting, false, 'open mic must stop when range is Off');
});

/* --------------------------- microphone modes --------------------------- */

test('push-to-talk transmits only while held', () => {
  const controls = ready({ range: 'talk', micMode: 'push-to-talk' });
  assert.equal(controls.transmission.transmitting, false);
  controls.pressMicrophone();
  assert.equal(controls.transmission.transmitting, true);
  assert.equal(controls.transmission.reason, 'held');
  controls.releaseMicrophone();
  assert.equal(controls.transmission.transmitting, false);
});

test('toggle-to-talk latches on the first press and clears on the second', () => {
  const controls = ready({ range: 'talk', micMode: 'toggle-to-talk' });
  controls.pressMicrophone();
  controls.releaseMicrophone();
  assert.equal(controls.transmission.transmitting, true, 'release must not stop a toggle');
  controls.pressMicrophone();
  controls.releaseMicrophone();
  assert.equal(controls.transmission.transmitting, false);
});

test('voice activation follows detected speech and the sensitivity slider', () => {
  const controls = ready({ range: 'talk', micMode: 'voice-activation' });
  assert.equal(controls.transmission.transmitting, false);
  controls.setSpeaking(true);
  assert.equal(controls.transmission.transmitting, true);
  controls.setSpeaking(false);
  assert.equal(controls.transmission.transmitting, false);

  // Low sensitivity needs a louder voice than high sensitivity.
  assert.ok(sensitivityToThreshold(0.1) > sensitivityToThreshold(0.9));
  assert.ok(sensitivityToThreshold(0.5) > 0 && sensitivityToThreshold(0.5) < 1);
  // Speaking detection is ignored outside voice-activation.
  const ptt = ready({ range: 'talk', micMode: 'push-to-talk' });
  ptt.setSpeaking(true);
  assert.equal(ptt.transmission.transmitting, false);
});

test('open mic transmits whenever range is enabled', () => {
  const controls = ready({ range: 'talk', micMode: 'open-mic' });
  assert.equal(controls.transmission.transmitting, true);
  controls.suspend();
  assert.equal(controls.transmission.transmitting, false);
});

test('push-to-mute transmits by default and mutes only while held', () => {
  const controls = ready({ range: 'shout', micMode: 'push-to-mute' });
  assert.equal(controls.transmission.transmitting, true);
  controls.pressMicrophone();
  assert.equal(controls.transmission.muted, true);
  assert.equal(controls.transmission.transmitting, false);
  controls.releaseMicrophone();
  assert.equal(controls.transmission.transmitting, true);
  assert.equal(controls.transmission.muted, false);
});

test('nothing transmits before the microphone is ready', () => {
  for (const micMode of MIC_MODES) {
    const controls = new VoiceControlState({ range: 'talk', micMode });
    controls.pressMicrophone();
    controls.setSpeaking(true);
    assert.equal(controls.transmission.transmitting, false);
  }
});

test('switching microphone mode clears incompatible transmission state', () => {
  const controls = ready({ range: 'talk', micMode: 'toggle-to-talk' });
  controls.pressMicrophone();
  assert.equal(controls.transmission.transmitting, true);
  controls.setMicMode('push-to-talk');
  assert.equal(controls.toggled, false);
  assert.equal(controls.transmission.transmitting, false, 'a toggle must not leak into push-to-talk');

  controls.pressMicrophone();
  assert.equal(controls.transmission.transmitting, true);
  controls.setMicMode('open-mic');
  assert.equal(controls.held, false);
});

/* ------------------------------ reliability ----------------------------- */

test('suspend after a disconnect stops transmission and needs a fresh action', () => {
  const controls = ready({ range: 'talk', micMode: 'open-mic' });
  controls.suspend();
  assert.equal(controls.transmission.transmitting, false);
  assert.equal(controls.transmission.reason, 'suspended');
  assert.equal(controls.range, 'talk', 'the selected range survives a reconnect');
  assert.equal(controls.micMode, 'open-mic', 'the selected mode survives a reconnect');
  controls.pressMicrophone();
  assert.equal(controls.transmission.transmitting, true, 'an intentional press resumes');
});

test('losing focus releases a held microphone without changing the mode', () => {
  const controls = ready({ range: 'talk', micMode: 'push-to-talk' });
  controls.pressMicrophone();
  controls.releaseMicrophone();
  assert.equal(controls.transmission.transmitting, false);
  assert.equal(controls.micMode, 'push-to-talk');
});

test('turning the microphone off releases every held state', () => {
  const controls = ready({ range: 'talk', micMode: 'toggle-to-talk' });
  controls.pressMicrophone();
  controls.setMicReady(false);
  assert.equal(controls.toggled, false);
  assert.equal(controls.transmission.transmitting, false);
});

/* ------------------------------ indicators ------------------------------ */

test('microphone indicator distinguishes every state', () => {
  const snapshot = (overrides) => ({
    range: 'talk',
    transmitting: false,
    muted: false,
    suspended: false,
    ...overrides,
  });
  assert.equal(microphoneIndicator('off', snapshot({})), 'off');
  assert.equal(microphoneIndicator('denied', snapshot({})), 'denied');
  assert.equal(microphoneIndicator('unsupported', snapshot({})), 'unavailable');
  assert.equal(microphoneIndicator('requesting', snapshot({})), 'requesting');
  assert.equal(microphoneIndicator('ready', snapshot({ range: 'off' })), 'range-off');
  assert.equal(microphoneIndicator('ready', snapshot({})), 'idle');
  assert.equal(microphoneIndicator('ready', snapshot({ transmitting: true })), 'transmitting');
  assert.equal(microphoneIndicator('ready', snapshot({ muted: true })), 'muted');
  assert.equal(microphoneIndicator('ready', snapshot({ suspended: true })), 'suspended');
});

/* ------------------------------- shortcuts ------------------------------ */

test('desktop shortcuts resolve to the shared voice, chat and camera actions', () => {
  assert.equal(resolveShortcut({ code: 'KeyT' }), 'microphone');
  assert.equal(resolveShortcut({ code: 'KeyR' }), 'voice-range');
  assert.equal(resolveShortcut({ code: 'KeyC' }), 'chat');
  assert.equal(resolveShortcut({ code: 'KeyZ' }), 'camera-zoom');
  assert.equal(resolveShortcut({ code: 'KeyF' }), 'follow-camera');
  assert.equal(resolveShortcut({ code: 'KeyR', mode: 'edit' }), 'rotate');
  assert.equal(resolveShortcut({ code: 'KeyE' }), null);
  assert.equal(resolveShortcut({ key: 't' }), 'microphone', 'falls back to the key label');
});

test('shortcuts never fire while typing or while a dialog owns the screen', () => {
  for (const code of ['KeyT', 'KeyR', 'KeyC', 'KeyZ', 'KeyF']) {
    assert.equal(resolveShortcut({ code, typing: true }), null);
    assert.equal(resolveShortcut({ code, modalOpen: true }), null);
  }
  assert.equal(isEditableElement({ tagName: 'INPUT' }), true);
  assert.equal(isEditableElement({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableElement({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditableElement({ tagName: 'DIV', role: 'textbox' }), true);
  assert.equal(isEditableElement({ tagName: 'DIV' }), false);
  assert.equal(isEditableElement(null), false);
});

test('computeTransmission is pure and matches the controller', () => {
  const controls = ready({ range: 'whisper', micMode: 'push-to-talk' });
  controls.pressMicrophone();
  assert.deepEqual(
    computeTransmission({
      range: 'whisper',
      micMode: 'push-to-talk',
      held: true,
      micReady: true,
    }),
    controls.transmission
  );
});
