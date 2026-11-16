// "💱 Euro and rand": today's exchange rate between the family currency and the currency the kids spend in
// (family rule "Kids spend money in"), what the wallet is worth there, and a two-way calculator. Display only.
import { useId, useState } from 'react';
import { Card, IconButton, Spinner, cx, inputShellClass } from '../../components/ui';
import { approxMoney, currencyWord, rateText, toBase, toQuote, useFx, type Fx } from '../../lib/fx';
import { centsToInput, currencySymbol, formatDate, money, parseMoney } from '../../lib/format';
import { CardTitle } from './parts';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface FxRow { label: string; cents: number }

/** Today's rate + rows (e.g. pocket money, spending) in both currencies + a calculator. Null when the rule is off. */
export function FxCard({ rows }: { rows: FxRow[] }) {
  const fx = useFx();
  const titleId = useId();
  if (!fx) return null;
  const r = fx.rate;
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardTitle
        id={titleId}
        right={<IconButton icon="reset" label="Check the rate again" disabled={fx.loading} onClick={fx.refresh} />}
      >
        <span aria-hidden="true">💱 </span>{cap(currencyWord(fx.base))} and {currencyWord(fx.quote)}
      </CardTitle>

      {!r ? (
        fx.failed ? (
          <p role="alert" className="py-2 text-[15px]">We couldn’t get today’s rate. Check the internet and tap ↻ to try again.</p>
        ) : (
          <p className="flex items-center gap-3 py-2 text-muted"><Spinner /> Checking today’s rate…</p>
        )
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-2xl font-extrabold tabular-nums">
              {money(100, fx.base, { whole: true })} = {rateText(r.rate, fx.quote)}
            </p>
            <p className="text-[14px] text-muted">
              {r.source === 'ECB' ? 'European Central Bank rate' : 'Exchange rate'} of {formatDate(r.date)}
              {fx.loading ? ' · checking…' : fx.failed ? ' · couldn’t check again, this is the last one we have' : ''}
            </p>
          </div>

          {rows.length > 0 && (
            <ul className="divide-y divide-line rounded-xl bg-surface-2 px-3">
              {rows.map((row) => (
                <li key={row.label} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 truncate font-semibold">{row.label}</span>
                  <span className="whitespace-nowrap text-right tabular-nums">
                    {money(row.cents, fx.base)} <span className="text-muted"><span aria-hidden="true">≈ </span><span className="sr-only">is about </span></span>
                    <strong>{approxMoney(toQuote(row.cents, r.rate), fx.quote)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Calculator fx={fx} rate={r.rate} />

          <p className="text-[14px] text-muted">
            Banks and Revolut use their own rate, so what you get in the shop can be a little different. The app keeps counting in {currencyWord(fx.base)}.
          </p>
        </div>
      )}
    </Card>
  );
}

/** Two linked boxes: type in either currency, the other one follows. */
function Calculator({ fx, rate }: { fx: Fx; rate: number }) {
  const [side, setSide] = useState<'base' | 'quote'>('base');
  const [text, setText] = useState('10');
  const id = useId();
  const typed = parseMoney(text);
  const other = typed == null ? '' : centsToInput(side === 'base' ? toQuote(typed, rate) : toBase(typed, rate));
  const onType = (s: 'base' | 'quote', raw: string) => {
    const clean = raw.replace(/[^\d.,]/g, '');
    if (!/^\d*([.,]\d{0,2})?$/.test(clean) || clean.length > 12) return;
    setSide(s);
    setText(clean);
  };
  const box = (s: 'base' | 'quote', cur: string) => (
    <div className="min-w-0">
      <label htmlFor={`${id}-${s}`} className="mb-1 block text-[14px] font-semibold">{cap(currencyWord(cur))}</label>
      <div className={cx(inputShellClass, 'min-w-0')}>
        <span className="shrink-0 text-lg font-bold text-muted" aria-hidden="true">{currencySymbol(cur)}</span>
        <input
          id={`${id}-${s}`} type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done" size={1}
          value={side === s ? text : other} onChange={(e) => onType(s, e.target.value)} placeholder="0"
          className="w-full min-w-0 flex-1 self-stretch bg-transparent py-2.5 text-lg font-semibold tabular-nums outline-none"
        />
      </div>
    </div>
  );
  return (
    <fieldset className="space-y-1">
      <legend className="text-[15px] font-bold">Work it out</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        {box('base', fx.base)}
        <span className="pb-3 text-lg text-muted" aria-hidden="true">⇄</span>
        {box('quote', fx.quote)}
      </div>
    </fieldset>
  );
}
