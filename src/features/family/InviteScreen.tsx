import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, Button, Card, Icon, ProgressBar, QRCode, Spinner, useToast } from '../../components/ui';
import { useOverlay } from '../../components/ui/overlay';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { groupCode, joinUrl } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Invite, Member } from '../../lib/types';

const TOTAL_SECONDS = 30 * 60;
const QR_SIZE = 264;

interface WakeLockSentinelLike { release(): Promise<void> }
interface WakeLockLike { request(type: 'screen'): Promise<WakeLockSentinelLike> }

/** Keep the screen on while the QR is showing (when the browser allows it). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const wl = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    if (!wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let alive = true;
    const acquire = () => {
      wl.request('screen')
        .then((s) => { if (alive) sentinel = s; else void s.release().catch(() => {}); })
        .catch(() => { /* not allowed (battery saver, iframe…) — fine */ });
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const bucketOf = (rem: number) => (rem <= 0 ? 0 : rem <= 60 ? 1 : rem <= 300 ? 5 : 30);

export interface InviteScreenProps {
  member: Pick<Member, 'id' | 'display_name' | 'avatar' | 'photo_path' | 'theme'>;
  /** An invite that was just made (by addMember). Without it the screen makes a fresh one. */
  initialInvite?: Invite | null;
  /** 'join' = someone new; 'device' = connect another / a new phone for an existing person. */
  purpose?: 'join' | 'device';
  onClose: () => void;
}

/**
 * Full-screen one-time join QR (shared by "Add member", "Show QR" and "Connect a device").
 * Counts down to `expires_at`, polls list_logins every 5 s and celebrates when they're in.
 */
