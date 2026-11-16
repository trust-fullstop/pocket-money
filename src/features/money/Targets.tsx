// Targets: "Do at least 80% of tasks this week → wins €2.00 + 10 points". Prizes are paid automatically.
// TargetsSection (wallet), TargetsPage (/money/:memberId/targets) and TargetSheet (managers add/edit/archive).
import { useState } from 'react';
import { useParams } from 'react-router';
import {
  AmountInput, Badge, Button, Card, EmptyState, Input, LinkButton, PageHeader, PageSpinner, ProgressBar, Segmented, Select, Sheet,
  useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { minutes, money, points } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Target, TargetMetric, TimeLabel } from '../../lib/types';
import { clip, isStale, moneyError, useData } from './moneyUtils';
import { CardTitle, LoadFailed, NotForYou, SheetActions } from './parts';
import { TIME_LABELS, timeLabelWords } from './txMeta';

const METRICS: { value: TargetMetric; label: string }[] = [
  { value: 'completion_pct', label: 'Do this much of the tasks' },
  { value: 'money_earned', label: 'Earn this much money' },
  { value: 'points_earned', label: 'Collect this many points' },
];

type Period = 'week' | 'month';
interface Draft {
  title: string; period: Period; metric: TargetMetric; threshold: number | null;
  prize_cents: number | null; prize_minutes: number | null; prize_points: number | null; prize_text: string; time_label: TimeLabel;
}

const metricValue = (metric: TargetMetric, v: number, cur: string) =>
  metric === 'completion_pct' ? `${v}%` : metric === 'money_earned' ? money(v, cur) : points(v);

function goalWords(d: Pick<Draft, 'metric' | 'threshold' | 'period'>, cur: string): string {
  const per = d.period === 'week' ? 'this week' : 'this month';
  const t = d.threshold ?? 0;
  if (d.metric === 'completion_pct') return `Do at least ${t}% of tasks ${per}`;
  if (d.metric === 'money_earned') return `Earn ${money(t, cur)} ${per}`;
  return `Collect ${points(t)} ${per}`;
}

function prizeParts(d: Pick<Draft, 'prize_cents' | 'prize_minutes' | 'prize_points' | 'prize_text' | 'time_label'>, cur: string): string[] {
  const out: string[] = [];
  if (d.prize_cents) out.push(money(d.prize_cents, cur));
  if (d.prize_minutes) out.push(`${minutes(d.prize_minutes)} ${timeLabelWords(d.time_label)}`);
  if (d.prize_points) out.push(points(d.prize_points));
  if (d.prize_text?.trim()) out.push(d.prize_text.trim());
  return out;
}

function sentence(d: Draft, cur: string): string {
  const prize = prizeParts(d, cur);
  return `${goalWords(d, cur)} → ${prize.length ? `wins ${prize.join(' + ')}` : 'no prize set'}`;
}

const toDraft = (t: Target | null): Draft => ({
  title: t?.title ?? '',
  period: t?.period ?? 'week',
  metric: t?.metric ?? 'completion_pct',
  threshold: t?.threshold ?? 80,
  prize_cents: t?.prize_cents || null,
  prize_minutes: t?.prize_minutes || null,
  prize_points: t?.prize_points || null,
  prize_text: t?.prize_text ?? '',
  time_label: t?.time_label ?? 'fun',
});

/** One target: sentence, progress, period badge, prize chips and last result. */
function TargetItem({ target, cur, onEdit }: { target: Target; cur: string; onEdit?: () => void }) {
  const d = toDraft(target);
  const per = target.period === 'week' ? 'week' : 'month';
  const reached = target.current_value >= target.threshold && target.threshold > 0;
  const prizes = prizeParts(d, cur);
  const body = (
    <span className="block text-left">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-bold leading-snug">{target.title}</span>
        <Badge tone="accent">{target.period === 'week' ? 'Week' : 'Month'}</Badge>
      </span>
      <span className="mt-0.5 block text-[15px] leading-snug">{goalWords(d, cur)}</span>
      <ProgressBar
        className="mt-2" value={Math.min(target.current_value, target.threshold)} max={Math.max(1, target.threshold)} tone={reached ? 'good' : 'accent'}
        label={`${target.title} progress`}
        valueText={`${metricValue(target.metric, target.current_value, cur)} of ${metricValue(target.metric, target.threshold, cur)}`}
      />
      <span className="mt-1 block text-[14px] font-semibold text-muted">
        {metricValue(target.metric, target.current_value, cur)} of {metricValue(target.metric, target.threshold, cur)}{reached ? ' · ✅ Reached!' : ''}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        {prizes.length ? prizes.map((p) => <Badge key={p} tone="good" icon="gift">{p}</Badge>) : <Badge tone="warn" icon="alert">No prize set</Badge>}
      </span>
      {target.last_result && (
        <span className="mt-2 block text-[14px] text-muted">
          {target.last_result.met
            ? `Last ${per}: ✅ Reached`
            : `Last ${per}: not this time — new chance now`}
        </span>
      )}
    </span>
  );
  if (!onEdit) return <div className="rounded-2xl border border-line/70 p-3">{body}</div>;
  return (
    <button
      type="button" onClick={onEdit} aria-label={`${target.title}. ${sentence(d, cur)}. Edit target`}
      className="w-full rounded-2xl border border-line/70 p-3 transition hover:bg-surface-2 active:bg-surface-2"
    >
      {body}
    </button>
  );
}

