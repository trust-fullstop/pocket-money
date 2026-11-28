// Family rules → 📖 Bible time surprise: which kids opened the Bible App from Sow & Grow this month (managers only;
// bible_opens_summary). Only taps on the app's own Bible App links are seen, so this is never "how much they read".
import { api } from '../../lib/api';
import { formatDate, money } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';

/** Per kid "Sam — this month: 5 days · last: Thu 26 Nov", plus this month's money. `saved` = the saved value (reloads after a change). */
export function BibleOpensLine({ saved }: { saved: number }) {
  const { family, membersById } = useApp();
  const summary = useLoad(() => api.bibleOpensSummary(), [saved]);
  const s = summary.data;
  if (!s || s.kids.length === 0) return null;
  const cur = family?.currency ?? 'EUR';
  const given = s.kids.reduce((a, k) => a + k.rewarded_month_cents, 0);
  const name = (id: string) => membersById[id]?.display_name ?? 'A child';
  return (
    <div className="space-y-1 rounded-2xl bg-surface-2 px-3 py-2 text-[15px]" aria-live="polite">
      <p className="font-semibold">Opened from Sow &amp; Grow</p>
      <ul className="space-y-0.5">
        {s.kids.map((k) => (
          <li key={k.member_id} className="[overflow-wrap:anywhere]">
            {name(k.member_id)} — this month: <span className="tabular-nums">{k.days_month}</span> {k.days_month === 1 ? 'day' : 'days'}
            {k.last_day && <span className="text-muted"> · last: {formatDate(k.last_day)}</span>}
          </li>
        ))}
      </ul>
      {given > 0 && <p className="text-muted">Given this month: {money(given, cur, { whole: true })}</p>}
    </div>
  );
}
