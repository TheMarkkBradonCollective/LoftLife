import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, FastForward, Mic, Sparkles } from 'lucide-react';
import { touchInput } from '../game/touchInput';

interface TouchControlsProps {
  /** Hidden while a modal is open so taps reach the dialog. */
  active: boolean;
  voiceEnabled: boolean;
  onEmote: () => void;
  onTalkStart: () => void;
  onTalkEnd: () => void;
}

const STICK_RADIUS = 48;
const STICK_SIZE = 136;

/**
 * Mobile controls: a virtual stick plus contextual buttons.
 *
 * Camera drag-look is handled by the viewport canvas itself (a drag rotates,
 * a tap interacts), so there is deliberately no full-screen look pad here:
 * an overlay would swallow every tap on the right half of the scene.
 *
 * Everything feeds `touchInput`, which the viewport's render loop already reads.
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  active,
  voiceEnabled,
  onEmote,
  onTalkStart,
  onTalkEnd,
}) => {
  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprint, setSprint] = useState(false);

  // A modal can open mid-drag; the matching pointerup never arrives, so release
  // everything instead of leaving the character walking on its own.
  useEffect(() => {
    if (active) return;
    stickPointer.current = null;
    setKnob({ x: 0, y: 0 });
    setSprint(false);
    touchInput.moveX = 0;
    touchInput.moveZ = 0;
    touchInput.sprint = false;
    touchInput.jump = false;
  }, [active]);

  useEffect(
    () => () => {
      touchInput.moveX = 0;
      touchInput.moveZ = 0;
      touchInput.sprint = false;
      touchInput.jump = false;
    },
    []
  );

  if (!active) return null;

  const moveStick = (clientX: number, clientY: number) => {
    const rect = stickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const distance = Math.hypot(dx, dy);
    const scale = distance > STICK_RADIUS ? STICK_RADIUS / distance : 1;
    const kx = dx * scale;
    const ky = dy * scale;
    setKnob({ x: kx, y: ky });
    touchInput.moveX = kx / STICK_RADIUS;
    touchInput.moveZ = ky / STICK_RADIUS;
  };

  const releaseStick = () => {
    stickPointer.current = null;
    setKnob({ x: 0, y: 0 });
    touchInput.moveX = 0;
    touchInput.moveZ = 0;
  };

  const toggleSprint = () => {
    const next = !sprint;
    setSprint(next);
    touchInput.sprint = next;
  };

  return (
    <>
      {/* Virtual stick */}
      <div
        ref={stickRef}
        className="fixed left-5 bottom-24 z-40 rounded-full border border-[#39ff14]/40 bg-[#0b100d]/70 backdrop-blur-sm touch-none select-none"
        style={{ width: STICK_SIZE, height: STICK_SIZE }}
        onPointerDown={(event) => {
          stickPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (stickPointer.current !== event.pointerId) return;
          moveStick(event.clientX, event.clientY);
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
        onLostPointerCapture={releaseStick}
        aria-label="Movement stick"
        role="slider"
        aria-valuetext="Movement"
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] uppercase tracking-widest text-[#39ff14]/45">Move</span>
        </div>
        <div
          className="absolute left-1/2 top-1/2 w-14 h-14 rounded-full bg-[#39ff14]/85 border border-[#8eff78] pointer-events-none"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Contextual buttons */}
      <div className="fixed right-5 bottom-24 z-40 flex flex-col items-end gap-2">
        {voiceEnabled && (
          <button
            type="button"
            aria-label="Hold to talk"
            title="Hold to talk"
            className="w-14 h-14 rounded-full bg-sky-500 text-white border border-sky-300 shadow-lg flex items-center justify-center touch-none active:scale-95"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              onTalkStart();
            }}
            onPointerUp={onTalkEnd}
            onPointerCancel={onTalkEnd}
            onPointerLeave={onTalkEnd}
          >
            <Mic className="w-6 h-6" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Toggle sprint"
            aria-pressed={sprint}
            className={`w-12 h-12 rounded-full border flex items-center justify-center active:scale-95 ${
              sprint
                ? 'bg-[#39ff14] text-[#051205] border-[#8eff78]'
                : 'bg-[#0b100d]/85 text-[#39ff14] border-[#39ff14]/40'
            }`}
            onClick={toggleSprint}
          >
            <FastForward className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Jump"
            className="w-12 h-12 rounded-full bg-[#0b100d]/85 text-[#39ff14] border border-[#39ff14]/40 flex items-center justify-center active:scale-95"
            onClick={() => {
              touchInput.jump = true;
            }}
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Emote"
            className="w-12 h-12 rounded-full bg-[#0b100d]/85 text-[#39ff14] border border-[#39ff14]/40 flex items-center justify-center active:scale-95"
            onClick={onEmote}
          >
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
};
