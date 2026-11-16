import type { HTMLAttributes, ReactNode } from 'react';
import { cardClass, cx } from './styles';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding (default true = p-4). */
  padded?: boolean;
  /** Soft accent background instead of surface. */
  tone?: 'default' | 'accent' | 'warn' | 'bad' | 'good';
}

const TONE: Record<NonNullable<CardProps['tone']>, string> = {
  default: '',
  accent: '!bg-accent-soft !border-transparent',
  warn: '!bg-warn-soft !border-warn/30',
  bad: '!bg-bad-soft !border-bad/30',
  good: '!bg-good-soft !border-good/30',
};

export function Card({ padded = true, tone = 'default', className, ...rest }: CardProps) {
  return <div className={cx(cardClass, padded && 'p-4', TONE[tone], className)} {...rest} />;
}

/** A titled group of content (heading + optional action on the right). */
export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('space-y-2', className)}>
      {(title || action) && (
        <div className="flex min-h-8 items-end justify-between gap-2 px-1">
          {title && <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
