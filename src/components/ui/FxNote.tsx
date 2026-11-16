import { approxMoney, currencyWord, useFx } from '../../lib/fx';
import { useMaybeApp } from '../../lib/session';
import { cx } from './styles';

export interface FxNoteProps {
  /** Amount in `currency` (cents). Pass a positive number for "owes" amounts. */
  cents: number;
  /** Currency of `cents` (default: the family currency). */
  currency?: string;
  /** Words after the amount, e.g. "today". */
  suffix?: string;
  className?: string;
}

/** "≈ R 373" — the same amount in the other currency at today's rate (nothing when the kids spend in the family currency). */
export function FxNote({ cents, currency, suffix, className }: FxNoteProps) {
  const app = useMaybeApp();
  const fx = useFx();
  const from = currency ?? app?.family?.currency ?? 'EUR';
  const c = fx?.convert(cents, from);
  if (!c) return null;
  const text = approxMoney(c.cents, c.currency);
  return (
    <span className={cx('whitespace-nowrap tabular-nums text-muted', className)}>
      <span aria-hidden="true">≈ {text}{suffix ? ` ${suffix}` : ''}</span>
      <span className="sr-only">about {text} in {currencyWord(c.currency)}{suffix ? ` ${suffix}` : ''}</span>
    </span>
  );
}
