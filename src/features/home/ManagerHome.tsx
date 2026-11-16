import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Icon, LinkButton, cx } from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { formatDate, plural } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { EventOccurrence, Member, TaskInstance } from '../../lib/types';
import { EventEditSheet } from '../calendar/EventSheets';
import { ComingUp, FamilyTaskRow, Greeting, HomeSection, KidGlanceCard, Loaded } from './shared';
import { eventsWindow, progressByMember } from './lib';

export default function ManagerHome() {
  const { me, family, state } = useApp();
  if (!me || !family || !state) return null;
  return <ManagerHomeInner me={me} today={state.today} tz={family.timezone} stamp={state.now} />;
}

function ManagerHomeInner({ me, today, tz, stamp }: { me: Member; today: string; tz: string; stamp: string }) {
  const { state, members, refresh } = useApp();
  const features = useFeatures();
  const calendarOn = features.on('calendar');
  const [from, to] = eventsWindow(today, tz);
  const insts = useLoad(() => api.listInstances(today, today), [today, stamp]);
  const events = useLoad(
    () => (calendarOn ? api.listEvents(from, to) : Promise.resolve([] as EventOccurrence[])),
    [from, to, stamp, calendarOn],
  );
  const [addReminder, setAddReminder] = useState(false);
  const kids = members.filter((m) => m.role === 'kid');
  const progress = insts.data ? progressByMember(insts.data) : null;

  return (
    <>
      <Greeting name={me.display_name} sub={formatDate(today, { long: true })} />

      <WaitingBanner
        approvals={state?.counts.approvals ?? 0}
        requests={features.on('requests') ? state?.counts.requests ?? 0 : 0}
      />

      <HomeSection title="Kids at a glance">
        {kids.length === 0 ? (
          <Card>
            <EmptyState
              className="!py-4"
              emoji="👋"
              title="No kids yet"
              message="Add a child so they can start earning."
              action={<LinkButton to="/family/add" icon="plus">Add a child</LinkButton>}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {kids.map((k) => (
              <KidGlanceCard
                key={k.id}
                kid={k}
                mode="manager"
                balances={state?.balances[k.id]}
                progress={progress ? (progress[k.id] ?? { done: 0, total: 0, waiting: 0, open: 0 }) : insts.error ? null : undefined}
              />
            ))}
          </div>
        )}
      </HomeSection>

      <HomeSection title="Today across the family" link={{ to: '/tasks', label: 'See all' }}>
        <Loaded load={insts} rows={3}>
          {(list) => <FamilyToday list={list} />}
        </Loaded>
      </HomeSection>

      <ComingUp events={events} max={5} />

      <div className={cx('mt-6 grid gap-2', calendarOn ? 'grid-cols-2' : 'grid-cols-1')}>
        <LinkButton to="/tasks/new" icon="plus" size="lg" block>New task</LinkButton>
        {calendarOn && (
          <Button variant="secondary" icon="bell" size="lg" block onClick={() => setAddReminder(true)}>Add reminder</Button>
        )}
      </div>

      {addReminder && calendarOn && (
        <EventEditSheet
          occurrence={null}
          initialKind="reminder"
          onClose={() => setAddReminder(false)}
          onSaved={() => { void events.reload(); void refresh(); }}
        />
      )}
    </>
  );
}

function WaitingBanner({ approvals, requests }: { approvals: number; requests: number }) {
  if (approvals + requests === 0) {
    return (
      <p className="mt-4 flex min-h-11 items-center gap-2 rounded-2xl bg-good-soft px-4 font-semibold text-good">
        <Icon name="check" size={20} /> All caught up
      </p>
    );
  }
  const parts = [
    approvals > 0 ? plural(approvals, 'task') + ' to check' : '',
    requests > 0 ? plural(requests, 'request') : '',
  ].filter(Boolean);
  return (
    <Card className="mt-4 border-warn/50 bg-warn-soft" role="region" aria-label="Waiting for you">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <span aria-hidden="true">⏳</span> Waiting for you
      </h2>
      <p className="mt-0.5 text-[15px] font-semibold">{parts.join(' · ')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {approvals > 0 && <LinkButton to="/tasks/approvals" icon="check">Check tasks</LinkButton>}
        {requests > 0 && <LinkButton to="/money/requests" variant="secondary" icon="money">See requests</LinkButton>}
      </div>
    </Card>
  );
}

function FamilyToday({ list }: { list: TaskInstance[] }) {
  const active = list
    .filter((i) => i.status === 'open' || i.status === 'submitted')
    .sort((a, b) => {
      const pa = a.status === 'submitted' && a.can_decide ? 0 : 1;
      const pb = b.status === 'submitted' && b.can_decide ? 0 : 1;
      return pa - pb || a.due_at.localeCompare(b.due_at);
    });
  const done = list.filter((i) => i.status === 'approved').length;

  if (list.length === 0) {
    return (
      <Card>
        <EmptyState
          className="!py-4"
          emoji="🌤️"
          title="Nothing due today"
          action={<LinkButton to="/tasks/new" variant="secondary" icon="plus">New task</LinkButton>}
        />
      </Card>
    );
  }
  if (active.length === 0) {
    return (
      <Card className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">🎉</span>
        <p className="font-semibold">Everything for today is done or checked.</p>
      </Card>
    );
  }
  return (
    <Card padded={false} className="divide-y divide-line overflow-hidden">
      {active.slice(0, 6).map((i) => <FamilyTaskRow key={i.id} inst={i} />)}
      <div className="flex items-center justify-between gap-2 px-4 py-2 text-[14px] text-muted">
        <span>{active.length > 6 ? `${active.length - 6} more to do` : `${plural(active.length, 'task')} still to go`}</span>
        {done > 0 && <Badge tone="good">{done} done</Badge>}
      </div>
    </Card>
  );
}
