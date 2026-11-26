import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, FastForward, MessageCircle, Mic, MicOff, Settings, Sparkles } from 'lucide-react';
import { touchInput } from '../game/touchInput';
import { MIC_MODE_INFO, VOICE_RANGE_INFO } from '../../shared/voice-controls.mjs';
import type { VoiceSnapshot } from '../session';

interface TouchControlsProps {
  /** Hidden while a modal is open so taps reach the dialog. */
  active: boolean;
  /** Shared voice state: identical to what the desktop keys and settings use. */
  voice: VoiceSnapshot;
  chatOpen: boolean;
  onCycleRange: () => void;
  onMicPress: () => void;
  onMicRelease: () => void;
  onToggleChat: () => void;
  onOpenVoiceSettings: () => void;
  onEmote: () => void;
}

const STICK_RADIUS = 48;
const STICK_SIZE = 136;

const VOICE_RANGE_STYLE: Record<string, string> = {
  off: 'bg-[#0b100d]/85 text-slate-400 border-white/15',
  whisper: 'bg-sky-500/25 text-sky-100 border-sky-400/50',
  talk: 'bg-sky-500 text-white border-sky-300',
  shout: 'bg-amber-400 text-[#1a1005] border-amber-200',
};

const INDICATOR_STYLE: Record<VoiceSnapshot['indicator'], { label: string; dot: string }> = {
  off: { label: 'Mic off', dot: 'bg-slate-500' },
  unavailable: { label: 'No mic', dot: 'bg-slate-500' },
  denied: { label: 'Blocked', dot: 'bg-red-500' },
  requesting: { label: 'Allow mic…', dot: 'bg-amber-400 animate-pulse' },
  'range-off': { label: 'Range off', dot: 'bg-slate-400' },
  idle: { label: 'Ready', dot: 'bg-sky-400' },
  transmitting: { label: 'Live', dot: 'bg-[#39ff14] animate-pulse' },
  muted: { label: 'Muted', dot: 'bg-amber-400' },
  suspended: { label: 'Paused', dot: 'bg-amber-400' },
};

/**
 * Mobile controls: a virtual stick plus contextual buttons.
 *
 * Camera drag-look is handled by the viewport canvas itself (a drag rotates,
 * a tap interacts), so there is deliberately no full-screen look pad here:
 * an overlay would swallow every tap on the right half of the scene.
 *
 * Voice range, microphone mode and transmission all come from the shared
 * session state, so the phone and the desktop keyboard can never disagree.
 * Everything movement-related feeds `touchInput`, which the viewport's render
 * loop already reads.
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  active,
  voice,
  chatOpen,
  onCycleRange,
  onMicPress,
  onMicRelease,
  onToggleChat,
  onOpenVoiceSettings,
  onEmote,
}) => {
  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const micPointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprint, setSprint] = useState(false);
  const [micHeld, setMicHeld] = useState(false);

  // A modal can open mid-drag; the matching pointerup never arrives, so release
  // everything instead of leaving the character walking on its own.
  useEffect(() => {
    if (active) return;
    stickPointer.current = null;
    micPointer.current = null;
    setKnob({ x: 0, y: 0 });
    setSprint(false);
    setMicHeld(false);
    onMicRelease();
    touchInput.moveX = 0;
    touchInput.moveZ = 0;
    touchInput.sprint = false;
    touchInput.jump = false;
    // onMicRelease is a stable session callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const range = VOICE_RANGE_INFO[voice.range];
  const micMode = MIC_MODE_INFO[voice.micMode];
  const indicator = INDICATOR_STYLE[voice.indicator];

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

      {/* Grouped voice bubble: range, microphone mode and status in one place */}
      <div className="fixed right-4 bottom-[9.75rem] z-40 flex flex-col items-end gap-1.5">
        <div className="flex items-stretch rounded-2xl border border-[#39ff14]/30 bg-[#0b100d]/90 backdrop-blur-sm overflow-hidden shadow-lg">
          <button
            type="button"
            onClick={onCycleRange}
            aria-label={`Voice range ${range.label}. Tap to change.`}
            className={`min-w-[4.75rem] px-3 py-2.5 border-r border-white/10 flex flex-col items-start justify-center active:scale-[0.97] transition-colors ${VOICE_RANGE_STYLE[voice.range]}`}
          >
            <span className="text-[9px] uppercase tracking-widest opacity-70">Range</span>
            <span className="text-xs font-bold leading-tight">{range.label}</span>
            <span className="text-[9px] font-mono-tabular opacity-70">
              {range.meters ? `${range.meters} m` : 'silent'}
            </span>
          </button>

          <button
            type="button"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              micPointer.current = event.pointerId;
              setMicHeld(true);
              onMicPress();
            }}
            onPointerUp={() => {
              micPointer.current = null;
              setMicHeld(false);
              onMicRelease();
            }}
            onPointerCancel={() => {
              micPointer.current = null;
              setMicHeld(false);
              onMicRelease();
            }}
            onLostPointerCapture={() => {
              if (micPointer.current === null) return;
              micPointer.current = null;
              setMicHeld(false);
              onMicRelease();
            }}
            aria-label={`${micMode.label}. ${micMode.mobile} Status: ${indicator.label}.`}
            aria-pressed={voice.transmitting}
            className={`w-16 px-2 py-2 flex flex-col items-center justify-center gap-0.5 touch-none active:scale-[0.97] transition-colors ${
              voice.transmitting
                ? 'bg-[#39ff14] text-[#051205]'
                : voice.muted || voice.suspended
                ? 'bg-amber-400/20 text-amber-200'
                : voice.status === 'ready'
                ? 'bg-[#101713] text-slate-200'
                : 'bg-[#101713] text-slate-400'
            } ${micHeld ? 'ring-2 ring-inset ring-sky-300/70' : ''}`}
          >
            {voice.status === 'denied' || voice.status === 'unsupported' ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            <span className="text-[9px] font-semibold leading-none">{indicator.label}</span>
          </button>

          <button
            type="button"
            onClick={onOpenVoiceSettings}
            aria-label="Microphone mode and audio settings"
            className="w-8 flex items-center justify-center border-l border-white/10 text-slate-400 active:scale-[0.97]"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="px-1 text-[9px] font-medium text-slate-400 bg-black/45 rounded">
          {micMode.label}
        </span>
      </div>

      {/* Contextual buttons */}
      <div className="fixed right-5 bottom-24 z-40 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={chatOpen ? 'Close chat' : 'Open chat'}
            aria-pressed={chatOpen}
            onClick={onToggleChat}
            className={`w-12 h-12 rounded-full border flex items-center justify-center active:scale-95 ${
              chatOpen
                ? 'bg-[#39ff14] text-[#051205] border-[#8eff78]'
                : 'bg-[#0b100d]/85 text-[#39ff14] border-[#39ff14]/40'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Toggle sprint"
            aria-pressed={sprint}
            onClick={toggleSprint}
            className={`w-12 h-12 rounded-full border flex items-center justify-center active:scale-95 ${
              sprint
                ? 'bg-[#39ff14] text-[#051205] border-[#8eff78]'
                : 'bg-[#0b100d]/85 text-[#39ff14] border-[#39ff14]/40'
            }`}
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
