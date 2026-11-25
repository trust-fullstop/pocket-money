// /money/proud — "Look what I did ⭐": a kid shows something good they did on their own (photo optional, a few words),
// then waits for a grown-up: a reward (the family's Spotted rule), a thank-you, or "Let's talk about it".
// Below the form: "My proud moments" with what the grown-ups said. Managers are sent to /money/proud/check.
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, PageSpinner, PhotoCapture, Textarea, cx, useToast, type BadgeTone } from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { uploadPhoto } from '../../lib/photos';
import { useApp } from '../../lib/session';
import { useHoldUpdates } from '../../lib/updates';
import type { Family, Initiative, InitiativeStatus, Member } from '../../lib/types';
import { clip, isStale, moneyError, rewardWords, useData, useDelayed, useReloadOn, whenText, type Loaded } from './moneyUtils';
import { LoadFailed, NotForYou, PhotoSheet, QuickChips, SkeletonRows, TxPhoto } from './parts';

const PROUD_CHIPS = [
  'Helped without being asked', 'Cleaned up without being asked', 'Helped my brother or sister', 'Did extra homework',
  'Cooked or baked something',
];

const STATUS: Record<InitiativeStatus, { emoji: string; label: string; tone: BadgeTone }> = {
  waiting: { emoji: '👀', label: 'Waiting for a grown-up', tone: 'warn' },
  rewarded: { emoji: '⭐', label: 'Rewarded', tone: 'good' },
  thanked: { emoji: '💛', label: 'Thanks!', tone: 'accent' },
  talk: { emoji: '💬', label: 'Let’s talk about it', tone: 'neutral' },
  cancelled: { emoji: '⚪', label: 'Taken back', tone: 'neutral' },
};

/** The kid's "⭐ I did something good!" button (KidHome has its own copy; this one is for the money page). */
export function ProudButton({ waiting }: { waiting: number }) {
  return (
    <div className="space-y-1">
      <LinkButton to="/money/proud" size="lg" block className="h-auto min-h-14 whitespace-normal py-2 text-[17px]">
        <span aria-hidden="true" className="text-xl">⭐</span> I did something good!
      </LinkButton>
      <LinkButton to="/money/proud#mine" variant="ghost" size="sm" className="w-full">
        My proud moments{waiting > 0 ? ` · ${waiting} waiting 👀` : ''}
      </LinkButton>
    </div>
  );
}

export function ProudPage() {
  const { me, family, isManager } = useApp();
  if (!me || !family) return <PageSpinner />;
  if (isManager) return <Navigate replace to="/money/proud/check" />;
  if (me.role !== 'kid') {
    return (
      <NotForYou
        message="Proud moments are for the kids: they show what they did, and the parents have a look."
        action={<LinkButton to="/money" icon="money">Back to Money</LinkButton>}
      />
    );
  }
  return <ProudForKid me={me} family={family} />;
}

