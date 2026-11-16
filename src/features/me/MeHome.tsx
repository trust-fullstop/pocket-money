import { useState } from 'react';
import { DemoPeopleSheet } from '../../components/DemoPeopleSheet';
import {
  AVATAR_EMOJIS, Avatar, Badge, Button, Card, EmojiGrid, Icon, Input, ListRow, PageHeader, PhotoCapture, ProgressBar,
  Section, Segmented, Sheet, Toggle, cx, useToast, type IconName,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { points, roleLabel } from '../../lib/format';
import { uploadPhoto } from '../../lib/photos';
import { useApp } from '../../lib/session';
import { ACCENTS, CHARACTERS, accentOf, levelFromPoints, type AccentKey, type ColorMode } from '../../lib/theme';
import type { Member, Theme } from '../../lib/types';
import { useSecured } from './useSecured';

export default function MeHome() {
  const { me, family, isManager, mode, balancesOf, patchMe, refresh } = useApp();
  const toast = useToast();
  const [identity, setIdentity] = useState(false);
  const [people, setPeople] = useState(false);
  const { secured } = useSecured(me);
  if (!me || !family) return null;

  const theme: Theme = me.theme ?? {};
  const pts = balancesOf(me.id).points;
  const accentKey = theme.classic ? 'classic' : theme.accent && theme.accent in ACCENTS ? theme.accent : 'teal';

  const saveTheme = async (patch: Partial<Theme>) => {
    const next: Theme = { ...theme, ...patch };
    patchMe({ theme: next });
    try {
      await api.updateMember(me.id, { theme: next });
    } catch (e) {
      toast.show(friendlyError(e), 'error');
      await refresh().catch(() => undefined);
    }
  };

  return (
    <>
      <PageHeader title="Me" back />

      <Card className="flex items-center gap-4">
        <button type="button" onClick={() => setIdentity(true)} className="relative shrink-0 rounded-full" aria-label="Change name and avatar">
          <Avatar member={me} size="xl" ring />
          <span className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full bg-surface text-ink shadow ring-1 ring-line" aria-hidden="true">
            <Icon name="edit" size={17} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-extrabold leading-tight">{me.display_name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{roleLabel(me.role)}</Badge>
            <span className="truncate text-sm text-muted">{family.name}</span>
          </div>
          <Button variant="ghost" size="sm" icon="edit" className="-ml-3 mt-1" onClick={() => setIdentity(true)}>Name &amp; avatar</Button>
        </div>
      </Card>

      <Section title="My look" className="mt-6">
        <Card className="space-y-6">
          <div>
            <h3 id="accent-label" className="mb-2 font-semibold">Colour</h3>
            <div role="radiogroup" aria-labelledby="accent-label" className="grid grid-cols-6 gap-2">
              {(Object.keys(ACCENTS) as AccentKey[]).map((k) => {
                const a = ACCENTS[k];
                const on = accentKey === k;
                return (
                  <button
                    key={k} type="button" role="radio" aria-checked={on} aria-label={a.name} title={a.name}
                    onClick={() => saveTheme(k === 'classic' ? { accent: k } : { accent: k, classic: false })}
                    className={cx('grid aspect-square min-h-11 place-items-center rounded-full text-white transition', on ? 'ring-4 ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
                    style={{ background: a[600], ['--tw-ring-color' as string]: a[500] }}
                  >
                    {on && <Icon name="check" size={22} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-muted">{theme.classic ? 'Classic look is on' : accentOf(theme).name}</p>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Light or dark</h3>
            <Segmented<ColorMode>
              label="Light or dark" value={theme.mode ?? 'system'} onChange={(m) => saveTheme({ mode: m })}
              options={[
                { value: 'light', label: 'Light', icon: 'sun' },
                { value: 'dark', label: 'Dark', icon: 'moon' },
                { value: 'system', label: 'Auto', icon: 'auto' },
              ]}
            />
          </div>

          {!theme.classic && (
            <CharacterPicker value={theme.character ?? null} points={pts} onChange={(c) => saveTheme({ character: c ?? undefined })} />
          )}

          {isManager && (
            <Toggle
              label="Classic look" description="Calm grey colours, no characters. Just the facts."
              checked={!!theme.classic} onChange={(on) => saveTheme({ classic: on })}
            />
          )}
        </Card>
      </Section>

      <Section title="About me" className="mt-6">
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          <ListRow to="/me/profile" left={<RowIcon icon="heart" />} title="My emergency card" subtitle="Allergies, doctor, emergency contacts…" />
          <ListRow
            to="/me/secure" left={<RowIcon icon={secured ? 'shield-check' : 'shield'} warn={!secured} />} title="Sign-in & devices"
            subtitle={secured ? 'Secured — you can sign in on a new phone' : '⚠️ Only this phone so far'}
          />
          {mode === 'demo' && (
            <ListRow onClick={() => setPeople(true)} left={<RowIcon icon="swap" />} title="Switch person" subtitle="Demo: try the app as someone else" />
          )}
        </Card>
      </Section>

      <p className="mt-8 text-center text-xs text-muted">Pocket Money · {mode === 'demo' ? 'Demo (on this device)' : 'Cloud'}</p>

      <IdentitySheet open={identity} onClose={() => setIdentity(false)} me={me} familyId={family.id} />
      {mode === 'demo' && <DemoPeopleSheet open={people} onClose={() => setPeople(false)} />}
    </>
  );
}

function RowIcon({ icon, warn }: { icon: IconName; warn?: boolean }) {
  return (
    <span className={cx('grid size-10 place-items-center rounded-full', warn ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent-ink')}>
      <Icon name={icon} size={20} />
    </span>
  );
}

function CharacterPicker({ value, points: pts, onChange }: { value: string | null; points: number; onChange: (c: string | null) => void }) {
  const level = levelFromPoints(pts, value);
  const current = value ? CHARACTERS[value] : null;
  return (
    <div>
      <h3 id="char-label" className="mb-1 font-semibold">My character</h3>
      <p className="mb-3 text-sm text-muted">Earn points and your character levels up.</p>
      {current && (
        <div className="mb-3 rounded-2xl bg-accent-soft p-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl" aria-hidden="true">{current.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-accent-ink">Level {level.level} · {level.title}</div>
              <div className="text-sm text-accent-ink/80">{points(level.toNext)} to level {level.level + 1}</div>
            </div>
          </div>
          <ProgressBar className="mt-2" value={level.progressPct} label={`Progress to level ${level.level + 1}`} valueText={`${level.progressPct}%`} />
        </div>
      )}
      <div role="radiogroup" aria-labelledby="char-label" className="grid grid-cols-3 gap-2">
        {Object.entries(CHARACTERS).map(([key, c]) => {
          const on = value === key;
          return (
            <button
              key={key} type="button" role="radio" aria-checked={on} onClick={() => onChange(key)}
              className={cx(
                'flex flex-col items-center gap-0.5 rounded-2xl border-2 px-1 py-3 transition',
                on ? 'border-accent-strong bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
              )}
            >
              <span className="text-4xl leading-none" aria-hidden="true">{c.emoji}</span>
              <span className="text-[14px] font-bold">{c.name}</span>
              <span className="text-[12px] text-muted">{on ? `Lv ${level.level}` : levelFromPoints(pts, key).title}</span>
            </button>
          );
        })}
        <button
          type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)}
          className={cx(
            'flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 py-3 transition',
            value === null ? 'border-accent-strong bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
          )}
        >
          <span className="text-4xl leading-none" aria-hidden="true">🚫</span>
          <span className="text-[14px] font-bold">None</span>
        </button>
      </div>
    </div>
  );
}

function IdentitySheet({ open, onClose, me, familyId }: { open: boolean; onClose: () => void; me: Member; familyId: string }) {
  const { refresh } = useApp();
  const toast = useToast();
  const [name, setName] = useState(me.display_name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const reset = () => { setName(me.display_name); setAvatar(me.avatar); setPhoto(null); setRemovePhoto(false); setError(undefined); };
  const close = () => { reset(); onClose(); };

  const save = async () => {
    if (!name.trim()) { setError('Your name can’t be empty'); return; }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { display_name: name.trim(), avatar };
      if (photo) patch.photo_path = await uploadPhoto(familyId, 'avatars', photo);
      else if (removePhoto) patch.photo_path = null;
      await api.updateMember(me.id, patch);
      await refresh();
      toast.show('Saved', 'success');
      setPhoto(null);
      setRemovePhoto(false);
      onClose();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const previewPhoto = removePhoto ? null : me.photo_path;
  return (
    <Sheet
      open={open} onClose={close} title="Name & avatar"
      footer={<Button block size="lg" loading={busy} onClick={save} icon="check">Save</Button>}
    >
      <div className="space-y-5">
        <div className="flex justify-center pt-1">
          <Avatar member={me} emoji={avatar} photoPath={photo ? null : previewPhoto} size="xl" ring />
        </div>
        <Input label="Name" value={name} onChange={(e) => { setName(e.target.value); setError(undefined); }} error={error} maxLength={40} />
        <PhotoCapture label="Use a photo" value={photo} onChange={(b) => { setPhoto(b); if (b) setRemovePhoto(false); }} capture={false} hint="Only your family can see it." />
        {me.photo_path && !photo && !removePhoto && (
          <Button variant="ghost" size="sm" icon="trash" onClick={() => setRemovePhoto(true)}>Remove my photo</Button>
        )}
        <div>
          <h3 className="mb-2 text-[15px] font-semibold">{photo || (me.photo_path && !removePhoto) ? 'Or pick an emoji' : 'Pick an emoji'}</h3>
          <EmojiGrid options={AVATAR_EMOJIS} value={avatar} onChange={(e) => { setAvatar(e); setPhoto(null); setRemovePhoto(true); }} label="Avatar emoji" />
        </div>
      </div>
    </Sheet>
  );
}
