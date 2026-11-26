import React from 'react';
import {
  ArrowRight,
  Building2,
  DoorOpen,
  Globe2,
  Lock,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react';
import type { WorldSummary } from '../net/api';
import { useSession } from '../session';
import { usePlatformData } from './data';
import { OPEN_AUTH_EVENT, type GameEntry } from './types';
import { Badge, StatusDot, btnPrimary, btnSecondary, panelClass } from './ui';
import cityImage from '../assets/images/thecity.jpg';
import suiteImage from '../assets/images/suite.jpg';
import communityImage from '../assets/images/community.jpg';

const worldImages: Record<string, string> = {
  club: communityImage,
  venue: communityImage,
  restaurant: communityImage,
  shop: communityImage,
  house: suiteImage,
  apartment: suiteImage,
  hangout: suiteImage,
  park: cityImage,
  neighborhood: cityImage,
};

const ACCESS_LABEL: Record<WorldSummary['access'], string> = {
  public: 'Public',
  friends: 'Friends only',
  invite: 'Invite only',
  collab: 'Collaborators',
  private: 'Private',
};

const ACCESS_REQUIREMENT: Record<WorldSummary['access'], string> = {
  public: 'Open to everyone',
  friends: 'Requires friendship with the owner',
  invite: 'Requires an invitation from the owner',
  collab: 'Requires an invitation or build rights',
  private: 'Owner only',
};

export function CityEntryCard({
  onEnter,
  compact = false,
}: {
  onEnter: (entry: GameEntry) => void;
  compact?: boolean;
}) {
  const session = useSession();
  const data = usePlatformData();
  const online = session.status === 'online';
  const status = !online
    ? { label: 'Offline', tone: 'slate' as const }
    : data.presenceError
    ? { label: 'Status unavailable', tone: 'amber' as const }
    : data.presenceLoading && !data.presence
    ? { label: 'Checking server…', tone: 'slate' as const }
    : { label: 'Server online', tone: 'green' as const };
  const headroom = Math.max(0, data.cityCapacity - data.presenceCount);

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-[#39ff14]/25 bg-[#0a120d] ${
        compact ? '' : 'shadow-[0_24px_80px_rgba(0,0,0,0.55)]'
      }`}
    >
      <img
        src={cityImage}
        alt="TheCity street grid with the LoftLife Grand Hotel"
        className="absolute inset-0 h-full w-full object-cover opacity-45"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#050a06] via-[#07110a]/92 to-[#07110a]/30" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(57,255,20,0.16),transparent_45%)]" />

      <div className={`relative ${compact ? 'p-5 sm:p-6' : 'p-5 sm:p-8 lg:p-10'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Main public world</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-semibold text-slate-200">
            <StatusDot tone={status.tone} />
            {status.label}
          </span>
        </div>

        <h1
          className={`mt-3 font-display font-bold uppercase leading-[0.95] tracking-tight text-white ${
            compact ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl lg:text-6xl'
          }`}
        >
          The<span className="text-[#39ff14]">City</span>
        </h1>
        <p className={`mt-2 max-w-lg leading-relaxed text-slate-300 ${compact ? 'text-xs' : 'text-sm'}`}>
          LoftLife&apos;s main social city: the Grand Hotel lobby, resident suite floors, the
          A–Z street grid, LoftLine buses and everyone who happens to be around.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-slate-200">
            <Users className="h-3.5 w-3.5 text-[#39ff14]" />
            {data.presence ? `${data.presenceCount} player${data.presenceCount === 1 ? '' : 's'} online` : 'Players —'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-slate-200">
            <Globe2 className="h-3.5 w-3.5 text-[#39ff14]" />
            {data.cityCapacity
              ? `${headroom} of ${data.cityCapacity} slots free`
              : 'Capacity —'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-slate-200">
            <MapPin className="h-3.5 w-3.5 text-[#39ff14]" />
            Starts at the Grand Hotel
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (online) onEnter({ kind: 'city' });
              else window.dispatchEvent(new Event(OPEN_AUTH_EVENT));
            }}
            className={`${btnPrimary} px-5 py-3 text-sm tracking-wide`}
          >
            <DoorOpen className="h-4 w-4" />
            {online ? 'ENTER THECITY' : 'Sign in to enter TheCity'}
          </button>
          <span className="text-[11px] text-slate-400">
            {online
              ? 'Your platform stays here — leave the world any time and come back to your dashboard.'
              : 'The platform dashboard is available in offline mode; online play needs an account.'}
          </span>
        </div>
      </div>
    </section>
  );
}

export function WorldCard({
  world,
  onEnter,
  featured = false,
}: {
  world: WorldSummary;
  onEnter: (entry: GameEntry) => void;
  featured?: boolean;
}) {
  const image = worldImages[world.kind] ?? suiteImage;
  const enterable = world.canEnter;
  return (
    <article
      className={`group overflow-hidden rounded-2xl border border-white/8 bg-[#0c1210] transition-colors hover:border-[#39ff14]/35 ${
        featured ? 'sm:col-span-2 sm:flex' : ''
      }`}
    >
      <div className={`relative overflow-hidden ${featured ? 'sm:w-1/2' : ''}`}>
        <img
          src={image}
          alt={`${world.name} preview`}
          className={`h-36 w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.03] ${
            featured ? 'sm:h-full sm:min-h-[190px]' : ''
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c1210] via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge tone={world.access === 'public' ? 'green' : world.access === 'friends' ? 'sky' : 'amber'}>
            {ACCESS_LABEL[world.access]}
          </Badge>
          {!world.published && <Badge tone="slate">Unpublished</Badge>}
        </div>
      </div>

      <div className={`flex flex-col gap-2 p-4 ${featured ? 'sm:w-1/2 sm:justify-center' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold text-white">{world.name}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              by <span className="text-slate-300">@{world.ownerHandle}</span> ·{' '}
              {world.kind.replace(/^\w/, (letter) => letter.toUpperCase())}
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-mono-tabular text-slate-400">
            {world.maxVisitors} max
          </span>
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
          {world.description || 'No description yet.'}
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            {enterable ? <Users className="h-3.5 w-3.5 text-[#39ff14]" /> : <Lock className="h-3.5 w-3.5" />}
            {enterable ? ACCESS_REQUIREMENT[world.access] : ACCESS_REQUIREMENT[world.access]}
          </span>
          <button
            type="button"
            disabled={!enterable}
            onClick={() => enterable && onEnter({ kind: 'world', worldId: world.id })}
            className={enterable ? btnSecondary : `${btnSecondary} opacity-50`}
            title={enterable ? `Enter ${world.name}` : ACCESS_REQUIREMENT[world.access]}
          >
            {enterable ? 'Enter' : 'Access required'}
            {enterable && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </article>
  );
}

export function LoftSummaryCard({
  onEnter,
  onManage,
}: {
  onEnter: (entry: GameEntry) => void;
  onManage: () => void;
}) {
  const session = useSession();
  const suite = session.suite;
  return (
    <div className={`overflow-hidden ${panelClass}`}>
      <div className="relative h-28">
        <img src={suiteImage} alt="A furnished LoftLife suite" className="h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c1210] to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#39ff14]/70">
              My Loft
            </div>
            <div className="font-display text-lg font-semibold text-white">
              {suite?.name ?? 'Your private suite'}
            </div>
          </div>
          <Badge tone={suite?.isPublic ? 'green' : 'slate'}>
            {suite?.isPublic ? 'Visitors welcome' : 'Private'}
          </Badge>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/30 px-2 py-1">
            <Building2 className="h-3 w-3 text-[#39ff14]" />
            {suite ? `Suite ${suite.number} · Floor ${suite.floor}` : 'Suite data unavailable'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-black/30 px-2 py-1">
            <Sparkles className="h-3 w-3 text-[#39ff14]" />
            {suite ? `${suite.items.length} furniture items` : '—'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onEnter({ kind: 'suite' })} className={btnPrimary}>
            <DoorOpen className="h-4 w-4" />
            Enter My Loft
          </button>
          <button type="button" onClick={onManage} className={btnSecondary}>
            Manage
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Your suite is always available, whether or not you are in TheCity. Room editing opens
          inside the suite.
        </p>
      </div>
    </div>
  );
}
