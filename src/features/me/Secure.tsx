import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { DemoPeopleSheet } from '../../components/DemoPeopleSheet';
import { clearLock, getLock, lockSupported, LOCK_EVENT, patternSecret, setLock, type LockKind } from '../../components/lockStore';
import {
  Badge, Button, Card, GoogleLogo, Icon, Input, ListRow, PageHeader, PatternPad, PinPad, Section, Segmented, Sheet,
  Spinner, cx, useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { backend } from '../../lib/backend';
import { googleEnabled } from '../../lib/backend/select';
import { friendlyError } from '../../lib/errors';
import { timeAgo } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { LoginDevice } from '../../lib/types';
import { useSecured } from './useSecured';

export default function Secure() {
  const { me, family, mode, signOut } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const welcome = params.get('welcome') === '1';
  const sec = useSecured(me);
  const [people, setPeople] = useState(false);

  useEffect(() => {
    if (params.get('linked') === '1') {
      toast.show('Google account linked', 'success');
      sec.reload();
      const next = new URLSearchParams(params);
      next.delete('linked');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me || !family) return null;

  const doSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out of this phone?',
      message: sec.secured
        ? 'You can sign back in with your username & password or Google.'
        : 'This phone is your only way in. After signing out you will need a new QR code from a parent.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    await signOut();
    navigate('/welcome', { replace: true });
  };

  return (
    <>
      <PageHeader title="Sign-in & devices" back={welcome ? undefined : '/me'} />

      {welcome && (
        <Card tone="accent" className="mb-4">
          <div className="text-3xl" aria-hidden="true">🎉</div>
          <h2 className="mt-1 text-xl font-extrabold">Welcome to {family.name}, {me.display_name}!</h2>
          <p className="mt-1">Make sure you can get back in if this phone gets lost or replaced.</p>
          <Button variant="secondary" className="mt-3" onClick={() => navigate('/', { replace: true })} icon="forward">
            {sec.secured ? 'Continue' : 'Skip for now'}
          </Button>
        </Card>
      )}

      <StatusCard secured={sec.secured} loading={sec.loading} username={me.username} google={sec.google?.email ?? (sec.google ? 'Google' : null)} />

      {mode === 'cloud' && googleEnabled && (
        <Section title="Google" className="mt-6">
          <GoogleCard linkedEmail={sec.google ? sec.google.email ?? 'your Google account' : null} />
        </Section>
      )}

      <Section title="Username & password" className="mt-6">
        <CredentialsCard username={me.username} hasPassword={me.has_password} />
      </Section>

      <Section title="Devices" className="mt-6">
        <Devices />
      </Section>

      <Section title="App lock" className="mt-6">
        <AppLockCard memberId={me.id} />
      </Section>

      {mode === 'demo' && (
        <Section title="Demo" className="mt-6">
          <Card padded={false} className="overflow-hidden">
            <ListRow onClick={() => setPeople(true)} left={<Icon name="swap" className="text-accent-ink" />} title="Switch person" subtitle="Try the app as someone else in the family" />
          </Card>
          <DemoPeopleSheet open={people} onClose={() => setPeople(false)} />
        </Section>
      )}

      <div className="mt-8">
        <Button variant="danger" block icon="logout" onClick={doSignOut}>Sign out of this phone</Button>
      </div>
    </>
  );
}

function StatusCard({ secured, loading, username, google }: { secured: boolean; loading: boolean; username: string | null; google: string | null }) {
  if (loading && !secured) {
    return <Card className="flex items-center gap-3"><Spinner /> Checking…</Card>;
  }
  if (secured) {
    const ways = [username && `username “${username}”`, google && `Google (${google})`].filter(Boolean).join(' or ');
    return (
      <Card tone="good" className="flex items-start gap-3">
        <Icon name="shield-check" size={28} className="mt-0.5 shrink-0" />
        <div>
          <h2 className="text-lg font-bold">Secured</h2>
          <p>On a new phone you can sign in with {ways || 'your sign-in'}.</p>
        </div>
      </Card>
    );
  }
  return (
    <Card tone="warn" className="flex items-start gap-3">
      <span className="text-2xl leading-none" aria-hidden="true">⚠️</span>
      <div>
        <h2 className="text-lg font-bold">Only this phone</h2>
        <p>If you lose it you’ll need a new QR code from a parent. Add a {googleEnabled ? 'password or Google' : 'username and password'} below to be safe.</p>
      </div>
    </Card>
  );
}

function GoogleCard({ linkedEmail }: { linkedEmail: string | null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (linkedEmail) {
    return (
      <Card className="flex items-center gap-3">
        <GoogleLogo size={24} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Linked</div>
          <div className="truncate text-sm text-muted">{linkedEmail}</div>
        </div>
        <Badge tone="good" icon="check">On</Badge>
      </Card>
    );
  }
  const link = async () => {
    setBusy(true);
    try {
      await backend().linkGoogle();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3">
      <p>Sign in on any phone with your Google account.</p>
      <Button variant="secondary" block loading={busy} onClick={link}>
        <GoogleLogo size={20} /> Link Google account
      </Button>
    </Card>
  );
}

function CredentialsCard({ username, hasPassword }: { username: string | null; hasPassword: boolean }) {
  const { refresh } = useApp();
  const toast = useToast();
  const [editing, setEditing] = useState(!hasPassword);
  const [user, setUser] = useState(username ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ user?: string; pw?: string; pw2?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = user.trim().toLowerCase();
    const errs: typeof errors = {};
    if (!/^[a-z0-9_.-]{3,24}$/.test(u)) errs.user = '3–24 letters, numbers, dots, dashes or underscores';
    if (pw.length < 6) errs.pw = 'At least 6 characters';
    else if (pw.length > 72) errs.pw = 'That’s a bit too long (72 max)';
    if (pw2 !== pw) errs.pw2 = 'The passwords don’t match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.setCredentials(u, pw);
      await refresh();
      toast.show('Username & password saved', 'success');
      setPw(''); setPw2(''); setEditing(false);
    } catch (err) {
      const msg = friendlyError(err);
      if (/username/i.test(msg)) setErrors({ user: msg }); else toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <Card className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent-ink"><Icon name="key" size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted">Username</div>
          <div className="truncate font-mono text-lg font-bold">{username}</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Change</Button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!hasPassword && <p className="text-muted">Pick a username and password so you can sign in on another phone.</p>}
        <Input
          label="Username" value={user} onChange={(e) => setUser(e.target.value)} error={errors.user}
          autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={24}
          hint="Letters, numbers, . _ -" prefix={<Icon name="user" size={18} />}
        />
        <Input
          label={hasPassword ? 'New password' : 'Password'} type={show ? 'text' : 'password'} value={pw}
          onChange={(e) => setPw(e.target.value)} error={errors.pw} autoComplete="new-password" hint="At least 6 characters"
          suffix={
            <button type="button" onClick={() => setShow((s) => !s)} className="min-h-11 px-2 text-sm font-semibold text-accent-ink" aria-pressed={show}>
              {show ? 'Hide' : 'Show'}
            </button>
          }
        />
        <Input label="Type it again" type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} error={errors.pw2} autoComplete="new-password" />
        <div className="flex gap-2">
          {hasPassword && <Button variant="ghost" onClick={() => { setEditing(false); setErrors({}); setPw(''); setPw2(''); }}>Cancel</Button>}
          <Button type="submit" block loading={busy} icon="check">Save</Button>
        </div>
      </form>
    </Card>
  );
}

function Devices() {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useLoad(() => api.listLogins(), []);
  const [renaming, setRenaming] = useState<LoginDevice | null>(null);

  if (list.loading && !list.data) return <Card className="flex items-center gap-3"><Spinner /> Loading devices…</Card>;
  if (list.error) {
    return (
      <Card tone="bad" className="space-y-2">
        <p>{friendlyError(list.error)}</p>
        <Button size="sm" variant="secondary" onClick={list.reload}>Try again</Button>
      </Card>
    );
  }
  const devices = [...(list.data ?? [])].sort((a, b) => Number(b.current) - Number(a.current) || b.last_seen_at.localeCompare(a.last_seen_at));

  const remove = async (d: LoginDevice) => {
    const ok = await confirm({
      title: `Remove “${d.label || 'this device'}”?`,
      message: 'It will be signed out of the family. To use it again it needs a new QR code or your password.',
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try {
      await api.removeLogin(d.id);
      toast.show('Device removed', 'success');
      list.reload();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    }
  };

  return (
    <>
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {devices.length === 0 && <p className="p-4 text-muted">No devices.</p>}
        {devices.map((d) => (
          <ListRow
            key={d.id}
            left={<span className={cx('grid size-10 place-items-center rounded-full', d.current ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted')}><Icon name="device" size={20} /></span>}
            title={<span className="flex items-center gap-2">{d.label || 'Unnamed device'}{d.current && <Badge tone="accent">This phone</Badge>}</span>}
            subtitle={d.current ? `Added ${timeAgo(d.created_at)}` : `Last used ${timeAgo(d.last_seen_at)}`}
            right={d.current
              ? <Button variant="ghost" size="sm" onClick={() => setRenaming(d)}>Rename</Button>
              : <Button variant="ghost" size="sm" className="text-bad" onClick={() => remove(d)} aria-label={`Remove ${d.label || 'device'}`}>Remove</Button>}
          />
        ))}
      </Card>
      <RenameSheet device={renaming} onClose={() => setRenaming(null)} onDone={() => { setRenaming(null); list.reload(); }} />
    </>
  );
}

function RenameSheet({ device, onClose, onDone }: { device: LoginDevice | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (device && device.id !== lastId) { setLastId(device.id); setLabel(device.label ?? ''); }

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.setLoginLabel(label.trim());
      toast.show('Renamed', 'success');
      onDone();
    } catch (err) {
      toast.show(friendlyError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!device} onClose={onClose} title="Rename this phone"
      footer={<Button block size="lg" loading={busy} disabled={!label.trim()} onClick={() => save()}>Save</Button>}
    >
      <form onSubmit={save}>
        <Input label="Name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="e.g. Sam’s iPhone" data-autofocus />
      </form>
    </Sheet>
  );
}

type LockChoice = 'none' | LockKind;

function AppLockCard({ memberId }: { memberId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [current, setCurrent] = useState<LockChoice>(() => getLock(memberId)?.kind ?? 'none');
  const [setting, setSetting] = useState<LockKind | null>(null);

  useEffect(() => {
    const sync = () => setCurrent(getLock(memberId)?.kind ?? 'none');
    sync();
    window.addEventListener(LOCK_EVENT, sync);
    return () => window.removeEventListener(LOCK_EVENT, sync);
  }, [memberId]);

  if (!lockSupported) {
    return <Card className="text-muted">App lock needs a secure (https) connection.</Card>;
  }

  const choose = async (c: LockChoice) => {
    if (c === current) return;
    if (c === 'none') {
      const ok = await confirm({ title: 'Turn off app lock?', message: 'Anyone holding this phone can open Sow & Grow as you.', confirmLabel: 'Turn off' });
      if (ok) { clearLock(memberId); toast.show('App lock off', 'success'); }
      return;
    }
    setSetting(c);
  };

  return (
    <Card className="space-y-3">
      <p className="text-muted">Ask for a PIN or pattern when opening the app (after 5 minutes away). Only on this phone.</p>
      <Segmented<LockChoice>
        label="App lock" value={current} onChange={choose}
        options={[
          { value: 'none', label: 'None' },
          { value: 'pin', label: 'PIN', icon: 'lock' },
          { value: 'pattern', label: 'Pattern', icon: 'sparkles' },
        ]}
      />
      {current !== 'none' && (
        <div className="flex items-center gap-2 text-sm font-semibold text-good">
          <Icon name="check" size={18} /> {current === 'pin' ? 'PIN lock is on' : 'Pattern lock is on'}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSetting(current)}>Change</Button>
        </div>
      )}
      <LockSetupSheet
        kind={setting} onClose={() => setSetting(null)}
        onSet={async (kind, secret) => {
          await setLock(memberId, kind, secret);
          setSetting(null);
          toast.show(kind === 'pin' ? 'PIN set' : 'Pattern set', 'success');
        }}
      />
    </Card>
  );
}

function LockSetupSheet({ kind, onClose, onSet }: { kind: LockKind | null; onClose: () => void; onSet: (kind: LockKind, secret: string) => Promise<void> }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [lastKind, setLastKind] = useState<LockKind | null>(null);
  if (kind !== lastKind) { setLastKind(kind); setFirst(null); setError(null); setRound((r) => r + 1); }

  const enter = async (secret: string): Promise<boolean | void> => {
    if (!kind) return;
    if (first === null) {
      setFirst(secret);
      setError(null);
      setRound((r) => r + 1);
      return;
    }
    if (secret !== first) {
      setFirst(null);
      setError('That didn’t match. Let’s start again.');
      setRound((r) => r + 1);
      return false;
    }
    await onSet(kind, secret);
  };

  const what = kind === 'pin' ? 'PIN' : 'pattern';
  const title = first === null ? `Choose a ${kind === 'pin' ? '4-digit PIN' : 'pattern (4+ dots)'}` : `Now ${kind === 'pin' ? 'type' : 'draw'} the same ${what} again`;
  return (
    <Sheet open={!!kind} onClose={onClose} title={kind === 'pin' ? 'Set a PIN' : 'Set a pattern'} description="You’ll need it to open the app on this phone.">
      <div className="flex justify-center pb-2">
        {kind === 'pin' && <PinPad key={round} title={title} error={error} onComplete={(p) => enter(p)} />}
        {kind === 'pattern' && <PatternPad key={round} title={title} error={error} onComplete={(p) => enter(patternSecret(p))} />}
      </div>
    </Sheet>
  );
}
