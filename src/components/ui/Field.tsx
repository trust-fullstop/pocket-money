import { cloneElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { cx, inputClass, inputShellClass } from './styles';

export interface A11yProps { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }

interface FieldBase {
  label: ReactNode;
  /** Helper text under the control. */
  hint?: ReactNode;
  /** Error text (also marks the control aria-invalid). */
  error?: ReactNode;
  /** Adds "(optional)" after the label. */
  optional?: boolean;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  className?: string;
  /** Use this id for the control (default: generated). */
  id?: string;
}

/** Label + hint/error around a control; hands id/aria props to a render function (for composite controls). */
export function FieldFor({ label, hint, error, optional, hideLabel, className, id: givenId, children }: FieldBase & { children: (a: A11yProps) => ReactNode }) {
  const auto = useId();
  const id = givenId || auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={id} className={cx('block text-[15px] font-semibold text-ink', hideLabel && 'sr-only')}>
        {label}{optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errId} className="flex items-center gap-1.5 text-sm font-semibold text-bad">
          <Icon name="alert" size={16} />{error}
        </p>
      )}
      {hint && <p id={hintId} className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

export interface FieldProps extends FieldBase {
  /** Exactly one form control element; it receives id / aria-describedby / aria-invalid. */
  children: ReactElement<Record<string, unknown>>;
}

/** Label + control + hint/error, wired up for accessibility. */
export function Field({ children, id, ...rest }: FieldProps) {
  return (
    <FieldFor {...rest} id={id ?? (children.props.id as string | undefined)}>
      {(a) => cloneElement(children, { ...a })}
    </FieldFor>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Text/icon inside the box before the value (e.g. "€"). */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Classes for the outer Field wrapper. */
  wrapperClassName?: string;
}

/** Text input. With `label` it renders a full Field; without, just the control. */
export function Input({ label, hint, error, optional, prefix, suffix, wrapperClassName, className, id, ...rest }: InputProps) {
  const render = (a?: Partial<A11yProps>) => prefix || suffix ? (
    <div className={inputShellClass}>
      {prefix && <span className="shrink-0 font-semibold text-muted" aria-hidden="true">{prefix}</span>}
      <input id={id} className={cx('min-w-0 flex-1 self-stretch bg-transparent py-2.5 outline-none placeholder:text-muted/70', className)} {...rest} {...a} />
      {suffix && <span className="shrink-0 text-muted" aria-hidden="true">{suffix}</span>}
    </div>
  ) : (
    <input id={id} className={cx(inputClass, className)} {...rest} {...a} />
  );
  if (!label) return render(error ? { 'aria-invalid': true } : undefined);
  return <FieldFor label={label} hint={hint} error={error} optional={optional} className={wrapperClassName} id={id}>{render}</FieldFor>;
}

export interface SelectOption { value: string; label: string; disabled?: boolean }
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Options as {value,label} or plain strings. */
  options: (SelectOption | string)[];
  /** Adds a first empty option ("") with this text. */
  placeholder?: string;
  wrapperClassName?: string;
}

export function Select({ label, hint, error, optional, options, placeholder, wrapperClassName, className, id, ...rest }: SelectProps) {
  const render = (a?: Partial<A11yProps>) => (
    <div className="relative">
      <select id={id} className={cx(inputClass, 'appearance-none pr-10', className)} {...rest} {...a}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>;
        })}
      </select>
      <Icon name="chevron-down" size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
  if (!label) return render();
  return <FieldFor label={label} hint={hint} error={error} optional={optional} className={wrapperClassName} id={id}>{render}</FieldFor>;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
}

export function Textarea({ label, hint, error, optional, wrapperClassName, className, rows = 3, id, ...rest }: TextareaProps) {
  const render = (a?: Partial<A11yProps>) => <textarea id={id} rows={rows} className={cx(inputClass, 'min-h-24 resize-y', className)} {...rest} {...a} />;
  if (!label) return render();
  return <FieldFor label={label} hint={hint} error={error} optional={optional} className={wrapperClassName} id={id}>{render}</FieldFor>;
}
