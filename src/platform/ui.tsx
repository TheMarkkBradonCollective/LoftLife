import React, { type ReactNode } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { AvatarConfig } from '../game/types';
import { initials } from './format';

export const panelClass =
  'rounded-2xl border border-white/8 bg-[#0c1210]/95 shadow-[0_10px_40px_rgba(0,0,0,0.35)]';
export const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-[#39ff14]/60 focus:ring-2 focus:ring-[#39ff14]/15';
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#39ff14] px-4 py-2.5 text-sm font-bold text-[#051205] transition-colors hover:bg-[#5bff3b] disabled:cursor-not-allowed disabled:opacity-50';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[#39ff14]/35 bg-[#39ff14]/8 px-4 py-2.5 text-sm font-semibold text-[#c8ffbc] transition-colors hover:bg-[#39ff14]/15 disabled:cursor-not-allowed disabled:opacity-50';
export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

const tones = {
  green: 'border-[#39ff14]/25 bg-[#39ff14]/10 text-[#a8ff96]',
  sky: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
  amber: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  violet: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200',
  slate: 'border-white/10 bg-white/5 text-slate-300',
  red: 'border-red-400/25 bg-red-400/10 text-red-200',
};

export function Badge({
  children,
  tone = 'green',
  className = '',
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        {eyebrow && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#39ff14]/65">
            {eyebrow}
          </div>
        )}
        <h2 className="font-display text-lg font-semibold tracking-tight text-white sm:text-xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/15 px-5 py-8 text-center">
      {icon && <div className="mb-2 text-[#39ff14]/50">{icon}</div>}
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-black/15 px-4 py-8 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin text-[#39ff14]" />
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-xs text-red-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btnGhost}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

export function AvatarCircle({
  config,
  name,
  size = 40,
  ring = true,
}: {
  config?: AvatarConfig | null;
  name: string;
  size?: number;
  ring?: boolean;
}) {
  const top = config?.topColor ?? '#2b3a2a';
  const hair = config?.hairColor ?? '#2f2119';
  const skin = config?.skinTone ?? '#e8b48f';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white ${
        ring ? 'ring-1 ring-white/20' : ''
      }`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 25%, ${top} 0%, ${hair} 78%)`,
        border: `2px solid ${skin}`,
      }}
      aria-hidden="true"
    >
      <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{initials(name)}</span>
    </span>
  );
}

export function StatusDot({ tone = 'green' }: { tone?: 'green' | 'amber' | 'slate' | 'red' }) {
  const colors = {
    green: 'bg-[#39ff14] shadow-[0_0_8px_#39ff14]',
    amber: 'bg-amber-400',
    slate: 'bg-slate-500',
    red: 'bg-red-400',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[tone]}`} aria-hidden="true" />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-[#39ff14] bg-[#39ff14]/80' : 'border-white/15 bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
          style={{ width: 18, height: 18, left: 0 }}
        />
      </button>
    </label>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function ChoiceRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        {description && <div className="mt-0.5 text-[11px] text-slate-500">{description}</div>}
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/8 bg-black/25 p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              value === option.id
                ? 'bg-[#39ff14] text-[#051205]'
                : 'text-slate-300 hover:bg-white/8'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