export function InviteScreen({ member, initialInvite = null, purpose = 'join', onClose }: InviteScreenProps) {
  const { now, refresh } = useApp();
  const toast = useToast();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(true, onClose, panel);

  const [invite, setInvite] = useState<Invite | null>(initialInvite);
  const [making, setMaking] = useState(!initialInvite);
  const [makeError, setMakeError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => now().getTime());
  const [announce, setAnnounce] = useState('');
  const [joined, setJoined] = useState<{ label: string | null } | null>(null);
  const nowRef = useRef(now);
  useEffect(() => { nowRef.current = now; });
  const baseline = useRef<number | null>(null);
  const seq = useRef(0);

  useWakeLock(!joined);

  // First code, when we weren't handed one.
  useEffect(() => {
    if (initialInvite) return;
    let alive = true;
    api.createInvite(member.id)
      .then((inv) => { if (alive) { setInvite(inv); setNowMs(nowRef.current().getTime()); } })
      .catch((e) => { if (alive) setMakeError(friendlyError(e)); })
      .finally(() => { if (alive) setMaking(false); });
    return () => { alive = false; };
  }, [initialInvite, member.id]);

  const makeNewCode = async () => {
    const id = ++seq.current;
    setMaking(true);
    setMakeError(null);
    try {
      const inv = await api.createInvite(member.id);
      if (id !== seq.current) return;
      setInvite(inv);
      setNowMs(nowRef.current().getTime());
      setAnnounce('New code ready. It works for 30 minutes.');
    } catch (e) {
      if (id === seq.current) setMakeError(friendlyError(e));
    } finally {
      if (id === seq.current) setMaking(false);
    }
  };

  // Countdown (1 s) with spoken warnings at 5 min, 1 min and when it runs out.
  const expiresMs = invite ? Date.parse(invite.expires_at) : 0;
  useEffect(() => {
    if (!expiresMs || joined) return;
    let last = bucketOf(Math.round((expiresMs - nowRef.current().getTime()) / 1000));
    const t = window.setInterval(() => {
      const n = nowRef.current().getTime();
      setNowMs(n);
      const b = bucketOf(Math.round((expiresMs - n) / 1000));
      if (b !== last) {
        last = b;
        if (b === 5) setAnnounce('5 minutes left on this code.');
        else if (b === 1) setAnnounce('1 minute left on this code.');
        else if (b === 0) setAnnounce('This code ran out. Make a new code.');
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [expiresMs, joined]);

  // Did they join? Poll the member's signed-in devices every 5 s while this screen is visible.
  const hasInvite = !!invite;
  useEffect(() => {
    if (!hasInvite || joined) return;
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const logins = await api.listLogins(member.id);
        if (!alive) return;
        if (baseline.current === null) { baseline.current = logins.length; return; }
        if (logins.length > baseline.current) {
          const newest = [...logins].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          setJoined({ label: newest?.label ?? null });
          setAnnounce(`${member.display_name} joined!`);
          void refresh();
        }
      } catch {
        /* keep trying quietly */
      }
    };
    void poll();
    const t = window.setInterval(() => { void poll(); }, 5000);
    return () => { alive = false; window.clearInterval(t); };
  }, [hasInvite, joined, member.id, member.display_name, refresh]);

  const remaining = invite ? Math.max(0, Math.round((expiresMs - nowMs) / 1000)) : TOTAL_SECONDS;
  const expired = !!invite && remaining <= 0;
  const url = invite ? joinUrl(invite.token) : '';
  const code = invite ? groupCode(invite.short_code) : '';
  const spelled = invite ? invite.short_code.split('').join(' ') : '';
  const name = member.display_name;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${what} copied`, 'success');
    } catch {
      toast.show('Couldn’t copy. Select it and copy it by hand.', 'error');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Join our family on Pocket Money', text: `Join code: ${code}`, url });
    } catch {
      /* cancelled */
    }
  };

  const body = joined ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="text-7xl" aria-hidden="true">🎉</div>
      <Avatar member={member} size="xl" ring />
      <h1 id={titleId} className="text-3xl font-extrabold">{name} joined!</h1>
      <p className="text-lg text-muted">
        {joined.label ? `Connected on “${joined.label}”.` : 'Their phone is connected now.'}
      </p>
      <Button size="lg" block onClick={onClose} data-autofocus>Done</Button>
    </div>
  ) : (
    <div className="flex flex-1 flex-col items-center gap-5 pb-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <Avatar member={member} size="lg" />
        <h1 id={titleId} className="text-2xl font-extrabold leading-tight">
          {purpose === 'device' ? `Connect a device for ${name}` : `Let ${name} join`}
        </h1>
        {purpose === 'device' && (
          <p className="text-[15px] text-muted">Use this if they lost their phone or got a new one.</p>
        )}
      </div>

      {makeError && !invite ? (
        <Card tone="bad" role="alert" className="w-full text-left">
          <p className="font-semibold">We couldn’t make a code.</p>
          <p className="text-[15px] text-muted">{makeError}</p>
          <Button variant="secondary" size="sm" icon="reset" className="mt-2" onClick={makeNewCode} loading={making}>Try again</Button>
        </Card>
      ) : !invite ? (
        <div className="grid place-items-center rounded-3xl bg-white shadow-md ring-1 ring-black/10" style={{ width: QR_SIZE, height: QR_SIZE }}>
          <Spinner size={32} className="text-neutral-500" label="Making a code" />
        </div>
      ) : (
        <>
          <div className="relative">
            <div className={expired ? 'opacity-15 blur-[2px]' : undefined} aria-hidden={expired || undefined}>
              <QRCode value={url} size={QR_SIZE} label={`QR code for ${name} to join`} />
            </div>
            {expired && (
              <div className="absolute inset-0 grid place-items-center p-4">
                <div className="rounded-2xl bg-surface p-4 shadow-lg">
                  <p className="mb-3 text-lg font-bold">This code ran out <span aria-hidden="true">⏳</span></p>
                  <Button icon="reset" onClick={makeNewCode} loading={making} data-autofocus>Make a new code</Button>
                </div>
              </div>
            )}
          </div>

          <div className={expired ? 'opacity-40' : undefined}>
            <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">or type the code</div>
            <div className="font-mono text-[2.6rem] font-extrabold leading-tight tracking-[0.12em] tabular-nums">
              <span aria-hidden="true">{code}</span>
              <span className="sr-only">Code: {spelled}</span>
            </div>
            {!expired && (
              <Button variant="ghost" size="sm" icon="link" onClick={() => copy(invite.short_code, 'Code')}>Copy code</Button>
            )}
          </div>

          {!expired && (
            <div className="w-full space-y-2">
              <p className="text-lg font-bold">Show this to {name} — they scan it with their phone camera.</p>
              <p className="text-[15px] text-muted">
                Works once. Expires in <span className="font-semibold tabular-nums text-ink">{mmss(remaining)}</span>.
              </p>
              <ProgressBar
                size="sm" value={remaining} max={TOTAL_SECONDS}
                tone={remaining <= 60 ? 'bad' : remaining <= 300 ? 'warn' : 'accent'}
                label="Time left on this code" valueText={`${mmss(remaining)} left`}
              />
              <p className="pt-1 text-[14px] text-muted">
                Can’t scan? On their phone open the app, tap “I have a QR code / join code” and type{' '}
                <span className="whitespace-nowrap font-mono font-bold text-ink">{code}</span>.
              </p>
            </div>
          )}
          {makeError && <p role="alert" className="text-[15px] text-bad">{makeError}</p>}

          <div className="mt-auto grid w-full gap-2">
            {!expired && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon="link" onClick={() => copy(url, 'Link')}>Copy link</Button>
                {canShare ? (
                  <Button variant="secondary" icon="forward" onClick={share}>Share</Button>
                ) : (
                  <Button variant="secondary" icon="reset" onClick={makeNewCode} loading={making}>New code</Button>
                )}
              </div>
            )}
            {!expired && canShare && (
              <Button variant="ghost" icon="reset" onClick={makeNewCode} loading={making}>Make a new code</Button>
            )}
            <Button size="lg" block onClick={onClose}>Done</Button>
          </div>
        </>
      )}
    </div>
  );

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto bg-bg text-ink outline-none"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center">
          <button
            type="button"
            onClick={onClose}
            className="-ml-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-surface-2"
          >
            <Icon name="close" />
            Done
          </button>
        </div>
        {body}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>,
    document.body,
  );
}
