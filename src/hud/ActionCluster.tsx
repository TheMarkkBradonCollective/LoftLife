import React from 'react';
import { cx } from './primitives';
import type { HudAction, HudContextAction } from './types';

interface ActionClusterProps {
  /** Offered only when something is actually in reach. */
  primary: HudContextAction | null;
  /** Jump / sprint / emote / camera — the actions that belong to this state. */
  actions: HudAction[];
  side: 'left' | 'right';
  scale: number;
  opacity: number;
  /** Tablets have room for text labels; phones stay icon-only. */
  showLabels: boolean;
  /** Landscape phones fold the secondary actions into two columns. */
  columns?: 1 | 2;
}

/**
 * The contextual action system.
 *
 * Nothing is permanent: the player sees the actions that belong to their
 * current situation, with the most relevant one as a large circular button and
 * the rest as compact secondary controls. Actions animate in and out without
 * moving the controls that are already on screen.
 */
export const ActionCluster: React.FC<ActionClusterProps> = ({
  primary,
  actions,
  side,
  scale,
  opacity,
  showLabels,
  columns = 1,
}) => {
  const primarySize = Math.round(70 * scale);
  const secondarySize = Math.round(48 * scale);
  const edge = side === 'left' ? 'left' : 'right';
  const align = side === 'left' ? 'items-start' : 'items-end';

  return (
    <div
      className={cx('fixed z-40 flex flex-col gap-2.5 pointer-events-none', align)}
      data-hud="actions"
      style={{
        [edge]: `calc(18px + var(--ll-safe-${edge}, 0px))`,
        bottom: 'calc(20px + var(--ll-safe-bottom, 0px))',
        opacity,
      }}
    >
      {/* Secondary actions sit above the primary one so thumbs never cross. */}
      <div
        className={cx(
          columns === 2 ? 'grid gap-2 pointer-events-auto' : 'flex flex-col gap-2 pointer-events-auto',
          columns === 1 && (side === 'right' ? 'items-end' : 'items-start')
        )}
        style={columns === 2 ? { gridTemplateColumns: 'repeat(2, max-content)' } : undefined}
      >
        {actions.map((action, index) => (
          <div
            key={action.id}
            className={cx('flex items-center gap-2', side === 'left' && 'flex-row-reverse')}
            style={{ animationDelay: `${Math.min(index, 4) * 25}ms` }}
          >
            {showLabels && columns === 1 && (
              <span
                className="ll-pill h-8 min-h-0 px-2.5 text-[11px] font-semibold text-white/90"
                aria-hidden="true"
              >
                {action.label}
              </span>
            )}
            <button
              type="button"
              aria-label={action.hint ? `${action.label} — ${action.hint}` : action.label}
              aria-pressed={action.pressed}
              disabled={action.disabled}
              title={action.hint ?? action.label}
              onClick={action.onPress}
              className={cx(
                'll-focus ll-surface relative inline-flex items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
                action.pressed && 'll-active'
              )}
              style={{ width: secondarySize, height: secondarySize }}
            >
              <span aria-hidden="true" className="[&>svg]:h-5 [&>svg]:w-5">
                {action.icon}
              </span>
            </button>
          </div>
        ))}
      </div>

      {primary && (
        <div className="flex flex-col items-center gap-1.5 pointer-events-auto">
          <button
            key={primary.id}
            type="button"
            aria-label={primary.label}
            aria-pressed={primary.pressed}
            disabled={primary.disabled}
            onClick={primary.onPress}
            className="ll-action-primary ll-focus ll-animate-pop relative flex flex-col items-center justify-center gap-0.5"
            style={{ width: primarySize, height: primarySize }}
            data-pressed={primary.pressed ? 'true' : 'false'}
          >
            <span aria-hidden="true" className="[&>svg]:h-6 [&>svg]:w-6">
              {primary.icon}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] leading-none">
              {primary.verb}
            </span>
          </button>
          <span
            className="max-w-[168px] rounded-lg bg-black/55 px-2 py-1 text-center text-[10px] font-semibold leading-tight text-white shadow-sm"
            aria-live="polite"
          >
            {primary.label}
            {primary.hint && (
              <span className="ml-1 text-white/55">· {primary.hint}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};
