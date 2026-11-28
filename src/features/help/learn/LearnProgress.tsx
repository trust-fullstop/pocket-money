// /help/learn/progress — for parents: which Money school lessons each kid finished, and when: the basics and each planned
// theme of the lesson plan (and when its next lesson opens), and the Money school reward a lesson paid (+€1).
import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Avatar, Button, Card, EmptyState, Icon, PageHeader, PageSpinner, ProgressBar, Section } from '../../../components/ui';
import { formatDate, dateInTz } from '../../../lib/format';
import { useApp } from '../../../lib/session';
import type { LessonDone } from '../../../lib/types';
import { dayLabel, monthLabel } from './bank';
import { moneySchool, type GroupProgress } from './progress';
import { useLessonCtx, useLessonsDone } from './useLearn';

export default function LearnProgress() {
  const { isManager, members, family } = useApp();
  const ctx = useLessonCtx();
  const { data, error, reload, today, plan } = useLessonsDone();
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  if (!isManager) return <Navigate replace to="/help/learn" />;

  const kids = members.filter((m) => m.role === 'kid');
  const tz = family?.timezone ?? 'UTC';

  return (
    <div className="space-y-6 pb-6">
      <PageHeader title="What the kids learned" subtitle="Money school" back="/help/learn" />

      {data === undefined && !error && <PageSpinner />}
      {data === undefined && error && (
        <Card tone="warn" role="alert" className="space-y-3">
          <p className="font-semibold">Couldn’t load the lessons. {error}</p>
          <Button variant="secondary" icon="reset" onClick={reload}>Try again</Button>
        </Card>
      )}

      {data !== undefined && kids.length === 0 && (
        <EmptyState emoji="🧒" title="No kids yet" message="When kids join the family, you’ll see their lessons here." />
      )}

      {data !== undefined && kids.map((kid) => {
        const when = new Map(data.filter((r) => r.member_id === kid.id).map((r) => [r.lesson, r]));
        const school = moneySchool({ on: ctx.on, rows: data, memberId: kid.id, plan, today });
        return (
          <Section key={kid.id} title={<span className="flex items-center gap-2"><Avatar member={kid} size="sm" />{kid.display_name}</span>}>
            <Card className="space-y-5">
              <LessonGroup title="The basics" label={`${kid.display_name}’s lessons: the basics`} p={school.core} when={when} tz={tz} m={ctx.m} />
              {school.themes.map((s) => (
                <LessonGroup
                  key={s.theme.id}
                  title={<><span aria-hidden="true">{s.theme.emoji} </span>{s.theme.title} <span className="font-semibold text-muted">· {monthLabel(s.month)}</span></>}
                  label={`${kid.display_name}’s lessons: ${s.theme.title}`} p={s} when={when} tz={tz} m={ctx.m}
                  note={s.nextOpening?.openOn
                    ? `${s.openCount === 0 ? 'Opens for the kids on' : 'Next lesson opens on'} ${dayLabel(s.nextOpening.openOn)}.`
                    : undefined}
                />
              ))}
            </Card>
          </Section>
        );
      })}
    </div>
  );
}

function LessonGroup({ title, label, p, when, tz, m, note }: {
  title: ReactNode; label: string; p: GroupProgress; when: Map<string, LessonDone>; tz: string; m: (cents: number) => string; note?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-bold">{title}</h3>
        <span className="shrink-0 text-sm tabular-nums text-muted">{p.count} of {p.total} done</span>
      </div>
      {note && (
        <p className="flex items-center gap-1.5 text-[14px] text-muted">
          <Icon name="lock" size={16} />{note}
        </p>
      )}
      <ProgressBar
        label={label} valueText={`${p.count} of ${p.total} done`}
        value={p.count} max={p.total} tone={p.count === p.total && p.total > 0 ? 'good' : 'accent'} size="sm"
      />
      <ul className="divide-y divide-line">
        {p.lessons.map(({ lesson: l }) => {
          const row = when.get(l.id);
          const paid = row?.money_cents ?? 0;
          return (
            <li key={l.id} className="flex min-h-12 items-center gap-3 py-2">
              <span className="text-xl" aria-hidden="true">{l.emoji}</span>
              <span className="min-w-0 flex-1 font-semibold leading-snug">{l.title}</span>
              {row ? (
                <span className="flex shrink-0 flex-col items-end text-[14px] font-semibold text-good">
                  <span className="flex items-center gap-1">
                    <Icon name="check" size={16} strokeWidth={3} />
                    Done <span className="font-normal text-muted">{formatDate(dateInTz(row.done_at, tz))}</span>
                  </span>
                  {paid > 0 && <span className="tabular-nums"><span className="sr-only">Reward: </span>+{m(paid)}</span>}
                </span>
              ) : (
                <span className="shrink-0 text-[14px] text-muted">Not yet</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
