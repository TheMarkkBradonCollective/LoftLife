import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera, FastForward, Hand, Mic, MicOff, RotateCw, Sparkles, X } from 'lucide-react';
import { resetTouchInput, touchInput } from '../game/touchInput';

interface TouchControlsProps {
  /** Hidden while a modal/menu is open or while the builder is active. */
  active: boolean;
  /** Drag-look is only meaningful in third-person Play View. */
  lookEnabled: boolean;
  /** Microphone capture is already running: the button becomes push-to-talk. */
  voiceEnabled: boolean;
  /** Voice is available in this browser (WebRTC + getUserMedia). */
  voiceAvailable: boolean;
  /** Contextual prompt from the viewport, e.g. "Press E · Board the LoftLine". */
  actionLabel: string | null;
  /** Portrait on a phone/tablet: suggest landscape without blocking play. */
  portrait: boolean;
  onEmote: () => void;
  onTalkStart: () => void;
  onTalkEnd: () => void;
  onToggleVoice: () => void;
}

const STICK_RADIUS = 46;

/** "Press E · Board the LoftLine" -> "Board the LoftLine" for the touch button. */
function actionText(label: string | null): string | null {
  if (!label) return null;
  return label.replace(/^press\s+E\s*[·:-]?\s*/i, '').trim() || null;
}

/**
 * Touch gameplay HUD for phones, tablets and touch-enabled hybrids.
 *
 * Everything feeds the shared `touchInput` singleton, so touch and keyboard use
 * the same movement/camera code in the viewport. The component is mounted only
 * when the current input is touch; it renders nothing while hidden and leaves
 * no invisible hit areas behind.
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  active,
  lookEnabled,
  voiceEnabled,
  voiceAvailable,
  actionLabel,
  portrait,
  onEmote,
  onTalkStart,
  onTalkEnd,
  onToggleVoice,
}) => {
  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const lookPointer = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprint, setSprint] = useState(false);
  const [landscapeHintDismissed, setLandscapeHintDismissed] = useState(false);

  // Never leave a held stick or look drag latched when the HUD is hidden.
  useEffect(() => {
    if (active) return;
    stickPointer.current = null;
    lookPointer.current = null;
    resetTouchInput();
    setKnob({ x: 0, y: 0 });
    setSprint(false);
  }, [active]);

  useEffect(() => () => resetTouchInput(), []);

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

  const contextLabel = actionText(actionLabel);
  const showLandscapeHint = portrait && !landscapeHintDismissed;

  return (
    <>
      {/* Camera rotation area: the right half of the screen, above the actions. */}
      {lookEnabled && (
        <div
          role="group"
          aria-label="Camera look area — drag to rotate the camera"
          className="fixed right-0 top-[calc(env(safe-area-inset-top)+3.5rem)] bottom-[calc(env(safe-area-inset-bottom)+12rem)] w-[48%] z-20 touch-none"
          onPointerDown={(event) => {
            lookPointer.current = event.pointerId;
            lookLast.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (lookPointer.current !== event.pointerId) return;
            const dx = event.clientX - lookLast.current.x;
            const dy = event.clientY - lookLast.current.y;
            lookLast.current = { x: event.clientX, y: event.clientY };
            touchInput.lookDx += dx * 0.005;
            touchInput.lookDy += dy * 0.004;
          }}
          onPointerUp={() => {
            lookPointer.current = null;
          }}
          onPointerCancel={() => {
            lookPointer.current = null;
          }}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
            <span className="flex items-center gap-1.5 rounded-full border border-[#39ff14]/30 bg-[#0b100d]/50 px-2.5 py-1 text-[10px] uppercase tracking-widest text-[#39ff14]">
              <Camera className="w-3.5 h-3.5" />
              Look
            </span>
          </div>
        </div>
      )}

      {/* Movement stick */}
      <div
        ref={stickRef}
        className="fixed left-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 w-[128px] h-[128px] rounded-full border border-[#39ff14]/40 bg-[#0b100d]/70 backdrop-blur-sm touch-none"
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
        aria-label="Movement joystick"
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] uppercase tracking-widest text-[#39ff14]/45">Move</span>
        </div>
        <div
          className="absolute left-1/2 top-1/2 w-12 h-12 rounded-full bg-[#39ff14]/85 border border-[#8eff78] pointer-events-none"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Contextual actions */}
      <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {voiceAvailable && (
            <button
              type="button"
              aria-label={voiceEnabled ? 'Hold to talk' : 'Turn on voice'}
              aria-pressed={voiceEnabled}
              className={`w-12 h-12 rounded-full border flex items-center justify-center touch-none active:scale-95 ${
                voiceEnabled
                  ? 'bg-sky-500 text-white border-sky-300'
                  : 'bg-[#0b100d]/85 text-slate-200 border-[#39ff14]/40'
              }`}
              onPointerDown={(event) => {
                if (!voiceEnabled) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                onTalkStart();
              }}
              onPointerUp={() => {
                if (voiceEnabled) onTalkEnd();
              }}
              onPointerCancel={() => {
                if (voiceEnabled) onTalkEnd();
              }}
              onPointerLeave={() => {
                if (voiceEnabled) onTalkEnd();
              }}
              onClick={() => {
                if (!voiceEnabled) onToggleVoice();
              }}
            >
              {voiceEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            aria-label="Toggle sprint"
            aria-pressed={sprint}
            className={`w-12 h-12 rounded-full border flex items-center justify-center touch-none active:scale-95 ${
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
            className="w-12 h-12 rounded-full bg-[#0b100d]/85 text-[#39ff14] border border-[#39ff14]/40 flex items-center justify-center touch-none active:scale-95"
            onClick={() => {
              touchInput.jump = true;
            }}
          >
            <ArrowUp className="w-5 h-5" />
          </button>

          <button
            type="button"
            aria-label="Emote"
            className="w-12 h-12 rounded-full bg-[#0b100d]/85 text-[#39ff14] border border-[#39ff14]/40 flex items-center justify-center touch-none active:scale-95"
            onClick={onEmote}
          >
            <Sparkles className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          aria-label={contextLabel ?? 'Interact (nothing nearby)'}
          className={`relative w-[76px] h-[76px] rounded-full border shadow-lg flex items-center justify-center touch-none active:scale-95 ${
            contextLabel
              ? 'bg-[#39ff14] text-[#051205] border-[#8eff78] neon-btn-glow'
              : 'bg-[#0b100d]/85 text-[#39ff14]/55 border-[#39ff14]/30'
          }`}
          onClick={() => {
            touchInput.interact = true;
          }}
        >
          {contextLabel && (
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#39ff14]/30 bg-[#0b100d]/92 px-2 py-0.5 text-[10px] font-semibold text-[#d8ffd0]">
              {contextLabel}
            </span>
          )}
          <Hand className="w-7 h-7" />
        </button>
      </div>

      {/* Landscape suggestion: informative only, gameplay stays available. */}
      {showLandscapeHint && (
        <div className="fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] z-40 -translate-x-1/2 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#39ff14]/30 bg-[#0b100d]/92 px-3 py-1.5 text-[11px] font-medium text-[#d8ffd0]">
            <RotateCw className="w-3.5 h-3.5 text-[#39ff14]" />
            Rotate for a wider view
            <button
              type="button"
              aria-label="Dismiss rotation tip"
              onClick={() => setLandscapeHintDismissed(true)}
              className="ml-0.5 rounded p-0.5 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
