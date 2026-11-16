import { Link } from 'react-router';
import { Avatar, Card, EmptyState, LinkButton, ListRow, ProgressBar, Stat, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures, type FeatureApi } from '../../lib/features';
import { minutes, money, plural, points } from '../../lib/format';
import { useApp, useLoad, type LoadResult } from '../../lib/session';
import { characterOf, levelFromPoints } from '../../lib/theme';
import type { Balances, EventOccurrence, Member, TaskInstance, Wallet } from '../../lib/types';
import { ComingUp, HomeSection, KidTaskRow, Loaded, SectionError, Skeleton } from './shared';
import { byStatusThenDue, countsForProgress, eventsWindow, gridCols, rewardParts, sumRewards, weekRange } from './lib';

export default function KidHome() {
  const { me, family, state } = useApp();
  if (!me || !family || !state) return null;
  return <KidHomeInner me={me} today={state.today} tz={family.timezone} stamp={state.now} />;
}

function KidHomeInner({ me, today, tz, stamp }: { me: Member; today: string; tz: string; stamp: string }) {
  const { state, family } = useApp();
  const features = useFeatures();
  const calendarOn = features.on('calendar');
  const challengesOn = features.on('challenges');
  const week = weekRange(today);
  const [from, to] = eventsWindow(today, tz);
  const insts = useLoad(() => api.listInstances(week.start, week.end, me.id), [me.id, week.start, stamp]);
  const wallet = useLoad(() => api.wallet(me.id, 0), [me.id, stamp]);
  const events = useLoad(
    () => (calendarOn ? api.listEvents(from, to) : Promise.resolve([] as EventOccurrence[])),
    [from, to, stamp, calendarOn],
  );
  // A kid only has something to check when they challenged someone.
  const approvals = challengesOn ? state?.counts.approvals ?? 0 : 0;
  const checks = useLoad(() => (approvals > 0 ? api.listApprovals() : Promise.resolve([] as TaskInstance[])), [approvals, stamp]);
  const balances = state?.balances[me.id];
  const cur = family?.currency ?? 'EUR';
  const myRequests = features.on('requests') ? state?.counts.my_requests ?? 0 : 0;

  const todays = (insts.data ?? []).filter((i) => i.occurs_on === today && i.assignee_id === me.id && countsForProgress(i)).sort(byStatusThenDue);
  const doneToday = todays.filter((i) => i.status === 'approved').length;

  return (
    <>
      <CharacterCard me={me} balances={balances} withLevel={features.on('points')} />

      <div className="mt-3">
        {balances ? <BalanceTiles meId={me.id} b={balances} currency={cur} features={features} /> : <NoBalances />}
      </div>

      {approvals > 0 && checks.data && checks.data.length > 0 && <ChallengeToCheck list={checks.data} />}

      <HomeSection
        title={<span>Today{insts.data && todays.length > 0 && <span className="ml-2 text-[15px] font-semibold text-muted">{doneToday} of {todays.length} done</span>}</span>}
        link={{ to: '/tasks', label: 'See all tasks' }}
      >
        <Loaded load={insts} rows={3} height="h-20">
          {() => todays.length === 0 ? (
            <Card>
              <EmptyState
                className="!py-4"
                emoji="🎈"
                title="No tasks today"
                message={challengesOn ? 'Enjoy it — or make a challenge.' : 'Enjoy your free time!'}
                action={challengesOn ? <LinkButton to="/tasks/new" variant="secondary" icon="plus">Make a challenge</LinkButton> : undefined}
              />
            </Card>
          ) : (
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-line">
                {todays.slice(0, 4).map((i) => <KidTaskRow key={i.id} inst={i} />)}
              </ul>
              {todays.length > 4 && (
                <Link to="/tasks" className="block min-h-11 border-t border-line p-3 text-center font-semibold text-accent-ink hover:bg-surface-2">
                  {plural(todays.length - 4, 'more task')} →
                </Link>
              )}
            </Card>
          )}
        </Loaded>
      </HomeSection>

      <CouldEarn insts={insts.data} wallet={wallet.data} currency={cur} features={features} />

      {features.on('goals') && <GoalCard wallet={wallet} meId={me.id} currency={cur} />}

      {myRequests > 0 && (
        <Card padded={false} className="mt-6 overflow-hidden">
          <ListRow
            to="/money/requests"
            left={<span className="grid size-11 place-items-center rounded-full bg-warn-soft text-xl" aria-hidden="true">🙋</span>}
            title={`${plural(myRequests, 'request')} waiting for a grown-up`}
          />
        </Card>
      )}

      <ComingUp events={events} max={3} forMember={me.id} title="Next reminders" />
    </>
  );
}

