// Savings goals: progress = savings balance / target, ETA from the average weekly savings.
// GoalsSection (inside the wallet), GoalSheet (create/edit/archive) and GoalsPage (/money/:memberId/goals).
import { useState } from 'react';
import { useParams } from 'react-router';
import { Avatar, Button, Card, EmojiGrid, EmptyState, Input, PageHeader, PageSpinner, ProgressBar, Sheet, AmountInput, useConfirm, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Goal } from '../../lib/types';
import { isManager } from '../../lib/types';
import { clip, goalEtaText, goalProgress, isStale, moneyError, useData } from './moneyUtils';
import { CardTitle, LoadFailed, NotForYou, SheetActions } from './parts';

const GOAL_EMOJIS = ['🎯', '🚲', '🎮', '⚽', '🧸', '📚', '🎨', '🎧', '👟', '🛹', '🐶', '🍦', '🎟️', '🏕️', '📱', '🎸', '🦄', '🧱', '🎁', '✈️'];

export interface GoalsSectionProps {
  goals: Goal[];
  savings: number;
  avgWeekly: number;
  memberId: string;
  self: boolean;
  name: string;
  canEdit: boolean;
  cur: string;
  onChanged: () => Promise<void>;
}

export function GoalsSection({ goals, savings, avgWeekly, memberId, self, name, canEdit, cur, onChanged }: GoalsSectionProps) {
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  const list = goals.filter((g) => !g.archived);
  if (!canEdit && list.length === 0) return null;
  return (
    <Card role="region" aria-labelledby="goals-title">
      <CardTitle
        id="goals-title"
        right={canEdit && list.length > 0 ? <Button size="sm" variant="secondary" icon="plus" onClick={() => setEdit('new')}>New goal</Button> : undefined}
      >
        <span aria-hidden="true">🎯 </span>{self ? 'Saving for' : `${name} is saving for`}
      </CardTitle>
      {list.length === 0 ? (
        <EmptyState
          emoji="🎯" title="No goals yet" message={self ? 'Pick something to save for.' : `Help ${name} pick something to save for.`}
          action={<Button icon="plus" onClick={() => setEdit('new')}>New goal</Button>}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {list.map((g) => (
              <li key={g.id}><GoalRow goal={g} savings={savings} avgWeekly={avgWeekly} self={self} name={name} cur={cur} onEdit={canEdit ? () => setEdit(g) : undefined} /></li>
            ))}
          </ul>
          {list.length > 1 && <p className="mt-2 text-[13px] text-muted">All goals use the same savings{self ? '' : ` (${money(Math.max(0, savings), cur)})`}.</p>}
        </>
      )}
      {edit && (
        <GoalSheet goal={edit === 'new' ? null : edit} memberId={memberId} self={self} name={name} onClose={() => setEdit(null)} onChanged={onChanged} />
      )}
    </Card>
  );
}

function GoalRow({ goal, savings, avgWeekly, self, name, cur, onEdit }: {
  goal: Goal; savings: number; avgWeekly: number; self: boolean; name: string; cur: string; onEdit?: () => void;
}) {
  const p = goalProgress(goal.target_cents, savings, avgWeekly);
  const have = Math.min(Math.max(0, savings), goal.target_cents);
  const body = (
    <>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">{goal.emoji || '🎯'}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-bold">{goal.title}</span>
          <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-muted">{money(have, cur)} of {money(goal.target_cents, cur)}</span>
        </span>
        <ProgressBar
          className="mt-1.5" value={have} max={goal.target_cents} tone={p.reached ? 'good' : 'accent'}
          label={`${goal.title} progress`} valueText={`${money(have, cur)} of ${money(goal.target_cents, cur)}`}
        />
        <span className="mt-1 block text-[14px] text-muted">
          {p.reached ? '' : `${money(p.left, cur)} to go · `}{goalEtaText(p, self, name)}
        </span>
      </span>
    </>
  );
  if (!onEdit) return <div className="flex items-start gap-3 rounded-2xl border border-line/70 p-3">{body}</div>;
  return (
    <button
      type="button" onClick={onEdit} aria-label={`${goal.title}: ${money(have, cur)} of ${money(goal.target_cents, cur)}. Edit goal`}
      className="flex w-full items-start gap-3 rounded-2xl border border-line/70 p-3 transition hover:bg-surface-2 active:bg-surface-2"
    >
      {body}
    </button>
  );
}

