// Parents look at the kids' proud moments ("Look what I did ⭐"): ⭐ Reward (the family's Spotted rule, or a different
// amount with a short note), Thanks! 💛 (nothing posted) or Let's talk 💬 (a note is needed).
// ProudCheckList is shared by /money/proud/check and the top of Tasks → Check.
import { useState } from 'react';
import { useLocation } from 'react-router';
import {
  AmountInput, Avatar, Badge, Button, Card, EmptyState, LinkButton, PageHeader, PageSpinner, Segmented, Sheet, Textarea, cx, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { useApp } from '../../lib/session';
import { familySpotRules, type Initiative, type InitiativeDecision, type SpotAmount } from '../../lib/types';
import { clip, isFeatureOff, isStale, moneyError, rewardWords, useData, useDelayed, useReloadOn, whenText } from './moneyUtils';
import { LoadFailed, NotForYou, PhotoSheet, QuickChips, SheetActions, SkeletonRows, TxPhoto } from './parts';

const THANKS_NOTES = ['We noticed, thank you!', 'That was really kind 💛', 'Well done!'];
const TALK_NOTES = ['Let’s talk about it tonight', 'Ask first next time, okay?', 'Great idea — let’s do it together'];

/** Friendly error for a decision; "wrong_status" means another grown-up was quicker. */
function decideError(e: unknown): string {
  return toAppError(e).code === 'wrong_status' ? 'Someone already looked at this.' : moneyError(e);
}

/** /money/proud/check — every kid's waiting proud moments, and the ones decided earlier. */
export function ProudCheckPage() {
  const { me, isManager } = useApp();
  const { hash } = useLocation();
  const [view, setView] = useState<'waiting' | 'done'>(hash === '#earlier' ? 'done' : 'waiting');
  if (!me) return <PageSpinner />;
  if (!isManager) {
    return <NotForYou message="Parents look at the proud moments." action={<LinkButton to="/money/proud" icon="star">My proud moments</LinkButton>} />;
  }
  return (
    <div className="space-y-4">
      <PageHeader title="⭐ Proud moments" back subtitle="Good things the kids did on their own." />
      <Segmented<'waiting' | 'done'>
        label="Show" value={view} onChange={setView}
        options={[{ value: 'waiting', label: 'Waiting' }, { value: 'done', label: 'Earlier' }]}
      />
      {view === 'waiting' ? <ProudCheckList showEmpty /> : <EarlierList />}
      <div className="h-16" aria-hidden="true" />
    </div>
  );
}

/** Waiting proud moments with the decision buttons. Without `showEmpty` it renders nothing when none are waiting. */
export function ProudCheckList({ showEmpty, title }: { showEmpty?: boolean; title?: boolean }) {
  const { refresh, state } = useApp();
  const list = useData(() => api.listInitiatives('waiting'), []);
  const done = useData(() => api.listInitiatives('done'), []);
  const reload = list.reload;
  useReloadOn(state, reload);
  useReloadOn(state, done.reload);
  const skeleton = useDelayed(list.loading);
  const items = (list.data ?? []).filter((i) => i.can_decide);
  // Sibling fairness: what the last few proud moments got.
  const recent = (done.data ?? []).filter((i) => i.status === 'rewarded').slice(0, 3);
  const changed = async () => { await Promise.all([refresh(), list.reload(), done.reload()]); };

  if (list.loading) return showEmpty ? (skeleton ? <SkeletonRows rows={2} /> : <div className="h-24" aria-hidden="true" />) : null;
  if (list.error && !list.data) return <LoadFailed message={list.error} onRetry={list.reload} />;
  if (items.length === 0) {
    return showEmpty ? <Card><EmptyState emoji="🎉" title="All looked at!" message="No proud moments are waiting." /></Card> : null;
  }
  return (
    <section aria-labelledby={title ? 'proud-check-title' : undefined} className="space-y-2">
      {title && (
        <div className="flex min-h-11 items-center justify-between gap-2 px-1">
          <h2 id="proud-check-title" className="text-lg font-bold"><span aria-hidden="true">⭐ </span>Proud moments</h2>
          <LinkButton to="/money/proud/check#earlier" variant="ghost" size="sm">Earlier</LinkButton>
        </div>
      )}
      <ul className={cx('space-y-3', list.refreshing && 'opacity-80')} aria-label="Proud moments waiting for you">
        {items.map((i) => <li key={i.id}><ProudCard item={i} recent={recent} onChanged={changed} /></li>)}
      </ul>
    </section>
  );
}

type SheetMode = 'custom' | 'thanks' | 'talk';

function ProudCard({ item, recent, onChanged }: { item: Initiative; recent: Initiative[]; onChanged: () => Promise<void> }) {
  const { family, membersById, now, refresh } = useApp();
  const features = useFeatures();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(false);
  const kid = membersById[item.member_id];
  const name = kid?.display_name ?? 'They';
  const cur = family?.currency ?? 'EUR';
  const tz = family?.timezone ?? 'Europe/Amsterdam';
  const on = { time: features.on('time'), points: features.on('points') };
  const rule = familySpotRules(family?.settings).reward;
  const ruleOn: SpotAmount = { cents: rule.cents, minutes: on.time ? rule.minutes : 0, points: on.points ? rule.points : 0 };
  const ruleText = rewardWords(ruleOn, cur, true);
  const fair = recent.map((r) => `${membersById[r.member_id]?.display_name ?? 'Someone'} ${rewardWords(
    { cents: r.reward_cents, minutes: r.reward_minutes, points: r.reward_points }, cur)}`);

  const rewardRule = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.decideInitiative(item.id, 'reward', ruleOn);
      toast.show(`${name} got ${ruleText} ⭐`, 'success');
      await onChanged();
    } catch (e) {
      toast.show(decideError(e), 'error');
      if (isStale(e)) await Promise.all([refresh(), onChanged()]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        {kid && <Avatar member={kid} size="md" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold">{name} <span aria-hidden="true">⭐</span></p>
          <p className="text-[13px] text-muted">Proud moment · {whenText(item.created_at, tz, now())}</p>
        </div>
        <Badge tone="warn"><span aria-hidden="true">👀</span>Waiting</Badge>
      </div>
      {item.photo_path && (
        <TxPhoto path={item.photo_path} alt={`${name}’s photo`} className="h-44 w-full" onOpen={() => setBig(true)} />
      )}
      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]">“{item.what}”</p>

      <div className="space-y-1">
        <Button
          block size="lg" loading={busy} className="h-auto min-h-14 whitespace-normal py-2"
          onClick={() => (ruleText ? rewardRule() : setSheet('custom'))}
        >
          <span aria-hidden="true">⭐</span> Reward {ruleText || '…'}
        </Button>
        {fair.length > 0 && (
          <p className="px-1 text-[13px] text-muted">Last {fair.length === 1 ? 'reward' : `${fair.length} rewards`} for proud moments: {fair.join(', ')}</p>
        )}
        <button
          type="button" onClick={() => setSheet('custom')} disabled={busy}
          className="min-h-11 px-1 text-[15px] font-semibold text-accent-ink underline underline-offset-2"
        >
          Different amount
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => setSheet('thanks')}>Thanks! 💛</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setSheet('talk')}>Let’s talk 💬</Button>
      </div>

      {sheet && (
        <DecideSheet
          mode={sheet} item={item} name={name} rule={ruleOn} on={on} cur={cur}
          onClose={() => setSheet(null)} onChanged={onChanged}
        />
      )}
      {big && item.photo_path && <PhotoSheet path={item.photo_path} alt={`${name}’s photo`} onClose={() => setBig(false)} />}
    </Card>
  );
}

