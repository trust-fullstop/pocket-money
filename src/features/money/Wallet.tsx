// /money/:memberId — one wallet: balances, level, owed banner, actions, waiting requests, tallies, goals,
// targets and the history ("What happened").
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Avatar, Button, Card, EmptyState, IconButton, LinkButton, ListRow, PageHeader, Sheet, cx,
} from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Member } from '../../lib/types';
import { GoalsSection } from './Goals';
import { HISTORY_PAGE, HistorySection } from './History';
import { useData, useDelayed } from './moneyUtils';
import { LevelLine, LoadFailed, NotForYou, SkeletonRows } from './parts';
import { RequestCard } from './Requests';
import { TalliesCard } from './Tallies';
import { TargetsSection } from './Targets';
import { WalletTiles } from './WalletTiles';
import { AllowanceSheet, AskSpendSheet, MoveSheet, UseTimeSheet, WithdrawSheet } from './WalletSheets';

type SheetKind = 'move' | 'spend' | 'withdraw' | 'time' | 'allowance' | 'menu';

interface Action { key: string; emoji: string; label: string; onClick?: () => void; to?: string; primary?: boolean }

export function WalletPage() {
  const { memberId = '' } = useParams();
  const navigate = useNavigate();
  const { me, family, membersById, isManager, refresh } = useApp();
  const w = useData(() => api.wallet(memberId, HISTORY_PAGE), [memberId]);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const skeleton = useDelayed(w.loading);
  const cur = family?.currency ?? 'EUR';

  const member: Member | undefined = w.data?.member ?? membersById[memberId];
  const self = !!me && me.id === memberId;
  const kidWallet = member?.role === 'kid';
  const amGrandparent = me?.role === 'grandparent';
  const managerOfKid = isManager && kidWallet && !self;
  const name = member?.display_name ?? 'This child';
  const kidSelf = self && me?.role === 'kid';
  const back = kidSelf ? undefined : '/money';
  const changed = async () => { await Promise.all([refresh(), w.reload()]); };
  const close = () => setSheet(null);

  const title = member ? (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar member={member} size="sm" />
      <span className="truncate">{self ? 'My wallet' : name}</span>
    </span>
  ) : 'Wallet';

  if (w.loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <PageHeader title={title} back={back} />
        {skeleton && <SkeletonRows rows={5} />}
        <span className="sr-only" role="status">Loading the wallet…</span>
      </div>
    );
  }

  if (w.code === 'not_allowed') {
    if (amGrandparent) {
      return (
        <div className="space-y-4">
          <PageHeader title={title} back="/money" />
          <EmptyState
            emoji="🔒" title="Money is private in this family" message="You can still send a gift."
            action={kidWallet ? <LinkButton to={`/money/spot?member=${memberId}`} size="lg">🎁 Send a gift</LinkButton> : undefined}
          />
        </div>
      );
    }
    return <NotForYou message={me?.role === 'kid' ? 'This wallet belongs to someone else. You can see your own wallet.' : undefined}
      action={me?.role === 'kid' ? <LinkButton to={`/money/${me.id}`} icon="money">My wallet</LinkButton> : undefined} />;
  }
  if (w.code === 'not_found' || w.code === 'invalid') {
    return (
      <div className="space-y-4">
        <PageHeader title="Wallet" back="/money" />
        <EmptyState emoji="🔍" title="We couldn't find that wallet" message="Maybe this person left the family." action={<LinkButton to="/money" icon="back">Back to Money</LinkButton>} />
      </div>
    );
  }
  if (!w.data || !member) {
    return (
      <div className="space-y-4">
        <PageHeader title={title} back={back} />
        <LoadFailed message={w.error} onRetry={w.reload} />
      </div>
    );
  }

  const wallet = w.data;
  const b = wallet.balances;
  const pending = wallet.requests.filter((r) => r.status === 'pending');
  const allowance = member.allowance_cents ?? 0;
  const canEditGoals = self || (isManager && kidWallet);
  const spotHref = `/money/spot?member=${memberId}`;

  // Actions by role (UX §3.2 step 4).
  const actions: Action[] = [];
  if (self) {
    actions.push({ key: 'move', emoji: '🐷', label: isManager ? 'Move money' : 'Move to savings', onClick: () => setSheet('move') });
    actions.push({ key: 'spend', emoji: '🛍️', label: 'Ask to spend', onClick: () => setSheet('spend') });
    if (!isManager) actions.push({ key: 'withdraw', emoji: '🏦', label: 'Ask to take out savings', onClick: () => setSheet('withdraw') });
    actions.push({ key: 'time', emoji: '⏳', label: 'Use time', onClick: () => setSheet('time') });
  } else if (managerOfKid) {
    actions.push({ key: 'spot', emoji: '📸', label: 'Spotted', to: spotHref, primary: true });
    actions.push({ key: 'move', emoji: '🔄', label: 'Move money', onClick: () => setSheet('move') });
    actions.push({ key: 'allowance', emoji: '💰', label: 'Pocket money', onClick: () => setSheet('allowance') });
    actions.push({ key: 'targets', emoji: '🏆', label: 'Targets', to: `/money/${memberId}/targets` });
  } else if (isManager) {
    actions.push({ key: 'move', emoji: '🔄', label: 'Move money', onClick: () => setSheet('move') });
  } else if (amGrandparent && kidWallet) {
    actions.push({ key: 'gift', emoji: '🎁', label: 'Send a gift', to: spotHref, primary: true });
  }

  const menu: Action[] = managerOfKid ? [
    { key: 'spot', emoji: '📸', label: `Spotted for ${name}`, to: spotHref },
    { key: 'move', emoji: '🔄', label: 'Move money', onClick: () => setSheet('move') },
    { key: 'allowance', emoji: '💰', label: 'Weekly pocket money', onClick: () => setSheet('allowance') },
    { key: 'goals', emoji: '🎯', label: 'Goals', to: `/money/${memberId}/goals` },
    { key: 'targets', emoji: '🏆', label: 'Targets', to: `/money/${memberId}/targets` },
    { key: 'requests', emoji: '📨', label: 'All requests', to: '/money/requests' },
  ] : [];

  return (
    <div className={cx('space-y-4', w.refreshing && 'transition-opacity')} aria-busy={w.refreshing || undefined}>
      <PageHeader
        title={title} back={back}
        subtitle={amGrandparent ? 'You can look, and send a gift.' : managerOfKid ? `${name} sees the same wallet.` : undefined}
        right={menu.length > 0 ? <IconButton icon="settings" label={`More for ${name}`} onClick={() => setSheet('menu')} /> : undefined}
      />

      <WalletTiles balances={b} currency={cur} label={self ? 'My balances' : `${name}’s balances`} />
      {kidWallet && <LevelLine member={member} pointsTotal={b.points} name={self ? undefined : name} />}

      {b.spending < 0 && (
        <Card tone="warn" role="status">
          <p className="font-bold"><span aria-hidden="true">⚠️ </span>{self ? 'You owe' : `${name} owes`} {money(-b.spending, cur)}.</p>
          <p className="mt-0.5 text-[15px]">New money goes here first and pays it back.</p>
        </Card>
      )}

      {kidWallet && (allowance > 0 || managerOfKid) && (
        <p className="flex items-center gap-2 px-1 text-[15px] text-muted">
          <span aria-hidden="true">💰</span>
          {allowance > 0 ? <span>Pocket money: <strong className="text-ink">{money(allowance, cur)}</strong> every week</span> : <span>No weekly pocket money yet.</span>}
          {managerOfKid && <button type="button" onClick={() => setSheet('allowance')} className="min-h-11 font-semibold text-accent-ink underline underline-offset-2">{allowance > 0 ? 'Change' : 'Set it'}</button>}
        </p>
      )}

      {actions.length > 0 && (
        <div className={cx('grid gap-2', actions.length === 1 ? 'grid-cols-1' : 'grid-cols-2')} role="group" aria-label="Actions">
          {actions.map((a) => a.to ? (
            <LinkButton key={a.key} to={a.to} size="lg" variant={a.primary ? 'primary' : 'secondary'} className="h-auto min-h-14 whitespace-normal py-2 leading-tight">
              <span aria-hidden="true" className="text-xl">{a.emoji}</span> {a.label}
            </LinkButton>
          ) : (
            <Button key={a.key} size="lg" variant={a.primary ? 'primary' : 'secondary'} onClick={a.onClick} className="h-auto min-h-14 whitespace-normal py-2 leading-tight">
              <span aria-hidden="true" className="text-xl">{a.emoji}</span> {a.label}
            </Button>
          ))}
        </div>
      )}

      {pending.length > 0 ? (
        <section aria-labelledby="waiting-title" className="space-y-2">
          <div className="flex min-h-11 items-center justify-between px-1">
            <h2 id="waiting-title" className="text-sm font-bold uppercase tracking-wide text-muted"><span aria-hidden="true">⏳ </span>Waiting</h2>
            <LinkButton to="/money/requests" variant="ghost" size="sm">{self && !isManager ? 'My requests' : 'All requests'}</LinkButton>
          </div>
          <ul className="space-y-2">
            {pending.map((r) => <li key={r.id}><RequestCard req={r} cur={cur} balances={b} onChanged={changed} /></li>)}
          </ul>
        </section>
      ) : self && wallet.requests.length > 0 ? (
        <LinkButton to="/money/requests" variant="ghost" size="sm" className="w-full">
          <span aria-hidden="true">📨</span> My requests — what the grown-ups said
        </LinkButton>
      ) : null}

      <TalliesCard wallet={wallet} self={self} name={name} cur={cur} />

      <GoalsSection
        goals={wallet.goals} savings={b.savings} avgWeekly={wallet.avg_weekly_savings_cents} memberId={memberId}
        self={self} name={name} canEdit={canEditGoals} cur={cur} onChanged={changed}
      />

      {kidWallet && (
        <TargetsSection targets={wallet.targets} memberId={memberId} canEdit={isManager} self={self} name={name} cur={cur} />
      )}

      <HistorySection memberId={memberId} initial={wallet.history} ownerName={self ? 'You' : name} self={self} cur={cur} onChanged={changed} />

      <div className="h-16" aria-hidden="true" />

      {sheet === 'move' && (
        <MoveSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} canToSpending={isManager} />
      )}
      {sheet === 'spend' && <AskSpendSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} />}
      {sheet === 'withdraw' && <WithdrawSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} />}
      {sheet === 'time' && <UseTimeSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} />}
      {sheet === 'allowance' && managerOfKid && (
        <AllowanceSheet memberId={memberId} name={name} cur={cur} current={allowance} onClose={close} onChanged={changed} />
      )}
      {sheet === 'menu' && (
        <Sheet open onClose={close} title={`${name}’s wallet`}>
          <ul className="-mx-2 divide-y divide-line">
            {menu.map(({ key, emoji, label, to, onClick }) => (
              <li key={key}>
                <ListRow
                  left={<span className="text-2xl" aria-hidden="true">{emoji}</span>} title={label} chevron
                  onClick={to ? () => { close(); navigate(to); } : () => onClick?.()}
                />
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
