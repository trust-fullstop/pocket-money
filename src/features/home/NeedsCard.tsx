// Home card for grown-ups: "🛍️ What we need: N open" with up to 3 items, linking to /family/needs.
// Never shown to kids (and the server refuses them anyway), so surprises stay surprises.
import { Link } from 'react-router';
import { Icon, cardClass, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { useApp, useLoad } from '../../lib/session';
import type { Need } from '../../lib/types';

export function NeedsCard({ stamp, className }: { stamp: string; className?: string }) {
  const { me, membersById } = useApp();
  const features = useFeatures();
  const on = !!me && me.role !== 'kid' && features.on('needs');
  const needs = useLoad(() => (on ? api.listNeeds('active') : Promise.resolve([] as Need[])), [on, stamp]);
  const list = on ? needs.data ?? [] : [];
  if (list.length === 0) return null;
  // Nobody is getting these yet, so show them first.
  const top = [...list].sort((a, b) => Number(a.status === 'claimed') - Number(b.status === 'claimed')).slice(0, 3);

  return (
    <div className={cx(cardClass, 'relative mt-3 p-4 transition hover:bg-surface-2', className)}>
      <h2 className="text-[17px] font-extrabold">
        {/* The whole card is clickable (after:inset-0); the link's name stays short. */}
        <Link to="/family/needs" className="flex items-center gap-2 after:absolute after:inset-0 after:rounded-2xl after:content-['']">
          <span aria-hidden="true">🛍️</span> What we need: {list.length} open
        </Link>
      </h2>
      <ul className="mt-2 space-y-1 text-[15px]">
        {top.map((n) => (
          <li key={n.id} className="[overflow-wrap:anywhere]">
            <span className="font-semibold">{membersById[n.member_id]?.display_name ?? 'A child'}</span>
            {' · '}{n.item}{' · '}<span className="text-muted">{n.occasion}</span>
            {n.status === 'claimed' && (
              <span className="text-muted">
                {' '}({n.claimed_by === me?.id ? 'you are' : `${membersById[n.claimed_by ?? '']?.display_name ?? 'someone'} is`} getting it)
              </span>
            )}
          </li>
        ))}
      </ul>
      {list.length > 3 && <p className="mt-1 text-[14px] text-muted">and {list.length - 3} more</p>}
      <span className="mt-2 inline-flex min-h-6 items-center gap-1 font-semibold text-accent-ink" aria-hidden="true">
        Open the list <Icon name="chevron-right" size={18} />
      </span>
    </div>
  );
}
