// Family rules → 🎓 Money school reward: lessons the kids finished before there was a value (or while it was 0) and never
// got money for. "Reward them now" pays them all at today's value, into the Wallet now, so it lands in this pay-out.
// The total the parent saw is sent along; when it changed meanwhile the server says wrong_status and the new amounts show.
import { useRef, useState } from 'react';
import { Button, FxNote, Icon, Sheet, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { money } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { LessonRewardsDue } from '../../lib/types';

const CHANGED = 'The amounts just changed — here are the new ones.';
const lessons = (n: number) => `${n} lesson${n === 1 ? '' : 's'}`;

/**
 * Under the reward field. `saved` = the stored value per lesson (cents); `changed` = the field differs from it (not saved).
 */
export function PastLessonRewards({ saved, changed }: { saved: number; changed: boolean }) {
  const { family, membersById, refresh } = useApp();
  const cur = family?.currency ?? 'EUR';
  const q = useLoad(api.lessonRewardsDue, [saved]);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const data = q.data;
  const kids = (data?.kids ?? []).filter((k) => k.count > 0 && membersById[k.member_id]);
  const count = kids.reduce((s, k) => s + k.count, 0);
  const nameOf = (id: string) => membersById[id]?.display_name ?? 'A child';
  const summary = kids.map((k) => `${nameOf(k.member_id)} ${lessons(k.count)}`).join(' · ');

  if (!data) {
    return q.error ? (
      <div className="flex flex-wrap items-center justify-between gap-2 text-[15px] text-muted" role="alert">
        <span>Couldn’t check earlier lessons. {q.error}</span>
        <Button size="sm" variant="secondary" icon="reset" onClick={() => void q.reload()}>Try again</Button>
      </div>
    ) : null;
  }

  if (saved <= 0) {
    return (
      <p className="rounded-xl bg-surface-2 p-3 text-[15px]">
        {count > 0
          ? <>Finished before: {summary}. Set an amount and save, then you can reward those lessons too.</>
          : <>Lessons finished before you set an amount can be rewarded later, once you set one.</>}
      </p>
    );
  }
  if (count === 0) return null;
  if (changed) {
    return (
      <p className="rounded-xl bg-surface-2 p-3 text-[15px]">
        Finished before, not rewarded yet: {summary}. Save the new amount first, then reward them.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl bg-accent-soft p-3">
      <p className="text-[15px] font-semibold">Finished before, not rewarded yet: {summary}</p>
      {notice && <p role="status" className="text-[15px] font-semibold text-warn">{notice}</p>}
      <Button block onClick={() => { setNotice(null); setOpen(true); }}>
        Reward them now (+{money(data.total_cents, cur, { whole: true })} total)
      </Button>
      {open && (
        <RewardSheet
          data={{ ...data, kids }} nameOf={nameOf} cur={cur}
          onClose={() => setOpen(false)}
          onChanged={async () => { await Promise.all([q.reload(), refresh()]); setNotice(CHANGED); }}
          onDone={async () => { setOpen(false); await Promise.all([q.reload(), refresh()]); }}
        />
      )}
    </div>
  );
}

function RewardSheet({ data, nameOf, cur, onClose, onChanged, onDone }: {
  data: LessonRewardsDue; nameOf: (id: string) => string; cur: string;
  onClose: () => void; onChanged: () => Promise<void>; onDone: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const whole = (c: number) => money(c, cur, { whole: true });
  const count = data.kids.reduce((s, k) => s + k.count, 0);

  const give = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.rewardPastLessons(data.total_cents);
      toast.show(r.rewarded > 0 ? `Rewarded ${lessons(r.rewarded)}: +${whole(r.total_cents)} ✅` : 'Nothing left to reward.', 'success');
      await onDone();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'wrong_status') {
        await onChanged();
        setError(CHANGED);
      } else {
        setError(friendlyError(e));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Reward ${lessons(count)} now?`}
      description="It goes into their Wallet now and shows in this pay-out. Each lesson is only ever rewarded once."
      footer={
        <div className="space-y-2">
          <Button size="lg" block loading={busy} disabled={data.total_cents <= 0} onClick={() => void give()}>
            Yes, give +{whole(data.total_cents)}
          </Button>
          <Button variant="secondary" block onClick={onClose} disabled={busy}>Not now</Button>
        </div>
      }
    >
      <div className="space-y-3 pt-1 text-[16px]">
        <ul className="space-y-1.5">
          {data.kids.map((k) => (
            <li key={k.member_id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">{nameOf(k.member_id)}</span>
              <span className="tabular-nums">
                {lessons(k.count)} × {whole(k.cents_each)} = <strong>{whole(k.total_cents)}</strong>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-2 font-bold">
          <span>Total</span>
          <span className="tabular-nums">+{whole(data.total_cents)} <FxNote cents={data.total_cents} currency={cur} className="font-normal" /></span>
        </p>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 font-semibold">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />{error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
