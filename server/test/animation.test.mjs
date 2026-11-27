import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANIMATION_STATES,
  MAX_ANIMATION_LABEL,
  SOCIAL_EMOTES,
  animationForPose,
  isLocomotionState,
  isMovingAnimation,
  normalizeAnimation,
  stridePhaseStep,
  turnLeanFor,
} from '../../shared/animation.mjs';

test('animation vocabulary covers every requested everyday state', () => {
  for (const state of [
    'idle',
    'walk',
    'run',
    'sit',
    'stand',
    'wave',
    'talk',
    'gesture',
    'enter_vehicle',
    'exit_vehicle',
  ]) {
    assert.ok(ANIMATION_STATES.includes(state), `missing animation state ${state}`);
  }
  assert.ok(SOCIAL_EMOTES.includes('talk'));
  assert.ok(SOCIAL_EMOTES.includes('gesture'));
  assert.ok(isLocomotionState('walk'));
  assert.ok(isLocomotionState('run'));
  assert.ok(!isLocomotionState('sit'));
});

test('only known animation labels survive the network boundary', () => {
  assert.equal(normalizeAnimation('wave'), 'wave');
  assert.equal(normalizeAnimation('enter_vehicle'), 'enter_vehicle');
  assert.equal(normalizeAnimation('moonwalk'), null);
  assert.equal(normalizeAnimation(''), null);
  assert.equal(normalizeAnimation(null), null);
  assert.equal(normalizeAnimation(42), null);
  assert.ok(MAX_ANIMATION_LABEL <= 16);
});

test('gait follows actual speed, sprint input and seating', () => {
  assert.equal(animationForPose({ speed: 0, emote: 'idle' }), 'idle');
  assert.equal(animationForPose({ speed: 1.8 }), 'walk');
  assert.equal(animationForPose({ speed: 4.5 }), 'walk');
  assert.equal(animationForPose({ speed: 4.7 }), 'run');
  assert.equal(animationForPose({ speed: 1.8, sprinting: true }), 'run');
  assert.equal(animationForPose({ speed: 0, emote: 'wave' }), 'wave');
  assert.equal(animationForPose({ speed: 1.8, emote: 'wave' }), 'walk');
  assert.equal(animationForPose({ speed: 0, seated: true, emote: 'wave' }), 'sit');
  assert.equal(animationForPose({ inVehicle: true }), 'sit');
  assert.equal(animationForPose({ inVehicle: true, emote: 'enter_vehicle' }), 'enter_vehicle');
  assert.equal(animationForPose({ inVehicle: true, emote: 'exit_vehicle' }), 'exit_vehicle');
});

test('a stale walk label does not animate a stationary avatar', () => {
  assert.equal(isMovingAnimation('walk', 0), false);
  assert.equal(isMovingAnimation('idle', 0), false);
  assert.equal(isMovingAnimation('wave', 0), false);
  assert.equal(isMovingAnimation('idle', 1.2), true);
  assert.equal(animationForPose({ speed: 0, emote: 'run' }), 'idle');
  assert.equal(animationForPose({ speed: 0.1, emote: 'walk' }), 'idle');
});

test('stride phase is distance driven and bounded', () => {
  assert.equal(stridePhaseStep(0, 0.1), 0);
  assert.equal(stridePhaseStep(2, 0), 0);
  const slow = stridePhaseStep(1.2, 0.05);
  const fast = stridePhaseStep(6, 0.05);
  assert.ok(slow > 0);
  assert.ok(fast > slow);
  assert.ok(fast <= 11.5 * 0.05 + 1e-9);
  // Two half frames advance the same distance as one full frame.
  assert.ok(Math.abs(stridePhaseStep(2, 0.1) - (stridePhaseStep(2, 0.05) * 2)) < 1e-9);
});

test('turning lean is subtle and clamped', () => {
  assert.equal(turnLeanFor(0), 0);
  assert.equal(turnLeanFor(Number.NaN), 0);
  assert.ok(turnLeanFor(100) <= 0.12);
  assert.ok(turnLeanFor(-100) >= -0.12);
  assert.ok(turnLeanFor(2) > 0);
  assert.ok(turnLeanFor(-2) < 0);
});
