import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Compass,
  Globe2,
  Home,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import { useSession } from '../session';
import { usePlatformData } from './data';
import { useSettings } from './settings';
import { CityEntryCard, LoftSummaryCard, WorldCard } from './cards';
import { EVENTS, FEATURED_LOCATIONS } from './content';
import type { GameEntry, PlatformPage } from './types';
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
  btnGhost,
  btnSecondary,
  inputClass,
  panelClass,
} from './ui';
import cityImage from '../assets/images/thecity.jpg';
import suiteImage from '../assets/images/suite.jpg';
import communityImage from '../assets/images/community.jpg';
import loftlineImage from '../assets/images/loftline.jpg';

const locationImages = {
  city: cityImage,
  suite: suiteImage,
  community: communityImage,
  loftline: loftlineImage,
};

const COMMUNITY_KINDS = new Set(['club', 'venue', 'park', 'restaurant', 'shop']);

export function ExplorePage({
  onNavigate,
  onEnter,
}: {
  onNavigate: (page: PlatformPage) => void;
  onEnter: (entry: GameEntry) => void;
}) {
  const session = useSession();
  const data = usePlatformData();
  const { settings } = useSettings();
  const [query, setQuery] = useState('');

  const published = useMemo(() => data.worlds.filter((world) => world.published), [data.worlds]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return published;
    return published.filter(
      (world) =>
        world.name.toLowerCase().includes(term) ||
        world.ownerHandle.toLowerCase().includes(term) ||
        world.kind.toLowerCase().includes(term) ||
        world.description.toLowerCase().includes(term)
    );
  }, [published, query]);

  const publicWorlds = filtered.filter((world) => !COMMUNITY_KINDS.has(world.kind));
  const communitySpaces = filtered.filter((world) => COMMUNITY_KINDS.has(world.kind));
  const events = settings.notifications.events ? EVENTS : [];

  return (
    <div className="space-y-6">
      <CityEntryCard onEnter={onEnter} compact />

      <div className={`${panelClass} flex flex-wrap items-center gap-3 p-3`}>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search worlds, owners or kinds"
            className={`${inputClass} pl-9`}
            aria-label="Search destinations"
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <Globe2 className="h-3.5 w-3.5 text-[#39ff14]" />
          {published.length} published world{published.length === 1 ? '' : 's'}
        </div>
      </div>

      <section>
        <SectionHeader
          eyebrow="Your space"
          title="Player homes & private suites"
          action={
            <button type="button" onClick={() => onNavigate('loft')} className={btnGhost}>
              My Loft
            </button>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <LoftSummaryCard onEnter={onEnter} onManage={() => onNavigate('loft')} />
          <div className={`${panelClass} flex flex-col justify-center gap-2 p-4`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Home className="h-4 w-4 text-[#39ff14]" />
              {session.suite ? `Suite ${session.suite.number}` : 'Private suite'}
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Your suite is separate from TheCity and stays exactly as you left it. Set it to public
              from My Loft if you want other residents to request a visit through existing world
              permissions.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" onClick={() => onEnter({ kind: 'suite', edit: true })} className={btnSecondary}>
                Enter & edit
              </button>
              <button type="button" onClick={() => onEnter({ kind: 'suite' })} className={btnGhost}>
                Walk around
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
              Visiting another resident&apos;s suite is managed by in-world keycard and resident
              permissions; it is not a separate dashboard destination yet.
            </p>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader eyebrow="Public" title="Worlds & hangouts" />
        {data.worldsLoading && data.worlds.length === 0 ? (
          <LoadingState label="Loading worlds…" />
        ) : data.worldsError ? (
          <ErrorState message={data.worldsError} onRetry={() => void data.refreshWorlds()} />
        ) : publicWorlds.length === 0 ? (
          <EmptyState
            icon={<Compass className="h-5 w-5" />}
            title={query ? 'No worlds match that search' : 'No public worlds are open yet'}
            description={
              query
                ? 'Try a different name, kind or owner handle.'
                : 'Worlds appear here after their owners publish them. TheCity is always available.'
            }
            action={
              query ? (
                <button type="button" onClick={() => setQuery('')} className={btnGhost}>
                  Clear search
                </button>
              ) : (
                <button type="button" onClick={() => onEnter({ kind: 'city' })} className={btnSecondary}>
                  Enter TheCity
                </button>
              )
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {publicWorlds.map((world) => (
              <WorldCard key={world.id} world={world} onEnter={onEnter} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader eyebrow="Community" title="Community spaces" />
        {communitySpaces.length === 0 ? (
          <div className={`${panelClass} p-4`}>
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No community venues configured"
              description="Clubs, venues, restaurants, parks and shops created by players will be listed here."
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {communitySpaces.map((world) => (
              <WorldCard key={world.id} world={world} onEnter={onEnter} />
            ))}
          </div>
        )}
      </section>

      {data.friendWorlds.length > 0 && (
        <section>
          <SectionHeader eyebrow="Friends" title="Friends' worlds" action={<Badge tone="sky">You have access</Badge>} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.friendWorlds.map((world) => (
              <WorldCard key={world.id} world={world} onEnter={onEnter} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${panelClass} p-4`}>
          <SectionHeader eyebrow="What's on" title="Events" />
          {events.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" />}
              title="No events are scheduled"
              description="There is no events service configured for this build, so the calendar stays honestly empty."
            />
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="rounded-xl border border-white/6 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-amber-200">{event.when}</div>
                  <div className="text-sm font-semibold text-slate-100">{event.title}</div>
                  <p className="text-xs text-slate-500">{event.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${panelClass} p-4`}>
          <SectionHeader eyebrow="Inside TheCity" title="Featured locations" />
          <ul className="space-y-2">
            {FEATURED_LOCATIONS.map((location) => (
              <li key={location.id} className="flex items-center gap-3 rounded-lg bg-black/20 p-2">
                <img
                  src={locationImages[location.image]}
                  alt=""
                  className="h-12 w-16 shrink-0 rounded-md object-cover opacity-80"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200">{location.name}</div>
                  <div className="text-[10px] text-slate-500">{location.description}</div>
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[#39ff14]/70">
                    <MapPin className="h-3 w-3" />
                    {location.inside}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
