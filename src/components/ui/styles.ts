// Shared class recipes for the UI kit (and for custom elements that should look the same).
export function cx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(' ');
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold select-none text-center leading-tight ' +
  'transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none';
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-white shadow-sm hover:brightness-110',
  secondary: 'bg-surface text-ink border border-line shadow-sm hover:bg-surface-2',
  ghost: 'bg-transparent text-accent-ink hover:bg-accent-soft',
  danger: 'bg-red-700 text-white shadow-sm hover:brightness-110',
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 text-[15px]',
  md: 'min-h-12 px-4 text-base',
  lg: 'min-h-14 px-5 text-lg',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false): string {
  return cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], block && 'w-full');
}

export const inputClass =
  'block w-full min-h-12 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink ' +
  'placeholder:text-muted/70 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 ' +
  'aria-[invalid=true]:border-bad disabled:opacity-60';

/** For inputs with a prefix/suffix: the wrapper looks like the input. */
export const inputShellClass =
  'flex w-full min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-base text-ink ' +
  'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40 has-[[aria-invalid=true]]:border-bad';

export const cardClass = 'rounded-2xl border border-line/70 bg-surface shadow-sm';
