/**
 * Shared input state for touch controls.
 *
 * The keyboard path and the touch path feed the same movement code in the
 * viewport, so a phone and a desktop run identical game logic. Values are
 * intentionally a mutable module singleton: the render loop reads them every
 * frame without triggering React re-renders.
 */
export interface TouchInputState {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  interact: boolean;
  lookDx: number;
  lookDy: number;
}

export const touchInput: TouchInputState = {
  moveX: 0,
  moveZ: 0,
  sprint: false,
  jump: false,
  interact: false,
  lookDx: 0,
  lookDy: 0,
};

export function resetTouchInput() {
  touchInput.moveX = 0;
  touchInput.moveZ = 0;
  touchInput.sprint = false;
  touchInput.jump = false;
  touchInput.interact = false;
  touchInput.lookDx = 0;
  touchInput.lookDy = 0;
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}
