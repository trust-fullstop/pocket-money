// Ledger vocabulary (UX spec §0.2): TxKind → emoji + kid-safe label + colour class, plus the glyphs for
// currencies, pots and labels. Self-contained (types only) so any feature may import it.
import type { Currency, MoneyLabel, Pot, TimeLabel, TxKind } from '../../lib/types';

/** plus = went up (green) · minus = a consequence (orange) · neutral = a choice / transfer / undo (slate). */
export type TxTone = 'plus' | 'minus' | 'neutral';

export interface TxMeta { emoji: string; label: string; tone: TxTone }

export const TX_META: Record<TxKind, TxMeta> = {
  task_reward: { emoji: '✅', label: 'Task done', tone: 'plus' },
  task_penalty: { emoji: '⏰', label: 'Not done in time', tone: 'minus' },
  bonus: { emoji: '🌟', label: 'Reward', tone: 'plus' },
  fine: { emoji: '⚠️', label: 'Consequence', tone: 'minus' },
  gift: { emoji: '🎁', label: 'Gift', tone: 'plus' },
  transfer: { emoji: '🔄', label: 'Moved', tone: 'neutral' },
  interest: { emoji: '🌱', label: 'Savings grew', tone: 'plus' },
  spend: { emoji: '🛍️', label: 'Bought', tone: 'neutral' },
  time_use: { emoji: '⏳', label: 'Time used', tone: 'neutral' },
  prize: { emoji: '🏆', label: 'Prize', tone: 'plus' },
  saver_bonus: { emoji: '🐷', label: 'Saver bonus', tone: 'plus' },
  no_savings_penalty: { emoji: '💤', label: 'Nothing saved this week', tone: 'minus' },
  excuse: { emoji: '🤝', label: 'Excused (given back)', tone: 'plus' },
  reversal: { emoji: '↩️', label: 'Undone', tone: 'neutral' },
  allowance: { emoji: '💰', label: 'Pocket money', tone: 'plus' },
  payout: { emoji: '🏦', label: 'Paid out', tone: 'neutral' },
  loan_repayment: { emoji: '🤝', label: 'Loan repayment', tone: 'neutral' },
  adjustment: { emoji: '👛', label: 'Pocket money adjustment', tone: 'neutral' },
};

/** Meta for a kind (unknown kinds fall back to a neutral bullet with the raw name). */
export function txMeta(kind: TxKind | string): TxMeta {
  return TX_META[kind as TxKind] ?? { emoji: '•', label: String(kind).replace(/_/g, ' '), tone: 'neutral' };
}

/** Tone of one row: the kind's tone, unless the amount's sign contradicts it (then neutral). */
export function txTone(kind: TxKind | string, amount: number): TxTone {
  const t = txMeta(kind).tone;
  if (t === 'plus' && amount < 0) return 'neutral';
  if (t === 'minus' && amount > 0) return 'neutral';
  return t;
}

/** Tailwind text colour per tone (uses the semantic tokens from index.css). */
export const TONE_TEXT: Record<TxTone, string> = { plus: 'text-good', minus: 'text-warn', neutral: 'text-ink' };
/** Soft background per tone (for the emoji bubble). */
export const TONE_SOFT: Record<TxTone, string> = { plus: 'bg-good-soft', minus: 'bg-warn-soft', neutral: 'bg-surface-2' };

export interface Glyph { emoji: string; label: string }

export const CURRENCY_META: Record<Currency, Glyph> = {
  money: { emoji: '💰', label: 'Money' },
  time: { emoji: '⏱️', label: 'Time' },
  points: { emoji: '✨', label: 'Points' },
};

export const TIME_LABELS: Record<TimeLabel, Glyph> = {
  wifi: { emoji: '📶', label: 'Wi-Fi' },
  game: { emoji: '🎮', label: 'Game' },
  fun: { emoji: '🎈', label: 'Fun' },
};

export const MONEY_LABELS: Record<MoneyLabel, Glyph> = {
  pocket: { emoji: '👛', label: 'Pocket money' },
  extra: { emoji: '🙌', label: 'Extra' },
  reward: { emoji: '🏅', label: 'Reward' },
  prize: { emoji: '🏆', label: 'Prize' },
  gift: { emoji: '🎁', label: 'Gift' },
};

export const POTS: Record<Pot, Glyph> = {
  spending: { emoji: '👛', label: 'Wallet' },
  savings: { emoji: '🐷', label: 'Savings' },
  time: { emoji: '⏱️', label: 'Time' },
  points: { emoji: '✨', label: 'Points' },
};

/** Glyph for a ledger/request label (time label or money label); null when unknown or empty. */
export function labelMeta(label: string | null | undefined): Glyph | null {
  if (!label) return null;
  return TIME_LABELS[label as TimeLabel] ?? MONEY_LABELS[label as MoneyLabel] ?? null;
}

/** "game" → "game time", "wifi" → "Wi-Fi time" (for sentences). */
export function timeLabelWords(label: string | null | undefined): string {
  const g = TIME_LABELS[(label ?? 'fun') as TimeLabel] ?? TIME_LABELS.fun;
  return `${label === 'wifi' ? g.label : g.label.toLowerCase()} time`;
}
