// /money/:memberId — one wallet: balances, level, owed banner, actions, waiting requests, real bank balance, tallies,
// goals, targets and the history ("What happened").
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Avatar, Button, Card, EmptyState, IconButton, LinkButton, ListRow, PageHeader, Sheet, cx,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { allowanceSchedule, money } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Member } from '../../lib/types';
import { AllowanceSheet } from './AllowanceEditor';
import { BankCard } from './Bank';
import { GoalsSection } from './Goals';
import { HISTORY_PAGE, HistorySection } from './History';
import { useData, useDelayed } from './moneyUtils';
import { LevelLine, LoadFailed, NotForYou, SkeletonRows } from './parts';
import { RequestCard } from './Requests';
import { TalliesCard } from './Tallies';
import { TargetsSection } from './Targets';
import { WalletTiles } from './WalletTiles';
import { AskSpendSheet, MoveSheet, UseTimeSheet, WithdrawSheet } from './WalletSheets';

type SheetKind = 'move' | 'spend' | 'withdraw' | 'time' | 'allowance' | 'menu';

/** `when` = the part it needs is switched on (Family → Features). */
interface Action { key: string; emoji: string; label: string; onClick?: () => void; to?: string; primary?: boolean; when: boolean }

export function WalletPage() {
  const { memberId = '' } = useParams();
  const navigate = useNavigate();
  const { me, family, membersById, isManager, refresh } = useApp();
  const features = useFeatures();
  const w = useData(() => api.wallet(memberId, HISTORY_PAGE), [memberId]);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const skeleton = useDelayed(w.loading);
  const cur = family?.currency ?? 'EUR';
  const on = {
    savings: features.on('savings'), requests: features.on('requests'), time: features.on('time'), points: features.on('points'),
    spotted: features.on('spotted'), allowance: features.on('allowance'), goals: features.on('goals'), targets: features.on('targets'),
    bank: features.on('bank'),
  };

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
            emoji="🔒" title="Money is private in this family" message={on.spotted ? 'You can still send a gift.' : undefined}
            action={kidWallet && on.spotted ? <LinkButton to={`/money/spot?member=${memberId}`} size="lg">🎁 Send a gift</LinkButton> : undefined}
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

  // Actions by role (UX §3.2 step 4), minus the ones whose part is switched off.
  const moveSheet = () => setSheet('move');
  const all: Action[] = [];
  if (self) {
    all.push({ key: 'move', emoji: '🐷', label: isManager ? 'Move money' : 'Move to savings', onClick: moveSheet, when: on.savings });
    all.push({ key: 'spend', emoji: '🛍️', label: 'Ask to spend', onClick: () => setSheet('spend'), when: on.requests });
    all.push({ key: 'withdraw', emoji: '🏦', label: 'Ask to take out savings', onClick: () => setSheet('withdraw'), when: !isManager && on.savings && on.requests });
    all.push({ key: 'time', emoji: '⏳', label: 'Use time', onClick: () => setSheet('time'), when: on.time && on.requests });
  } else if (managerOfKid) {
    all.push({ key: 'spot', emoji: '📸', label: 'Spotted', to: spotHref, primary: true, when: on.spotted });
    all.push({ key: 'move', emoji: '🔄', label: 'Move money', onClick: moveSheet, when: on.savings });
    all.push({ key: 'allowance', emoji: '💰', label: 'Pocket money', onClick: () => setSheet('allowance'), when: on.allowance });
    all.push({ key: 'targets', emoji: '🏆', label: 'Targets', to: `/money/${memberId}/targets`, when: on.targets });
  } else if (isManager) {
    all.push({ key: 'move', emoji: '🔄', label: 'Move money', onClick: moveSheet, when: on.savings });
  } else if (amGrandparent && kidWallet) {
    all.push({ key: 'gift', emoji: '🎁', label: 'Send a gift', to: spotHref, primary: true, when: on.spotted });
  }
  const actions = all.filter((a) => a.when);

  const menuAll: Action[] = managerOfKid ? [
    { key: 'spot', emoji: '📸', label: `Spotted for ${name}`, to: spotHref, when: on.spotted },
    { key: 'move', emoji: '🔄', label: 'Move money', onClick: moveSheet, when: on.savings },
    { key: 'allowance', emoji: '💰', label: 'Pocket money', onClick: () => setSheet('allowance'), when: on.allowance },
    { key: 'goals', emoji: '🎯', label: 'Goals', to: `/money/${memberId}/goals`, when: on.goals },
    { key: 'targets', emoji: '🏆', label: 'Targets', to: `/money/${memberId}/targets`, when: on.targets },
    { key: 'requests', emoji: '📨', label: 'All requests', to: '/money/requests', when: on.requests },
  ] : [];
  const menu = menuAll.filter((a) => a.when);

  return (
    <div className={cx('space-y-4', w.refreshing && 'transition-opacity')} aria-busy={w.refreshing || undefined}>
      <PageHeader
        title={title} back={back}
        subtitle={amGrandparent ? (on.spotted ? 'You can look, and send a gift.' : 'You can have a look.') : managerOfKid ? `${name} sees the same wallet.` : undefined}
        right={menu.length > 0 ? <IconButton icon="settings" label={`More for ${name}`} onClick={() => setSheet('menu')} /> : undefined}
      />

      <WalletTiles balances={b} currency={cur} label={self ? 'My balances' : `${name}’s balances`} />
      {kidWallet && on.points && <LevelLine member={member} pointsTotal={b.points} name={self ? undefined : name} />}

      {b.spending < 0 && (
        <Card tone="warn" role="status">
          <p className="font-bold"><span aria-hidden="true">⚠️ </span>{self ? 'You owe' : `${name} owes`} {money(-b.spending, cur)}.</p>
          <p className="mt-0.5 text-[15px]">New money goes here first and pays it back.</p>
        </Card>
      )}

      {kidWallet && on.allowance && (allowance > 0 || managerOfKid) && (
        <p className="flex items-center gap-2 px-1 text-[15px] text-muted">
          <span aria-hidden="true">💰</span>
          {allowance > 0
            ? <span>Pocket money: <strong className="text-ink">{money(allowance, cur)}</strong> {allowanceSchedule(member.allowance_period, member.allowance_day)}</span>
            : <span>No pocket money yet.</span>}
          {managerOfKid && <button type="button" onClick={() => setSheet('allowance')} className="min-h-11 font-semibold text-accent-ink underline underline-offset-2">{allowance > 0 ? 'Change' : 'Set it'}</button>}
        </p>
      )}

      {actions.length > 0 && (
        <div className={cx('grid gap-2', actions.length === 1 ? 'grid-cols-1' : 'grid-cols-2')} role="group" aria-label="Actions">
          {actions.map((a, i) => {
            // An odd last button spans the row so the grid stays tidy (3 actions → 2 + 1 wide).
            const cls = cx('h-auto min-h-14 whitespace-normal py-2 leading-tight', actions.length > 1 && actions.length % 2 === 1 && i === actions.length - 1 && 'col-span-2');
            return a.to ? (
              <LinkButton key={a.key} to={a.to} size="lg" variant={a.primary ? 'primary' : 'secondary'} className={cls}>
                <span aria-hidden="true" className="text-xl">{a.emoji}</span> {a.label}
              </LinkButton>
            ) : (
              <Button key={a.key} size="lg" variant={a.primary ? 'primary' : 'secondary'} onClick={a.onClick} className={cls}>
                <span aria-hidden="true" className="text-xl">{a.emoji}</span> {a.label}
              </Button>
            );
          })}
        </div>
      )}

      {!on.requests ? null : pending.length > 0 ? (
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

      {on.bank && (kidWallet || self) && (
        <BankCard memberId={memberId} self={self} name={name} canEdit={self || managerOfKid} cur={cur} onFeatureOff={changed} />
      )}

      <TalliesCard wallet={wallet} self={self} name={name} cur={cur} />

      {on.goals && (
        <GoalsSection
          goals={wallet.goals} savings={b.savings} avgWeekly={wallet.avg_weekly_savings_cents} memberId={memberId}
          self={self} name={name} canEdit={canEditGoals} cur={cur} onChanged={changed}
        />
      )}

      {kidWallet && on.targets && (
        <TargetsSection targets={wallet.targets} memberId={memberId} canEdit={isManager} self={self} name={name} cur={cur} />
      )}

      <HistorySection memberId={memberId} initial={wallet.history} ownerName={self ? 'You' : name} self={self} cur={cur} onChanged={changed} />

      <div className="h-16" aria-hidden="true" />

      {sheet === 'move' && on.savings && (
        <MoveSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} canToSpending={isManager} />
      )}
      {sheet === 'spend' && on.requests && <AskSpendSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} />}
      {sheet === 'withdraw' && on.savings && on.requests && (
        <WithdrawSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} />
      )}
      {sheet === 'time' && on.time && on.requests && (
        <UseTimeSheet memberId={memberId} name={name} self={self} balances={b} cur={cur} onClose={close} onChanged={changed} />
      )}
      {sheet === 'allowance' && managerOfKid && on.allowance && (
        <AllowanceSheet member={member} onClose={close} onSaved={changed} />
      )}
      {sheet === 'menu' && menu.length > 0 && (
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
