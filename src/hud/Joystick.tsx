import React, { useCallback, useEffect, useRef, useState } from 'react';
import { touchInput } from '../game/touchInput';

interface JoystickProps {
  /** Which lower corner the stick occupies (opposite the action cluster). */
  side: 'left' | 'right';
  scale: number;
  opacity: number;
  /** Isometric pans the camera with the stick; Play View walks. */
  label: 'Move' | 'Pan';
}

const BASE_SIZE = 132;

/**
 * One polished virtual joystick.
 *
 * It writes the shared `touchInput` singleton the render loop already reads, so
 * touch and keyboard movement stay the same code path. The knob springs back on
 * release, and every pointer is captured so a finger sliding past the ring does
 * not drop movement mid-drag.
 */
export const Joystick: React.FC<JoystickProps> = ({ side, scale, opacity, label }) => {
  const padRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const size = Math.round(BASE_SIZE * scale);
  const radius = Math.round(size / 2 - 10 * scale);
  const knobSize = Math.round(size * 0.4);

  // A menu/chat can open mid-drag; never leave the avatar walking on its own.
  useEffect(
    () => () => {
      touchInput.moveX = 0;
      touchInput.moveZ = 0;
    },
    []
  );

  const release = useCallback(() => {
    pointerRef.current = null;
    setKnob({ x: 0, y: 0 });
    touchInput.moveX = 0;
    touchInput.moveZ = 0;
  }, []);

  const move = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const clamp = distance > radius ? radius / distance : 1;
    const kx = dx * clamp;
    const ky = dy * clamp;
    setKnob({ x: kx, y: ky });
    // A small dead zone prevents drift from a resting thumb.
    const magnitude = Math.hypot(kx, ky) / radius;
    const gain = magnitude < 0.12 ? 0 : Math.min(1, (magnitude - 0.1) / 0.9);
    const nx = radius === 0 ? 0 : kx / radius;
    const ny = radius === 0 ? 0 : ky / radius;
    touchInput.moveX = nx * gain;
    touchInput.moveZ = ny * gain;
  };

  const edge = side === 'left' ? 'left' : 'right';
  const position: React.CSSProperties = {
    [edge]: `calc(18px + var(--ll-safe-${edge}, 0px))`,
    bottom: 'calc(20px + var(--ll-safe-bottom, 0px))',
    opacity,
  };

  return (
    <div
      className="fixed z-40 flex flex-col items-center gap-1.5 pointer-events-none"
      style={position}
      data-hud="joystick"
    >
      <span
        aria-hidden="true"
        className="mb-1 rounded-full bg-[#15181b]/75 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/80 shadow-sm"
      >
        {label}
      </span>
      <div
        ref={padRef}
        role="application"
        aria-label={
          label === 'Move'
            ? 'Movement stick. Drag to walk; release to stop.'
            : 'Camera stick. Drag to pan the view.'
        }
        className="ll-joystick pointer-events-auto"
        style={{ width: size, height: size, touchAction: 'none' }}
        onPointerDown={(event) => {
          pointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (pointerRef.current !== event.pointerId) return;
          move(event.clientX, event.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <span
          className="ll-joystick__knob"
          aria-hidden="true"
          style={{
            width: knobSize,
            height: knobSize,
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          }}
        />
      </div>
    </div>
  );
};
