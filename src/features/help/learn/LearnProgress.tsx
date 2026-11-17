// /help/learn/progress — for parents: which Money school lessons each kid finished, and when.
import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { Avatar, Button, Card, EmptyState, Icon, PageHeader, PageSpinner, ProgressBar, Section } from '../../../components/ui';
import { formatDate, dateInTz } from '../../../lib/format';
import { useApp } from '../../../lib/session';
import { coreProgress } from './catalog';
import { useLessonCtx, useLessonsDone } from './useLearn';

export default function LearnProgress() {
  const { isManager, members, family } = useApp();
  const ctx = useLessonCtx();
  const { data, error, reload } = useLessonsDone();
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
        const p = coreProgress(ctx.on, data, kid.id);
        const when = new Map(data.filter((r) => r.member_id === kid.id).map((r) => [r.lesson, r.done_at]));
        return (
          <Section key={kid.id} title={<span className="flex items-center gap-2"><Avatar member={kid} size="sm" />{kid.display_name}</span>}>
            <Card className="space-y-3">
              <ProgressBar
                label={`${kid.display_name}’s lessons`} showLabel valueText={`${p.count} of ${p.total} done`}
                value={p.count} max={p.total} tone={p.count === p.total && p.total > 0 ? 'good' : 'accent'} size="sm"
              />
              <ul className="divide-y divide-line">
                {p.list.map((l) => {
                  const at = when.get(l.id);
                  return (
                    <li key={l.id} className="flex min-h-12 items-center gap-3 py-2">
                      <span className="text-xl" aria-hidden="true">{l.emoji}</span>
                      <span className="min-w-0 flex-1 font-semibold leading-snug">{l.title}</span>
                      {at ? (
                        <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-good">
                          <Icon name="check" size={16} strokeWidth={3} />
                          Done <span className="font-normal text-muted">{formatDate(dateInTz(at, tz))}</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-[14px] text-muted">Not yet</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        );
      })}
    </div>
  );
}
