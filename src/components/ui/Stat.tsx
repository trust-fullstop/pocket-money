import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './styles';

/** Label over a big value, e.g. <Stat label="Wallet" value={money(1250, 'EUR')} sub="+€2 this week" />. */
export function Stat({ label, value, sub, icon, tone, className }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: IconName; tone?: 'good' | 'bad' | 'warn' | 'accent'; className?: string;
}) {
  const toneClass = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent-ink' : 'text-ink';
  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">
        {icon && <Icon name={icon} size={15} />}{label}
      </div>
      <div className={cx('text-2xl font-extrabold tabular-nums leading-tight wrap-break-word', toneClass)}>{value}</div>
      {sub && <div className="truncate text-sm text-muted">{sub}</div>}
    </div>
  );
}

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name (and visible caption when showLabel). */
  label: string;
  showLabel?: boolean;
  /** Text on the right of the caption, e.g. "60 / 120 XP". */
  valueText?: string;
  tone?: 'accent' | 'good' | 'warn' | 'bad';
  size?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({ value, max = 100, label, showLabel, valueText, tone = 'accent', size = 'md', className }: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar = tone === 'good' ? 'bg-good' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-bad' : 'bg-accent';
  return (
    <div className={className}>
      {showLabel && (
        <div className="mb-1 flex justify-between gap-2 text-sm">
          <span className="font-semibold">{label}</span>
          {valueText && <span className="tabular-nums text-muted">{valueText}</span>}
        </div>
      )}
      <div
        role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-valuetext={valueText}
        className={cx('w-full overflow-hidden rounded-full bg-surface-2', size === 'sm' ? 'h-2' : 'h-3')}
      >
        <div className={cx('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Friendly "nothing here" block. */
export function EmptyState({ emoji, icon, title, message, action, className }: {
  emoji?: string; icon?: IconName; title: ReactNode; message?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      {emoji && <div className="text-5xl" aria-hidden="true">{emoji}</div>}
      {!emoji && icon && <div className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-ink"><Icon name={icon} size={30} /></div>}
      <h3 className="mt-1 text-lg font-bold">{title}</h3>
      {message && <p className="max-w-xs text-[15px] text-muted">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
