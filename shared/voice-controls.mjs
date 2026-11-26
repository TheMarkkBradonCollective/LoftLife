/**
 * Voice policy shared by every LoftLife surface.
 *
 * Voice *range* (how far the voice carries) and microphone *mode* (when the
 * microphone transmits) are deliberately separate settings:
 *
 *   range: off -> whisper (4 m) -> talk (14 m) -> shout (35 m) -> off
 *   mode:  push-to-talk | toggle-to-talk | voice-activation | open-mic |
 *          push-to-mute
 *
 * The desktop shortcuts, the mobile bubble, the Audio & Voice settings panel
 * and the WebRTC layer all read the same `VoiceControlState`, so the platforms
 * can never disagree. This module is plain ESM with no DOM access so the
 * node:test suite can exercise the exact logic the app runs.
 */

/** @typedef {'off'|'whisper'|'talk'|'shout'} VoiceRange */
/** @typedef {'push-to-talk'|'toggle-to-talk'|'voice-activation'|'open-mic'|'push-to-mute'} MicMode */
/** @typedef {'whisper'|'say'|'shout'} AudibleVoiceMode */
/** @typedef {'off'|'unavailable'|'denied'|'requesting'|'range-off'|'idle'|'transmitting'|'muted'|'suspended'} MicrophoneIndicator */

/** @type {VoiceRange[]} */
export const VOICE_RANGES = ['off', 'whisper', 'talk', 'shout'];

/** Cycle order required by the R shortcut and the mobile range button. */
/** @type {MicMode[]} */
export const MIC_MODES = [
  'push-to-talk',
  'toggle-to-talk',
  'voice-activation',
  'open-mic',
  'push-to-mute',
];

/** @type {Record<VoiceRange, {label: string, meters: number, detail: string}>} */
export const VOICE_RANGE_INFO = {
  off: { label: 'Off', meters: 0, detail: 'Your microphone never transmits.' },
  whisper: { label: 'Whisper', meters: 4, detail: 'Only players right beside you hear you.' },
  talk: { label: 'Talk', meters: 14, detail: 'Normal conversation distance.' },
  shout: { label: 'Shout', meters: 35, detail: 'Players across the room still hear you.' },
};

/** @type {Record<MicMode, {label: string, summary: string, desktop: string, mobile: string}>} */
export const MIC_MODE_INFO = {
  'push-to-talk': {
    label: 'Push-to-Talk',
    summary: 'Hold to transmit, release to stop.',
    desktop: 'Hold T to talk.',
    mobile: 'Press and hold the mic to talk.',
  },
  'toggle-to-talk': {
    label: 'Toggle-to-Talk',
    summary: 'Tap once to start, tap again to stop.',
    desktop: 'Press T to start and T again to stop.',
    mobile: 'Tap the mic to start and tap again to stop.',
  },
  'voice-activation': {
    label: 'Voice Activation',
    summary: 'Transmits automatically when speech is detected.',
    desktop: 'Speak and the mic opens by itself; T is not needed.',
    mobile: 'Speak and the mic opens by itself; no key needed.',
  },
  'open-mic': {
    label: 'Open Mic',
    summary: 'Transmits continuously while Voice Range is on.',
    desktop: 'The mic is live whenever Voice Range is not Off.',
    mobile: 'The mic is live whenever Voice Range is not Off.',
  },
  'push-to-mute': {
    label: 'Push-to-Mute',
    summary: 'Normally live; hold to mute temporarily.',
    desktop: 'The mic is live whenever Voice Range is not Off; hold T to mute.',
    mobile: 'Hold the mic to mute temporarily.',
  },
};

export const DEFAULT_VOICE_PREFERENCES = {
  /** @type {VoiceRange} */
  range: 'off',
  /** @type {MicMode} */
  micMode: 'push-to-talk',
  sensitivity: 0.55,
};

/** @param {unknown} value */
export const isVoiceRange = (value) => typeof value === 'string' && VOICE_RANGES.includes(value);

/** @param {unknown} value */
export const isMicMode = (value) => typeof value === 'string' && MIC_MODES.includes(value);

/**
 * @param {unknown} value
 * @param {VoiceRange} [fallback]
 * @returns {VoiceRange}
 */
