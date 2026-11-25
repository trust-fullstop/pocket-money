// What each feature switch means, in plain words (Family → Features, the "switched off" pages, the activity log).
import { featureOn, type FeatureKey, type Features } from '../../lib/types';

export interface FeatureInfo { key: FeatureKey; emoji: string; label: string; line: string }
export interface FeatureGroup { key: string; title: string; emoji: string; items: FeatureInfo[] }

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    key: 'tasks', title: 'Tasks', emoji: '✅', items: [
      { key: 'challenges', emoji: '🏆', label: 'Challenges', line: 'One-off challenges with a reward — kids can even challenge their parents.' },
    ],
  },
  {
    key: 'money', title: 'Money', emoji: '💶', items: [
      { key: 'allowance', emoji: '📅', label: 'Pocket money', line: 'A set amount is paid automatically every week or every month.' },
      { key: 'requests', emoji: '🙋', label: 'Requests', line: 'Kids ask before they spend money or use time, and a parent says yes or no.' },
      { key: 'spotted', emoji: '📸', label: 'Spotted', line: 'An on-the-spot reward or consequence with a photo. Grandparents and other family can send gifts.' },
      { key: 'savings', emoji: '🐷', label: 'Savings', line: 'A savings pot next to the Wallet, so kids learn to put some aside.' },
      { key: 'interest', emoji: '📈', label: 'Interest', line: 'Savings grow a little every week, so waiting pays off.' },
      { key: 'saver_rules', emoji: '⭐', label: 'Saver rules', line: 'Bonus points for saving, and an optional penalty for saving nothing.' },
      { key: 'goals', emoji: '🎯', label: 'Savings goals', line: 'Save up for something and see how many weeks are left.' },
      { key: 'targets', emoji: '🏁', label: 'Targets', line: 'Weekly or monthly targets with a prize when they are reached.' },
      { key: 'bank', emoji: '🏦', label: 'Real bank balance', line: 'Type in the balance of a kid’s real bank account (e.g. Revolut) to see it next to the app.' },
      { key: 'loans', emoji: '🤝', label: 'Loans', line: 'Kids can borrow from a parent and choose how to pay it back — it comes off their pocket money.' },
    ],
  },
  {
    key: 'currencies', title: 'Currencies', emoji: '🪙', items: [
      { key: 'time', emoji: '⏱️', label: 'Time', line: 'Earn and spend Wi-Fi, game or fun minutes.' },
      { key: 'points', emoji: '🌟', label: 'Points & levels', line: 'Points for tasks, with characters that level up.' },
    ],
  },
  {
    key: 'life', title: 'Family life', emoji: '🏠', items: [
      { key: 'calendar', emoji: '🗓️', label: 'Calendar', line: 'Family events, reminders and birthdays in one place.' },
      { key: 'emergency', emoji: '🆘', label: 'Emergency card', line: 'Blood type, allergies, medication and who to call.' },
      { key: 'devices', emoji: '📱', label: 'Devices', line: 'A list of the phones, tablets and consoles at home.' },
      { key: 'needs', emoji: '🛍️', label: 'What we need', line: 'Grown-ups note what each child needs (school shoes, a bag…) and tick it off when it is bought.' },
    ],
  },
  {
    key: 'helper', title: 'Learning and help', emoji: '💡', items: [
      { key: 'learn', emoji: '🎓', label: 'Money school', line: 'Short lessons: why and how to save, how interest works, earning and spending wisely.' },
      { key: 'faith', emoji: '🕊️', label: 'Faith, hope and love', line: 'A Bible verse of the day, faith-and-money reflections and links to the Bible App. Each person can hide verses.' },
      { key: 'ask', emoji: '💬', label: 'Ask Pocket', line: 'Kids can ask how the app works. Parents can read all questions.' },
    ],
  },
];

export const FEATURE_INFO = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]),
) as Record<FeatureKey, FeatureInfo>;

/** All 20 switches, in the order they appear on the Features page. */
export const FEATURE_KEYS: FeatureKey[] = FEATURE_GROUPS.flatMap((g) => g.items.map((i) => i.key));
export const FEATURE_TOTAL = FEATURE_KEYS.length;

/** Stored switches → a full record of raw switches (missing keys count as on, like featureOn). */
export function fullFeatures(raw: Partial<Features> | null | undefined): Features {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, raw?.[k] !== false])) as Features;
}

/** How many features are effectively on (dependencies respected). */
export function countOn(raw: Partial<Features> | null | undefined): number {
  return FEATURE_KEYS.filter((k) => featureOn(raw ?? {}, k)).length;
}

/** What is effectively switched on / off when going from `from` to `to`. */
export function featureChanges(from: Partial<Features>, to: Partial<Features>): { on: FeatureKey[]; off: FeatureKey[] } {
  const on: FeatureKey[] = [];
  const off: FeatureKey[] = [];
  for (const k of FEATURE_KEYS) {
    const a = featureOn(from, k);
    const b = featureOn(to, k);
    if (a !== b) (b ? on : off).push(k);
  }
  return { on, off };
}

