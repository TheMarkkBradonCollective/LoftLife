import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Eye,
  Gamepad2,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Volume2,
} from 'lucide-react';
import { ApiError, api, type MicrophoneMode } from '../net/api';
import { useSession } from '../session';
import { useKeybindings } from '../game/keybindings';
import {
  BINDING_ACTIONS,
  eventToBinding,
  keyLabel,
  type BindingAction,
} from '../../shared/keybindings.mjs';
import { MIC_MODE_INFO, VOICE_RANGE_INFO } from '../../shared/voice-controls.mjs';
import type { PlatformPage } from './types';
import {
  useSettings,
  type PlatformSettings,
  type SettingsSection as SectionId,
} from './settings';
import {
  Badge,
  ChoiceRow,
  Field,
  SectionHeader,
  Toggle,
  btnGhost,
  btnPrimary,
  btnSecondary,
  inputClass,
  panelClass,
} from './ui';

const errorOf = (error: unknown) =>
  error instanceof ApiError ? error.message : (error as Error)?.message ?? 'Something went wrong';

const tabs: { id: SectionId | 'account' | 'controls' | 'mobile'; label: string; icon: React.ReactNode }[] = [
  { id: 'account', label: 'Account', icon: <UserRound className="h-4 w-4" /> },
  { id: 'privacy', label: 'Privacy', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { id: 'audio', label: 'Audio & voice', icon: <Volume2 className="h-4 w-4" /> },
  { id: 'controls', label: 'Controls', icon: <Gamepad2 className="h-4 w-4" /> },
  { id: 'graphics', label: 'Graphics', icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: 'mobile', label: 'Mobile', icon: <MonitorSmartphone className="h-4 w-4" /> },
  { id: 'accessibility', label: 'Accessibility', icon: <Eye className="h-4 w-4" /> },
];

type TabId = (typeof tabs)[number]['id'];

export function SettingsPage({ onNavigate }: { onNavigate: (page: PlatformPage) => void }) {
  const session = useSession();
  const { settings, sync, update } = useSettings();
  const controls = useKeybindings({
    online: session.status === 'online',
    userId: session.user?.id ?? null,
  });
  const [tab, setTab] = useState<TabId>('account');
  const [capturing, setCapturing] = useState<BindingAction | null>(null);
  const [conflict, setConflict] = useState<{
    action: BindingAction;
    code: string;
    conflicts: BindingAction[];
  } | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [suiteBusy, setSuiteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const voice = session.voice;

  function patchSection<S extends keyof PlatformSettings>(
    section: S,
    values: Partial<PlatformSettings[S]>
  ) {
    update(
      (current) =>
        ({
          ...current,
          [section]: { ...(current[section] as object), ...values },
        } as PlatformSettings)
    );
  }

  const bindingRow = (action: BindingAction) => (
    <li key={action.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-[11px]">
      <span className="min-w-0 flex-1" title={action.detail}>
        <span className="block truncate text-slate-300">{action.label}</span>
        <span className="block truncate text-[9px] text-slate-600">{action.detail}</span>
      </span>
      <kbd className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono-tabular text-[10px] text-slate-200">
        {keyLabel(controls.bindings[action.id]) || 'Unbound'}
      </kbd>
      <button
        type="button"
        onClick={() => controls.resetOne(action.id)}
        title={`Restore ${action.label} to its default`}
        className="rounded-md px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-white/10 hover:text-white"
      >
        <RotateCcw className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => {
          setConflict(null);
          setBindingError(null);
          setCapturing(action);
        }}
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
          capturing?.id === action.id
            ? 'bg-[#39ff14] text-[#051205]'
            : 'bg-white/8 text-slate-300 hover:bg-white/15'
        }`}
      >
        Change
      </button>
    </li>
  );

  // Capture a key for the selected action through the same resolver the game uses.
  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        setCapturing(null);
        setConflict(null);
        return;
      }
      const code = eventToBinding(event);
      const result = controls.setBinding(capturing, code);
      setCapturing(null);
      if (result.error) {
        setConflict(null);
        setBindingError('That key is reserved by the browser or operating system.');
        return;
      }
      setBindingError(null);
      if (result.conflicts.length > 0) {
        setConflict({ action: capturing, code, conflicts: result.conflicts });
      } else {
        setConflict(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, controls.setBinding]);

  const toggleSuiteVisibility = async (next: boolean) => {
    setSuiteBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.setSuiteVisibility(next);
      await session.refresh();
      setNotice(next ? 'Suite is visible to visitors.' : 'Suite is private.');
    } catch (caught) {
      setError(errorOf(caught));
    } finally {
      setSuiteBusy(false);
    }
  };

  const syncLabel =
    sync === 'saving'
      ? 'Saving to account…'
      : sync === 'synced'
      ? 'Saved to account'
      : sync === 'error'
      ? 'Save failed — kept on this device'
      : session.status === 'online'
      ? 'Loading account settings…'
      : 'Saved on this device';

  return (
    <div className="space-y-4">
      <div className={`${panelClass} flex flex-wrap items-center gap-3 px-4 py-3`}>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Save className="h-4 w-4 text-[#39ff14]" />
          {syncLabel}
        </div>
        <Badge tone={sync === 'error' ? 'red' : sync === 'synced' ? 'green' : 'slate'}>
          {session.status === 'online' ? 'Account' : 'Local'}
        </Badge>
        <span className="ml-auto text-[10px] text-slate-600">
          Settings load from your account on every device, with a local copy when offline.
        </span>
      </div>

      {(error || notice) && (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            error
              ? 'border-red-400/25 bg-red-500/8 text-red-200'
              : 'border-[#39ff14]/25 bg-[#39ff14]/8 text-[#c8ffbc]'
          }`}
        >
          {error ?? notice}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
        <nav className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-[#0c1210] p-2 lg:flex-col lg:overflow-visible">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                tab === entry.id
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/8'
              }`}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </nav>

        <div className={`${panelClass} min-w-0 p-4 sm:p-5`}>
          {tab === 'account' && (
            <section>
              <SectionHeader eyebrow="Account" title="Identity & security" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Handle">
                  <input value={session.user?.handle ?? 'offline'} readOnly className={`${inputClass} opacity-70`} />
                </Field>
                <Field label="Display name">
                  <input
                    value={session.profile?.displayName ?? session.user?.handle ?? ''}
                    readOnly
                    className={`${inputClass} opacity-70`}
                  />
                </Field>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Handles are created with the account. Change your display name and bio on the Profile
                page.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onNavigate('profile')} className={btnSecondary}>
                  Open profile
                </button>
                <button type="button" onClick={() => void session.logout()} className={btnGhost}>
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                  <div className="text-xs font-semibold text-slate-200">Email & password</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Email is held by the authentication service and is never returned to the platform
                    UI. Password changes are not exposed through an API yet, so no fake form is shown.
                  </p>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                  <div className="text-xs font-semibold text-slate-200">Session</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    This device is signed in with a bearer session minted by the Cloudflare edge.
                    Logging out revokes it. Per-device session management is not implemented yet.
                  </p>
                </div>
              </div>
            </section>
          )}

          {tab === 'privacy' && (
            <section>
              <SectionHeader
                eyebrow="Privacy"
                title="Who can find and reach you"
                action={<Badge tone="green">Enforced server-side</Badge>}
              />
              <ChoiceRow
                label="Profile visibility"
                description="Friends means only accepted friends can read your public profile."
                value={settings.privacy.profileVisibility}
                options={[
                  { id: 'public', label: 'Everyone' },
                  { id: 'friends', label: 'Friends' },
                  { id: 'private', label: 'Only me' },
                ]}
                onChange={(value) => patchSection('privacy', { profileVisibility: value })}
              />
              <ChoiceRow
                label="Friend requests"
                description="When off, new requests are refused by the API."
                value={settings.privacy.friendRequests}
                options={[
                  { id: 'everyone', label: 'Everyone' },
                  { id: 'nobody', label: 'Nobody' },
                ]}
                onChange={(value) => patchSection('privacy', { friendRequests: value })}
              />
              <ChoiceRow
                label="Direct messages"
                description="Decides who can send you a DM from the platform or inside a world."
                value={settings.privacy.messages}
                options={[
                  { id: 'everyone', label: 'Everyone' },
                  { id: 'friends', label: 'Friends only' },
                ]}
                onChange={(value) => patchSection('privacy', { messages: value })}
              />
              <ChoiceRow
                label="World invitations"
                description="When off, owners cannot add you to invite-only worlds."
                value={settings.privacy.invitations}
                options={[
                  { id: 'everyone', label: 'Everyone' },
                  { id: 'nobody', label: 'Nobody' },
                ]}
                onChange={(value) => patchSection('privacy', { invitations: value })}
              />
              <div className="rounded-xl border border-white/8 bg-black/20 px-3">
                <Toggle
                  checked={Boolean(session.suite?.isPublic)}
                  onChange={(next) => void toggleSuiteVisibility(next)}
                  label="Allow suite visits"
                  description={
                    suiteBusy
                      ? 'Saving…'
                      : 'Uses the existing suite visibility rule that friends and invited players pass.'
                  }
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Online status is not exposed per player by the platform API. In a world, presence is
                visible to players in the same instance; the server does not publish a global online
                list, so there is no visibility toggle to misrepresent.
              </p>
            </section>
          )}

          {tab === 'notifications' && (
            <section>
              <SectionHeader eyebrow="Notifications" title="What the platform highlights" />
              <div className="rounded-xl border border-white/8 bg-black/20 px-3">
                <Toggle
                  checked={settings.notifications.messages}
                  onChange={(value) => patchSection('notifications', { messages: value })}
                  label="Unread messages"
                  description="Controls the unread badge on navigation and the inbox summary."
                />
                <Toggle
                  checked={settings.notifications.friendRequests}
                  onChange={(value) => patchSection('notifications', { friendRequests: value })}
                  label="Friend requests"
                  description="Controls the requests badge in navigation and Home."
                />
                <Toggle
                  checked={settings.notifications.invitations}
                  onChange={(value) => patchSection('notifications', { invitations: value })}
                  label="Party & world invitations"
                  description="Controls invitation reminders. Delivery still follows world permissions."
                />
                <Toggle
                  checked={settings.notifications.worldActivity}
                  onChange={(value) => patchSection('notifications', { worldActivity: value })}
                  label="World activity"
                  description="Saved preference for world activity highlights; no activity feed exists yet."
                />
                <Toggle
                  checked={settings.notifications.events}
                  onChange={(value) => patchSection('notifications', { events: value })}
                  label="Events"
                  description="Shows configured events. The events calendar is currently empty."
                />
                <Toggle
                  checked={settings.notifications.announcements}
                  onChange={(value) => patchSection('notifications', { announcements: value })}
                  label="Platform announcements"
                  description="Shows release notes on Home."
                />
              </div>
            </section>
          )}

          {tab === 'audio' && (
            <section>
              <SectionHeader
                eyebrow="Audio & voice"
                title="Sound and proximity chat"
                action={
                  <Badge tone={voice.status === 'ready' ? 'green' : 'slate'}>
                    {voice.status === 'ready' ? 'Microphone ready' : 'Microphone off'}
                  </Badge>
                }
              />
              <div className="rounded-xl border border-white/8 bg-black/20 px-3">
                <Toggle
                  checked={settings.audio.muted}
                  onChange={(value) => patchSection('audio', { muted: value })}
                  label="Mute interface sounds"
                  description="Applies to the platform and the in-world UI sound effects."
                />
              </div>
              <ChoiceRow
                label="Voice range"
                description="The same range is used by the desktop key, the mobile bubble and the in-world voice panel."
                value={voice.range}
                options={([
                  'off',
                  'whisper',
                  'talk',
                  'shout',
                ] as const).map((id) => ({
                  id,
                  label: `${VOICE_RANGE_INFO[id].label}${
                    VOICE_RANGE_INFO[id].meters ? ` ${VOICE_RANGE_INFO[id].meters}m` : ''
                  }`,
                }))}
                onChange={(value) => session.setVoiceRange(value)}
              />
              <ChoiceRow
                label="Microphone mode"
                description={MIC_MODE_INFO[voice.micMode].summary}
                value={voice.micMode}
                options={(Object.keys(MIC_MODE_INFO) as MicrophoneMode[]).map((id) => ({
                  id,
                  label: MIC_MODE_INFO[id].label,
                }))}
                onChange={(value) => session.setMicMode(value as MicrophoneMode)}
              />
              <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">Voice activation sensitivity</span>
                  <span className="font-mono-tabular text-[10px] text-slate-400">
                    {Math.round(voice.sensitivity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(voice.sensitivity * 100)}
                  onChange={(event) => session.setVoiceSensitivity(Number(event.target.value) / 100)}
                  aria-label="Voice activation sensitivity"
                  className="mt-2 w-full accent-[#39ff14]"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Used by Voice Activation. Lower values open the microphone more easily.
                </p>
              </div>
              <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="text-xs font-semibold text-slate-200">Input device</div>
                {voice.devices.length > 0 ? (
                  <select
                    value={voice.deviceId}
                    onChange={(event) => void session.setVoiceInputDevice(event.target.value)}
                    aria-label="Microphone input device"
                    className={`${inputClass} mt-2`}
                  >
                    <option value="">Browser default microphone</option>
                    {voice.devices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `Microphone ${index + 1}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Enable voice in a world to let the browser list microphones. The browser default is
                    used until then.
                  </p>
                )}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Voice preferences sync to your account through the existing profile API, and stay on
                this device while you play offline.
              </p>
            </section>
          )}

          {tab === 'controls' && (
            <section>
              <SectionHeader
                eyebrow="Controls"
                title="Keybindings"
                action={
                  <Badge tone={capturing ? 'amber' : controls.syncing ? 'slate' : 'green'}>
                    {capturing
                      ? 'Press a key…'
                      : controls.syncing
                      ? 'Saving to account…'
                      : session.status === 'online'
                      ? 'Synced with the game'
                      : 'Saved on this device'}
                  </Badge>
                }
              />
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                Isometric and Third-Person keep separate movement contexts; global controls apply in both.
                These are the same bindings used by the in-game M menu, so changes made here are live
                when you enter a world.
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    controls.resetAll();
                    setCapturing(null);
                    setConflict(null);
                    setBindingError(null);
                  }}
                  className={btnGhost}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore all defaults
                </button>
                {controls.syncError && (
                  <span className="text-[10px] text-amber-300">{controls.syncError}</span>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {(['isometric', 'play'] as const).map((scope) => (
                  <div key={scope} className="rounded-xl border border-white/8 bg-black/20 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#39ff14]">
                      {scope === 'isometric' ? 'Isometric preset' : 'Third-Person preset'}
                    </div>
                    <ul className="space-y-1">
                      {BINDING_ACTIONS.filter((action) => action.scope === scope).map(bindingRow)}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#39ff14]">
                  Global controls
                </div>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {BINDING_ACTIONS.filter((action) => action.scope === 'global').map(bindingRow)}
                </ul>
              </div>

              {conflict && (
                <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-[11px] text-amber-100">
                  <div>
                    {keyLabel(conflict.code)} is already used by{' '}
                    <strong>{conflict.conflicts.map((entry) => entry.label).join(', ')}</strong>.
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        controls.setBinding(conflict.action, conflict.code, true);
                        setConflict(null);
                      }}
                      className="rounded-md bg-amber-400 px-2 py-1 text-[10px] font-bold text-[#1a1005]"
                    >
                      Use it anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => setConflict(null)}
                      className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {bindingError && (
                <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/8 px-3 py-2 text-[11px] text-red-200">
                  {bindingError}
                </div>
              )}
            </section>
          )}

          {tab === 'graphics' && (
            <section>
              <SectionHeader eyebrow="Graphics" title="Quality & performance" />
              <ChoiceRow
                label="Graphics quality"
                description="Controls render resolution in world scenes. Takes effect the next time you enter a world."
                value={settings.graphics.quality}
                options={[
                  { id: 'low', label: 'Low' },
                  { id: 'medium', label: 'Medium' },
                  { id: 'high', label: 'High' },
                ]}
                onChange={(value) => patchSection('graphics', { quality: value })}
              />
              <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-500">
                <p>
                  LoftLife renders with WebGL. High quality uses the device pixel ratio up to 2× with
                  shadows; low caps it at 1× for integrated or software GPUs.
                </p>
                <p>
                  Forced software WebGL already disables shadows and drops the pixel ratio
                  automatically.
                </p>
              </div>
              <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="text-xs font-semibold text-slate-200">Display</div>
                <p className="mt-1 text-[11px] text-slate-500">
                  The 3D viewport fills the available window and supports desktop, tablet and phone
                  orientations. Dedicated fullscreen mode is not exposed in this build.
                </p>
              </div>
            </section>
          )}

          {tab === 'mobile' && (
            <section>
              <SectionHeader
                eyebrow="Mobile"
                title="Touch controls"
                action={<Badge tone="green">Used by the game</Badge>}
              />
              <ChoiceRow
                label="Camera mode"
                description="Auto uses portrait for Isometric and landscape for Third-Person. You can lock either mode here."
                value={settings.camera.mobileMode}
                options={[
                  { id: 'auto', label: 'Auto (phone rotation)' },
                  { id: 'isometric', label: 'Lock Isometric' },
                  { id: 'third-person', label: 'Lock Third-Person' },
                ]}
                onChange={(value) => patchSection('camera', { mobileMode: value })}
              />
              <ChoiceRow
                label="Movement stick"
                description="Choose the side of the screen the virtual stick occupies. Actions move to the opposite side."
                value={controls.touch.handedness}
                options={[
                  { id: 'right', label: 'Right' },
                  { id: 'left', label: 'Left' },
                ]}
                onChange={(value) => controls.setTouch({ handedness: value as 'left' | 'right' })}
              />
              <ChoiceRow
                label="Control size"
                description="Scales the stick, buttons and their reach for smaller or larger hands."
                value={controls.touch.size}
                options={[
                  { id: 'sm', label: 'Compact' },
                  { id: 'md', label: 'Standard' },
                  { id: 'lg', label: 'Large' },
                ]}
                onChange={(value) => controls.setTouch({ size: value as 'sm' | 'md' | 'lg' })}
              />
              <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">Control opacity</span>
                  <span className="font-mono-tabular text-[10px] text-slate-400">
                    {controls.touch.opacity}%
                  </span>
                </div>
                <input
                  type="range"
                  min={55}
                  max={100}
                  value={controls.touch.opacity}
                  onChange={(event) => controls.setTouch({ opacity: Number(event.target.value) })}
                  aria-label="Touch control opacity"
                  className="mt-2 w-full accent-[#39ff14]"
                />
              </div>
              <button type="button" onClick={() => controls.resetTouch()} className={`${btnGhost} mt-3`}>
                <RotateCcw className="h-3.5 w-3.5" />
                Restore default layout
              </button>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Touch controls appear automatically on phones, tablets, mobile browsers and the
                Android app. A desktop touchscreen switches to them while touch is the last input.
                These preferences are the same ones used by the in-game controls panel, and sync to
                your account when you are signed in.
              </p>
            </section>
          )}

          {tab === 'accessibility' && (
            <section>
              <SectionHeader eyebrow="Accessibility" title="Readability & motion" />
              <div className="rounded-xl border border-white/8 bg-black/20 px-3">
                <Toggle
                  checked={settings.accessibility.largeText}
                  onChange={(value) => patchSection('accessibility', { largeText: value })}
                  label="Larger text"
                  description="Increases the base text size across the platform."
                />
                <Toggle
                  checked={settings.accessibility.highContrast}
                  onChange={(value) => patchSection('accessibility', { highContrast: value })}
                  label="High contrast"
                  description="Strengthens borders and secondary text contrast."
                />
                <Toggle
                  checked={settings.accessibility.reduceMotion}
                  onChange={(value) => patchSection('accessibility', { reduceMotion: value })}
                  label="Reduce motion"
                  description="Removes non-essential transitions and hover movement."
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Keyboard focus is always visible, every control is reachable with Tab, and the platform
                does not rely on colour alone to communicate state.
              </p>
            </section>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-[10px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" />
              Preferences save automatically.
            </span>
            <button type="button" onClick={() => onNavigate('home')} className={btnGhost}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
