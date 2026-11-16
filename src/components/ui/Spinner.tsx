import { cx } from './styles';

/** Inline spinner (inherits text colour). */
export function Spinner({ size = 20, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin shrink-0', className)}
      role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered spinner for a page/section that is loading. */
export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <Spinner size={32} className="text-accent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
