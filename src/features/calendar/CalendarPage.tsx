import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Card, EmptyState, Icon, PageHeader, Segmented, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { addDays, dateInTz, todayISO } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { EventKind, EventOccurrence } from '../../lib/types';
import { EventRow } from './EventRow';
import { EventEditSheet, EventViewSheet } from './EventSheets';
import { dayHeading, isForMember } from './events';
import { zonedTimeToIso } from './tz';

const DAYS_AHEAD = 60;
const DAYS_BACK = 30;
const KINDS: EventKind[] = ['event', 'reminder', 'birthday'];

type Scope = 'mine' | 'all';
interface Editing { occ: EventOccurrence | null; kind: EventKind }

function groupByDay(list: EventOccurrence[], tz: string): [string, EventOccurrence[]][] {
  const sorted = [...list].sort((a, b) => Date.parse(a.occurs_at) - Date.parse(b.occurs_at));
  const map = new Map<string, EventOccurrence[]>();
  for (const o of sorted) {
    const day = dateInTz(o.occurs_at, tz);
    const arr = map.get(day);
    if (arr) arr.push(o);
    else map.set(day, [o]);
  }
  return [...map.entries()];
}

const occKey = (o: EventOccurrence) => `${o.source}:${o.id}:${o.occurs_at}`;

export default function CalendarPage() {
  const { me, family, now, refresh } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const meId = me?.id ?? '';
  const [params, setParams] = useSearchParams();
  const addParam = params.get('add');
  const [scope, setScope] = useState<Scope>('all');
  const [showEarlier, setShowEarlier] = useState(false);
  const [viewing, setViewing] = useState<EventOccurrence | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  // Home's "Add reminder" links to /calendar?add=reminder → open the add sheet straight away.
  const addKind: EventKind | null = addParam ? (KINDS.includes(addParam as EventKind) ? (addParam as EventKind) : 'event') : null;
  const activeEdit: Editing | null = editing ?? (addKind ? { occ: null, kind: addKind } : null);
  const closeEdit = () => {
    setEditing(null);
    if (addParam) setParams((p) => { p.delete('add'); return p; }, { replace: true });
  };

  const nowDate = now();
  const today = todayISO(tz, nowDate);
  const fromIso = zonedTimeToIso(today, '00:00', tz);
  const toIso = zonedTimeToIso(addDays(today, DAYS_AHEAD), '00:00', tz);
  const upcoming = useLoad(() => api.listEvents(fromIso, toIso), [fromIso, toIso]);
  const earlier = useLoad(
    () => (showEarlier
      ? api.listEvents(zonedTimeToIso(addDays(today, -DAYS_BACK), '00:00', tz), fromIso)
      : Promise.resolve([] as EventOccurrence[])),
    [showEarlier, fromIso],
  );

  const reloadAll = () => {
    void upcoming.reload();
    if (showEarlier) void earlier.reload();
    void refresh();
  };

  const visible = (list: EventOccurrence[] | undefined) =>
    (list ?? []).filter((o) => scope === 'all' || isForMember(o, meId));
  const days = groupByDay(visible(upcoming.data), tz);
  const pastDays = groupByDay(visible(earlier.data).filter((o) => dateInTz(o.occurs_at, tz) < today), tz);

  const renderDays = (list: [string, EventOccurrence[]][]) => (
    <div className="space-y-4">
      {list.map(([date, items]) => (
        <section key={date} aria-labelledby={`day-${date}`}>
          <h2
            id={`day-${date}`}
            className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-10 -mx-4 bg-bg/95 px-5 py-2 text-[15px] font-bold backdrop-blur"
          >
            {dayHeading(date, tz, nowDate)}
          </h2>
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            {items.map((o) => <EventRow key={occKey(o)} occ={o} onClick={() => setViewing(o)} />)}
          </Card>
        </section>
      ))}
    </div>
  );

  const openAdd = () => setEditing({ occ: null, kind: 'event' });

  return (
    <>
      <PageHeader
        title="Calendar"
        right={<Button size="sm" icon="plus" onClick={openAdd}>Add</Button>}
      />

      <Segmented<Scope>
        label="Whose plans"
        value={scope}
        onChange={setScope}
        options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]}
        className="mb-3"
      />

      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          variant="ghost" size="sm" icon={showEarlier ? 'chevron-down' : 'clock'}
          aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)}
        >
          {showEarlier ? 'Hide earlier' : 'Show earlier'}
        </Button>
        {upcoming.loading && upcoming.data && <Spinner label="Updating" />}
      </div>

      {showEarlier && (
        <section aria-label="Earlier (last 30 days)" className="mb-6">
          <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-muted">Earlier · last {DAYS_BACK} days</h2>
          {earlier.loading && !earlier.data ? (
            <AgendaSkeleton rows={2} />
          ) : earlier.error && !earlier.data ? (
            <LoadErrorCard message={earlier.error} onRetry={earlier.reload} />
          ) : pastDays.length === 0 ? (
            <p className="px-1 text-[15px] text-muted">Nothing in the last {DAYS_BACK} days.</p>
          ) : (
            <div className="opacity-80">{renderDays(pastDays)}</div>
          )}
        </section>
      )}

      {upcoming.loading && !upcoming.data ? (
        <AgendaSkeleton rows={4} />
      ) : upcoming.error && !upcoming.data ? (
        <LoadErrorCard message={upcoming.error} onRetry={upcoming.reload} />
      ) : days.length === 0 ? (
        scope === 'mine' && (upcoming.data?.length ?? 0) > 0 ? (
          <EmptyState emoji="📅" title={`Nothing for you in the next ${DAYS_AHEAD} days.`} message="Switch to Everyone to see the whole family’s plans." />
        ) : (
          <EmptyState
            emoji="📅"
            title="Nothing planned yet"
            message="Add a birthday, a match or a reminder."
            action={<Button icon="plus" onClick={openAdd}>Add</Button>}
          />
        )
      ) : (
        renderDays(days)
      )}

      {upcoming.data && <p className="py-6 text-center text-[14px] text-muted">Showing the next {DAYS_AHEAD} days.</p>}

      {viewing && !activeEdit && (
        <EventViewSheet
          occurrence={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing({ occ: viewing, kind: viewing.kind }); setViewing(null); }}
          onChanged={reloadAll}
        />
      )}
      {activeEdit && (
        <EventEditSheet
          key={activeEdit.occ ? occKey(activeEdit.occ) : `new-${activeEdit.kind}`}
          occurrence={activeEdit.occ}
          initialKind={activeEdit.kind}
          onClose={closeEdit}
          onSaved={reloadAll}
        />
      )}
    </>
  );
}

function AgendaSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="h-5 w-40 motion-safe:animate-pulse rounded bg-surface-2" />
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
            <div className="size-11 motion-safe:animate-pulse rounded-2xl bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 motion-safe:animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-1/3 motion-safe:animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function LoadErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card tone="bad" role="alert" className="flex items-start gap-3">
      <Icon name="alert" className="mt-0.5 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">We couldn’t load the calendar.</p>
        <p className="text-[15px] text-muted">{message}</p>
        <Button variant="secondary" size="sm" className="mt-2" icon="reset" onClick={onRetry}>Try again</Button>
      </div>
    </Card>
  );
}
