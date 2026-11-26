import React, { useState } from 'react';
import {
  Brush,
  Check,
  DoorOpen,
  Eye,
  EyeOff,
  Layers,
  Package,
  Shirt,
  Sofa,
  Sparkles,
} from 'lucide-react';
import { ApiError, api, type InventoryEntry } from '../net/api';
import { FLOOR_STYLES, WALL_STYLES, getCatalogItem } from '../game/catalog';
import { useSession } from '../session';
import { useIdentity } from './identity';
import { AvatarFigure } from './AvatarFigure';
import { RoomPreview } from './RoomPreview';
import { compactNumber, timeAgo } from './format';
import type { GameEntry, PlatformPage } from './types';
import {
  AvatarCircle,
  Badge,
  EmptyState,
  SectionHeader,
  Toggle,
  btnGhost,
  btnPrimary,
  btnSecondary,
  panelClass,
} from './ui';
import suiteImage from '../assets/images/suite.jpg';

const errorOf = (error: unknown) =>
  error instanceof ApiError ? error.message : (error as Error)?.message ?? 'Something went wrong';

function InventoryRow({ entry }: { entry: InventoryEntry }) {
  const catalog = getCatalogItem(entry.catalogId);
  return (
    <li className="flex items-center gap-2 rounded-lg border border-white/6 bg-black/20 px-2.5 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#39ff14]/10 text-[#39ff14]">
        <Sofa className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-slate-200">
          {catalog?.name ?? entry.catalogId}
        </div>
        <div className="text-[10px] text-slate-500">
          {catalog ? `${catalog.size[0]}×${catalog.size[1]}m · ${catalog.category}` : 'Catalog item'}
        </div>
      </div>
      <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-mono-tabular text-slate-400">
        ×{entry.qty}
      </span>
    </li>
  );
}