export function GoalSheet({ goal, memberId, self, name, onClose, onChanged }: {
  goal: Goal | null; memberId: string; self: boolean; name: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [emoji, setEmoji] = useState(goal?.emoji || '🎯');
  const [target, setTarget] = useState<number | null>(goal?.target_cents ?? null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'archive' | null>(null);
  const titleErr = tried && !title.trim() ? 'What are you saving for?' : undefined;
  const targetErr = tried && !(target && target > 0) ? 'How much does it cost?' : undefined;
  const emojis = GOAL_EMOJIS.includes(emoji) ? GOAL_EMOJIS : [emoji, ...GOAL_EMOJIS];

  const save = async () => {
    setTried(true);
    if (!title.trim() || !(target && target > 0)) return;
    setBusy('save');
    setError(null);
    try {
      await api.upsertGoal({ id: goal?.id ?? null, member_id: self ? null : memberId, title: clip(title, 60), target_cents: target, emoji });
      toast.show(goal ? 'Goal saved 🎯' : `New goal: ${clip(title, 60)} ${emoji}`, 'success');
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
    if (!goal) return;
    const ok = await confirm({
      title: `Remove “${goal.title}”?`, message: 'The savings stay where they are. Only the goal goes away.', confirmLabel: 'Remove goal', danger: true,
    });
    if (!ok) return;
    setBusy('archive');
    setError(null);
    try {
      await api.archiveGoal(goal.id);
      toast.show('Goal removed', 'success');
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
      open onClose={onClose} title={goal ? 'Edit goal' : 'New goal'}
      description={self ? 'Your savings count towards it.' : `${name}’s savings count towards it.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy === 'save'} disabled={busy === 'archive'} onClick={save}>{goal ? 'Save' : 'Add goal'}</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <Input
          label={self ? 'What are you saving for?' : `What is ${name} saving for?`} value={title} maxLength={60}
          placeholder="A new bike" onChange={(e) => setTitle(e.target.value)} error={titleErr} autoComplete="off"
        />
        <EmojiGrid label="Pick a picture" options={emojis} value={emoji} onChange={setEmoji} />
        <AmountInput kind="money" label="It costs" value={target} onChange={setTarget} max={10_000_000} error={targetErr} />
        {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>}
        {goal && (
          <Button variant="ghost" icon="trash" className="text-bad" loading={busy === 'archive'} disabled={busy === 'save'} onClick={archive}>
            Remove this goal
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/** /money/:memberId/goals — all goals of one wallet with add / edit / remove. */
export function GoalsPage() {
  const { memberId = '' } = useParams();
  const { me, membersById, isManager: amManager, refresh, family } = useApp();
  const w = useData(() => api.wallet(memberId, 0), [memberId]);
  const [adding, setAdding] = useState(false);
  const member = w.data?.member ?? membersById[memberId];
  const self = me?.id === memberId;
  const name = member?.display_name ?? 'this child';
  const canEdit = self || (amManager && member?.role === 'kid');
  const cur = family?.currency ?? 'EUR';
  const changed = async () => { await Promise.all([refresh(), w.reload()]); };

  if (w.loading) return <PageSpinner />;
  if (w.code === 'not_allowed') return <NotForYou />;
  if (!w.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Goals" back={`/money/${memberId}`} />
        <LoadFailed message={w.error} onRetry={w.reload} />
      </div>
    );
  }
  const goals = w.data.goals.filter((g) => !g.archived);
  return (
    <div className="space-y-4">
      <PageHeader
        title={self ? 'My goals' : `${name}’s goals`} back={`/money/${memberId}`}
        subtitle={<span className="inline-flex items-center gap-1.5">{member && !isManager(member.role) && <Avatar member={member} size="xs" />}Savings: {money(Math.max(0, w.data.balances.savings), cur)}</span>}
        right={canEdit && goals.length > 0 ? <Button size="sm" icon="plus" onClick={() => setAdding(true)}>New</Button> : undefined}
      />
      <GoalsSection
        goals={goals} savings={w.data.balances.savings} avgWeekly={w.data.avg_weekly_savings_cents} memberId={memberId}
        self={self} name={name} canEdit={canEdit} cur={cur} onChanged={changed}
      />
      {!canEdit && goals.length === 0 && <EmptyState emoji="🎯" title="No goals yet" message={`${name} hasn’t picked anything to save for.`} />}
      {adding && <GoalSheet goal={null} memberId={memberId} self={self} name={name} onClose={() => setAdding(false)} onChanged={changed} />}
      <div className="h-16" aria-hidden="true" />
    </div>
  );
}
