import { useState, type FormEvent } from 'react';
import {
  AVATAR_EMOJIS, Avatar, Badge, Button, EmojiGrid, Icon, Input, ListRow, PhotoCapture, Select, Sheet, Spinner,
  cx, useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { roleChoiceLabel, roleLabel, timeAgo } from '../../lib/format';
import { uploadPhoto } from '../../lib/photos';
import { useApp, type LoadResult } from '../../lib/session';
import { ACCENTS, CHARACTERS, type AccentKey } from '../../lib/theme';
import type { LoginDevice, Member, Role } from '../../lib/types';

interface SheetBase {
  member: Member;
  onClose: () => void;
}

// ------------------------------------------------------------------ signed-in devices

export function LoginsSheet({ member, onClose, logins }: SheetBase & { logins: LoadResult<LoginDevice[] | null> }) {
  const { refresh, now } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [removing, setRemoving] = useState<string | null>(null);
  const list = [...(logins.data ?? [])].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at));

  const remove = async (d: LoginDevice) => {
    const ok = await confirm({
      title: `Sign ${member.display_name} out on ${d.label ? `“${d.label}”` : 'this phone'}?`,
      message: 'To use it again they’ll need a new QR code or their password.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    setRemoving(d.id);
    try {
      await api.removeLogin(d.id);
      toast.show('Signed out', 'success');
      await logins.reload();
      void refresh();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Devices signed in" description={`Phones and computers where ${member.display_name} is signed in.`}>
      {logins.loading && !logins.data ? (
        <div className="flex items-center gap-3 py-4 text-muted"><Spinner /> Loading…</div>
      ) : logins.error && !logins.data ? (
        <div className="space-y-2 py-2" role="alert">
          <p>{logins.error}</p>
          <Button size="sm" variant="secondary" icon="reset" onClick={logins.reload}>Try again</Button>
        </div>
      ) : list.length === 0 ? (
        <p className="py-4 text-muted">Not signed in anywhere yet. Use “Connect a device” to show them a QR code.</p>
      ) : (
        <ul className="-mx-5 divide-y divide-line">
          {list.map((d) => (
            <li key={d.id}>
              <ListRow
                left={
                  <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted">
                    <Icon name="device" size={20} />
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    {d.label || 'Unnamed device'}
                    {d.current && <Badge tone="accent">This phone</Badge>}
                  </span>
                }
                subtitle={`Last seen ${timeAgo(d.last_seen_at, now())}`}
                right={
                  <Button
                    variant="ghost" size="sm" className="!text-bad" loading={removing === d.id}
                    onClick={() => remove(d)} aria-label={`Sign out ${d.label || 'device'}`}
                  >
                    Remove
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ username & password

export function CredentialsSheet({ member, onClose }: SheetBase) {
  const { refresh } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [user, setUser] = useState(member.username ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [errors, setErrors] = useState<{ user?: string; pw?: string; pw2?: string }>({});
  const name = member.display_name;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
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
      await api.setCredentials(u, pw, member.id);
      toast.show('Password set ✅', 'success');
      void refresh();
      onClose();
    } catch (err) {
      const msg = friendlyError(err);
      const code = toAppError(err).code;
      if (code === 'username_taken' || /username/i.test(msg)) setErrors({ user: msg });
      else toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    const ok = await confirm({
      title: `Remove ${name}’s password?`,
      message: `${name} stays signed in on their devices, but can’t sign in on a new one with a password until a new one is set.`,
      confirmLabel: 'Remove password',
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      await api.clearCredentials(member.id);
      toast.show('Password removed', 'success');
      void refresh();
      onClose();
    } catch (err) {
      toast.show(friendlyError(err), 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Reset sign-in"
      description={member.has_password ? `Password set ✅${member.username ? ` · username “${member.username}”` : ''}` : 'No password yet'}
      footer={
        <div className="space-y-2">
          <Button block size="lg" icon="check" loading={busy} onClick={() => submit()}>Save new password</Button>
          {member.has_password && (
            <Button block variant="ghost" className="!text-bad" icon="trash" loading={clearing} onClick={clear}>Remove password</Button>
          )}
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4 pt-1" noValidate>
        <p className="text-[15px] text-muted">
          With a username and password {name} can sign in on any phone, without a QR code. Tell them the new password in person.
        </p>
        <Input
          label="Username" value={user} onChange={(e) => setUser(e.target.value)} error={errors.user}
          autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={24}
          hint="Letters, numbers, . _ -" prefix={<Icon name="user" size={18} />}
        />
        <Input
          label="New password" type={show ? 'text' : 'password'} value={pw}
          onChange={(e) => setPw(e.target.value)} error={errors.pw} autoComplete="new-password" hint="At least 6 characters"
          suffix={
            <button type="button" onClick={() => setShow((s) => !s)} className="min-h-11 px-2 text-sm font-semibold text-accent-ink" aria-pressed={show}>
              {show ? 'Hide' : 'Show'}
            </button>
          }
        />
        <Input
          label="Type it again" type={show ? 'text' : 'password'} value={pw2}
          onChange={(e) => setPw2(e.target.value)} error={errors.pw2} autoComplete="new-password"
        />
      </form>
    </Sheet>
  );
}

// ------------------------------------------------------------------ role (owner only)

const ROLE_CHOICES: Role[] = ['parent', 'step_parent', 'guardian', 'grandparent', 'kid', 'owner'];

export function RoleSheet({ member, onClose }: SheetBase) {
  const { refresh } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [role, setRole] = useState<Role>(member.role);
  const [busy, setBusy] = useState(false);
  const name = member.display_name;

  const save = async () => {
    if (role === member.role) { onClose(); return; }
    if (role === 'owner') {
      const ok = await confirm({
        title: `Make ${name} the owner?`,
        message: 'You become a parent. Only the owner can change roles or delete the family.',
        confirmLabel: `Make ${name} owner`,
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.setRole(member.id, role);
      toast.show(`${name} is now ${roleLabel(role).toLowerCase()}`, 'success');
      void refresh();
      onClose();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Change ${name}’s role`}
      footer={<Button block size="lg" icon="check" loading={busy} onClick={save}>Save</Button>}
    >
      <div className="space-y-3 pt-1">
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={ROLE_CHOICES.map((r) => ({ value: r, label: r === 'owner' ? 'Owner (hand over to them)' : roleChoiceLabel(r) }))}
        />
        {role === 'guardian' && member.role !== 'guardian' && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-[15px] font-semibold text-warn" role="status">
            <span aria-hidden="true">⚠️ </span>Guardian: can do everything a parent can.
          </p>
        )}
        <ul className="space-y-1 text-[14px] text-muted">
          <li><strong className="text-ink">Parent, bonus parent, guardian:</strong> approve tasks, pay out money, change rules.</li>
          <li><strong className="text-ink">Grandparents and other family</strong> (aunts, uncles, godparents): gifts and fun challenges.</li>
          <li><strong className="text-ink">Kid:</strong> does tasks and earns.</li>
        </ul>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ name, avatar & look

export function IdentitySheet({ member, onClose, familyId, withLook }: SheetBase & { familyId: string; withLook: boolean }) {
  const { refresh } = useApp();
  const toast = useToast();
  const [name, setName] = useState(member.display_name);
  const [avatar, setAvatar] = useState(member.avatar);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [accent, setAccent] = useState<string>(member.theme?.accent && member.theme.accent in ACCENTS ? member.theme.accent : 'teal');
  const [character, setCharacter] = useState<string | null>(member.theme?.character ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const save = async () => {
    if (!name.trim()) { setError('The name can’t be empty'); return; }
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { display_name: name.trim(), avatar };
      if (photo) patch.photo_path = await uploadPhoto(familyId, 'avatars', photo);
      else if (removePhoto) patch.photo_path = null;
      if (withLook) {
        const theme: Record<string, unknown> = { ...member.theme, accent, classic: false };
        if (character) theme.character = character; else delete theme.character;
        patch.theme = theme;
      }
      await api.updateMember(member.id, patch);
      toast.show('Saved', 'success');
      void refresh();
      onClose();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const previewPhoto = removePhoto ? null : member.photo_path;
  const previewTheme = withLook ? { ...member.theme, accent, classic: false } : member.theme;
  return (
    <Sheet
      open
      onClose={onClose}
      title={withLook ? 'Name & look' : 'Name & avatar'}
      footer={<Button block size="lg" loading={busy} onClick={save} icon="check">Save</Button>}
    >
      <div className="space-y-5">
        <div className="flex justify-center pt-1">
          <Avatar
            member={{ ...member, theme: previewTheme }} emoji={avatar}
            photoPath={photo ? null : previewPhoto} size="xl" ring name=""
          />
        </div>
        <Input label="Name" value={name} onChange={(e) => { setName(e.target.value); setError(undefined); }} error={error} maxLength={40} />
        <PhotoCapture
          label="Use a photo" value={photo} capture={false} hint="Only your family can see it."
          onChange={(b) => { setPhoto(b); if (b) setRemovePhoto(false); }}
        />
        {member.photo_path && !photo && !removePhoto && (
          <Button variant="ghost" size="sm" icon="trash" onClick={() => setRemovePhoto(true)}>Remove photo</Button>
        )}
        <div>
          <h3 className="mb-2 text-[15px] font-semibold">{photo || (member.photo_path && !removePhoto) ? 'Or pick an emoji' : 'Pick an emoji'}</h3>
          <EmojiGrid
            options={AVATAR_EMOJIS.includes(avatar) ? AVATAR_EMOJIS : [avatar, ...AVATAR_EMOJIS]}
            value={avatar}
            onChange={(e) => { setAvatar(e); setPhoto(null); if (member.photo_path) setRemovePhoto(true); }}
            label="Avatar emoji"
          />
        </div>

        {withLook && (
          <>
            <div>
              <h3 id="member-accent-label" className="mb-2 text-[15px] font-semibold">Colour</h3>
              <div role="radiogroup" aria-labelledby="member-accent-label" className="grid grid-cols-6 gap-2">
                {(Object.keys(ACCENTS) as AccentKey[]).filter((k) => k !== 'classic').map((k) => {
                  const a = ACCENTS[k];
                  const on = accent === k;
                  return (
                    <button
                      key={k} type="button" role="radio" aria-checked={on} aria-label={a.name} title={a.name}
                      onClick={() => setAccent(k)}
                      className={cx('grid aspect-square min-h-11 place-items-center rounded-full text-white transition', on ? 'ring-4 ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
                      style={{ background: a[600], ['--tw-ring-color' as string]: a[500] }}
                    >
                      {on && <Icon name="check" size={22} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 id="member-char-label" className="mb-2 text-[15px] font-semibold">Character</h3>
              <div role="radiogroup" aria-labelledby="member-char-label" className="grid grid-cols-3 gap-2">
                {Object.entries(CHARACTERS).map(([key, c]) => {
                  const on = character === key;
                  return (
                    <button
                      key={key} type="button" role="radio" aria-checked={on} onClick={() => setCharacter(key)}
                      className={cx(
                        'flex min-h-11 flex-col items-center gap-0.5 rounded-2xl border-2 px-1 py-3 transition',
                        on ? 'border-accent-strong bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
                      )}
                    >
                      <span className="text-4xl leading-none" aria-hidden="true">{c.emoji}</span>
                      <span className="text-[14px] font-bold">{c.name}</span>
                    </button>
                  );
                })}
                <button
                  type="button" role="radio" aria-checked={character === null} onClick={() => setCharacter(null)}
                  className={cx(
                    'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 py-3 transition',
                    character === null ? 'border-accent-strong bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
                  )}
                >
                  <span className="text-4xl leading-none" aria-hidden="true">🚫</span>
                  <span className="text-[14px] font-bold">None</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ remove from family

export function RemoveSheet({ member, onClose, onRemoved }: SheetBase & { onRemoved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const name = member.display_name;

  const remove = async () => {
    setBusy(true);
    try {
      await api.removeMember(member.id);
      toast.show(`${name} was removed from the family`, 'success');
      onRemoved();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Remove ${name} from the family?`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" size="lg" block icon="trash" loading={busy} onClick={remove}>Remove {name}</Button>
        </div>
      }
    >
      <p className="pt-1 text-[16px]">
        {name} will be signed out everywhere. Their open tasks and requests are cancelled. This can’t be undone.
      </p>
    </Sheet>
  );
}