export function MyLoftPage({
  onEnter,
  onNavigate,
}: {
  onEnter: (entry: GameEntry) => void;
  onNavigate: (page: PlatformPage) => void;
}) {
  const session = useSession();
  const { avatar, displayName } = useIdentity();
  const suite = session.suite;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const furniture = session.inventory.filter((entry) => entry.kind === 'furniture');
  const clothing = session.inventory.filter((entry) => entry.kind === 'clothing');
  const floorName =
    FLOOR_STYLES.find((style) => style.id === suite?.surfaces.floor)?.label ?? 'Unknown finish';
  const wallName = WALL_STYLES.find((style) => style.id === suite?.surfaces.wall)?.label ?? 'Unknown paint';

  const setVisibility = async (next: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.setSuiteVisibility(next);
      await session.refresh();
      setNotice(next ? 'Your suite is now visible to visitors.' : 'Your suite is private again.');
    } catch (caught) {
      setError(errorOf(caught));
    } finally {
      setBusy(false);
    }
  };

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

      <section className="overflow-hidden rounded-3xl border border-[#39ff14]/20 bg-[#0c1210]">
        <div className="relative h-44 sm:h-56">
          <img src={suiteImage} alt="Furnished LoftLife suite" className="h-full w-full object-cover opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c1210] via-[#0c1210]/40 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#39ff14]/75">
                My Loft · Private suite
              </div>
              <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                {suite?.name ?? 'Your private suite'}
              </h1>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-300">
                <span>{suite ? `Suite ${suite.number} · Floor ${suite.floor}` : 'Offline device suite'}</span>
                <span>·</span>
                <span>{suite ? `${suite.items.length} furniture items` : 'Saved locally'}</span>
                <span>·</span>
                <span>Updated {suite ? timeAgo(suite.updatedAt) : 'on this device'}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onEnter({ kind: 'suite' })} className={btnPrimary}>
                <DoorOpen className="h-4 w-4" />
                Enter My Loft
              </button>
              <button type="button" onClick={() => onEnter({ kind: 'suite', edit: true })} className={btnSecondary}>
                <Brush className="h-4 w-4" />
                Edit room
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/8 p-4 md:grid-cols-[260px_1fr]">
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Layers className="h-3.5 w-3.5 text-[#39ff14]" />
              Room preview
            </div>
            <RoomPreview suite={suite} className="w-full rounded-lg" />
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
              <span className="rounded-md bg-black/30 px-2 py-1 text-slate-400">{floorName}</span>
              <span className="rounded-md bg-black/30 px-2 py-1 text-slate-400">{wallName}</span>
              <span className="rounded-md bg-black/30 px-2 py-1 text-slate-400">
                {suite?.mood ?? 'morning'} lighting
              </span>
              <span className="rounded-md bg-black/30 px-2 py-1 text-slate-400">
                {suite?.isPublic ? 'Visitors allowed' : 'Private'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <Eye className="h-3.5 w-3.5 text-[#39ff14]" />
                Home options
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3">
                <Toggle
                  checked={Boolean(suite?.isPublic)}
                  onChange={(next) => void setVisibility(next)}
                  label="Allow suite visits"
                  description={
                    busy
                      ? 'Saving…'
                      : session.status === 'online'
                      ? 'Uses the existing suite visibility rule. Private suites stay hidden from other residents.'
                      : 'Sign in to change suite visibility for visitors.'
                  }
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
              <div className="h-32 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10">
                <AvatarFigure config={avatar} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Character appearance
                </div>
                <div className="mt-0.5 text-sm font-semibold text-white">{displayName}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  The dashboard never bypasses the character system. Hair and makeup change at the
                  bathroom mirror or a salon, clothing is bought in shops, and outfits change at the
                  home closet. Open the suite to use the in-world studio.
                </p>
                <button
                  type="button"
                  onClick={() => onEnter({ kind: 'suite' })}
                  className={`${btnGhost} mt-2`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Open character studio in-world
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <Shirt className="h-3.5 w-3.5 text-[#39ff14]" />
                  Saved outfits
                </div>
                <Badge tone="amber">Not available yet</Badge>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                LoftLife stores your current look on the account. A saved-outfit library does not
                exist in the backend yet, so nothing is shown here rather than a fake list.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="slate">{avatar.topStyle} top</Badge>
                <Badge tone="slate">{clothing.length} clothing pieces owned</Badge>
              </div>
            </div>

            <button type="button" onClick={() => onNavigate('settings')} className={`${btnGhost} self-start`}>
              <EyeOff className="h-3.5 w-3.5" />
              Privacy & suite settings
            </button>
          </div>
        </div>
      </section>

      <section className={`${panelClass} p-4`}>
        <SectionHeader
          eyebrow="Inventory"
          title="Furniture inventory"
          action={
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Package className="h-3.5 w-3.5 text-[#39ff14]" />
              {compactNumber(furniture.reduce((total, entry) => total + entry.qty, 0))} pieces
            </div>
          }
        />
        {furniture.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="No unplaced furniture yet"
            description="Your suite's placed furniture is shown above. Furniture bought in the in-world shop is added here and can be placed from Edit Room."
          />
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {furniture.map((entry) => (
              <InventoryRow key={`${entry.kind}-${entry.catalogId}`} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className={`${panelClass} p-4`}>
          <SectionHeader eyebrow="Wardrobe" title="Clothing owned" />
          {clothing.length === 0 ? (
            <EmptyState
              icon={<Shirt className="h-5 w-5" />}
              title="No purchased clothing"
              description="The free starting pieces are always available; bought clothing appears here."
            />
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {clothing.map((entry) => (
                <li key={entry.catalogId}>
                  <Badge tone="slate">
                    {entry.catalogId} ×{entry.qty}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-600">
            <Check className="h-3 w-3" />
            Owned pieces unlock in the existing wardrobe studio.
          </div>
        </section>

        <section className={`${panelClass} p-4`}>
          <SectionHeader eyebrow="Suite" title="What is saved" />
          <ul className="space-y-1.5 text-xs text-slate-400">
            <li className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2">
              <span>Suite</span>
              <span className="font-mono-tabular text-slate-200">
                {suite ? `${suite.number} · Floor ${suite.floor}` : 'Offline'}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2">
              <span>Furniture</span>
              <span className="font-mono-tabular text-slate-200">{suite?.items.length ?? 0}</span>
            </li>
            <li className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2">
              <span>Finish</span>
              <span className="text-slate-200">{floorName} / {wallName}</span>
            </li>
            <li className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2">
              <span>Lighting</span>
              <span className="capitalize text-slate-200">{suite?.mood ?? 'morning'}</span>
            </li>
            <li className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-2">
              <span>Last saved</span>
              <span className="text-slate-200">{suite ? timeAgo(suite.updatedAt) : 'This device'}</span>
            </li>
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Room edits save to your account as you build. The suite remains accessible while you are
            not in TheCity.
          </p>
        </section>
      </div>

      {session.status !== 'online' && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/6 px-3 py-2 text-[11px] text-amber-100">
          <AvatarCircle config={avatar} name={displayName} size={26} />
          Offline: this suite preview is the room saved on this device. Sign in to load the account
          suite, furniture inventory and visitor permissions.
        </div>
      )}
    </div>
  );
}
