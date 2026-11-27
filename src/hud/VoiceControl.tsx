import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Settings2, X } from 'lucide-react';
import { MIC_MODE_INFO, VOICE_RANGE_INFO, VOICE_RANGES } from '../../shared/voice-controls.mjs';
import type { VoiceSnapshot } from '../session';
import { HudButton, HudIconButton, cx } from './primitives';

const STATUS_LABEL: Record<VoiceSnapshot['indicator'], string> = {
  off: 'Mic off',
  unavailable: 'No microphone',
  denied: 'Mic blocked',
  requesting: 'Allow mic…',
  'range-off': 'Range off',
  idle: 'Mic ready',
  transmitting: 'Talking',
  muted: 'Muted',
  suspended: 'Paused',
};

interface VoiceControlProps {
  voice: VoiceSnapshot;
  onCycleRange: () => void;
  onRangeChange: (range: VoiceSnapshot['range']) => void;
  onMicPress: () => void;
  onMicRelease: () => void;
  onMicModeChange: (mode: VoiceSnapshot['micMode']) => void;
  onOpenSettings: () => void;
  /** Labels stay on desktop; phones use the icon with an accessible name. */
  showLabel: boolean;
}

/**
 * One compact voice chip that expands into a full voice card.
 *
 * It replaces the permanent block of range + microphone + gear buttons, while
 * still driving the exact same session actions (range, push-to-talk, settings).
 * Transmission is shown with a filled icon and text, never colour alone.
 */
export const VoiceControl: React.FC<VoiceControlProps> = ({
  voice,
  onCycleRange,
  onRangeChange,
  onMicPress,
  onMicRelease,
  onMicModeChange,
  onOpenSettings,
  showLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [held, setHeld] = useState(false);
  const pointerRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const range = VOICE_RANGE_INFO[voice.range];
  const micMode = MIC_MODE_INFO[voice.micMode];
  const status = STATUS_LABEL[voice.indicator];
  const blocked = voice.status === 'denied' || voice.status === 'unsupported';

  // A menu or modal opening mid-hold must never leave the microphone latched.
  useEffect(() => {
    if (open) return;
    pointerRef.current = null;
    setHeld(false);
  }, [open]);

  useEffect(
    () => () => {
      pointerRef.current = null;
      onMicRelease();
    },
    [onMicRelease]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Voice: ${status}, range ${range.label}. Open voice controls.`}
        className={cx(
          'll-focus ll-pill gap-2 px-2.5 transition-colors',
          voice.transmitting && 'bg-white text-[#15181b]',
          held && 'ring-2 ring-white/80'
        )}
      >
        {blocked ? (
          <MicOff className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Mic className="w-4 h-4" aria-hidden="true" />
        )}
        {showLabel && (
          <span className="text-[11px] font-semibold leading-none">
            {voice.range === 'off' ? 'Voice off' : status}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label="Voice controls"
          className="ll-popover ll-animate-pop fixed z-[65] flex w-[min(320px,calc(100vw-24px))] flex-col gap-3 p-3.5"
          style={{
            top: 'calc(var(--ll-safe-top, 0px) + 60px)',
            right: 'calc(12px + var(--ll-safe-right, 0px))',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-white">Voice</p>
              <p className="text-[11px] text-white/55">
                {status} · {micMode.label}
              </p>
            </div>
            <HudIconButton
              label="Close voice controls"
              icon={<X className="w-4 h-4" />}
              size="sm"
              onClick={() => setOpen(false)}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Microphone activation</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/12 bg-black/25 p-1" role="group" aria-label="Microphone activation mode">
              {(['open-mic', 'push-to-talk', 'toggle-to-talk'] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={voice.micMode === mode} onClick={() => { onMicRelease(); onMicModeChange(mode); }} className={cx('ll-focus rounded-lg px-1 py-2 text-[9px] font-semibold transition-colors', voice.micMode === mode ? 'bg-white text-[#15181b]' : 'text-white/65 hover:text-white')}>
                  {MIC_MODE_INFO[mode].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
              Voice range
            </span>
            <div
              role="group"
              aria-label="Voice range"
              className="grid grid-cols-4 gap-1 rounded-xl border border-white/12 bg-black/25 p-1"
            >
              {VOICE_RANGES.map((entry) => {
                const active = voice.range === entry;
                return (
                  <button
                    key={entry}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onRangeChange(entry)}
                    className={cx(
                      'll-focus rounded-lg px-1 py-1.5 text-[10px] font-semibold transition-colors',
                      active ? 'bg-white text-[#15181b]' : 'text-white/65 hover:text-white'
                    )}
                  >
                    {VOICE_RANGE_INFO[entry].label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onCycleRange}
              className="ll-focus mt-1.5 text-[10px] font-semibold text-white/45 hover:text-white/80"
            >
              Cycle range ({range.meters ? `${range.meters} m` : 'silent'})
            </button>
          </div>

          {voice.micMode === 'open-mic' ? (
            <div className="rounded-xl border border-white/15 bg-white/8 px-3 py-3 text-center text-[11px] text-white/70">Open Mic · microphone transmits whenever Voice Range is enabled and the mic is unmuted.</div>
          ) : voice.micMode === 'toggle-to-talk' ? (
            <button type="button" aria-pressed={voice.transmitting} onClick={() => { onMicPress(); }} className={cx('ll-focus flex min-h-[52px] items-center justify-center gap-2 rounded-xl border text-[12px] font-bold', voice.transmitting ? 'bg-white text-[#15181b] border-white' : 'bg-white/10 text-white border-white/20')}>
              <Mic className="w-4 h-4" /> {voice.transmitting ? 'Tap to stop talking' : 'Tap to talk'}
            </button>
          ) : (
          <button
            type="button"
            aria-label={`${micMode.label}. Hold to transmit.`}
            aria-pressed={voice.transmitting}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pointerRef.current = event.pointerId;
              setHeld(true);
              onMicPress();
            }}
            onPointerUp={() => {
              pointerRef.current = null;
              setHeld(false);
              onMicRelease();
            }}
            onPointerCancel={() => {
              pointerRef.current = null;
              setHeld(false);
              onMicRelease();
            }}
            onLostPointerCapture={() => {
              if (pointerRef.current === null) return;
              pointerRef.current = null;
              setHeld(false);
              onMicRelease();
            }}
            className={cx(
              'll-focus flex min-h-[52px] select-none items-center justify-center gap-2 rounded-xl border text-[12px] font-bold transition-colors touch-none',
              voice.transmitting
                ? 'bg-white text-[#15181b] border-white'
                : 'bg-white/10 text-white border-white/20 hover:bg-white/16'
            )}
          >
            {blocked ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {blocked ? 'Microphone unavailable' : 'Hold to talk'}
          </button>
          )}

          <HudButton
            variant="quiet"
            icon={<Settings2 className="w-4 h-4" />}
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            block
          >
            Audio &amp; voice settings
          </HudButton>
        </div>
      )}
    </>
  );
};