export function normalizeVoiceRange(value, fallback = 'off') {
  return isVoiceRange(value) ? /** @type {VoiceRange} */ (value) : fallback;
}

/**
 * @param {unknown} value
 * @param {MicMode} [fallback]
 * @returns {MicMode}
 */
export function normalizeMicMode(value, fallback = 'push-to-talk') {
  return isMicMode(value) ? /** @type {MicMode} */ (value) : fallback;
}

/**
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeSensitivity(value, fallback = DEFAULT_VOICE_PREFERENCES.sensitivity) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

/**
 * Accepts partial/legacy/corrupt preference objects (local storage, account
 * sync) and always returns a usable, fully-normalized object.
 * @param {unknown} input
 * @returns {{range: VoiceRange, micMode: MicMode, sensitivity: number}}
 */
export function normalizeVoicePreferences(input) {
  const source = input && typeof input === 'object' ? /** @type {Record<string, unknown>} */ (input) : {};
  return {
    range: normalizeVoiceRange(source.range, DEFAULT_VOICE_PREFERENCES.range),
    micMode: normalizeMicMode(source.micMode, DEFAULT_VOICE_PREFERENCES.micMode),
    sensitivity: normalizeSensitivity(source.sensitivity, DEFAULT_VOICE_PREFERENCES.sensitivity),
  };
}

/**
 * Off -> Whisper -> Talk -> Shout -> Off.
 * @param {VoiceRange} range
 * @returns {VoiceRange}
 */
export function cycleVoiceRange(range) {
  const current = normalizeVoiceRange(range);
  const index = VOICE_RANGES.indexOf(current);
  return VOICE_RANGES[(index + 1) % VOICE_RANGES.length];
}

/**
 * Wire format for other clients: talk is called "say" in the realtime protocol.
 * @param {VoiceRange} range
 * @returns {AudibleVoiceMode|'off'}
 */
export function rangeToAudibleMode(range) {
  const normalized = normalizeVoiceRange(range);
  if (normalized === 'talk') return 'say';
  return normalized;
}

/**
 * Microphone RMS threshold for voice activation. Higher sensitivity listens
 * for quieter speech, so the threshold moves down as sensitivity rises.
 * @param {number} sensitivity 0..1
 * @returns {number} threshold in the 0..1 level range
 */
export function sensitivityToThreshold(sensitivity) {
  const value = normalizeSensitivity(sensitivity);
  return Math.round((0.16 - 0.13 * value) * 1000) / 1000;
}

/**
 * Pure transmission decision used by every platform.
 * @param {{range?: VoiceRange, micMode?: MicMode, held?: boolean, toggled?: boolean, speaking?: boolean, micReady?: boolean, suspended?: boolean}} input
 * @returns {{transmitting: boolean, muted: boolean, reason: string}}
 */
export function computeTransmission(input = {}) {
  const range = normalizeVoiceRange(input.range);
  const micMode = normalizeMicMode(input.micMode);
  const micReady = input.micReady === true;
  const held = input.held === true;
  const toggled = input.toggled === true;
  const speaking = input.speaking === true;

  /** @param {string} reason */
  const idle = (reason) => ({ transmitting: false, muted: false, reason });

  if (!micReady) return idle('microphone-off');
  // Voice Range Off always wins, whatever the microphone mode is.
  if (range === 'off') return idle('range-off');
  // A reconnect requires a fresh, intentional action before transmitting again.
  if (input.suspended === true) return idle('suspended');

  switch (micMode) {
    case 'toggle-to-talk':
      return toggled
        ? { transmitting: true, muted: false, reason: 'toggled' }
        : idle('toggle-idle');
    case 'voice-activation':
      return speaking
        ? { transmitting: true, muted: false, reason: 'speech' }
        : idle('listening');
    case 'open-mic':
      return { transmitting: true, muted: false, reason: 'open-mic' };
    case 'push-to-mute':
      return held
        ? { transmitting: false, muted: true, reason: 'muted' }
        : { transmitting: true, muted: false, reason: 'open-mic' };
    case 'push-to-talk':
    default:
      return held ? { transmitting: true, muted: false, reason: 'held' } : idle('idle');
  }
}

