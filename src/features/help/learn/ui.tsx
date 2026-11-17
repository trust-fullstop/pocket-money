// Small Money school building blocks: rich text with **bold**, and a radio group of big tappable cards.
import { Fragment, useId, type ReactNode } from 'react';
import { Icon, cx } from '../../../components/ui';

/** Text with `**bold**` parts. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4
          ? <strong key={i} className="font-bold text-ink">{p.slice(2, -2)}</strong>
          : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

export type Mark = 'right' | 'wrong' | 'maybe';

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  /** ✓ / ✗ / 🤔 shown on this option (text too, never colour only). */
  mark?: Mark;
}

const MARK_STYLE: Record<Mark, string> = {
  right: 'border-good bg-good-soft',
  wrong: 'border-bad bg-bad-soft',
  maybe: 'border-warn bg-warn-soft',
};

/** A native radio group as big cards (≥ 48 px): arrow keys, Space and screen readers work as usual. */
export function RadioCards<T extends string>({
  legend, options, value, onChange, disabled, columns = 1, className, describedBy,
}: {
  legend: ReactNode;
  options: RadioOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  columns?: 1 | 2;
  className?: string;
  describedBy?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cx('min-w-0', className)} aria-describedby={describedBy}>
      <legend className="mb-2 font-semibold text-ink">{legend}</legend>
      <div className={cx('grid gap-2', columns === 2 && 'grid-cols-2')}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cx(
                'flex min-h-12 items-center gap-3 rounded-xl border-2 px-3 py-2 text-[16px] transition',
                disabled ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2',
                o.mark ? MARK_STYLE[o.mark] : checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
              )}
            >
              <input
                type="radio" name={name} value={o.value} checked={checked} disabled={disabled}
                onChange={() => onChange(o.value)}
                className="size-5 shrink-0 accent-[var(--color-accent-strong)]"
              />
              <span className="min-w-0 flex-1 font-medium">{o.label}</span>
              {o.mark && <MarkIcon mark={o.mark} />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === 'maybe') return <span className="shrink-0 text-xl" aria-hidden="true">🤔</span>;
  return (
    <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-white', mark === 'right' ? 'bg-good' : 'bg-bad')} aria-hidden="true">
      <Icon name={mark === 'right' ? 'check' : 'close'} size={16} strokeWidth={3} />
    </span>
  );
}
