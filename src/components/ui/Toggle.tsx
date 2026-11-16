import { useId, type ReactNode } from 'react';
import { cx } from './styles';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** On/off switch with label (role="switch"); the whole row is tappable. */
export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
  const id = useId();
  return (
    <div className={cx('flex min-h-14 items-center gap-3', className)}>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-1">
        <span className="block font-semibold leading-snug">{label}</span>
        {description && <span id={`${id}-d`} className="block text-[14px] leading-snug text-muted">{description}</span>}
      </label>
      <button
        id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        aria-describedby={description ? `${id}-d` : undefined}
        className={cx(
          'relative inline-flex h-8 w-[3.25rem] shrink-0 items-center rounded-full p-1 transition disabled:opacity-50',
          checked ? 'bg-accent-strong' : 'bg-line',
        )}
      >
        <span className={cx('grid size-6 place-items-center rounded-full bg-white text-[11px] font-black shadow transition-transform', checked ? 'translate-x-5 text-accent-strong' : 'text-neutral-400')} aria-hidden="true">
          {checked ? '✓' : ''}
        </span>
      </button>
    </div>
  );
}
