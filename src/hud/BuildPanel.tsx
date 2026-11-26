import React, { useMemo } from 'react';
import {
  Armchair,
  ChevronDown,
  ChevronUp,
  Copy,
  Eraser,
  Frame,
  LampDesk,
  Layers,
  Move,
  Paintbrush,
  PencilRuler,
  RotateCw,
  Sofa,
  Sparkles,
  Sprout,
  Trash2,
  Tv,
  Undo2,
  X,
  Check,
} from 'lucide-react';
import { FLOOR_STYLES, FURNITURE_CATALOG, WALL_STYLES } from '../game/catalog';
import type { FurnitureCategory } from '../game/types';
import type { BuildController, HudPresentation } from './types';
import { cx } from './primitives';

const CATEGORY_TABS: { id: 'all' | FurnitureCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'seating', label: 'Seating' },
  { id: 'tables', label: 'Tables' },
  { id: 'living', label: 'Living' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'plants_rugs', label: 'Plants' },
  { id: 'wall', label: 'Wall' },
];

function catalogIcon(category: FurnitureCategory) {
  switch (category) {
    case 'seating':
      return <Sofa className="w-4 h-4" />;
    case 'tables':
      return <Layers className="w-4 h-4" />;
    case 'living':
      return <Tv className="w-4 h-4" />;
    case 'lighting':
      return <LampDesk className="w-4 h-4" />;
    case 'plants_rugs':
      return <Sprout className="w-4 h-4" />;
    case 'wall':
      return <Frame className="w-4 h-4" />;
    default:
      return <Armchair className="w-4 h-4" />;
  }
}

interface BuildPanelProps {
  build: BuildController;
  presentation: HudPresentation;
  touch: boolean;
}

/**
 * Interior editing. It is its own HUD state: unrelated actions disappear and
 * the tools take the bottom of the screen. Every control is the existing
 * builder handler — catalog, surfaces, layouts, undo, clear and Done.
 */
