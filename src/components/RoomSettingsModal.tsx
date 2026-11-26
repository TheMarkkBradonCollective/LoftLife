import React, { useEffect, useState } from 'react';
import {
  Eye,
  Footprints,
  Keyboard,
  Lock,
  Mic,
  MicOff,
  Move,
  PencilRuler,
  Radio,
  Smartphone,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import { sfx } from '../game/audio';
import type { GameMode } from '../game/types';
import type { MicrophoneMode, VoiceRangeSetting } from '../net/api';
import {
  MIC_MODES,
  MIC_MODE_INFO,
  VOICE_RANGES,
  VOICE_RANGE_INFO,
} from '../../shared/voice-controls.mjs';
import type { VoiceSnapshot } from '../session';
import type { VoiceStatus } from '../net/voice';

interface RoomSettingsModalProps {
  open: boolean;
  roomName: string;
  itemCount: number;
  mode: GameMode;
  canEdit: boolean;
  touchDevice: boolean;
  /** False on mobile browsers and unsupported runtimes: editor only. */
  gameplayAllowed: boolean;
  platformLabel: string;
  /** One shared snapshot drives desktop, mobile and this panel. */
  voice: VoiceSnapshot;
  onEnableVoice: () => Promise<VoiceStatus>;
  onDisableVoice: () => void;
  onCycleVoiceRange: () => void;
  onVoiceRangeChange: (range: VoiceRangeSetting) => void;
  onMicModeChange: (mode: MicrophoneMode) => void;
  onVoiceSensitivityChange: (value: number) => void;
  onVoiceInputDeviceChange: (deviceId: string) => Promise<boolean>;
  getVoiceLevel: () => number;
  onVoicePermissionHint: (text: string | null) => void;
  onEnterEdit: () => void;
  onExitEdit: () => void;
  onClose: () => void;
}

const rowClass = 'px-3.5 py-3 flex items-center justify-between gap-3';

const RowLabel: React.FC<{ icon: React.ReactNode; label: string; detail: string }> = ({
  icon,
  label,
  detail,
}) => (
  <div className="flex items-start gap-2.5 min-w-0">
    <span className="w-7 h-7 rounded-lg bg-white/8 text-white flex items-center justify-center shrink-0">
      {icon}
    </span>
    <div className="min-w-0">
      <span className="block text-xs font-semibold text-slate-100">{label}</span>
      <span className="block text-[11px] leading-snug text-slate-400">{detail}</span>
    </div>
  </div>
);

const STATUS_TEXT: Record<VoiceSnapshot['indicator'], string> = {
  off: 'Microphone off',
  unavailable: 'Microphone unavailable',
  denied: 'Permission denied',
  requesting: 'Waiting for permission…',
  'range-off': 'Range Off',
  idle: 'Mic ready · not transmitting',
  transmitting: 'Transmitting',
  muted: 'Temporarily muted',
  suspended: 'Paused after reconnect',
};

const STATUS_TONE: Record<VoiceSnapshot['indicator'], string> = {
  off: 'text-slate-400',
  unavailable: 'text-slate-400',
  denied: 'text-red-300',
  requesting: 'text-amber-300',
  'range-off': 'text-slate-400',
  idle: 'text-sky-300',
  transmitting: 'text-white',
  muted: 'text-amber-300',
  suspended: 'text-amber-300',
};

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  open,
  roomName,
  itemCount,
  mode,
  canEdit,
  touchDevice,
  gameplayAllowed,
  platformLabel,
  voice,
  onEnableVoice,
  onDisableVoice,
  onCycleVoiceRange,
  onVoiceRangeChange,
  onMicModeChange,
  onVoiceSensitivityChange,
  onVoiceInputDeviceChange,
  getVoiceLevel,
  onVoicePermissionHint,
  onEnterEdit,
  onExitEdit,
  onClose,
}) => {
  const [level, setLevel] = useState(0);
  const [requesting, setRequesting] = useState(false);

  // Live input meter: the same analyser voice activation uses, so "Test
  // microphone" shows exactly what the game hears.
  useEffect(() => {
    if (!open) {
      setLevel(0);
      return;
    }
    if (voice.status !== 'ready') return;
    const timer = window.setInterval(() => setLevel(getVoiceLevel()), 120);
    return () => window.clearInterval(timer);
  }, [open, voice.status, getVoiceLevel]);

  if (!open) return null;

  const editing = mode === 'edit';
  const rangeInfo = VOICE_RANGE_INFO[voice.range];
  const micInfo = MIC_MODE_INFO[voice.micMode];
  const statusText = STATUS_TEXT[voice.indicator];

  const enable = async () => {
    sfx.playClick();
    setRequesting(true);
    const status = await onEnableVoice();
    setRequesting(false);
    if (status === 'denied') {
      onVoicePermissionHint('Microphone permission denied — allow it in the browser settings');
    } else if (status === 'unsupported') {
      onVoicePermissionHint('No microphone is available on this device');
    } else if (status === 'ready') {
      onVoicePermissionHint('Microphone ready — select a microphone mode below');
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Room and audio settings"
    >
      <button
        type="button"
        aria-label="Close room settings"
        onClick={() => {
          sfx.playClick();
          onClose();
        }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
      />

      <div className="relative pointer-events-auto w-full max-w-[440px] max-h-[88vh] flex flex-col bg-[#15181c] text-slate-100 rounded-2xl border border-white/25 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#1a1e23]">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">Settings</h2>
            <p className="text-xs text-slate-400">
              {roomName} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            aria-label="Close settings"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* One obvious action for the owner; visitors get the reason instead. */}
        {canEdit ? (
          <div className="px-5 pt-4">
            {editing ? (
              gameplayAllowed ? (
                <button
                  type="button"
                  onClick={() => {
                    sfx.playClick();
                    onExitEdit();
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 text-slate-100 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors"
                >
                  <Footprints className="w-4 h-4" />
                  Back to walking
                </button>
              ) : (
                <div className="px-3 py-2.5 rounded-xl border border-amber-300/30 bg-amber-400/10 text-[11px] leading-snug text-amber-100 flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                  <span>
                    Walking and world entry are unavailable on {platformLabel}. You can still
                    manage the suite, chat and change settings here.
                  </span>
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  onEnterEdit();
                }}
                className="w-full px-4 py-3 rounded-xl bg-white text-[#15181b] text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/90 transition-colors"
              >
                <PencilRuler className="w-4 h-4" />
                Edit this suite
              </button>
            )}
          </div>
        ) : (
          <div className="mx-5 mt-4 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-[11px] leading-snug text-slate-400 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-white shrink-0" />
            Visiting · only the owner can furnish this suite
          </div>
        )}

        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45">
              Audio &amp; Voice
            </h3>

            <div className="rounded-xl border border-white/10 bg-white/[0.05] divide-y divide-white/8">
              {/* Microphone transmission mode */}
              <div className="px-3.5 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <RowLabel
                    icon={<Mic className="w-3.5 h-3.5" />}
                    label="Microphone mode"
                    detail={micInfo.summary}
                  />
                  <span className={`text-[10px] font-bold whitespace-nowrap ${STATUS_TONE[voice.indicator]}`}>
                    {statusText}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {MIC_MODES.map((entry) => {
                    const active = voice.micMode === entry;
                    return (
                      <button
                        key={entry}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          sfx.playClick();
                          onMicModeChange(entry);
                        }}
                        className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold text-left transition-colors ${
                          active
                            ? 'bg-white text-[#15181b] border-white'
                            : 'bg-black/25 border-white/10 text-slate-200 hover:border-white/30'
                        }`}
                      >
                        {MIC_MODE_INFO[entry].label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] leading-snug text-slate-400">
                  {touchDevice ? micInfo.mobile : micInfo.desktop}
                </p>
              </div>

              {/* Voice activation sensitivity */}
              <div className="px-3.5 py-3 space-y-2">
                <RowLabel
                  icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                  label="Voice activation sensitivity"
                  detail="Higher opens the mic for quieter speech."
                />
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(voice.sensitivity * 100)}
                    onChange={(event) => onVoiceSensitivityChange(Number(event.target.value) / 100)}
                    aria-label="Voice activation sensitivity"
                    disabled={voice.micMode !== 'voice-activation'}
                    className="flex-1 accent-white disabled:opacity-40"
                  />
                  <span className="w-9 text-right text-[11px] font-mono-tabular text-slate-300">
                    {Math.round(voice.sensitivity * 100)}%
                  </span>
                </div>
                {voice.micMode !== 'voice-activation' && (
                  <p className="text-[10px] text-slate-500">
                    Used when Microphone mode is Voice Activation.
                  </p>
                )}
              </div>

              {/* Voice range: how far the voice carries */}
              <div className="px-3.5 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <RowLabel
                    icon={<Radio className="w-3.5 h-3.5" />}
                    label="Voice range"
                    detail={rangeInfo.detail}
                  />
                  <button
                    type="button"
                    onClick={onCycleVoiceRange}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/10 text-slate-100 border border-white/15 hover:bg-white/20 whitespace-nowrap"
                    aria-label="Cycle voice range"
                  >
                    Cycle (R)
                  </button>
                </div>
                <div className="grid grid-cols-4 rounded-lg border border-white/12 overflow-hidden">
                  {VOICE_RANGES.map((entry) => {
                    const active = voice.range === entry;
                    return (
                      <button
                        key={entry}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          sfx.playClick();
                          onVoiceRangeChange(entry);
                        }}
                        className={`py-2 text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-white text-[#15181b]'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {VOICE_RANGE_INFO[entry].label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500">
                  Whisper 4 m · Talk 14 m · Shout 35 m · Off blocks the microphone in every mode.
                </p>
              </div>

              {/* Permission, input device and microphone test */}
              <div className="px-3.5 py-3 space-y-2.5">
                <RowLabel
                  icon={<Volume2 className="w-3.5 h-3.5" />}
                  label="Microphone"
                  detail={
                    voice.status === 'ready'
                      ? 'Device live. Release voice when you are done.'
                      : voice.status === 'denied'
                      ? 'Blocked. Allow the microphone in your browser, then try again.'
                      : voice.status === 'unsupported'
                      ? 'This browser or device has no microphone support.'
                      : 'Turn voice on to talk to nearby players.'
                  }
                />
                <div className="flex items-center gap-2">
                  {voice.status === 'ready' ? (
                    <button
                      type="button"
                      onClick={() => {
                        sfx.playClick();
                        onDisableVoice();
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 text-slate-100 border border-white/15 hover:bg-white/20 flex items-center gap-1.5"
                    >
                      <MicOff className="w-3.5 h-3.5" /> Turn voice off
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={enable}
                      disabled={requesting || voice.status === 'requesting'}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white text-[#15181b] hover:bg-white/90 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      {requesting || voice.status === 'requesting' ? 'Asking…' : 'Turn voice on'}
                    </button>
                  )}
                  <span className={`text-[10px] font-semibold ${STATUS_TONE[voice.indicator]}`}>
                    {statusText}
                  </span>
                </div>

                {voice.status === 'ready' && (
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase tracking-widest text-slate-500">
                      Microphone test
                    </span>
                    <div className="h-2 w-full rounded-full bg-black/50 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 via-white to-amber-300 transition-[width] duration-100"
                        style={{ width: `${Math.min(100, Math.round(level * 160))}%` }}
                        role="meter"
                        aria-label="Microphone input level"
                        aria-valuenow={Math.round(level * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                    <span className="block text-[10px] text-slate-500">
                      Speak to check the level. Nothing is sent unless a mode above is transmitting.
                    </span>
                  </div>
                )}

                {voice.devices.length > 1 && (
                  <label className="block space-y-1">
                    <span className="block text-[10px] uppercase tracking-widest text-slate-500">
                      Microphone input
                    </span>
                    <select
                      value={voice.deviceId}
                      onChange={(event) => {
                        void onVoiceInputDeviceChange(event.target.value);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/12 text-[11px] text-slate-100"
                    >
                      {voice.devices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-400">
              {touchDevice
                ? 'The voice bubble on the right holds Range and the mic button. The gear opens this panel.'
                : 'T is the microphone control, R cycles the range, C opens chat, Z toggles close/wide and F follows your avatar in Isometric.'}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-white/45">
              Controls
            </h3>

            <div className="rounded-xl border border-white/10 bg-white/[0.05] divide-y divide-white/8">
              <div className={rowClass}>
                <RowLabel
                  icon={<Lock className="w-3.5 h-3.5" />}
                  label="Device access"
                  detail={
                    gameplayAllowed
                      ? `${platformLabel} · gameplay, world entry and desktop/mobile controls loaded for this runtime`
                      : `${platformLabel} · dashboard and loft management only; gameplay is refused by the app`
                  }
                />
                <span
                  className={`text-[11px] font-mono-tabular shrink-0 ${
                    gameplayAllowed ? 'text-white' : 'text-amber-300'
                  }`}
                >
                  {gameplayAllowed ? 'Play' : 'Limited'}
                </span>
              </div>

              <div className={rowClass}>
                <RowLabel
                  icon={<Move className="w-3.5 h-3.5" />}
                  label="Movement"
                  detail={
                    touchDevice
                      ? 'Tap the floor to walk · the stick pans the Isometric camera or moves in Play View'
                      : 'Click the floor to walk · WASD pans in Isometric and moves in Play View'
                  }
                />
                <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                  {touchDevice ? 'Tap · Stick' : 'Click · WASD'}
                </span>
              </div>

              <div className={rowClass}>
                <RowLabel
                  icon={<Smartphone className="w-3.5 h-3.5" />}
                  label="Camera"
                  detail={
                    touchDevice
                      ? 'Portrait is Isometric, landscape is Play View · Follow and Close/Wide sit above the voice bubble'
                      : 'V switches view · F toggles follow (Isometric) · Z switches Close/Wide distance without resetting the angle'
                  }
                />
                <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                  {touchDevice ? 'Follow · Zoom' : 'V · F · Z'}
                </span>
              </div>

              <div className={rowClass}>
                <RowLabel
                  icon={<Keyboard className="w-3.5 h-3.5" />}
                  label="Chat"
                  detail={touchDevice ? 'Chat button beside the movement buttons' : 'C opens and closes chat'}
                />
                <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                  {touchDevice ? 'Button' : 'C'}
                </span>
              </div>

              <div className={rowClass}>
                <RowLabel
                  icon={<PencilRuler className="w-3.5 h-3.5" />}
                  label="Editing"
                  detail={
                    !canEdit
                      ? 'Only the owner of this room can furnish it'
                      : editing
                      ? 'Catalog, walls, floors and layouts are open'
                      : 'Furnish and decorate this room'
                  }
                />
                <span
                  className={`text-[11px] font-semibold shrink-0 ${
                    canEdit ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  {canEdit ? (editing ? 'Editing' : 'Owner') : 'Visiting'}
                </span>
              </div>
            </div>
          </section>

          <p className="text-[11px] leading-relaxed text-slate-400">
            {editing
              ? 'Drag furniture to move it, R rotates, and the dock below holds the catalog. Choose Back to walking when you are done.'
              : 'Walk the room freely; tap Edit this suite whenever you want to change the furniture or finishes.'}
          </p>
        </div>

        <div className="px-5 py-3 border-t border-white/10 bg-[#1a1e23] flex justify-end">
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold bg-white text-[#15181b] rounded-lg hover:bg-white/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