/** Inside the wallet: active targets; managers get "Edit targets". Hidden when none (non-managers). */
export function TargetsSection({ targets, memberId, canEdit, self, name, cur }: {
  targets: Target[]; memberId: string; canEdit: boolean; self: boolean; name: string; cur: string;
}) {
  const list = targets.filter((t) => t.active);
  if (!canEdit && list.length === 0) return null;
  return (
    <Card role="region" aria-labelledby="targets-title">
      <CardTitle
        id="targets-title"
        right={canEdit ? <LinkButton to={`/money/${memberId}/targets`} size="sm" variant="secondary" icon="edit">Edit targets</LinkButton> : undefined}
      >
        <span aria-hidden="true">🏆 </span>{self ? 'Your targets' : `${name}’s targets`}
      </CardTitle>
      {list.length === 0 ? (
        <p className="text-[15px] text-muted">No targets yet. Add one — the prize is paid automatically when it’s reached.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => <li key={t.id}><TargetItem target={t} cur={cur} /></li>)}
        </ul>
      )}
    </Card>
  );
}

/** /money/:memberId/targets — managers add / edit / archive; everyone else reads. */
export function TargetsPage() {
  const { memberId = '' } = useParams();
  const { me, membersById, isManager, refresh, family } = useApp();
  const w = useData(() => api.wallet(memberId, 0), [memberId]);
  const [edit, setEdit] = useState<Target | 'new' | null>(null);
  const member = w.data?.member ?? membersById[memberId];
  const self = me?.id === memberId;
  const name = member?.display_name ?? 'this child';
  const canEdit = isManager && member?.role === 'kid';
  const cur = family?.currency ?? 'EUR';
  const changed = async () => { await Promise.all([refresh(), w.reload()]); };

  if (w.loading) return <PageSpinner />;
  if (w.code === 'not_allowed') return <NotForYou />;
  if (!w.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Targets" back={`/money/${memberId}`} />
        <LoadFailed message={w.error} onRetry={w.reload} />
      </div>
    );
  }
  const list = w.data.targets.filter((t) => t.active);
  return (
    <div className="space-y-4">
      <PageHeader
        title={self ? 'My targets' : `${name}’s targets`} back={`/money/${memberId}`}
        subtitle={canEdit ? 'Prizes are paid automatically when a target is reached.' : undefined}
        right={canEdit ? <Button size="sm" icon="plus" onClick={() => setEdit('new')}>Add</Button> : undefined}
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🎯" title="No targets yet"
            message={canEdit ? 'Add one — the prize is paid automatically when it’s reached.' : 'When a grown-up sets a target, it shows up here.'}
            action={canEdit ? <Button icon="plus" onClick={() => setEdit('new')}>Add a target</Button> : undefined}
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => <li key={t.id}><TargetItem target={t} cur={cur} onEdit={canEdit ? () => setEdit(t) : undefined} /></li>)}
        </ul>
      )}
      {edit && canEdit && (
        <TargetSheet target={edit === 'new' ? null : edit} memberId={memberId} name={name} cur={cur} onClose={() => setEdit(null)} onChanged={changed} />
      )}
      <div className="h-16" aria-hidden="true" />
    </div>
  );
}