export const BuildPanel: React.FC<BuildPanelProps> = ({ build, presentation, touch }) => {
  const filtered = useMemo(
    () =>
      build.categoryFilter === 'all'
        ? FURNITURE_CATALOG
        : FURNITURE_CATALOG.filter((item) => item.category === build.categoryFilter),
    [build.categoryFilter]
  );

  const portraitPhone = presentation === 'mobile-portrait';

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-2"
      style={{
        paddingBottom: 'calc(8px + var(--ll-safe-bottom, 0px))',
        paddingLeft: 'calc(8px + var(--ll-safe-left, 0px))',
        paddingRight: 'calc(8px + var(--ll-safe-right, 0px))',
      }}
      data-hud="build"
    >
      <div
        className={cx(
          'll-build-sheet ll-animate-rise flex w-full flex-col overflow-hidden',
          portraitPhone ? 'max-w-none' : 'max-w-[960px]'
        )}
        style={{ maxHeight: portraitPhone ? '52dvh' : '46dvh' }}
      >
        {/* Header: what mode am I in, and how do I leave it? */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
            <PencilRuler className="w-3.5 h-3.5" aria-hidden="true" />
            Build
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'catalog' as const, label: 'Furniture', icon: <Sofa className="w-3.5 h-3.5" /> },
                {
                  id: 'surfaces' as const,
                  label: 'Surfaces',
                  icon: <Paintbrush className="w-3.5 h-3.5" />,
                },
                { id: 'presets' as const, label: 'Layouts', icon: <Layers className="w-3.5 h-3.5" /> },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={build.tab === tab.id}
                onClick={() => build.setTab(tab.id)}
                className={cx(
                  'll-focus inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors',
                  build.tab === tab.id
                    ? 'bg-white text-[#15181b]'
                    : 'text-white/65 hover:bg-white/10 hover:text-white'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={build.historyLength === 0}
            onClick={build.onUndo}
            aria-label="Undo last change"
            className="ll-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-35"
          >
            <Undo2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={build.onToggleCollapsed}
            aria-label={build.collapsed ? 'Show build tools' : 'Hide build tools'}
            aria-expanded={!build.collapsed}
            className="ll-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
          >
            {build.collapsed ? (
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={build.onDone}
            className="ll-focus inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-bold text-[#15181b] hover:bg-white/90"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            Done
          </button>
        </div>

        {!build.collapsed && (
          <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5">
            {(build.placing || build.movingName) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/14 bg-black/25 px-2.5 py-2">
                <span className="text-[11px] font-semibold text-white">
                  {build.movingName ? `Moving ${build.movingName}` : `Placing ${build.placing?.name}`}
                </span>
                <span className="text-[10px] text-white/45">
                  {build.placing?.isWall ? 'Tap a wall to hang it' : 'Tap a floor tile to place'}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  {build.placing && build.placing.colors.length > 0 && (
                    <div className="flex items-center gap-1 pr-1.5 border-r border-white/12">
                      {build.placing.colors.map((color) => (
                        <button
                          key={color.hex}
                          type="button"
                          title={color.label}
                          aria-label={`${color.label}${build.placing?.color === color.hex ? ', selected' : ''}`}
                          aria-pressed={build.placing?.color === color.hex}
                          onClick={() => build.onRecolor(color.hex)}
                          className={cx(
                            'h-5 w-5 rounded-full border transition-transform',
                            build.placing?.color === color.hex
                              ? 'border-white scale-110 ring-2 ring-white/40'
                              : 'border-white/25 hover:scale-105'
                          )}
                          style={{ backgroundColor: color.hex }}
                        />
                      ))}
                    </div>
                  )}
                  {!build.placing?.isWall && (
                    <button
                      type="button"
                      onClick={build.onRotate}
                      className="ll-focus inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white/12 px-2 text-[10px] font-bold text-white hover:bg-white/20"
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" /> Rotate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={build.onCancelPlacement}
                    aria-label="Cancel placing"
                    className="ll-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/12 hover:text-white"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {!build.placing && !build.movingName && build.selected && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/14 bg-black/25 px-2.5 py-2">
                <span className="text-[11px] font-semibold text-white">{build.selected.name}</span>
                <span className="font-mono-tabular text-[10px] text-white/45">
                  {build.selected.size[0]}×{build.selected.size[1]} m
                </span>
                {build.selected.colors.length > 0 && (
                  <div className="flex items-center gap-1 pl-1.5 border-l border-white/12">
                    {build.selected.colors.map((color) => (
                      <button
                        key={color.hex}
                        type="button"
                        title={color.label}
                        aria-label={`Recolour ${color.label}`}
                        aria-pressed={build.selected?.color === color.hex}
                        onClick={() => build.onRecolor(color.hex)}
                        className={cx(
                          'h-5 w-5 rounded-full border transition-transform',
                          build.selected?.color === color.hex
                            ? 'border-white scale-110 ring-2 ring-white/40'
                            : 'border-white/25 hover:scale-105'
                        )}
                        style={{ backgroundColor: color.hex }}
                      />
                    ))}
                  </div>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  <BuildMiniAction label="Move" icon={<Move className="w-3.5 h-3.5" />} onClick={build.onStartMove} />
                  {!build.selected.isWall && (
                    <BuildMiniAction
                      label="Rotate"
                      icon={<RotateCw className="w-3.5 h-3.5" />}
                      onClick={build.onRotate}
                    />
                  )}
                  <BuildMiniAction
                    label="Duplicate"
                    icon={<Copy className="w-3.5 h-3.5" />}
                    onClick={build.onDuplicate}
                  />
                  <BuildMiniAction
                    label="Delete"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={build.onDelete}
                    danger
                  />
                </div>
              </div>
            )}

            {build.tab === 'catalog' && (
              <>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {CATEGORY_TABS.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={build.categoryFilter === category.id}
                      onClick={() => build.setCategoryFilter(category.id)}
                      className={cx(
                        'll-focus shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
                        build.categoryFilter === category.id
                          ? 'bg-white text-[#15181b]'
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {category.label}
                    </button>
                  ))}
                  <span className="ml-auto shrink-0 pr-1 text-[10px] font-mono-tabular text-white/40">
                    {build.itemCount} in suite
                  </span>
                </div>

                <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-1">
                  {filtered.map((item) => {
                    const active = build.placing?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => build.onPickCatalog(item.id)}
                        className={cx(
                          'll-focus flex min-w-[112px] shrink-0 flex-col gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-colors',
                          active
                            ? 'border-white bg-white text-[#15181b]'
                            : 'border-white/12 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/10'
                        )}
                      >
                        <span className="flex w-full items-center justify-between">
                          <span
                            className={cx(
                              'flex h-6 w-6 items-center justify-center rounded-md',
                              active ? 'bg-black/10' : 'bg-white/10 text-white/80'
                            )}
                          >
                            {catalogIcon(item.category)}
                          </span>
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-black/20"
                            style={{ backgroundColor: item.defaultColor }}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="truncate text-[11px] font-semibold">{item.name}</span>
                        <span
                          className={cx(
                            'font-mono-tabular text-[10px]',
                            active ? 'text-black/50' : 'text-white/40'
                          )}
                        >
                          {item.size[0]}×{item.size[1]} m
                          {item.sittable ? ' · Sit' : item.interactive ? ' · Use' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {build.tab === 'surfaces' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                    Floor finish
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {FLOOR_STYLES.map((floor) => {
                      const active = build.surfaces.floor === floor.id;
                      return (
                        <button
                          key={floor.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => build.onFloorChange(floor.id)}
                          className={cx(
                            'll-focus inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors',
                            active
                              ? 'border-white bg-white text-[#15181b]'
                              : 'border-white/12 bg-white/[0.06] text-white/80 hover:border-white/30'
                          )}
                        >
                          <span
                            className="h-3 w-3 rounded-full border border-black/20"
                            style={{ backgroundColor: floor.color }}
                            aria-hidden="true"
                          />
                          {floor.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
                    Wall paint
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {WALL_STYLES.map((wall) => {
                      const active = build.surfaces.wall === wall.id;
                      return (
                        <button
                          key={wall.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => build.onWallChange(wall.id)}
                          className={cx(
                            'll-focus inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors',
                            active
                              ? 'border-white bg-white text-[#15181b]'
                              : 'border-white/12 bg-white/[0.06] text-white/80 hover:border-white/30'
                          )}
                        >
                          <span
                            className="h-3 w-3 rounded-full border border-black/20"
                            style={{ backgroundColor: wall.color }}
                            aria-hidden="true"
                          />
                          {wall.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {build.tab === 'presets' && (
              <div className="flex flex-wrap items-center gap-2">
                {build.presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={preset.active}
                    onClick={() => build.onPreset(preset.id)}
                    className={cx(
                      'll-focus flex min-h-[44px] flex-col items-start rounded-xl border px-3 py-1.5 text-left transition-colors',
                      preset.active
                        ? 'border-white bg-white text-[#15181b]'
                        : 'border-white/12 bg-white/[0.06] text-white hover:border-white/30'
                    )}
                  >
                    <span className="text-[11px] font-semibold">{preset.name}</span>
                    <span
                      className={cx(
                        'font-mono-tabular text-[10px]',
                        preset.active ? 'text-black/50' : 'text-white/40'
                      )}
                    >
                      {preset.count} items
                    </span>
                  </button>
                ))}
                {touch && (
                  <button
                    type="button"
                    onClick={build.onClear}
                    className="ll-focus ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-red-200 hover:bg-red-500/15"
                  >
                    <Eraser className="w-3.5 h-3.5" aria-hidden="true" /> Clear floor
                  </button>
                )}
              </div>
            )}

            {!touch && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/40">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" aria-hidden="true" /> Drag items to move · Arrows
                  nudge · R rotates · Delete removes
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={build.onClear}
                  className="ll-focus inline-flex items-center gap-1 rounded px-1 text-red-200 hover:bg-red-500/15"
                >
                  <Eraser className="w-3 h-3" aria-hidden="true" /> Clear floor
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const BuildMiniAction: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}> = ({ label, icon, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={cx(
      'll-focus inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-[10px] font-semibold',
      danger ? 'text-red-200 hover:bg-red-500/18' : 'text-white/80 hover:bg-white/12'
    )}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);
