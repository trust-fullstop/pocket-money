import { useEffect, useState, type ReactNode } from 'react';
import { centsToInput, currencySymbol, minutes as fmtMinutes, money, parseMoney, points as fmtPoints } from '../../lib/format';
import { FX_ENTRY_MAX_AGE_MS, currencyWord, toBase, toQuote, useFx } from '../../lib/fx';
import { useMaybeApp } from '../../lib/session';
import { FieldFor, type A11yProps } from './Field';
import { FxNote } from './FxNote';
import { cx, inputShellClass } from './styles';

export type AmountKind = 'money' | 'time' | 'points';

export interface AmountInputProps {
  /** 'money' = cents, 'time' = minutes, 'points' = XP (all integers). */
  kind: AmountKind;
  value: number | null;
  onChange: (value: number | null) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** ISO currency for money (default: the family currency, else EUR). */
  currency?: string;
  /** Quick-pick values in the same unit as value. Default: time → [15, 30, 60], others → none. Pass [] to hide. */
  chips?: number[];
  /** Upper limit (same unit); larger typed values are clamped. */
  max?: number;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Money in the family currency only: when the kids spend in another currency, offer "Type in R" — the person types
   * rand and `value` stays in the family currency (converted at today's rate).
   */
  fxEntry?: boolean;
}

const toText = (kind: AmountKind, v: number | null) =>
  v == null ? '' : kind === 'money' ? centsToInput(v) : v === 0 ? '' : String(v);

function parse(kind: AmountKind, text: string): number | null {
  if (kind === 'money') return parseMoney(text);
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

/** Number entry for money ("2.50" → 250 cents), time (minutes, with quick chips) or points. */
export function AmountInput({
  kind, value, onChange, label, hint, error, optional, currency, chips, max, placeholder, id, autoFocus, disabled, className, fxEntry,
}: AmountInputProps) {
  const app = useMaybeApp();
  const cur = currency ?? app?.family?.currency ?? 'EUR';
  const fx = useFx();
  // The kids spend in another currency: show the amount in the other one, and (opt-in) let people type in it.
  const fxShown = kind === 'money' && !!fx && (cur === fx.base || cur === fx.quote);
  const rate = fx?.rate?.rate ?? null;
  // Typing in the other currency only with a recent rate (a stale one is still fine to look at).
  const fresh = !!fx?.rate && Date.now() - fx.rate.fetchedAt < FX_ENTRY_MAX_AGE_MS;
  const canSwitch = !!fxEntry && fxShown && cur === fx?.base && rate != null && fresh;
  // The rate is frozen when "Type in R" is switched on, so a refresh never changes what was typed.
  const [frozenRate, setFrozenRate] = useState<number | null>(null);
  const inQuote = !!fxEntry && fxShown && cur === fx?.base && frozenRate != null;
  const qRate = frozenRate ?? 1;
  const shownCur = inQuote && fx ? fx.quote : cur;
  const toTextV = (v: number | null) => (inQuote && v != null ? toText(kind, toQuote(v, qRate)) : toText(kind, v));
  const parseV = (t: string) => {
    const p = parse(kind, t);
    return inQuote && p != null ? toBase(p, qRate) : p;
  };
  const [text, setText] = useState(() => toText(kind, value));

  // Follow external changes (e.g. chips, form reset, switching € ↔ R) without fighting the user's typing ("2." stays "2.").
  useEffect(() => {
    setText((t) => (parseV(t) === value ? t : toTextV(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, value, inQuote, frozenRate]);

  const quick = chips ?? (kind === 'time' ? [15, 30, 60] : []);
  const chipLabel = (v: number) => kind === 'money' ? money(v, cur, { whole: true }) : kind === 'time' ? fmtMinutes(v) : fmtPoints(v);

  const handle = (raw: string) => {
    const clean = kind === 'money' ? raw.replace(/[^\d.,]/g, '') : raw.replace(/\D/g, '');
    if (kind === 'money' && !/^\d*([.,]\d{0,2})?$/.test(clean)) return;
    let v = parseV(clean);
    let shown = clean;
    if (v != null && max != null && v > max) { v = max; shown = toTextV(v); }
    setText(shown);
    onChange(v);
  };

  const control = (a?: Partial<A11yProps>) => (
    <div className="space-y-2">
      <div className={cx(inputShellClass, disabled && 'opacity-60')}>
        {kind === 'money' && <span className="shrink-0 text-lg font-bold text-muted" aria-hidden="true">{currencySymbol(shownCur)}</span>}
        <input
          id={id} {...a} type="text" inputMode={kind === 'money' ? 'decimal' : 'numeric'} autoComplete="off"
          enterKeyHint="done" value={text} onChange={(e) => handle(e.target.value)} autoFocus={autoFocus} disabled={disabled}
          placeholder={placeholder ?? (kind === 'money' ? '0.00' : '0')}
          className={cx('min-w-0 flex-1 self-stretch bg-transparent py-2.5 text-lg font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/60', className)}
        />
        {kind !== 'money' && <span className="shrink-0 font-semibold text-muted" aria-hidden="true">{kind === 'time' ? 'min' : 'XP'}</span>}
      </div>
      {kind === 'time' && value != null && value >= 60 && <p className="px-1 text-sm text-muted">= {fmtMinutes(value)}</p>}
      {fxShown && fx && (canSwitch || inQuote || (value != null && value > 0)) && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 px-1 text-sm">
          <span>
            {value != null && value > 0 && (inQuote
              ? <span className="font-semibold">= {money(value, cur)} <span className="font-normal text-muted">in the app</span></span>
              : <FxNote cents={value} currency={cur} suffix="today" />)}
          </span>
          {(canSwitch || inQuote) && (
            <button
              type="button" disabled={disabled} aria-pressed={inQuote} onClick={() => setFrozenRate(inQuote ? null : rate)}
              className={cx(
                'min-h-11 rounded-full border px-3.5 text-[14px] font-semibold transition',
                inQuote ? 'border-transparent bg-accent-strong text-white' : 'border-line bg-surface text-ink hover:bg-surface-2',
              )}
            >
              Type in {currencySymbol(fx.quote)} ({currencyWord(fx.quote)})
            </button>
          )}
        </div>
      )}
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
          {quick.map((c) => (
            <button
              key={c} type="button" disabled={disabled} aria-pressed={value === c} onClick={() => { setText(toTextV(c)); onChange(c); }}
              className={cx(
                'min-h-11 rounded-full border px-4 text-[15px] font-semibold transition',
                value === c ? 'border-transparent bg-accent-strong text-white' : 'border-line bg-surface text-ink hover:bg-surface-2',
              )}
            >
              {chipLabel(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!label) return control(error ? { 'aria-invalid': true } : undefined);
  return <FieldFor label={label} hint={hint} error={error} optional={optional} id={id}>{control}</FieldFor>;
}