function CharacterCard({ me, balances, withLevel }: { me: Member; balances?: Balances; withLevel: boolean }) {
  const char = withLevel ? characterOf(me.theme) : null;
  const level = balances && withLevel ? levelFromPoints(balances.points, char?.key) : null;
  return (
    <Link
      to="/me"
      className="block rounded-3xl border border-line bg-linear-to-br from-accent-soft to-surface p-4 text-accent-ink shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-4">
        {withLevel ? (
          <span className="grid size-20 shrink-0 place-items-center rounded-full bg-surface text-5xl shadow-sm" aria-hidden="true">
            {char?.emoji ?? me.avatar ?? '🙂'}
          </span>
        ) : (
          <Avatar member={me} size="lg" name="" className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">Hi {me.display_name}! <span aria-hidden="true">👋</span></h1>
          {level ? (
            <p className="font-semibold">Level {level.level} · {level.title}</p>
          ) : withLevel ? (
            <p className="text-[15px]">Tap to pick your character</p>
          ) : (
            <p className="text-[15px]">Tap to change your look</p>
          )}
        </div>
      </div>
      {level && balances && (
        <div className="mt-3">
          <ProgressBar value={level.progressPct} label={`Progress to level ${level.level + 1}`} valueText={points(balances.points)} />
          <p className="mt-1 text-[15px] font-semibold">
            {plural(level.toNext, 'point')} to Level {level.level + 1}
          </p>
        </div>
      )}
    </Link>
  );
}

function BalanceTiles({ meId, b, currency, features }: { meId: string; b: Balances; currency: string; features: FeatureApi }) {
  const owes = b.spending < 0;
  const savings = features.on('savings');
  const time = features.on('time');
  const tile = 'block rounded-2xl border border-line bg-surface p-3 shadow-sm transition active:scale-[0.98]';
  return (
    <div className={cx('grid gap-2', gridCols(1 + Number(savings) + Number(time)))}>
      <Link to={`/money/${meId}`} className={cx(tile, owes && 'border-warn/50 bg-warn-soft')}>
        <Stat
          label={<><span aria-hidden="true">👛</span> {owes ? 'Owes' : 'Spending'}</>}
          value={<>{money(owes ? -b.spending : b.spending, currency)}{owes && <span aria-hidden="true"> ⚠️</span>}</>}
          tone={owes ? 'warn' : undefined}
          className="[&_.text-2xl]:text-xl"
        />
      </Link>
      {savings && (
        <Link to={`/money/${meId}`} className={tile}>
          <Stat label={<><span aria-hidden="true">🐷</span> Savings</>} value={money(b.savings, currency)} className="[&_.text-2xl]:text-xl" />
        </Link>
      )}
      {time && (
        <Link to={`/money/${meId}`} className={tile}>
          <Stat
            label={<><span aria-hidden="true">⏱️</span> Time</>}
            value={minutes(b.time)}
            tone={b.time < 0 ? 'warn' : undefined}
            className="[&_.text-2xl]:text-xl"
          />
        </Link>
      )}
    </div>
  );
}

function NoBalances() {
  const { refresh } = useApp();
  return <SectionError error="Your money isn’t showing right now." onRetry={() => void refresh()} />;
}

function ChallengeToCheck({ list }: { list: TaskInstance[] }) {
  const { membersById } = useApp();
  const first = list[0];
  const who = membersById[first.assignee_id]?.display_name ?? 'Someone';
  return (
    <Card padded={false} className="mt-6 overflow-hidden border-accent/40">
      <ListRow
        to={list.length === 1 ? `/tasks/${first.id}` : '/tasks/approvals'}
        left={<span className="grid size-11 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">🏆</span>}
        title={list.length === 1 ? `${who} did your challenge!` : `${list.length} challenges to check!`}
        subtitle="Take a look"
      />
    </Card>
  );
}

function CouldEarn({ insts, wallet, currency, features }: {
  insts?: TaskInstance[] | null; wallet?: Wallet | null; currency: string; features: FeatureApi;
}) {
  // Time and points only count when those currencies are switched on.
  const show = { time: features.on('time'), points: features.on('points') };
  let still: string[] = [];
  let waiting: string[] = [];
  let anyThisWeek = false;
  if (insts) {
    const counted = insts.filter(countsForProgress);
    anyThisWeek = counted.length > 0;
    still = rewardParts(sumRewards(counted.filter((i) => i.status === 'open')), currency, show);
    waiting = rewardParts(sumRewards(counted.filter((i) => i.status === 'submitted')), currency, show);
  } else if (wallet) {
    const w = wallet.tallies.week;
    anyThisWeek = w.tasks_open + w.tasks_done + w.tasks_missed > 0;
    if (w.tasks_open > 0) {
      still = rewardParts({
        reward_cents: Math.max(0, w.possible_cents - w.money_earned),
        reward_minutes: Math.max(0, w.possible_minutes - w.time_earned),
        reward_points: Math.max(0, w.possible_points - w.points_earned),
      }, currency, show);
    }
  } else {
    return null;
  }
  if (!anyThisWeek) return null;

  return (
    <HomeSection title="This week you could still earn">
      {still.length > 0 ? (
        <Link to="/tasks" className="block rounded-2xl border border-line bg-surface p-4 shadow-sm transition active:scale-[0.99]">
          <p className="text-xl font-extrabold tabular-nums text-accent-ink">{still.join(' · ')}</p>
          {waiting.length > 0 && <p className="mt-1 text-[14px] text-muted">Waiting for OK: {waiting.join(' · ')}</p>}
        </Link>
      ) : (
        <Card className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">🎉</span>
          <div>
            <p className="font-semibold">Nice! Everything for this week is done.</p>
            {waiting.length > 0 && <p className="text-[14px] text-muted">Waiting for OK: {waiting.join(' · ')}</p>}
          </div>
        </Card>
      )}
    </HomeSection>
  );
}

function GoalCard({ wallet, meId, currency }: { wallet: LoadResult<Wallet>; meId: string; currency: string }) {
  if (wallet.error && !wallet.data) {
    return (
      <HomeSection title="My goal">
        <SectionError error={wallet.error} onRetry={() => void wallet.reload()} />
      </HomeSection>
    );
  }
  if (!wallet.data) {
    return <HomeSection title="My goal"><Skeleton rows={1} height="h-24" /></HomeSection>;
  }
  const w = wallet.data;
  const goal = w.goals.find((g) => !g.archived);
  if (!goal) {
    return (
      <Card padded={false} className="mt-6 overflow-hidden">
        <ListRow
          to={`/money/${meId}/goals`}
          left={<span className="grid size-11 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">🎯</span>}
          title="Saving up for something?"
          subtitle="Set a goal and watch it grow"
        />
      </Card>
    );
  }
  const saved = Math.max(0, w.balances.savings);
  const reached = saved >= goal.target_cents;
  const left = goal.target_cents - saved;
  const avg = w.avg_weekly_savings_cents;
  const eta = reached
    ? 'You did it! 🎉 Ask a grown-up to take it out'
    : avg > 0
      ? `about ${plural(Math.ceil(left / avg), 'week')} to go`
      : 'Save a little each week to get there';
  return (
    <HomeSection title="My goal">
      <Link to={`/money/${meId}`} className="block rounded-2xl border border-line bg-surface p-4 shadow-sm transition active:scale-[0.99]">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">{goal.emoji || '🎯'}</span>
          <span className="min-w-0 flex-1 truncate text-lg font-bold">{goal.title}</span>
        </div>
        <ProgressBar
          className="mt-3"
          value={Math.min(saved, goal.target_cents)}
          max={goal.target_cents}
          tone={reached ? 'good' : 'accent'}
          label={`Saved for ${goal.title}`}
          valueText={`${money(saved, currency)} of ${money(goal.target_cents, currency)}`}
        />
        <p className="mt-2 text-[15px]">
          <span className="font-semibold tabular-nums">{money(saved, currency)} of {money(goal.target_cents, currency)}</span>
          <span className="text-muted"> · {eta}</span>
        </p>
      </Link>
    </HomeSection>
  );
}
