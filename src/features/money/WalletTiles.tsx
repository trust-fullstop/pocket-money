// Balance tiles: Spending 👛 · Savings 🐷 · Time ⏱️ · Points ✨. Self-contained, reusable (Home, Family…).
// A negative spending balance reads "Owes €1.50" with ⚠️ in the warning style — never a bare red minus.
// Tiles whose part is switched off (Family → Features) are left out; the grid adapts to 1–4 tiles.
import { cx } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { minutes, money, points } from '../../lib/format';
import type { Balances, FeatureKey } from '../../lib/types';

export type BalanceKey = keyof Balances;

export interface WalletTilesProps {
  balances: Balances;
  /** ISO currency, e.g. family.currency. */
  currency: string;
  /** Which tiles, in order (default: all four). Switched-off ones are skipped. */
  show?: BalanceKey[];
  /** Smaller tiles for lists / cards. */
  compact?: boolean;
  /** Accessible name of the list, e.g. "Sam's balances". */
  label?: string;
  className?: string;
}

const META: Record<BalanceKey, { emoji: string; label: string }> = {
  spending: { emoji: '👛', label: 'Spending' },
  savings: { emoji: '🐷', label: 'Savings' },
  time: { emoji: '⏱️', label: 'Time' },
  points: { emoji: '✨', label: 'Points' },
};

/** The feature switch behind each pot (Spending is always on). */
const POT_FEATURE: Partial<Record<BalanceKey, FeatureKey>> = { savings: 'savings', time: 'time', points: 'points' };

/** Text for one balance ("€12.50", "Owes €1.50", "1 h 15 min", "85 XP"). */
function balanceText(key: BalanceKey, value: number, currency: string): string {
  if (key === 'spending' || key === 'savings') return value < 0 ? `Owes ${money(-value, currency)}` : money(value, currency);
  if (key === 'time') return minutes(Math.max(0, value));
  return points(value);
}

export function WalletTiles({ balances, currency, show = ['spending', 'savings', 'time', 'points'], compact, label = 'Balances', className }: WalletTilesProps) {
  const features = useFeatures();
  const keys = show.filter((k) => {
    const need = POT_FEATURE[k];
    return !need || features.on(need);
  });
  if (keys.length === 0) return null;
  const cols = keys.length === 3 ? 'grid-cols-3' : keys.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <ul aria-label={label} className={cx('grid gap-2', cols, className)}>
      {keys.map((k) => {
        const v = balances[k] ?? 0;
        const owes = (k === 'spending' || k === 'savings') && v < 0;
        return (
          <li
            key={k}
            className={cx(
              'min-w-0 rounded-2xl border',
              compact ? 'px-2.5 py-2' : 'px-3.5 py-3',
              owes ? 'border-warn/40 bg-warn-soft' : 'border-line/70 bg-surface shadow-sm',
            )}
          >
            <div className={cx('flex items-center gap-1.5 font-semibold text-muted', compact ? 'text-[12px]' : 'text-[14px]')}>
              <span aria-hidden="true">{owes ? '⚠️' : META[k].emoji}</span>
              <span className="truncate">{META[k].label}</span>
            </div>
            <div
              className={cx(
                'font-extrabold leading-tight tabular-nums [overflow-wrap:anywhere]',
                compact ? 'text-[15px]' : 'text-[1.4rem]',
                owes ? 'text-warn' : 'text-ink',
              )}
            >
              {balanceText(k, v, currency)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
