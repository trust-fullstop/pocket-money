import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './styles';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** When defined the chip is a toggle (aria-pressed) and shows a check when selected. */
  selected?: boolean;
  icon?: IconName;
  /** Emoji shown before the text. */
  emoji?: string;
  children: ReactNode;
}

/** Tappable pill for filters / quick choices. */
export function Chip({ selected, icon, emoji, children, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type} aria-pressed={selected}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold transition',
        selected ? 'border-transparent bg-accent-strong text-white' : 'border-line bg-surface text-ink hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {selected ? <Icon name="check" size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {children}
    </button>
  );
}

export type BadgeTone = 'accent' | 'good' | 'bad' | 'warn' | 'neutral';
const BADGE: Record<BadgeTone, string> = {
  accent: 'bg-accent-soft text-accent-ink',
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  neutral: 'bg-surface-2 text-muted',
};

/** Small status label, e.g. <Badge tone="warn">Waiting</Badge>. */
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: BadgeTone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-bold', BADGE[tone], className)}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

/** Red count bubble (hidden when 0). `label` e.g. "3 waiting for approval" for screen readers. */
export function CountBadge({ count, label, className }: { count: number; label?: string; className?: string }) {
  if (!count) return null;
  return (
    <span className={cx('inline-grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[12px] font-bold leading-5 text-white', className)}>
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label ?? `${count} new`}</span>
    </span>
  );
}