function TargetSheet({ target, memberId, name, cur, onClose, onChanged }: {
  target: Target | null; memberId: string; name: string; cur: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Draft>(() => toDraft(target));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'archive' | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((x) => ({ ...x, [k]: v })); setError(null); };

  const titleErr = tried && !d.title.trim() ? 'Give it a short name.' : undefined;
  const thresholdOk = (d.threshold ?? 0) > 0 && (d.metric !== 'completion_pct' || (d.threshold ?? 0) <= 100);
  const thresholdErr = tried && !thresholdOk ? (d.metric === 'completion_pct' ? 'Pick 1 to 100%.' : 'Must be more than 0.') : undefined;
  const noPrize = prizeParts(d, cur).length === 0;

  const pickMetric = (m: TargetMetric) => setD((x) => ({ ...x, metric: m, threshold: m === 'completion_pct' ? 80 : null }));

  const save = async () => {
    setTried(true);
    if (!d.title.trim() || !thresholdOk) return;
    setBusy('save');
    setError(null);
    try {
      await api.upsertTarget({
        id: target?.id ?? null, member_id: memberId, title: clip(d.title, 80), period: d.period, metric: d.metric,
        threshold: d.threshold ?? 0, prize_cents: d.prize_cents ?? 0, prize_minutes: d.prize_minutes ?? 0, prize_points: d.prize_points ?? 0,
        prize_text: d.prize_text.trim() ? clip(d.prize_text, 120) : null, time_label: d.time_label,
      });
      toast.show(target ? 'Target saved' : `Target added for ${name} 🎯`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      setError(moneyError(e));
      if (isStale(e)) await onChanged();
    } finally {
      setBusy(null);
    }
  };

  const archive = async () => {
    if (!target) return;
    const ok = await confirm({
      title: `Remove “${target.title}”?`, message: 'Prizes already won stay. This target stops counting.', confirmLabel: 'Remove target', danger: true,
    });
    if (!ok) return;
    setBusy('archive');
    try {
      await api.archiveTarget(target.id);
      toast.show('Target removed', 'success');
      await onChanged();
      onClose();
    } catch (e) {
      setError(moneyError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title={target ? 'Edit target' : `New target for ${name}`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy === 'save'} disabled={busy === 'archive'} onClick={save}>{target ? 'Save' : 'Add target'}</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <Input label="Name" value={d.title} maxLength={80} placeholder="Super helper week" onChange={(e) => set('title', e.target.value)} error={titleErr} autoComplete="off" />
        <Segmented<Period>
          label="How long" value={d.period} onChange={(v) => set('period', v)}
          options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]}
        />
        <Select label="Goal" value={d.metric} options={METRICS} onChange={(e) => pickMetric(e.target.value as TargetMetric)} />
        {d.metric === 'completion_pct' ? (
          <Input
            label="How much of the tasks" type="text" inputMode="numeric" suffix="%" value={d.threshold == null ? '' : String(d.threshold)}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); set('threshold', v ? Math.min(100, Number(v)) : null); }}
            error={thresholdErr} hint="1 to 100"
          />
        ) : d.metric === 'money_earned' ? (
          <AmountInput kind="money" label="Earn at least" value={d.threshold} onChange={(v) => set('threshold', v)} max={10_000_000} error={thresholdErr} />
        ) : (
          <AmountInput kind="points" label="Collect at least" value={d.threshold} onChange={(v) => set('threshold', v)} max={10_000_000} chips={[50, 100, 200]} error={thresholdErr} />
        )}

        <fieldset className="space-y-3 rounded-2xl border border-line/70 p-3">
          <legend className="px-1 text-[15px] font-bold"><span aria-hidden="true">🎁 </span>Prize</legend>
          <AmountInput kind="money" label="Money" optional value={d.prize_cents} onChange={(v) => set('prize_cents', v)} max={100_000} chips={[100, 200, 500]} />
          <AmountInput kind="time" label="Time" optional value={d.prize_minutes} onChange={(v) => set('prize_minutes', v)} max={1440} />
          {(d.prize_minutes ?? 0) > 0 && (
            <Segmented<TimeLabel>
              label="Kind of time" value={d.time_label} onChange={(v) => set('time_label', v)}
              options={(Object.keys(TIME_LABELS) as TimeLabel[]).map((k) => ({ value: k, label: `${TIME_LABELS[k].emoji} ${TIME_LABELS[k].label}` }))}
            />
          )}
          <AmountInput kind="points" label="Points" optional value={d.prize_points} onChange={(v) => set('prize_points', v)} max={10_000} chips={[5, 10, 20]} />
          <Input label="Or in words" optional value={d.prize_text} maxLength={120} placeholder="Pick the film on Friday" onChange={(e) => set('prize_text', e.target.value)} />
        </fieldset>

        <div className="rounded-2xl bg-accent-soft px-3.5 py-3 text-accent-ink" aria-live="polite">
          <p className="text-[13px] font-bold uppercase tracking-wide">{name} will see</p>
          <p className="mt-1 text-[16px] font-semibold">{sentence(d, cur)}</p>
        </div>
        {noPrize && <p className="rounded-xl bg-warn-soft px-3 py-2 text-[15px] font-semibold text-warn">⚠️ No prize set. That’s allowed, but a prize makes it fun.</p>}
        {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>}
        {target && (
          <Button variant="ghost" icon="trash" className="text-bad" loading={busy === 'archive'} disabled={busy === 'save'} onClick={archive}>
            Remove this target
          </Button>
        )}
      </div>
    </Sheet>
  );
}
