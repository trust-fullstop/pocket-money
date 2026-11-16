import { useRef, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './styles';

export interface SegmentedOption<T extends string> { value: T; label: ReactNode; icon?: IconName }

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** Accessible name of the group (required: e.g. "Colour mode"). */
  label: string;
  className?: string;
}

/** Pill-style single choice (radio group). Arrow keys move the selection. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div
      ref={ref} role="radiogroup" aria-label={label}
      className={cx('flex gap-1 rounded-2xl bg-surface-2 p-1', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.value)}
            className={cx(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold transition',
              on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
            )}
          >
            {o.icon && <Icon name={o.icon} size={18} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
