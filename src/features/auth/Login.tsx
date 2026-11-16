import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Icon, Input, LinkButton, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { backend } from '../../lib/backend';
import { AppError, friendlyError, type ErrorCode } from '../../lib/errors';
import { deviceLabel, deviceTimeZone, formatTime } from '../../lib/format';
import { useApp } from '../../lib/session';
import { AuthShell } from './AuthShell';

/** /login — username & password (set up earlier under Me → Sign-in & devices). */
export default function Login() {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError('Fill in both your username and password.'); return; }
    setBusy(true);
    setError(null);
    try {
      await backend().ensureSession();
      const r = await api.loginWithPassword(username.trim().toLowerCase(), password, deviceLabel());
      if (!r.ok) {
        if (r.error === 'locked' && r.until) setError(`Too many wrong tries. Try again after ${formatTime(r.until, deviceTimeZone())}.`);
        else setError(friendlyError(new AppError((r.error ?? 'bad_login') as ErrorCode)));
        return;
      }
      await refresh({ tick: true });
      navigate('/', { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <PageHeader title="Sign in" subtitle="With your Pocket Money username" back="/welcome" />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Username" value={username} onChange={(e) => setUsername(e.target.value)}
          autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={24} required
        />
        <Input
          label="Password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" maxLength={72} required
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-5 accent-[var(--accent-strong)]" />
          Show password
        </label>
        {error && (
          <Card tone="bad" className="flex gap-2" role="alert">
            <Icon name="alert" className="shrink-0 text-bad" /><span className="text-[15px] font-semibold">{error}</span>
          </Card>
        )}
        <Button type="submit" size="lg" block loading={busy} icon="key">Sign in</Button>
      </form>
      <div className="mt-auto pt-8 text-center text-[15px] text-muted">
        No password yet? A parent can show you a QR code.
        <div><LinkButton to="/join" variant="ghost" size="sm" icon="qr">I have a QR code</LinkButton></div>
      </div>
    </AuthShell>
  );
}
