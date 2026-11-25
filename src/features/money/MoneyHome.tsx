// /money — kids go straight to their own money page; grown-ups pick a child (cards with balances).
// Switched-off parts (Family → Features) are left out: tiles, level badge, requests, gifts.
import { Link, Navigate } from 'react-router';
import { Avatar, Badge, Card, EmptyState, Icon, LinkButton, PageHeader, PageSpinner, cx } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { plural } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Balances, Member } from '../../lib/types';
import { characterOf, levelFromPoints } from '../../lib/theme';
import { VerseLine } from '../faith/VerseCard';
import { WalletTiles } from './WalletTiles';

function KidCard({ kid, balances, cur, showLevel }: { kid: Member; balances: Balances; cur: string; showLevel: boolean }) {
  const lv = levelFromPoints(Math.max(0, balances.points), characterOf(kid.theme)?.key);
  const owes = balances.spending < 0;
  return (
    <Link
      to={`/money/${kid.id}`}
      className={cx(
        'block rounded-3xl border bg-surface p-3.5 shadow-sm transition hover:bg-surface-2 active:scale-[0.99]',
        owes ? 'border-warn/40' : 'border-line/70',
      )}
    >
      <div className="mb-2.5 flex items-center gap-3">
        <Avatar member={kid} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold leading-tight">{kid.display_name}</span>
          {(showLevel || owes) && (
            <span className="mt-0.5 flex flex-wrap gap-1.5">
              {showLevel && <Badge tone="accent"><span aria-hidden="true">{characterOf(kid.theme)?.emoji ?? '⭐'}</span>Level {lv.level}</Badge>}
              {owes && <Badge tone="warn" icon="alert">Owes money</Badge>}
            </span>
          )}
        </span>
        <Icon name="chevron-right" className="size-5 text-muted" />
      </div>
      <WalletTiles balances={balances} currency={cur} show={['spending', 'savings', 'time']} compact label={`${kid.display_name}’s balances`} />
    </Link>
  );
}

function SelfRow({ me }: { me: Member }) {
  return (
    <Link to={`/money/${me.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line/70 bg-surface px-3.5 py-2.5 shadow-sm transition hover:bg-surface-2">
      <Avatar member={me} size="sm" />
      <span className="flex-1 font-semibold">My money</span>
      <Icon name="chevron-right" className="size-5 text-muted" />
    </Link>
  );
}

export function MoneyHome() {
  const { me, members, family, isManager, state, balancesOf } = useApp();
  const features = useFeatures();
  if (!me || !family) return <PageSpinner />;
  if (me.role === 'kid') return <Navigate replace to={`/money/${me.id}`} />;

  const cur = family.currency;
  const giftsOn = features.on('spotted');
  const requestsOn = features.on('requests');
  const pointsOn = features.on('points');
  const hasAny = (b: Balances) => b.spending !== 0
    || (features.on('savings') && b.savings !== 0) || (features.on('time') && b.time !== 0) || (pointsOn && b.points !== 0);
  const kids = members.filter((m) => m.role === 'kid');
  const amG = me.role === 'grandparent';
  const gSees = family.settings?.grandparents_see_money !== false;
  const waiting = (requestsOn ? state?.counts.requests ?? 0 : 0) + (state?.counts.loans ?? 0);
  const mine = hasAny(balancesOf(me.id));
  const otherAdults = isManager ? members.filter((m) => m.role !== 'kid' && m.id !== me.id && hasAny(balancesOf(m.id))) : [];

  if (amG && !gSees) {
    return (
      <div className="space-y-4">
        <PageHeader title="Money" />
        <Card>
          <EmptyState
            emoji="🔒" title="Money is private in this family" message={giftsOn ? 'You can still send a gift.' : undefined}
            action={giftsOn && kids.length > 0 ? <LinkButton to="/money/spot" size="lg">🎁 Send a gift</LinkButton> : undefined}
          />
        </Card>
        {mine && <SelfRow me={me} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Money"
        subtitle={kids.length ? (amG ? (giftsOn ? 'Have a look at how the kids are doing, and send a gift if you like.' : 'Have a look at how the kids are doing.') : 'Tap a child to see their money.') : undefined}
      />

      {isManager && waiting > 0 && (
        <Link
          to="/money/requests"
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-warn/40 bg-warn-soft px-4 py-3 font-bold text-warn transition hover:brightness-95"
        >
          <span className="text-xl" aria-hidden="true">⏳</span>
          <span className="flex-1">{plural(waiting, 'request')} waiting</span>
          <Icon name="chevron-right" className="size-5" />
        </Link>
      )}

      {kids.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🧒" title="No kids yet" message="Their money shows here once a child joins the family."
            action={isManager ? <LinkButton to="/family/add" icon="plus">Add a child</LinkButton> : undefined}
          />
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Children">
          {kids.map((k) => <li key={k.id}><KidCard kid={k} balances={balancesOf(k.id)} cur={cur} showLevel={pointsOn} /></li>)}
        </ul>
      )}

      {(mine || otherAdults.length > 0 || (isManager && requestsOn)) && (
        <div className="space-y-2">
          {mine && <SelfRow me={me} />}
          {otherAdults.map((m) => (
            <Link key={m.id} to={`/money/${m.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line/70 bg-surface px-3.5 py-2.5 shadow-sm transition hover:bg-surface-2">
              <Avatar member={m} size="sm" />
              <span className="flex-1 font-semibold">{m.display_name}’s money</span>
              <Icon name="chevron-right" className="size-5 text-muted" />
            </Link>
          ))}
          {isManager && requestsOn && waiting === 0 && (
            <Link to="/money/requests" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line/70 bg-surface px-3.5 py-2.5 shadow-sm transition hover:bg-surface-2">
              <span className="grid size-8 place-items-center text-xl" aria-hidden="true">📨</span>
              <span className="flex-1 font-semibold">Requests</span>
              <span className="text-[14px] text-muted">None waiting</span>
              <Icon name="chevron-right" className="size-5 text-muted" />
            </Link>
          )}
        </div>
      )}
      <VerseLine id="little-by-little" className="mt-8 border-t border-line px-1 pt-4" />
      <div className="h-16" aria-hidden="true" />
    </div>
  );
}
