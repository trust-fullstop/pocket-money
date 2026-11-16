// Pocket money for a kid (managers): amount, every week / every month, pay day and a live preview of the first
// payment. Used from the wallet (Money → kid) and from Family → kid → Pocket money.
import { useId, useState } from 'react';
import { AmountInput, Button, Chip, Segmented, Select, Sheet, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { addDays, allowanceSchedule, dateInTz, formatDay, money, nextPayDate, ordinal, todayISO } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { Member, Transaction } from '../../lib/types';
import { isFeatureOff, moneyError } from './moneyUtils';
import { SheetActions } from './parts';

type Period = 'week' | 'month';
interface Paid { period: Period; date: string }

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: ordinal(i + 1) }));
const CHIPS: Record<Period, number[]> = { week: [200, 500, 1000], month: [1000, 2000, 5000] };
const MAX_CENTS = 100_000;

const clampDay = (d: number | null | undefined, max: number) => Math.min(max, Math.max(1, Math.round(d ?? 1)));
const monthBefore = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, d)).toISOString().slice(0, 10);
};

/** Pocket money already paid (from the history): which schedule it came from and its pay day. */
function paidDays(history: Transaction[] | undefined, tz: string): Paid[] {
  return (history ?? []).filter((t) => t.kind === 'allowance')
    .map((t) => ({ period: /month/i.test(t.reason) ? 'month' : 'week', date: dateInTz(t.effective_at, tz) }));
}

/**
 * The first pay day on/after `from` that will really pay. Mirrors app.pay_allowances: a pay day is skipped when the
 * same kind of schedule already paid within the period before it (no double pay after moving the day).
 */
function firstPayDay(period: Period, day: number, from: string, paid: Paid[]): string {
  let d = nextPayDate(period, day, from);
  for (let i = 0; i < 3; i++) {
    const start = period === 'week' ? addDays(d, -7) : monthBefore(d);
    if (!paid.some((p) => p.period === period && p.date > start && p.date <= d)) return d;
    d = nextPayDate(period, day, addDays(d, 1));
  }
  return d;
}

export interface AllowanceSheetProps {
  member: Pick<Member, 'id' | 'display_name' | 'allowance_cents' | 'allowance_period' | 'allowance_day' | 'allowance_since'>;
  onClose: () => void;
  /** Reload after saving (also called when the server says the feature was switched off). */
  onSaved: () => Promise<unknown> | void;
}

/** Managers: set, change or stop a kid's pocket money (weekly on a weekday, or monthly on day 1–28). */
export function AllowanceSheet({ member, onClose, onSaved }: AllowanceSheetProps) {
  const { family, now } = useApp();
  const toast = useToast();
  const dayLabelId = useId();
  const cur = family?.currency ?? 'EUR';
  const tz = family?.timezone ?? 'UTC';
  const name = member.display_name;

  const savedCents = member.allowance_cents ?? 0;
  const savedPeriod: Period = member.allowance_period === 'month' ? 'month' : 'week';
  const savedDay = member.allowance_day ?? 1;

  const [cents, setCents] = useState<number | null>(savedCents || null);
  const [period, setPeriod] = useState<Period>(savedPeriod);
  const [weekDay, setWeekDay] = useState(savedPeriod === 'week' ? clampDay(savedDay, 7) : 1);
  const [monthDay, setMonthDay] = useState(savedPeriod === 'month' ? clampDay(savedDay, 28) : 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useLoad(() => api.history(member.id, { currency: 'money', limit: 100 }), [member.id]);

  const v = Math.max(0, cents ?? 0);
  const day = period === 'week' ? weekDay : monthDay;
  const schedule = allowanceSchedule(period, day);
  const changed = v !== savedCents || period !== savedPeriod || day !== savedDay;
  // A changed schedule starts today; an unchanged one keeps its start day.
  const today = todayISO(tz, now());
  const since = member.allowance_since && member.allowance_since > today ? member.allowance_since : today;
  const first = firstPayDay(period, day, changed ? today : since, paidDays(history.data, tz));
  const firstText = formatDay(first, tz, now());
  const firstWords = firstText === 'Today' || firstText === 'Tomorrow' ? firstText.toLowerCase() : firstText;

  const pick = (fn: () => void) => { fn(); setError(null); };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateMember(member.id, { allowance_cents: v, allowance_period: period, allowance_day: day });
      toast.show(v > 0 ? `${name} gets ${money(v, cur)} ${schedule} 💰` : `Pocket money for ${name} is off`, 'success');
      await onSaved();
      onClose();
    } catch (e) {
      if (isFeatureOff(e)) {
        toast.show(moneyError(e), 'error');
        onClose();
        await onSaved();
        return;
      }
      setError(moneyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title={`${name}’s pocket money 💰`}
      description="Paid into Spending automatically, every week or every month."
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy} onClick={save}>Save</Button>
        </SheetActions>
      }
    >
      <div className="space-y-5">
        <AmountInput
          kind="money" label="How much?" value={cents} onChange={(c) => pick(() => setCents(c))}
          max={MAX_CENTS} chips={CHIPS[period]} hint="Leave empty or 0 to stop it."
        />

        <div className="space-y-2">
          <p className="text-[15px] font-semibold" aria-hidden="true">How often?</p>
          <Segmented<Period>
            label="How often?" value={period} onChange={(p) => pick(() => setPeriod(p))}
            options={[{ value: 'week', label: 'Every week' }, { value: 'month', label: 'Every month' }]}
          />
        </div>

        {period === 'week' ? (
          <div role="group" aria-labelledby={dayLabelId} className="space-y-2">
            <p id={dayLabelId} className="text-[15px] font-semibold">On which day?</p>
            <div className="flex flex-wrap gap-2">
              {DAY_SHORT.map((d, i) => (
                <Chip
                  key={d} selected={weekDay === i + 1} aria-label={DAY_LONG[i]} className="px-3.5"
                  onClick={() => pick(() => setWeekDay(i + 1))}
                >
                  {d}
                </Chip>
              ))}
            </div>
          </div>
        ) : (
          <Select
            label="On which day of the month?" value={String(monthDay)} options={MONTH_DAYS}
            onChange={(e) => pick(() => setMonthDay(clampDay(Number(e.target.value), 28)))}
            hint="Up to the 28th so it works in every month."
          />
        )}

        <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[15px]" aria-live="polite">
          {v > 0 ? (
            <>
              {name} gets <strong className="text-good">{money(v, cur)}</strong> {schedule}
              {' · '}{changed ? 'first' : 'next'} payment <strong>{firstWords}</strong>
            </>
          ) : savedCents > 0 ? (
            `${name} won’t get pocket money any more.`
          ) : (
            `${name} gets no pocket money.`
          )}
        </p>
        {v > 0 && (
          <p className="text-[14px] text-muted">It lands in {name}’s Spending at midnight, marked “Pocket money”.</p>
        )}
        {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>}
      </div>
    </Sheet>
  );
}
