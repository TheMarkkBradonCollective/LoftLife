/**
 * Character animation vocabulary shared by the client renderer and the
 * multiplayer authority.
 *
 * The avatar rig is the single animation foundation for players, hotel staff,
 * stylists and city pedestrians. Keeping the state list here means:
 *  - the server can reject arbitrary animation labels from a modified client,
 *  - remote players render the same locomotion state the sender produced,
 *  - gait selection (walk vs run) is one rule, not a per-component guess.
 *
 * Animation states are *poses*. Movement is still driven by the authoritative
 * pose/e.mote pair: an avatar that stops moving returns to idle even if a stale
 * "walk" label was the last thing it sent.
 */

export const ANIMATION_STATES = Object.freeze([
  'idle',
  'walk',
  'run',
  'stand',
  'sit',
  'wave',
  'dance',
  'cheer',
  'talk',
  'gesture',
  'jump',
  'enter_vehicle',
  'exit_vehicle',
]);

/** States that represent travelling across the ground. */
export const LOCOMOTION_STATES = Object.freeze(['walk', 'run']);

/** States a player can intentionally hold as a social pose. */
export const SOCIAL_EMOTES = Object.freeze([
  'idle',
  'wave',
  'dance',
  'cheer',
  'talk',
  'gesture',
  'sit',
  'jump',
]);

const STATE_SET = new Set(ANIMATION_STATES);

/** Walk/run transition speed in metres per second (sprint input is separate). */
export const RUN_SPEED = 4.6;

/** Longest animation label accepted from a client. */
export const MAX_ANIMATION_LABEL = 16;

/** Return a known animation state, or null for anything unrecognised. */
export function normalizeAnimation(value) {
  return typeof value === 'string' && STATE_SET.has(value) ? value : null;
}

export function isLocomotionState(value) {
  return LOCOMOTION_STATES.includes(value);
}

/**
 * True when the state should visually advance the feet. A moving avatar that
 * reports a social emote (for example waving while walking) still walks; the
 * emote is suppressed until it stops, which avoids sliding or crouch-walking.
 */
export function isMovingAnimation(state, speed = 0) {
  if (state === 'walk' || state === 'run') return speed > 0.2;
  return speed > 0.2;
}

/**
 * Choose the pose to render for one avatar.
 *
 * @param {object} pose
 * @param {number} [pose.speed] metres per second along the ground
 * @param {boolean} [pose.sprinting] sprint input is held
 * @param {boolean} [pose.seated] sitting on a seat
 * @param {boolean} [pose.inVehicle] riding transit
 * @param {string} [pose.emote] requested social pose
 * @returns {string} an ANIMATION_STATES value
 */
export function animationForPose({ speed = 0, sprinting = false, seated = false, inVehicle = false, emote = 'idle' } = {}) {
  const requested = normalizeAnimation(emote) ?? 'idle';
  // Riders are seated for the whole trip; enter/exit are short transitions that
  // the UI can request explicitly.
  if (inVehicle) {
    if (requested === 'enter_vehicle' || requested === 'exit_vehicle') return requested;
    return 'sit';
  }
  if (seated && !isLocomotionState(requested)) return 'sit';
  if (speed > 0.25) {
    return sprinting || speed > RUN_SPEED || requested === 'run' ? 'run' : 'walk';
  }
  // A stale walk/run label from a stopped avatar must settle into idle rather
  // than march on the spot.
  if (isLocomotionState(requested)) return 'idle';
  return requested;
}

/**
 * Ground-distance-driven stride phase. Using distance rather than wall-clock
 * time keeps the feet planted at every speed: a slow walk takes short steps and
 * a sprint takes long ones instead of the legs cycling at a fixed rate.
 *
 * @returns the phase increment in radians for this frame
 */
export function stridePhaseStep(speed, delta) {
  if (!(speed > 0) || !(delta > 0)) return 0;
  // 6.5 rad/s at walking pace (~1.8 m/s), capped for a readable sprint cadence.
  const cadence = Math.min(11.5, Math.max(2.6, speed * 3.6));
  return cadence * delta;
}

/** Turn rate (radians/second) that reads as a lean rather than a snap. */
export function turnLeanFor(turnRate) {
  if (!Number.isFinite(turnRate)) return 0;
  return Math.max(-0.12, Math.min(0.12, turnRate * 0.045));
}