function ProudForKid({ me, family }: { me: Member; family: Family }) {
  const { refresh, state } = useApp();
  const features = useFeatures();
  const toast = useToast();
  const spottedOn = features.on('spotted');
  const list = useData(() => api.listInitiatives('all'), [me.id]);
  useReloadOn(state, list.reload);
  // "My proud moments" links here with #mine: scroll to the list once it is in.
  const { hash } = useLocation();
  const scrolled = useRef(false);
  const loaded = !!list.data;
  useEffect(() => {
    if (hash !== '#mine' || !loaded || scrolled.current) return;
    scrolled.current = true;
    document.getElementById('mine')?.scrollIntoView({ block: 'start' });
  }, [hash, loaded]);

  const [photo, setPhoto] = useState<Blob | null>(null);
  const [uploaded, setUploaded] = useState<{ blob: Blob; path: string } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // One id per form: sending twice (double tap, retry after a lost answer) never makes two.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useHoldUpdates(!!(photo || what.trim()) && !sent);

  const choosePhoto = (b: Blob | null) => {
    setPhoto(b);
    setUploaded(null);
    setPhotoFailed(false);
  };

  const reset = () => {
    choosePhoto(null);
    setWhat('');
    setError(null);
    setSent(false);
    setRequestId(crypto.randomUUID());
    window.scrollTo({ top: 0 });
  };

  const text = what.trim();
  const send = async (withPhoto = true) => {
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setPhotoFailed(false);
    try {
      let path: string | null = null;
      if (withPhoto && photo) {
        if (uploaded?.blob === photo) path = uploaded.path;
        else {
          try {
            path = await uploadPhoto(family.id, me.id, photo);
            setUploaded({ blob: photo, path });
          } catch {
            setPhotoFailed(true);
            return;
          }
        }
      }
      await api.submitInitiative(clip(text, 200), path, requestId);
      if (!withPhoto) choosePhoto(null);
      setSent(true);
      await Promise.all([refresh(), list.reload()]);
    } catch (e) {
      const msg = moneyError(e);
      setError(msg);
      if (isStale(e)) { toast.show(msg, 'error'); await refresh(); }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const mine = (list.data ?? []).filter((i) => i.status !== 'cancelled');

  return (
    <div className="space-y-5">
      <PageHeader title="Look what I did ⭐" back={`/money/${me.id}`} subtitle="Show what you did on your own." />

      {!spottedOn ? (
        <Card>
          <EmptyState emoji="💤" title="This is switched off" message="A parent can switch it on again (it’s part of Spotted)." />
        </Card>
      ) : sent ? (
        <Card tone="good" className="space-y-3 text-center" role="status">
          <p className="text-4xl" aria-hidden="true">👀</p>
          <p className="text-lg font-bold">Sent! A parent will have a look 👀</p>
          <div className="flex gap-2">
            <LinkButton to={`/money/${me.id}`} variant="secondary" size="lg" className="flex-1">My money</LinkButton>
            <Button size="lg" className="flex-1" onClick={reset}>Show another</Button>
          </div>
        </Card>
      ) : (
        <>
          <section aria-labelledby="proud-photo" className="space-y-2">
            <h2 id="proud-photo" className="px-1 text-[15px] font-bold">1. Photo <span className="font-normal text-muted">(optional)</span></h2>
            <PhotoCapture label="📷 Take a photo" value={photo} onChange={choosePhoto} hint="A photo helps the grown-ups see it." />
          </section>

          <section aria-labelledby="proud-what" className="space-y-2">
            <h2 id="proud-what" className="px-1 text-[15px] font-bold">2. Tell the grown-ups</h2>
            <Textarea
              label="What did you do?" rows={2} maxLength={200} value={what} onChange={(e) => setWhat(e.target.value)}
              hint="Say it in your own words, or tap one below."
            />
            <QuickChips label="Quick ideas" options={PROUD_CHIPS} value={what} onPick={setWhat} />
          </section>

          <div className="space-y-2">
            {photoFailed ? (
              <div className="space-y-2">
                <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-center text-[15px] font-semibold text-warn">⚠️ The photo didn’t send.</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={() => send(false)}>Send without photo</Button>
                  <Button size="lg" className="flex-1" icon="reset" loading={busy} onClick={() => send(true)}>Try again</Button>
                </div>
              </div>
            ) : (
              <Button block size="lg" icon="send" disabled={!text} loading={busy} onClick={() => send(true)}>Send to a grown-up</Button>
            )}
            {!text && <p className="text-center text-[14px] font-semibold text-muted">Still needed: what you did</p>}
            {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>}
          </div>
        </>
      )}

      <section id="mine" aria-labelledby="proud-mine" className="scroll-mt-20 space-y-2">
        <h2 id="proud-mine" className="px-1 text-sm font-bold uppercase tracking-wide text-muted">My proud moments</h2>
        <MomentList list={list} items={mine} />
      </section>
      <div className="h-12" aria-hidden="true" />
    </div>
  );
}

function MomentList({ list, items }: { list: Loaded<Initiative[]>; items: Initiative[] }) {
  const skeleton = useDelayed(list.loading);
  if (list.loading) return skeleton ? <SkeletonRows rows={2} /> : <div className="h-24" aria-hidden="true" />;
  if (list.error && !list.data) return <LoadFailed message={list.error} onRetry={list.reload} />;
  if (items.length === 0) {
    return <Card><EmptyState className="!py-4" emoji="🌱" title="Nothing yet" message="When you do something good on your own, show it here!" /></Card>;
  }
  return (
    <ul className={cx('space-y-2', list.refreshing && 'opacity-80')}>
      {items.map((i) => <li key={i.id}><MomentCard item={i} onChanged={list.reload} /></li>)}
    </ul>
  );
}

function MomentCard({ item, onChanged }: { item: Initiative; onChanged: () => Promise<void> }) {
  const { family, membersById, me, now, refresh } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [big, setBig] = useState(false);
  const st = STATUS[item.status];
  const cur = family?.currency ?? 'EUR';
  const tz = family?.timezone ?? 'Europe/Amsterdam';
  const decider = item.decided_by ? (item.decided_by === me?.id ? 'You' : membersById[item.decided_by]?.display_name ?? 'A grown-up') : null;
  const reward = rewardWords({ cents: item.reward_cents, minutes: item.reward_minutes, points: item.reward_points }, cur);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.cancelInitiative(item.id);
      toast.show('Taken back', 'success');
      await Promise.all([refresh(), onChanged()]);
    } catch (e) {
      toast.show(moneyError(e), 'error');
      if (isStale(e)) await Promise.all([refresh(), onChanged()]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2">
      <div className="flex items-start gap-3">
        {item.photo_path ? (
          <TxPhoto path={item.photo_path} alt="Photo of what you did" className="size-16" onOpen={() => setBig(true)} />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">⭐</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug [overflow-wrap:anywhere]">{item.what}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <Badge tone={st.tone}><span aria-hidden="true">{st.emoji}</span>{st.label}</Badge>
            <span>{whenText(item.created_at, tz, now())}</span>
          </p>
          {item.status === 'rewarded' && reward && (
            <p className="mt-1 text-[15px] font-bold text-good">You got {reward} <span aria-hidden="true">🎉</span></p>
          )}
          {item.decision_note && (
            <p className="mt-1 rounded-xl bg-surface-2 px-3 py-2 text-[15px] [overflow-wrap:anywhere]">
              <span aria-hidden="true">💬 </span>{item.decision_note}
              {decider && <span className="text-muted"> — {decider}</span>}
            </p>
          )}
        </div>
      </div>
      {item.can_cancel && (
        <Button variant="ghost" size="sm" icon="close" loading={busy} onClick={cancel}>Take it back</Button>
      )}
      {big && item.photo_path && <PhotoSheet path={item.photo_path} alt="Photo of what you did" onClose={() => setBig(false)} />}
    </Card>
  );
}
