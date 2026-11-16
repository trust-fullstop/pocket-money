import { useEffect, useState, type FormEvent } from 'react';
import { Route, Routes, useNavigate } from 'react-router';
import { DemoPeopleSheet } from '../../components/DemoPeopleSheet';
import {
  AVATAR_EMOJIS, Button, Card, EmojiGrid, GoogleLogo, Input, LinkButton, PageHeader, Select, useAction, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { backend } from '../../lib/backend';
import { cloudConfigured, switchMode } from '../../lib/backend/select';
import { friendlyError } from '../../lib/errors';
import { deviceTimeZone } from '../../lib/format';
import { useApp } from '../../lib/session';
import { AuthShell } from './AuthShell';

export default function Welcome() {
  return (
    <Routes>
      <Route index element={<Hero />} />
      <Route path="create" element={<CreateFamily />} />
    </Routes>
  );
}

function Hero() {
  const { mode } = useApp();
  const toast = useToast();
  const [people, setPeople] = useState(false);
  const [hasPeople, setHasPeople] = useState(false);

  useEffect(() => {
    if (mode !== 'demo') return;
    let alive = true;
    backend().demo?.people().then((p) => { if (alive) setHasPeople(p.length > 0); }).catch(() => undefined);
    return () => { alive = false; };
  }, [mode]);

  const google = async () => {
    try { await backend().signInWithGoogle(); } catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  return (
    <AuthShell>
      {mode === 'demo' && (
        <div className="mb-2 mt-1 flex items-center gap-2 rounded-2xl bg-amber-300 px-3 py-2 text-[14px] font-semibold text-amber-950" role="note">
          <span className="rounded-md bg-amber-950 px-1.5 py-0.5 text-[11px] font-black tracking-wider text-amber-300">DEMO</span>
          <span className="flex-1">Everything stays on this device.</span>
          {cloudConfigured && <button type="button" className="min-h-11 rounded-full px-2 font-bold underline" onClick={() => switchMode('cloud')}>Leave demo</button>}
        </div>
      )}
      <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-28 drop-shadow-md" />
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Pocket Money</h1>
        <p className="mt-2 text-lg text-muted">Earn it, save it, share family life.</p>
        <ul className="mt-5 flex flex-wrap justify-center gap-2 text-[14px] font-semibold" aria-label="What you can do">
          <li className="rounded-full bg-surface px-3 py-1.5 shadow-sm ring-1 ring-line">✅ Chores &amp; challenges</li>
          <li className="rounded-full bg-surface px-3 py-1.5 shadow-sm ring-1 ring-line">💰 Pocket money &amp; savings</li>
          <li className="rounded-full bg-surface px-3 py-1.5 shadow-sm ring-1 ring-line">📅 Family calendar</li>
        </ul>
      </div>

      <div className="space-y-3">
        {mode === 'demo' && hasPeople && (
          <Button size="lg" block icon="sparkles" onClick={() => setPeople(true)}>Explore the example family</Button>
        )}
        <LinkButton to="/welcome/create" size="lg" block variant={mode === 'demo' && hasPeople ? 'secondary' : 'primary'} icon="plus">
          Create our family
        </LinkButton>
        <LinkButton to="/join" size="lg" block variant="secondary" icon="qr">I have a QR code / join code</LinkButton>
        {mode === 'cloud' && (
          <Button size="lg" block variant="secondary" onClick={google}><GoogleLogo />Sign in with Google</Button>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-2 pt-1">
          <LinkButton to="/login" variant="ghost" size="sm" icon="key">Username &amp; password</LinkButton>
          {mode === 'cloud' && (
            <Button variant="ghost" size="sm" icon="sparkles" onClick={() => switchMode('demo')}>Try the demo</Button>
          )}
        </div>
      </div>
      <DemoPeopleSheet open={people} onClose={() => setPeople(false)} />
    </AuthShell>
  );
}

const CURRENCIES = [
  { value: 'EUR', label: '€ Euro (EUR)' },
  { value: 'ZAR', label: 'R South African rand (ZAR)' },
  { value: 'USD', label: '$ US dollar (USD)' },
  { value: 'GBP', label: '£ British pound (GBP)' },
];

function guessCurrency(tz: string): string {
  if (tz.startsWith('Africa/Johannesburg')) return 'ZAR';
  if (tz === 'Europe/London') return 'GBP';
  if (tz.startsWith('America/')) return 'USD';
  return 'EUR';
}

function timeZones(current: string): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    return all.includes(current) ? all : [current, ...all];
  } catch {
    return [current];
  }
}

function CreateFamily() {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [tz] = useState(deviceTimeZone);
  const [familyName, setFamilyName] = useState('');
  const [myName, setMyName] = useState('');
  const [avatar, setAvatar] = useState('🧑');
  const [currency, setCurrency] = useState(() => guessCurrency(tz));
  const [timezone, setTimezone] = useState(tz);
  const [errors, setErrors] = useState<{ family?: string; me?: string }>({});
  const create = useAction(async () => {
    await backend().ensureSession();
    await api.createFamily(familyName.trim(), myName.trim(), avatar, timezone, currency);
    await refresh({ tick: true });
    navigate('/me/secure?welcome=1', { replace: true });
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = {
      family: familyName.trim() ? undefined : 'Give your family a name',
      me: myName.trim() ? undefined : 'What should we call you?',
    };
    setErrors(errs);
    if (errs.family || errs.me) return;
    void create.run();
  };

  return (
    <AuthShell>
      <PageHeader title="Create our family" subtitle="You'll be the owner. Add the others afterwards." back="/welcome" />
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input
          label="Family name" placeholder="The Smiths" value={familyName} onChange={(e) => setFamilyName(e.target.value)}
          error={errors.family} maxLength={60} autoComplete="off" required
        />
        <Input
          label="Your name" hint="As the kids will see it, e.g. Mum, Dad or Oma." placeholder="Mum" value={myName}
          onChange={(e) => setMyName(e.target.value)} error={errors.me} maxLength={40} autoComplete="given-name" required
        />
        <Card>
          <div className="mb-3 flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-3xl" aria-hidden="true">{avatar}</span>
            <div>
              <div className="font-semibold">Your avatar</div>
              <div className="text-sm text-muted">You can use a photo later.</div>
            </div>
          </div>
          <EmojiGrid options={AVATAR_EMOJIS} value={avatar} onChange={setAvatar} label="Your avatar" />
        </Card>
        <Select label="Currency" options={CURRENCIES} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        <Select
          label="Time zone" hint="Used for due times and 'today'." options={timeZones(tz)} value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
        <Button type="submit" size="lg" block loading={create.busy} icon="check">Create family</Button>
      </form>
    </AuthShell>
  );
}
