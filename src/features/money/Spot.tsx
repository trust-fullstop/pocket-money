// /money/spot — Spotted: camera first → who → ➕ Reward / ➖ Consequence → what happened → check → send.
// Spotted is a quick report: for parents the amount comes from the family rules (Family rules → Spotted), shown on the
// check screen and sent exactly as shown; "Different amount this time?" opens the amount fields.
// Grandparents send a 🎁 Gift (money only, they choose the amount). Kids can't open it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  AmountInput, Avatar, Button, Card, EmptyState, LinkButton, MemberPicker, PageHeader, PageSpinner, PhotoCapture, Segmented, Sheet,
  Textarea, cx, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { amount, minutes, money } from '../../lib/format';
import { uploadPhoto } from '../../lib/photos';
import { useHoldUpdates } from '../../lib/updates';
import { useApp } from '../../lib/session';
import { familySpotRules, type Currency, type MoneyLabel, type SpotInput, type TimeLabel, type Transaction, type TxKind } from '../../lib/types';
import { TxRow } from './History';
import { canSeeMoney, clip, isFeatureOff, moneyError } from './moneyUtils';
import { NotForYou, QuickChips, SheetActions } from './parts';
import { MONEY_LABELS, TIME_LABELS } from './txMeta';

type Dir = 'plus' | 'minus';

const PLUS_REASONS = ['Helped without being asked', 'Kind to a sibling', 'Great effort', 'Homework done early', 'Tidy room'];
const MINUS_REASONS = ['Left the bike in the rain', 'Didn’t tidy up', 'Screen after bedtime', 'Unkind words', 'Home late'];
const GIFT_REASONS = ['Just because 💛', 'Well done at school', 'For your savings', 'Happy birthday! 🎂'];
const PLUS_LABELS: MoneyLabel[] = ['reward', 'extra', 'prize'];

