import { memberRoleLabel } from '../../lib/format';
import { useMaybeApp } from '../../lib/session';
import type { Member, Role } from '../../lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { cx } from './styles';

interface MemberPickerBase {
  /** Members to show (default: everyone in the family from useApp()). */
  members?: Member[];
  /** Only show these roles. */
  roles?: Role[];
  /** Hide these member ids. */
  exclude?: string[];
  /** Accessible name of the group, also shown as a heading when `showLabel`. */
  label: string;
  showLabel?: boolean;
  /** Show the role under the name. */
  showRole?: boolean;
  className?: string;
}
export type MemberPickerProps = MemberPickerBase & (
  | { multiple: true; value: string[]; onChange: (ids: string[]) => void }
  | { multiple?: false; value: string | null; onChange: (id: string) => void }
);

/** Horizontal, scrollable row of avatars to pick one (radio) or several (checkbox) members. */
export function MemberPicker(props: MemberPickerProps) {
  const app = useMaybeApp();
  const { roles, exclude, label, showLabel, showRole, className } = props;
  const list = (props.members ?? app?.members ?? [])
    .filter((m) => (!roles || roles.includes(m.role)) && !exclude?.includes(m.id));
  const isOn = (id: string) => (props.multiple ? props.value.includes(id) : props.value === id);
  const toggle = (id: string) => {
    if (props.multiple) props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
    else props.onChange(id);
  };
  return (
    <div className={className}>
      {showLabel && <div className="mb-1.5 text-[15px] font-semibold">{label}</div>}
      <div
        role={props.multiple ? 'group' : 'radiogroup'} aria-label={label}
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 pt-2 [scrollbar-width:none]"
      >
        {list.map((m) => {
          const on = isOn(m.id);
          return (
            <button
              key={m.id} type="button" onClick={() => toggle(m.id)}
              role={props.multiple ? 'checkbox' : 'radio'} aria-checked={on}
              className={cx('flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 transition', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
            >
              <span className="relative">
                <Avatar member={m} size="lg" ring={on} />
                {on && (
                  <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-accent-strong text-white ring-2 ring-surface" aria-hidden="true">
                    <Icon name="check" size={14} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={cx('w-full truncate text-center text-[14px] leading-tight', on ? 'font-bold text-ink' : 'font-semibold text-muted')}>{m.display_name}</span>
              {showRole && <span className="w-full truncate text-center text-[12px] text-muted">{memberRoleLabel(m)}</span>}
            </button>
          );
        })}
        {list.length === 0 && <p className="px-1 py-3 text-sm text-muted">Nobody to pick yet.</p>}
      </div>
    </div>
  );
}
