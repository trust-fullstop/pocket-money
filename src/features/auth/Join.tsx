import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Avatar, Badge, Button, Card, EmptyState, Icon, Input, LinkButton, PageHeader, PageSpinner, useAction, useConfirm } from '../../components/ui';
import { api } from '../../lib/api';
import { backend } from '../../lib/backend';
import { AppError, friendlyError, type ErrorCode } from '../../lib/errors';
import { deviceLabel, deviceTimeZone, extractJoinCode, formatWhen, roleLabel } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { InvitePreview } from '../../lib/types';
import { AuthShell } from './AuthShell';

/** /join and /join/:code — redeem a QR / short code to link this device to a family member. */
export default function Join() {
  const { code } = useParams();
  return code ? <JoinPreview key={code} code={extractJoinCode(code)} /> : <EnterCode />;
}

function EnterCode() {
  const { state } = useApp();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = extractJoinCode(text);
    if (c.length < 8) { setError('The code has 8 letters and numbers, like ABCD EFGH.'); return; }
    navigate(`/join/${encodeURIComponent(c)}`);
  };

  return (
    <AuthShell>
      <PageHeader title="Join your family" back={state ? '/' : '/welcome'} />
      <Card tone="accent" className="flex gap-3">
        <Icon name="qr" size={34} className="shrink-0 text-accent-ink" />
        <div>
          <p className="font-bold">Got a QR code?</p>
          <p className="text-[15px] text-accent-ink">Scan it with your phone camera — it opens this page for you. No app store needed.</p>
        </div>
      </Card>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Input
          label="Or type the join code" placeholder="ABCD EFGH" value={text} error={error}
          onChange={(e) => { setText(e.target.value.toUpperCase()); setError(undefined); }}
          autoCapitalize="characters" autoComplete="one-time-code" autoCorrect="off" spellCheck={false} maxLength={80}
          className="font-mono text-xl tracking-[0.15em]" hint="A parent can show it under Family → member → QR code."
        />
        <Button type="submit" size="lg" block icon="forward">Continue</Button>
      </form>
      <div className="mt-auto pt-8 text-center text-[15px] text-muted">
        Have a username &amp; password?{' '}
        <LinkButton to="/login" variant="ghost" size="sm">Sign in</LinkButton>
      </div>
    </AuthShell>
  );
}

function JoinPreview({ code }: { code: string }) {
  const { me, mode, refresh, signOut } = useApp();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      await backend().ensureSession();
      return api.invitePreview(code);
    })()
      .then((p) => {
        if (!alive) return;
        if (p.ok) setPreview(p);
        else { setPreview(null); setError(friendlyError(new AppError((p.error ?? 'invite_invalid') as ErrorCode))); }
      })
      .catch((e) => { if (alive) setError(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code, attempt]);

  const join = useAction(async () => {
    const r = await api.redeemInvite(code, deviceLabel());
    if (!r.ok) throw new AppError((r.error ?? 'invite_invalid') as ErrorCode);
    await refresh({ tick: true });
    navigate('/me/secure?welcome=1', { replace: true });
  });

  const switchPerson = async () => {
    const secured = !!me?.has_password;
    const ok = await confirm({
      title: `Sign ${me?.display_name ?? 'the current person'} out of this phone?`,
      message: mode === 'demo'
        ? 'In the demo you can switch back any time.'
        : secured
          ? `${me?.display_name} can sign in again with their username & password.`
          : `⚠️ ${me?.display_name ?? 'This person'} has no password or Google sign-in. They'll need a new QR code from a parent to get back in.`,
      confirmLabel: 'Sign out', danger: !secured && mode !== 'demo',
    });
    if (!ok) return;
    await signOut();
    setAttempt((n) => n + 1);
  };

  if (loading) return <AuthShell><PageSpinner label="Checking the code…" /></AuthShell>;

  if (error || !preview) {
    return (
      <AuthShell>
        <PageHeader title="Join your family" back="/join" />
        <EmptyState
          emoji="😕" title="That code didn't work" message={error ?? undefined}
          action={
            <div className="flex flex-col gap-2">
              <LinkButton to="/join" icon="qr">Try another code</LinkButton>
              <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>Check again</Button>
            </div>
          }
        />
      </AuthShell>
    );
  }

  const elsewhere = !!preview.linked_elsewhere;
  return (
    <AuthShell>
      <PageHeader title="Join your family" back={me ? '/' : '/welcome'} />
      <Card className="flex flex-col items-center gap-2 py-7 text-center">
        <Avatar emoji={preview.avatar} name={preview.display_name} size="xl" />
        <p className="mt-2 text-lg">
          Join <strong className="font-extrabold">{preview.family_name}</strong> as
        </p>
        <h2 className="text-3xl font-extrabold leading-tight">{preview.display_name}</h2>
        <Badge tone="accent">{roleLabel(preview.role)}</Badge>
        {preview.expires_at && (
          <p className="mt-2 text-sm text-muted">Code valid until {formatWhen(preview.expires_at, deviceTimeZone())}</p>
        )}
      </Card>

      {elsewhere ? (
        <div className="mt-5 space-y-3">
          <Card tone="warn" className="flex gap-3">
            <Icon name="alert" className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[15px]">
              This phone is already signed in as <strong>{me?.display_name ?? 'someone else'}</strong>. One phone belongs to one
              person — sign out first to join as {preview.display_name}.
            </p>
          </Card>
          <Button size="lg" block variant="danger" icon="logout" onClick={switchPerson}>
            Sign out &amp; join as {preview.display_name}
          </Button>
          <LinkButton to={me ? '/' : '/welcome'} size="lg" block variant="secondary">Keep {me?.display_name ?? 'current person'}</LinkButton>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <Button size="lg" block icon="check" loading={join.busy} onClick={() => void join.run()}>Yes, that's me</Button>
          <LinkButton to={me ? '/' : '/welcome'} size="lg" block variant="ghost">No, that's not me</LinkButton>
        </div>
      )}
    </AuthShell>
  );
}