export function SpotPage() {
  const { me, family, members, membersById, balancesOf, refresh, isManager, now } = useApp();
  const features = useFeatures();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const kids = useMemo(() => members.filter((m) => m.role === 'kid' && m.id !== me?.id), [members, me?.id]);
  const asked = params.get('member');
  const initialKid = asked && kids.some((k) => k.id === asked) ? asked : kids.length === 1 ? kids[0].id : null;
  const amG = me?.role === 'grandparent';

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [skipPhoto, setSkipPhoto] = useState(false);
  const [kidId, setKidId] = useState<string | null>(initialKid);
  const [dir, setDir] = useState<Dir | null>(amG ? 'plus' : null);
  const [cents, setCents] = useState<number | null>(null);
  const [mins, setMins] = useState<number | null>(null);
  const [pts, setPts] = useState<number | null>(null);
  // Parents: false = the amount comes from the family rules; true = typed in ("Different amount this time?").
  const [custom, setCustom] = useState(false);
  const [moneyLabel, setMoneyLabel] = useState<MoneyLabel>('reward');
  const [timeLabel, setTimeLabel] = useState<TimeLabel>('fun');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<{ blob: Blob; path: string } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  useHoldUpdates(!!(photo || dir || reason.trim() || custom) && !done);

  const choosePhoto = (b: Blob | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = b ? URL.createObjectURL(b) : null;
    setPreview(previewRef.current);
    setPhoto(b);
    setUploaded(null);
    setPhotoFailed(false);
  };

  // Follow ?member= when arriving from another wallet while this page is open.
  const [seenKid, setSeenKid] = useState(initialKid);
  if (seenKid !== initialKid) {
    setSeenKid(initialKid);
    if (initialKid) setKidId(initialKid);
  }

  if (!me || !family) return <PageSpinner />;
  if (me.role === 'kid' || (!isManager && !amG)) {
    return <NotForYou message="Only grown-ups can use Spotted." action={<LinkButton to={`/money/${me.id}`} icon="money">My wallet</LinkButton>} />;
  }

  const cur = family.currency;
  const kid = kidId ? membersById[kidId] : undefined;
  const name = kid?.display_name ?? 'them';
  // Time and points only when those parts are switched on (gifts are money only).
  const timeOn = !amG && features.on('time');
  const pointsOn = !amG && features.on('points');
  const extras = [timeOn && 'time', pointsOn && 'points'].filter(Boolean) as string[];
  // The family rule for the chosen direction (parts that are switched off don't count).
  const rules = familySpotRules(family.settings);
  const rule = dir === 'minus' ? rules.consequence : rules.reward;
  const fromRule = !amG && !custom;
  const ruleTotal = rule.cents + (timeOn ? rule.minutes : 0) + (pointsOn ? rule.points : 0);
  const c = fromRule ? rule.cents : cents ?? 0;
  const m = !timeOn ? 0 : fromRule ? rule.minutes : mins ?? 0;
  const p = !pointsOn ? 0 : fromRule ? rule.points : pts ?? 0;
  const hasAmount = c + m + p > 0;
  const why = reason.trim();
  const missing = [
    !kid && 'who',
    !dir && 'reward or consequence',
    !hasAmount && (fromRule ? 'an amount (set it in Family rules → Spotted, or choose a different amount)'
      : extras.length === 0 ? 'an amount' : extras.length === 1 ? `money or ${extras[0]}` : 'money, time or points'),
    !why && 'what happened',
  ].filter(Boolean) as string[];
  const ready = missing.length === 0;
  const kind: TxKind = amG ? 'gift' : dir === 'minus' ? 'fine' : 'bonus';
  const sign = dir === 'minus' ? -1 : 1;
  const mLabel: MoneyLabel | null = amG ? 'gift' : dir === 'plus' ? moneyLabel : null;

  const parts: { currency: Currency; value: number }[] = [
    { currency: 'money' as const, value: c },
    { currency: 'time' as const, value: m },
    { currency: 'points' as const, value: p },
  ].filter((x) => x.value > 0);
  const signed = parts.map((x) => amount(x.currency, sign * x.value, cur, { sign: true })).join(' · ');
  const ruleSigned = [
    { currency: 'money' as const, value: rule.cents },
    { currency: 'time' as const, value: timeOn ? rule.minutes : 0 },
    { currency: 'points' as const, value: pointsOn ? rule.points : 0 },
  ].filter((x) => x.value > 0).map((x) => amount(x.currency, sign * x.value, cur, { sign: true })).join(' · ');
  const startCustom = () => {
    setCents(rule.cents || null);
    setMins(timeOn ? rule.minutes || null : null);
    setPts(pointsOn ? rule.points || null : null);
    setCustom(true);
  };

  const reset = () => {
    choosePhoto(null); setSkipPhoto(false); setKidId(initialKid); setDir(amG ? 'plus' : null);
    setCents(null); setMins(null); setPts(null); setCustom(false); setMoneyLabel('reward'); setTimeLabel('fun'); setReason('');
    setConfirm(false); setSendError(null); setDone(null);
    window.scrollTo({ top: 0 });
  };

  const send = async (withPhoto = true) => {
    if (!kid || !dir || !ready || busy) return;
    setBusy(true);
    setSendError(null);
    setPhotoFailed(false);
    let path: string | null = null;
    if (withPhoto && photo) {
      if (uploaded?.blob === photo) path = uploaded.path;
      else {
        try {
          // Filed under the child's folder so the child can see it (grandparents may write into kids' folders).
          path = await uploadPhoto(family.id, kid.id, photo);
          setUploaded({ blob: photo, path });
        } catch {
          setPhotoFailed(true);
          setBusy(false);
          return;
        }
      }
    }
    const input: SpotInput = {
      member_id: kid.id, direction: dir, cents: c || undefined, minutes: m || undefined, points: p || undefined,
      money_label: c > 0 && mLabel ? mLabel : undefined, time_label: m > 0 ? timeLabel : undefined,
      reason: clip(why, 200), photo_path: path,
    };
    try {
      await api.spot(input);
      if (!withPhoto) choosePhoto(null);
      await refresh();
      toast.show(
        amG ? `Gift sent to ${kid.display_name} 🎁 ${signed}` : dir === 'plus' ? `${kid.display_name} got ${signed} ✨` : `Sent to ${kid.display_name}: ${signed}`,
        'success',
      );
      setConfirm(false);
      if (canSeeMoney(me, kid, family)) navigate(`/money/${kid.id}`, { replace: true });
      else setDone(kid.display_name);
    } catch (e) {
      const msg = moneyError(e);
      if (isFeatureOff(e)) {
        // Spotted (or a part of it) was switched off meanwhile: reload so the page shows what's on now.
        toast.show(msg, 'error');
        setConfirm(false);
        await refresh();
      } else setSendError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (kids.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title={amG ? 'Send a gift 🎁' : 'Spotted 📸'} back />
        <Card>
          <EmptyState
            emoji="🧒" title="No kids yet" message="Spotted is for the children in your family."
            action={isManager ? <LinkButton to="/family/add" icon="plus">Add a child</LinkButton> : undefined}
          />
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <PageHeader title={amG ? 'Send a gift 🎁' : 'Spotted 📸'} back />
        <Card tone="good" className="space-y-3 text-center" role="status">
          <p className="text-4xl" aria-hidden="true">{amG ? '🎁' : '✨'}</p>
          <p className="text-lg font-bold">Sent! {done} will see it in their wallet.</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => navigate(-1)}>Close</Button>
            <Button size="lg" className="flex-1" icon="camera" onClick={reset}>{amG ? 'Another gift' : 'Spot another'}</Button>
          </div>
        </Card>
      </div>
    );
  }

  // What the child will see: one history row per currency.
  const at = now().toISOString();
  const rows: Transaction[] = parts.map((x) => ({
    id: `preview-${x.currency}`, member_id: kid?.id ?? '', currency: x.currency,
    pot: x.currency === 'money' ? 'spending' : x.currency === 'time' ? 'time' : 'points',
    amount: sign * x.value, kind, label: x.currency === 'money' ? mLabel : x.currency === 'time' ? timeLabel : null,
    reason: why, photo_path: null, source_type: 'spot', source_id: null, reversed_by: null,
    effective_at: at, created_at: at, created_by: me.id, can_reverse: false,
  }));

  const bal = kid ? balancesOf(kid.id) : null;
  const owes: string[] = [];
  if (bal && dir === 'minus') {
    if (c > 0 && bal.spending - c < 0) {
      owes.push(bal.spending < 0
        ? `${name} already owes ${money(-bal.spending, cur)}, so ${name} will owe ${money(c - bal.spending, cur)}.`
        : `${name} has ${money(bal.spending, cur)}, so ${name} will owe ${money(c - bal.spending, cur)}.`);
    }
    if (m > 0 && bal.time - m < 0) {
      owes.push(`${name} has ${minutes(Math.max(0, bal.time))}, so ${name} will owe ${minutes(m - Math.max(0, bal.time))} of time.`);
    }
  }

  const reasons = amG ? GIFT_REASONS : dir === 'minus' ? MINUS_REASONS : dir === 'plus' ? PLUS_REASONS : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={amG ? 'Send a gift 🎁' : 'Spotted 📸'} back
        subtitle={amG ? 'A little something for a grandchild.' : 'Saw something good — or not so good? Note it now.'}
      />

      {/* 1. Photo */}
      <section aria-labelledby="spot-photo" className="space-y-2">
        <h2 id="spot-photo" className="px-1 text-[15px] font-bold">1. Photo <span className="font-normal text-muted">(optional)</span></h2>
        {skipPhoto && !photo ? (
          <div className="flex min-h-14 items-center justify-between gap-2 rounded-2xl border border-line/70 bg-surface px-4">
            <span className="text-[15px] text-muted">No photo</span>
            <Button variant="ghost" size="sm" icon="camera" onClick={() => setSkipPhoto(false)}>Add one</Button>
          </div>
        ) : (
          <>
            <PhotoCapture
              label="📷 Take photo" value={photo} onChange={choosePhoto}
              hint={amG ? `${kid ? name : 'Your grandchild'}, the parents and you can see this photo.` : `Only ${kid ? name : 'the child'}, parents and you can see this photo.`}
            />
            {!photo && <Button variant="secondary" block onClick={() => setSkipPhoto(true)}>Skip photo</Button>}
          </>
        )}
      </section>

      {/* 2. Who */}
      <section aria-labelledby="spot-who" className="space-y-2">
        <h2 id="spot-who" className="px-1 text-[15px] font-bold">2. Who?</h2>
        <MemberPicker label="Which child" members={kids} roles={['kid']} value={kidId} onChange={(id) => setKidId(id)} />
      </section>

      {/* 3. Reward / Consequence */}
      <section aria-labelledby="spot-dir" className="space-y-2">
        <h2 id="spot-dir" className="px-1 text-[15px] font-bold">3. {amG ? 'A gift' : 'Reward or consequence?'}</h2>
        {amG ? (
          <p className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-good-soft text-xl font-extrabold text-good"><span aria-hidden="true">🎁</span> Gift</p>
        ) : (
          <div role="group" aria-label="Reward or consequence" className="grid grid-cols-2 gap-2">
            {([['plus', '➕', 'Reward'], ['minus', '➖', 'Consequence']] as const).map(([d, emoji, label]) => {
              const on = dir === d;
              const good = d === 'plus';
              return (
                <button
                  key={d} type="button" aria-pressed={on} onClick={() => { if (custom && d !== dir) setCustom(false); setDir(d); if (reason && !(good ? PLUS_REASONS : MINUS_REASONS).includes(reason) && (good ? MINUS_REASONS : PLUS_REASONS).includes(reason)) setReason(''); }}
                  className={cx(
                    'flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 px-2 text-lg font-extrabold transition active:scale-[0.98]',
                    good
                      ? on ? 'border-good bg-good text-surface' : 'border-good/40 bg-good-soft text-good'
                      : on ? 'border-warn bg-warn text-surface' : 'border-warn/40 bg-warn-soft text-warn',
                  )}
                >
                  <span aria-hidden="true">{emoji}</span>{label}{on && <span className="sr-only"> (chosen)</span>}
                </button>
              );
            })}
          </div>
        )}
        {!amG && dir && !custom && (
          <div className={cx('space-y-1 rounded-2xl px-4 py-3', dir === 'minus' ? 'bg-warn-soft' : 'bg-good-soft')} aria-live="polite">
            {ruleTotal > 0 ? (
              <p className={cx('text-[16px] font-bold', dir === 'minus' ? 'text-warn' : 'text-good')}>
                {dir === 'minus' ? 'Costs' : 'Gives'} {ruleSigned}
                <span className="block text-[14px] font-semibold text-muted">From the family rules</span>
              </p>
            ) : (
              <p className="text-[15px] font-semibold">
                No amount set for a {dir === 'minus' ? 'consequence' : 'reward'} yet.{' '}
                <Link to="/family/settings" className="text-accent-ink underline underline-offset-2">Set it in Family rules</Link>
              </p>
            )}
            <button type="button" onClick={startCustom} className="min-h-11 text-[15px] font-semibold text-accent-ink underline underline-offset-2">
              Different amount this time?
            </button>
          </div>
        )}
      </section>

      {/* 4. Amounts — gifts, or a different amount this time */}
      {(amG || custom) && (
      <section aria-labelledby="spot-amount" className="space-y-3">
        <h2 id="spot-amount" className="px-1 text-[15px] font-bold">
          4. {amG ? 'How much?' : dir === 'minus' ? 'What does it cost this time?' : 'What do they get this time?'} <span className="font-normal text-muted">{extras.length > 0 ? '(at least one)' : ''}</span>
        </h2>
        <Card className="space-y-3">
          <AmountInput
            kind="money" label={amG ? 'Money' : dir === 'minus' ? 'Money (consequence)' : 'Money'} optional={extras.length > 0}
            value={cents} onChange={setCents} max={100_000} chips={[50, 100, 200]}
          />
          {!amG && dir !== 'minus' && (cents ?? 0) > 0 && (
            <div role="group" aria-label="Call it" className="flex flex-wrap gap-2">
              {PLUS_LABELS.map((l) => (
                <button
                  key={l} type="button" aria-pressed={moneyLabel === l} onClick={() => setMoneyLabel(l)}
                  className={cx('min-h-11 rounded-full border px-3.5 text-[15px] font-semibold transition', moneyLabel === l ? 'border-transparent bg-accent-strong text-white' : 'border-line bg-surface hover:bg-surface-2')}
                >
                  <span aria-hidden="true">{MONEY_LABELS[l].emoji} </span>{MONEY_LABELS[l].label}
                </button>
              ))}
            </div>
          )}
          {timeOn && (
            <>
              <AmountInput kind="time" label="Time" optional value={mins} onChange={setMins} max={1440} chips={[15, 30]} />
              {(mins ?? 0) > 0 && (
                <Segmented<TimeLabel>
                  label="Kind of time" value={timeLabel} onChange={setTimeLabel}
                  options={(Object.keys(TIME_LABELS) as TimeLabel[]).map((k) => ({ value: k, label: `${TIME_LABELS[k].emoji} ${TIME_LABELS[k].label}` }))}
                />
              )}
            </>
          )}
          {pointsOn && <AmountInput kind="points" label="Points" optional value={pts} onChange={setPts} max={10_000} chips={[5, 10, 20]} />}
          {custom && (
            <button type="button" onClick={() => setCustom(false)} className="min-h-11 text-[15px] font-semibold text-accent-ink underline underline-offset-2">
              Use the family rule{ruleTotal > 0 ? ` (${ruleSigned})` : ''}
            </button>
          )}
        </Card>
      </section>
      )}

      {/* Why */}
      <section aria-labelledby="spot-why" className="space-y-2">
        <h2 id="spot-why" className="px-1 text-[15px] font-bold">{amG || custom ? 5 : 4}. What happened?</h2>
        <Textarea
          label={amG ? 'A message' : 'What happened?'} rows={2} maxLength={80} value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={amG ? `${name} will read this.` : `${kid ? name : 'They'} will read this. Say what happened, not what ${kid ? name : 'they'} ${kid ? 'is' : 'are'}.`}
        />
        {reasons.length > 0 && <QuickChips label="Quick reasons" options={reasons} value={reason} onPick={setReason} />}
      </section>

      <div className="space-y-2">
        <Button block size="lg" icon="check" disabled={!ready} onClick={() => { setSendError(null); setPhotoFailed(false); setConfirm(true); }}>Check</Button>
        {!ready && <p className="text-center text-[14px] font-semibold text-muted" aria-live="polite">Still needed: {missing.join(' · ')}</p>}
      </div>
      <div className="h-8" aria-hidden="true" />

      {confirm && kid && dir && (
        <Sheet
          open onClose={() => !busy && setConfirm(false)} title={`This is exactly what ${name} will see`}
          footer={
            photoFailed ? (
              <div className="space-y-2">
                <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-center text-[15px] font-semibold text-warn">⚠️ Photo didn’t send.</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={() => send(false)}>Skip photo</Button>
                  <Button size="lg" className="flex-1" icon="reset" loading={busy} onClick={() => send(true)}>Try again</Button>
                </div>
              </div>
            ) : (
              <SheetActions onCancel={() => setConfirm(false)} cancelLabel="Go back">
                <Button size="lg" icon="check" loading={busy} onClick={() => send(true)}>Send to {name}</Button>
              </SheetActions>
            )
          }
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-muted">
              <Avatar member={kid} size="xs" /> {name}’s wallet · What happened
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line/70 bg-surface" aria-label="Preview">
              {rows.map((r) => <li key={r.id}><TxRow tx={r} cur={cur} viewerId={kid.id} photoSrc={preview} /></li>)}
            </ul>
            <p className={cx('rounded-2xl px-4 py-3 text-[16px] font-semibold', dir === 'minus' ? 'bg-warn-soft text-warn' : 'bg-good-soft text-good')}>
              {why}, so {signed}.
            </p>
            {owes.map((o) => (
              <p key={o} className="rounded-xl bg-warn-soft px-3 py-2 text-[15px] font-semibold text-warn"><span aria-hidden="true">⚠️ </span>{o}</p>
            ))}
            {amG && !canSeeMoney(me, kid, family) && <p className="text-[14px] text-muted">You won’t see {name}’s wallet afterwards — money is private in this family.</p>}
            {sendError && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{sendError}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
