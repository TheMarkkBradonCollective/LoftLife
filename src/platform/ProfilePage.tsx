import React, { useEffect, useState } from 'react';
import { AtSign, CalendarDays, Check, Coins, LockKeyhole, Shirt, Sofa } from 'lucide-react';
import { ApiError, api } from '../net/api';
import { useSession } from '../session';
import { useIdentity } from './identity';
import { AvatarFigure } from './AvatarFigure';
import { shortDate } from './format';
import type { PlatformPage } from './types';
import {
  AvatarCircle,
  Badge,
  Field,
  SectionHeader,
  btnGhost,
  btnPrimary,
  btnSecondary,
  inputClass,
  panelClass,
} from './ui';

const errorOf = (error: unknown) =>
  error instanceof ApiError ? error.message : (error as Error)?.message ?? 'Something went wrong';

export function ProfilePage({ onNavigate }: { onNavigate: (page: PlatformPage) => void }) {
  const session = useSession();
  const { avatar, displayName, handle } = useIdentity();
  const [name, setName] = useState(displayName);
  const [bio, setBio] = useState(session.profile?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(session.profile?.displayName ?? displayName);
    setBio(session.profile?.bio ?? '');
  }, [session.profile?.displayName, session.profile?.bio, displayName]);

  const online = session.status === 'online';
  const dirty = name !== (session.profile?.displayName ?? displayName) || bio !== (session.profile?.bio ?? '');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!online) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.updateProfile({ displayName: name.trim() || handle, bio });
      await session.refresh();
      setNotice('Profile saved to your account.');
    } catch (caught) {
      setError(errorOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const furnitureCount = session.inventory
    .filter((entry) => entry.kind === 'furniture')
    .reduce((total, entry) => total + entry.qty, 0);
  const clothingCount = session.inventory
    .filter((entry) => entry.kind === 'clothing')
    .reduce((total, entry) => total + entry.qty, 0);

  return (
    <div className="space-y-5">
      {(notice || error) && (
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

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section className={`${panelClass} overflow-hidden`}>
          <div className="relative h-56 bg-[radial-gradient(circle_at_50%_20%,rgba(57,255,20,0.18),transparent_60%),#0a100c]">
            <AvatarFigure config={avatar} className="mx-auto h-full w-auto" />
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-semibold text-white">{displayName}</h1>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <AtSign className="h-3 w-3" />
                  {handle}
                </div>
              </div>
              <Badge tone={online ? 'green' : 'amber'}>{online ? 'Signed in' : 'Offline'}</Badge>
            </div>
          </div>
          <div className="space-y-2 border-t border-white/8 p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-[#39ff14]" />
                Account created
              </span>
              <span className="text-slate-200">
                {session.profile?.createdAt
                  ? shortDate(session.profile.createdAt)
                  : session.user?.createdAt
                  ? shortDate(session.user.createdAt)
                  : 'This device'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <LockKeyhole className="h-3.5 w-3.5 text-[#39ff14]" />
                Account role
              </span>
              <span className="capitalize text-slate-200">{session.user?.role ?? 'offline player'}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-[#39ff14]" />
                Wallet
              </span>
              <span className="font-mono-tabular text-slate-200">
                元 {session.wallet.yuanzi} · 宝 {session.wallet.tongbao}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg border border-white/6 bg-black/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Furniture</div>
                <div className="inline-flex items-center gap-1 text-sm font-semibold text-slate-200">
                  <Sofa className="h-3.5 w-3.5 text-[#39ff14]" />
                  {furnitureCount}
                </div>
              </div>
              <div className="rounded-lg border border-white/6 bg-black/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Clothing</div>
                <div className="inline-flex items-center gap-1 text-sm font-semibold text-slate-200">
                  <Shirt className="h-3.5 w-3.5 text-[#39ff14]" />
                  {clothingCount}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section className={`${panelClass} p-4`}>
            <SectionHeader
              eyebrow="Public profile"
              title="How other players see you"
              action={<Badge tone="sky">Visible by privacy setting</Badge>}
            />
            {online ? (
              <form onSubmit={save} className="space-y-3">
                <Field label="Display name" hint="Shown in chat, friends and your profile.">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={32}
                    className={inputClass}
                  />
                </Field>
                <Field label="Bio" hint="Up to 280 characters. Do not share private account details.">
                  <textarea
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    rows={4}
                    maxLength={280}
                    className={`${inputClass} resize-none`}
                    placeholder="What are you building, collecting or hosting?"
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={busy || !dirty} className={btnPrimary}>
                    <Check className="h-4 w-4" />
                    {busy ? 'Saving…' : 'Save profile'}
                  </button>
                  <button type="button" onClick={() => onNavigate('settings')} className={btnGhost}>
                    Privacy settings
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2 text-xs text-slate-400">
                <p>
                  Offline profile. This device is using the character and room saved locally; account
                  profile fields need a sign-in.
                </p>
                <button type="button" onClick={() => onNavigate('loft')} className={btnSecondary}>
                  Open My Loft
                </button>
              </div>
            )}
          </section>

          <section className={`${panelClass} p-4`}>
            <SectionHeader eyebrow="Preview" title="Public card" />
            <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
              <AvatarCircle config={avatar} name={displayName} size={52} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{displayName}</div>
                <div className="text-[11px] text-slate-500">@{handle}</div>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                  {session.profile?.bio || 'No bio yet.'}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
              Email, password, session tokens and private account data are never included in profile
              responses. Profile visibility is checked by the server before a profile is returned.
            </p>
          </section>

          <section className={`${panelClass} p-4`}>
            <SectionHeader eyebrow="Your space" title="Suite & account" />
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded-lg bg-black/25 px-2.5 py-1.5">
                {session.suite ? `Suite ${session.suite.number} · Floor ${session.suite.floor}` : 'No suite loaded'}
              </span>
              <span className="rounded-lg bg-black/25 px-2.5 py-1.5">
                {session.suite ? `${session.suite.items.length} furniture items` : 'Offline room'}
              </span>
              <button type="button" onClick={() => onNavigate('loft')} className={btnGhost}>
                My Loft
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