/**
 * What the microphone badge should say.
 * @param {string} status VoiceManager status
 * @param {{range?: VoiceRange, transmitting?: boolean, muted?: boolean, suspended?: boolean}} transmission
 * @returns {MicrophoneIndicator}
 */
export function microphoneIndicator(status, transmission = {}) {
  if (status === 'unsupported') return 'unavailable';
  if (status === 'denied') return 'denied';
  if (status === 'requesting') return 'requesting';
  if (status !== 'ready') return 'off';
  if (normalizeVoiceRange(transmission.range) === 'off') return 'range-off';
  if (transmission.transmitting === true) return 'transmitting';
  if (transmission.muted === true) return 'muted';
  if (transmission.suspended === true) return 'suspended';
  return 'idle';
}

/**
 * The single source of truth for range, microphone mode and transient
 * transmission state. Both the desktop shortcuts and the mobile bubble mutate
 * this object; React only mirrors its snapshot.
 */
export class VoiceControlState {
  /** @param {unknown} [preferences] */
  constructor(preferences = {}) {
    const initial = normalizeVoicePreferences(preferences);
    /** @type {VoiceRange} */
    this.range = initial.range;
    /** @type {MicMode} */
    this.micMode = initial.micMode;
    this.sensitivity = initial.sensitivity;
    this.held = false;
    this.toggled = false;
    this.speaking = false;
    this.micReady = false;
    this.suspended = false;
  }

  /** Clears per-gesture state and stops transmission until the next action. */
  clearHolds() {
    this.held = false;
    this.toggled = false;
    this.speaking = false;
  }

  /** @param {boolean} ready */
  setMicReady(ready) {
    this.micReady = Boolean(ready);
    if (!this.micReady) this.clearHolds();
    return this;
  }

  /** @param {VoiceRange} range */
  setRange(range) {
    this.range = normalizeVoiceRange(range, this.range);
    if (this.range === 'off') this.clearHolds();
    this.suspended = false;
    return this.range;
  }

  cycleRange() {
    return this.setRange(cycleVoiceRange(this.range));
  }

  /** @param {MicMode} mode */
  setMicMode(mode) {
    const next = normalizeMicMode(mode, this.micMode);
    if (next !== this.micMode) {
      this.clearHolds();
      this.micMode = next;
    }
    this.suspended = false;
    return this.micMode;
  }

  /** @param {number} value */
  setSensitivity(value) {
    this.sensitivity = normalizeSensitivity(value, this.sensitivity);
    return this.sensitivity;
  }

  /**
   * One microphone control press. Toggle-to-talk flips its latch; every other
   * mode treats the press as a hold (talk or temporary mute).
   */
  pressMicrophone() {
    this.suspended = false;
    if (this.micMode === 'toggle-to-talk') {
      this.toggled = !this.toggled;
      return { toggled: this.toggled };
    }
    this.held = true;
    return { held: true };
  }

  releaseMicrophone() {
    this.held = false;
    return { held: false };
  }

  /** @param {boolean} speaking */
  setSpeaking(speaking) {
    this.speaking = Boolean(speaking) && this.micMode === 'voice-activation' && !this.suspended;
    return this.speaking;
  }

  /**
   * Connection lost / player disconnected: stop transmitting without changing
   * the selected microphone mode. The next mic action resumes normally.
   */
  suspend() {
    this.clearHolds();
    this.suspended = true;
    return this;
  }

  get transmission() {
    return computeTransmission({
      range: this.range,
      micMode: this.micMode,
      held: this.held,
      toggled: this.toggled,
      speaking: this.speaking,
      micReady: this.micReady,
      suspended: this.suspended,
    });
  }

  snapshot() {
    const transmission = this.transmission;
    return {
      range: this.range,
      micMode: this.micMode,
      sensitivity: this.sensitivity,
      held: this.held,
      toggled: this.toggled,
      speaking: this.speaking,
      suspended: this.suspended,
      micReady: this.micReady,
      transmitting: transmission.transmitting,
      muted: transmission.muted,
      reason: transmission.reason,
    };
  }

  preferences() {
    return {
      range: this.range,
      micMode: this.micMode,
      sensitivity: this.sensitivity,
    };
  }
}