function DecideSheet({ mode, item, name, rule, on, cur, onClose, onChanged }: {
  mode: SheetMode; item: Initiative; name: string; rule: SpotAmount; on: { time: boolean; points: boolean }; cur: string;
  onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { refresh } = useApp();
  const toast = useToast();
  const [cents, setCents] = useState<number | null>(rule.cents || null);
  const [mins, setMins] = useState<number | null>(on.time ? rule.minutes || null : null);
  const [pts, setPts] = useState<number | null>(on.points ? rule.points || null : null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt: SpotAmount = { cents: cents ?? 0, minutes: on.time ? mins ?? 0 : 0, points: on.points ? pts ?? 0 : 0 };
  const total = amt.cents + amt.minutes + amt.points;
  const differs = amt.cents !== rule.cents || amt.minutes !== rule.minutes || amt.points !== rule.points;
  const why = note.trim();
  // A different amount than the family rule needs a short note: kids compare (red-team #8).
  const missing = mode === 'custom'
    ? [total <= 0 && 'an amount', differs && !why && 'a short note why'].filter(Boolean) as string[]
    : mode === 'talk' && !why ? ['a note'] : [];
  const decision: InitiativeDecision = mode === 'custom' ? 'reward' : mode;
  const words = rewardWords(amt, cur, true);

  const run = async () => {
    if (busy || missing.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.decideInitiative(item.id, decision, mode === 'custom' ? amt : {}, why ? clip(why, 200) : null);
      toast.show(
        mode === 'custom' ? `${name} got ${words} ⭐` : mode === 'thanks' ? `Said thanks to ${name} 💛` : `${name} will see “Let’s talk about it 💬”`,
        'success',
      );
      onClose();
      await onChanged();
    } catch (e) {
      const msg = decideError(e);
      setError(msg);
      if (isStale(e)) {
        toast.show(msg, 'error');
        onClose();
        await Promise.all([refresh(), onChanged()]);
      } else if (isFeatureOff(e)) await refresh();
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'custom' ? `Reward ${name}` : mode === 'thanks' ? `Thanks to ${name} 💛` : 'Let’s talk 💬';
  const description = mode === 'custom'
    ? 'Choose what they get this time.'
    : mode === 'thanks'
      ? `No reward this time. ${name} sees “Thanks! 💛” and your note.`
      : `${name} sees “Let’s talk about it 💬” and your note. Nothing changes in their money.`;

  return (
    <Sheet
      open onClose={() => !busy && onClose()} title={title} description={description}
      footer={
        <SheetActions onCancel={onClose} note={missing.length > 0 ? `Still needed: ${missing.join(' · ')}` : undefined}>
          <Button size="lg" loading={busy} disabled={missing.length > 0} onClick={run}>
            {mode === 'custom' ? `Reward ${words || ''}`.trim() : mode === 'thanks' ? 'Thanks! 💛' : 'Let’s talk 💬'}
          </Button>
        </SheetActions>
      }
    >
      <div className="space-y-3">
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[16px] [overflow-wrap:anywhere]"><span aria-hidden="true">⭐ </span>“{item.what}”</p>
        {mode === 'custom' && (
          <>
            <AmountInput kind="money" label="Money" optional={on.time || on.points} value={cents} onChange={setCents} max={100_000} chips={[100, 200, 500]} />
            {on.time && <AmountInput kind="time" label="Time" optional value={mins} onChange={setMins} max={1440} chips={[15, 30]} />}
            {on.points && <AmountInput kind="points" label="Points" optional value={pts} onChange={setPts} max={10_000} chips={[5, 10, 20]} />}
          </>
        )}
        <Textarea
          label={mode === 'custom' ? 'Why this amount?' : 'A note for them'}
          optional={mode === 'thanks' || (mode === 'custom' && !differs)}
          rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} error={error ?? undefined}
          hint={mode === 'custom' && differs ? `It differs from the family rule (${rewardWords(rule, cur, true) || 'nothing'}). ${name} will read your note.` : `${name} will read this.`}
        />
        {mode === 'thanks' && <QuickChips label="Quick notes" options={THANKS_NOTES} value={note} onPick={setNote} />}
        {mode === 'talk' && <QuickChips label="Quick notes" options={TALK_NOTES} value={note} onPick={setNote} />}
      </div>
    </Sheet>
  );
}

/** Proud moments decided in the last 90 days (newest first). */
function EarlierList() {
  const { family, membersById, now, me, state } = useApp();
  const list = useData(() => api.listInitiatives('done'), []);
  useReloadOn(state, list.reload);
  const skeleton = useDelayed(list.loading);
  const cur = family?.currency ?? 'EUR';
  const tz = family?.timezone ?? 'Europe/Amsterdam';
  if (list.loading) return skeleton ? <SkeletonRows rows={3} /> : <div className="h-24" aria-hidden="true" />;
  if (list.error && !list.data) return <LoadFailed message={list.error} onRetry={list.reload} />;
  const rows = list.data ?? [];
  if (rows.length === 0) return <Card><EmptyState emoji="🗂️" title="Nothing earlier" message="Proud moments from the last 90 days show up here." /></Card>;
  const label = (i: Initiative) => i.status === 'rewarded'
    ? `⭐ ${rewardWords({ cents: i.reward_cents, minutes: i.reward_minutes, points: i.reward_points }, cur, true)}`
    : i.status === 'thanked' ? '💛 Thanks' : '💬 Let’s talk';
  return (
    <ul className={cx('space-y-2', list.refreshing && 'opacity-80')}>
      {rows.map((i) => {
        const kid = membersById[i.member_id];
        const by = i.decided_by ? (i.decided_by === me?.id ? 'you' : membersById[i.decided_by]?.display_name ?? 'a grown-up') : null;
        return (
          <li key={i.id}>
            <Card className="flex items-start gap-3">
              {kid && <Avatar member={kid} size="sm" />}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] [overflow-wrap:anywhere]"><strong>{kid?.display_name ?? 'Someone'}</strong> · “{i.what}”</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  <span className="font-bold text-ink">{label(i)}</span>
                  {by && i.decided_at && <> · by {by} · {whenText(i.decided_at, tz, now())}</>}
                </p>
                {i.decision_note && <p className="mt-1 text-[14px] italic text-muted [overflow-wrap:anywhere]">“{i.decision_note}”</p>}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
