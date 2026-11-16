import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../lib/session';
import { getLock, LOCK_EVENT, patternSecret, verifyLock, type LockKind } from './lockStore';
import { Avatar, Button, PatternPad, PinPad, useConfirm } from './ui';

const BACKGROUND_LOCK_MS = 5 * 60_000;
const MAX_TRIES = 5;

/**
 * Wraps the app. When the signed-in member has a PIN/pattern on this device, the app is covered by a lock
 * screen on start and after 5 minutes in the background. Content underneath is inert while locked.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const { me } = useApp();
  const memberId = me?.id ?? null;
  const [locked, setLocked] = useState<LockKind | null>(null);
  const lockedFor = useRef<string | null>(null);

  // Lock on start (first time we know who is signed in) / when the person changes.
  useEffect(() => {
    if (lockedFor.current === memberId) return;
    lockedFor.current = memberId;
    setLocked(getLock(memberId)?.kind ?? null);
  }, [memberId]);

  // Lock again after a while in the background; drop the lock screen if the lock was removed.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= BACKGROUND_LOCK_MS) setLocked(getLock(memberId)?.kind ?? null);
    };
    const onChange = () => setLocked((l) => (l && !getLock(memberId) ? null : l));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(LOCK_EVENT, onChange);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(LOCK_EVENT, onChange);
    };
  }, [memberId]);

  return (
    <>
      <div inert={!!locked || undefined} aria-hidden={locked ? true : undefined}>{children}</div>
      {locked && memberId && <LockScreen kind={locked} memberId={memberId} onUnlock={() => setLocked(null)} />}
    </>
  );
}

function LockScreen({ kind, memberId, onUnlock }: { kind: LockKind; memberId: string; onUnlock: () => void }) {
  const { me, signOut } = useApp();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!waitUntil) return;
    const t = window.setInterval(() => {
      const left = Math.ceil((waitUntil - Date.now()) / 1000);
      if (left <= 0) { setWaitUntil(0); setError(null); setSecondsLeft(0); } else setSecondsLeft(left);
    }, 1000);
    return () => window.clearInterval(t);
  }, [waitUntil]);

  const attempt = async (secret: string) => {
    if (waitUntil) return false;
    if (await verifyLock(memberId, secret)) { onUnlock(); return true; }
    const n = tries + 1;
    setTries(n);
    if (n % MAX_TRIES === 0) {
      setWaitUntil(Date.now() + 30_000);
      setSecondsLeft(30);
      setError('Too many tries. Wait 30 seconds.');
    } else {
      setError(kind === 'pin' ? 'Wrong PIN. Try again.' : 'Wrong pattern. Try again.');
    }
    return false;
  };

  const forgot = async () => {
    const ok = await confirm({
      title: 'Sign out of this phone?',
      message: "You'll need a new QR code from a parent (or your username & password) to get back in. Your points and money are safe.",
      confirmLabel: 'Sign out', danger: true,
    });
    if (ok) await signOut();
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="App locked">
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        {me && <Avatar member={me} size="xl" ring />}
        <p className="mt-3 text-lg font-bold">Hi {me?.display_name ?? 'there'} 👋</p>
        <div className="mt-6 flex-1">
          {kind === 'pin'
            ? <PinPad title="Enter your PIN" error={waitUntil ? `Too many tries. Wait ${secondsLeft} s.` : error} onComplete={attempt} />
            : <PatternPad title="Draw your pattern" error={waitUntil ? `Too many tries. Wait ${secondsLeft} s.` : error} onComplete={(p) => attempt(patternSecret(p))} />}
        </div>
        <Button variant="ghost" size="sm" className="mt-6" onClick={forgot}>Forgot? Sign out &amp; rescan QR</Button>
      </div>
    </div>
  );
}
