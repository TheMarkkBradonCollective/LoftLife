import React from 'react';
import { Loader2 } from 'lucide-react';

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

export type HudTheme = 'dark' | 'light';

/* ---------------------------------------------------------------------------
   Buttons
   ------------------------------------------------------------------------- */

export interface HudButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
  theme?: HudTheme;
  pressed?: boolean;
  loading?: boolean;
  block?: boolean;
}

/**
 * Labelled HUD button. Touch targets are >= 40px; the primary action uses a
 * dark charcoal surface on light menus and a translucent glass surface over
 * the world. LoftLife green never fills a large control.
 */
export const HudButton: React.FC<HudButtonProps> = ({
  children,
  icon,
  variant = 'secondary',
  theme = 'dark',
  pressed,
  loading = false,
  block = false,
  disabled,
  className,
  type = 'button',
  ...rest
}) => {
  const base =
    'll-focus inline-flex items-center justify-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-colors select-none disabled:opacity-45 disabled:pointer-events-none min-h-[44px]';
  const tokens: Record<string, Record<HudTheme, string>> = {
    primary: {
      dark: 'bg-white text-[#15181b] hover:bg-white/90',
      light: 'bg-[#1b1f24] text-white hover:bg-[#2a3036]',
    },
    secondary: {
      dark: 'll-surface text-white hover:bg-white/15',
      light: 'bg-white text-[#1b1f24] border border-black/10 hover:bg-black/[0.03]',
    },
    ghost: {
      dark: 'text-white/85 hover:bg-white/12',
      light: 'text-[#1b1f24]/80 hover:bg-black/[0.05]',
    },
    quiet: {
      dark: 'll-surface text-white/70 hover:text-white',
      light: 'bg-black/[0.04] text-[#1b1f24]/70 hover:bg-black/[0.07]',
    },
    danger: {
      dark: 'bg-red-500/18 text-red-100 border border-red-400/30 hover:bg-red-500/26',
      light: 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100',
    },
  };
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-pressed={pressed}
      className={cx(base, tokens[variant][theme], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
};

export interface HudIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon: React.ReactNode;
  theme?: HudTheme;
  size?: 'sm' | 'md' | 'lg';
  pressed?: boolean;
  active?: boolean;
  badge?: boolean;
  loading?: boolean;
}

const ICON_SIZES = { sm: 36, md: 44, lg: 48 } as const;

/** Icon-only control. `label` is required so every button has an accessible name. */
export const HudIconButton: React.FC<HudIconButtonProps> = ({
  label,
  icon,
  theme = 'dark',
  size = 'md',
  pressed,
  active = false,
  badge = false,
  loading = false,
  disabled,
  className,
  type = 'button',
  ...rest
}) => {
  const px = ICON_SIZES[size];
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled || loading}
      style={{ width: px, height: px }}
      className={cx(
        'll-focus relative inline-flex items-center justify-center rounded-full transition-colors select-none disabled:opacity-45 disabled:pointer-events-none',
        theme === 'dark'
          ? 'll-surface text-white hover:bg-white/15'
          : 'bg-white text-[#1b1f24] border border-black/10 hover:bg-black/[0.03]',
        active && 'll-active',
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : icon}
      {badge && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#6ee787] ring-2 ring-[#12161a]"
        />
      )}
    </button>
  );
};

/* ---------------------------------------------------------------------------
   Surfaces & layout
   ------------------------------------------------------------------------- */

export const HudPill: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'span';
}> = ({ children, className, as: Tag = 'div' }) => (
  <Tag className={cx('ll-pill', className)}>{children}</Tag>
);

export const MenuCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'li';
}> = ({ children, className, as: Tag = 'section' }) => (
  <Tag className={cx('ll-menu-card', className)}>{children}</Tag>
);

export const SectionHeading: React.FC<{ children: React.ReactNode; hint?: string }> = ({
  children,
  hint,
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/45">{children}</h3>
    {hint && <span className="text-[11px] text-black/40">{hint}</span>}
  </div>
);

export const MenuRow: React.FC<{
  title: string;
  detail?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, detail, icon, children }) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <div className="flex items-start gap-2.5 min-w-0">
      {icon && (
        <span className="w-8 h-8 rounded-lg bg-black/[0.05] text-[#1b1f24]/70 flex items-center justify-center shrink-0 mt-0.5">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <span className="block text-[13px] font-semibold text-[#1b1f24]">{title}</span>
        {detail && (
          <span className="block text-[11px] leading-snug text-black/50 mt-0.5">{detail}</span>
        )}
      </div>
    </div>
    {children && <div className="flex items-center gap-1.5 shrink-0">{children}</div>}
  </div>
);

export const HudBadge: React.FC<{
  children: React.ReactNode;
  tone?: 'neutral' | 'live' | 'warn' | 'dark';
  className?: string;
}> = ({ children, tone = 'neutral', className }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
      tone === 'live' && 'bg-[#e8f7e5] text-[#25612a]',
      tone === 'warn' && 'bg-amber-50 text-amber-800',
      tone === 'dark' && 'bg-[#1b1f24] text-white',
      tone === 'neutral' && 'bg-black/[0.05] text-black/60',
      className
    )}
  >
    {children}
  </span>
);

export const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  detail?: string;
  disabled?: boolean;
}> = ({ label, checked, onChange, detail, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="ll-focus flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:opacity-45"
  >
    <span className="min-w-0">
      <span className="block text-[13px] font-semibold text-[#1b1f24]">{label}</span>
      {detail && <span className="block text-[11px] leading-snug text-black/50">{detail}</span>}
    </span>
    <span
      aria-hidden="true"
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
        checked ? 'bg-[#1b1f24] border-[#1b1f24]' : 'bg-black/10 border-black/10'
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform shadow',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
        style={{ width: 18, height: 18 }}
      />
    </span>
  </button>
);

export const Segmented: React.FC<{
  label: string;
  options: { id: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  theme?: HudTheme;
}> = ({ label, options, value, onChange, theme = 'light' }) => (
  <div
    role="group"
    aria-label={label}
    className={cx(
      'flex items-center gap-1 rounded-xl p-1',
      theme === 'light' ? 'bg-black/[0.05]' : 'll-surface'
    )}
  >
    {options.map((option) => {
      const selected = option.id === value;
      return (
        <button
          key={option.id}
          type="button"
          aria-pressed={selected}
          onClick={() => onChange(option.id)}
          className={cx(
            'll-focus flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors min-h-[34px]',
            selected
              ? theme === 'light'
                ? 'bg-white text-[#1b1f24] shadow-sm'
                : 'bg-white/90 text-[#15181b]'
              : theme === 'light'
              ? 'text-black/55 hover:text-black/80'
              : 'text-white/65 hover:text-white'
          )}
        >
          {option.icon}
          {option.label}
        </button>
      );
    })}
  </div>
);
