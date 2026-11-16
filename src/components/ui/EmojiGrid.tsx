import { cx } from './styles';

export interface EmojiGridProps {
  options: string[];
  value: string;
  onChange: (emoji: string) => void;
  /** Accessible name of the group, e.g. "Avatar". */
  label: string;
  className?: string;
}

/** Grid of big emoji buttons (single choice). */
export function EmojiGrid({ options, value, onChange, label, className }: EmojiGridProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('grid grid-cols-6 gap-1.5', className)}>
      {options.map((e) => {
        const on = e === value;
        return (
          <button
            key={e} type="button" role="radio" aria-checked={on} aria-label={e} onClick={() => onChange(e)}
            className={cx(
              'grid aspect-square min-h-11 place-items-center rounded-2xl text-[1.75rem] transition',
              on ? 'bg-accent-soft ring-2 ring-accent-strong' : 'hover:bg-surface-2',
            )}
          >
            <span aria-hidden="true">{e}</span>
          </button>
        );
      })}
    </div>
  );
}
