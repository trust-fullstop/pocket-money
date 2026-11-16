import { Card, ListRow } from '../../components/ui';
import { api } from '../../lib/api';
import { toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { formatDate } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { EventOccurrence, Member, TaskInstance } from '../../lib/types';
import { ComingUp, Greeting, HomeSection, KidGlanceCard } from './shared';
import { eventsWindow, progressByMember } from './lib';

export default function GrandparentHome() {
  const { me, family, state } = useApp();
  if (!me || !family || !state) return null;
  return <GrandparentHomeInner me={me} today={state.today} tz={family.timezone} stamp={state.now} />;
}

function GrandparentHomeInner({ me, today, tz, stamp }: { me: Member; today: string; tz: string; stamp: string }) {
  const { state, members } = useApp();
  const features = useFeatures();
  const calendarOn = features.on('calendar');
  const [from, to] = eventsWindow(today, tz);
  // `list: null` = not allowed to see tasks → hide the tasks line but keep the gift buttons (when Spotted is on).
  const insts = useLoad(
    () => api.listInstances(today, today).then(
      (list): { list: TaskInstance[] | null } => ({ list }),
      (e: unknown) => {
        if (toAppError(e).code === 'not_allowed') return { list: null };
        throw e;
      },
    ),
    [today, stamp],
  );
  const events = useLoad(
    () => (calendarOn ? api.listEvents(from, to) : Promise.resolve([] as EventOccurrence[])),
    [from, to, stamp, calendarOn],
  );
  const kids = members.filter((m) => m.role === 'kid');
  const progress = insts.data?.list ? progressByMember(insts.data.list) : null;

  return (
    <>
      <Greeting hello="Hello" name={me.display_name} sub={formatDate(today, { long: true })} />

      <HomeSection title="The kids today">
        {kids.length === 0 ? (
          <Card className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">🧸</span>
            <p className="font-semibold">No kids to cheer on yet</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {kids.map((k) => (
              <KidGlanceCard
                key={k.id}
                kid={k}
                mode="grandparent"
                balances={state?.balances[k.id]}
                progress={
                  progress ? (progress[k.id] ?? { done: 0, total: 0, waiting: 0, open: 0 })
                    : insts.data || insts.error ? null
                      : undefined
                }
              />
            ))}
          </div>
        )}
      </HomeSection>

      <ComingUp events={events} max={5} />

      {features.on('challenges') && (
        <Card padded={false} className="mt-6 overflow-hidden">
          <ListRow
            to="/tasks/new"
            left={<span className="grid size-11 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">🏆</span>}
            title="Make a fun challenge"
            subtitle="Promise a reward for something special"
          />
        </Card>
      )}
    </>
  );
}
