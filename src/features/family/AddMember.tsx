import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AVATAR_EMOJIS, Avatar, Button, Card, EmojiGrid, EmptyState, Input, LinkButton, PageHeader, Select, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { roleLabel } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Invite, Role } from '../../lib/types';
import { InviteScreen } from './InviteScreen';
import { DEFAULT_AVATAR, addableRoles } from './perms';

type NewRole = Exclude<Role, 'owner'>;

const ROLE_HELP: Record<NewRole, string> = {
  parent: 'Can approve tasks, pay out money and change the rules.',
  step_parent: 'Same as a parent: approves tasks and pays out money.',
  guardian: 'Same as a parent: approves tasks and pays out money.',
  grandparent: 'Can cheer the kids on, give gifts and set small challenges.',
  kid: 'Does tasks, earns money, time and points.',
};

export default function AddMember() {
  const { me, isManager, refresh } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const roles = me ? addableRoles(me) : [];
  const [name, setName] = useState('');
  const [role, setRole] = useState<NewRole>('kid');
  const [picked, setPicked] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; avatar: string; invite: Invite } | null>(null);

  if (!me || !isManager) {
    return (
      <>
        <PageHeader title="Add someone" back="/family" />
        <EmptyState emoji="🔒" title="Only parents can add people." action={<LinkButton to="/family" variant="secondary">Back to family</LinkButton>} />
      </>
    );
  }

  const avatar = picked ?? DEFAULT_AVATAR[role];
  const emojiOptions = AVATAR_EMOJIS.includes(avatar) ? AVATAR_EMOJIS : [avatar, ...AVATAR_EMOJIS];

  const submit = async () => {
    const clean = name.trim();
    if (!clean) { setNameError('Please type a name.'); return; }
    setNameError(null);
    setBusy(true);
    try {
      const res = await api.addMember(clean.slice(0, 40), role, avatar);
      setCreated({ id: res.member_id, name: clean, avatar, invite: res.invite });
      void refresh();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'invalid' && err.detail === 'too_many_members') toast.show('A family can have up to 30 people.', 'error');
      else if (err.code === 'invalid') setNameError('Please check the name.');
      else toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Add someone" subtitle="They’ll join by scanning a QR code — no email needed." back="/family" />
      <Card className="space-y-5">
        <div className="flex justify-center">
          <Avatar emoji={avatar} name="" size="xl" ring />
        </div>
        <Input
          label="Name"
          value={name}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => { setName(e.target.value); setNameError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          error={nameError ?? undefined}
          placeholder="Sam"
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as NewRole)}
          options={roles.map((r) => ({ value: r, label: roleLabel(r) }))}
          hint={ROLE_HELP[role]}
        />
        <div>
          <h2 className="mb-2 text-[15px] font-semibold">Avatar</h2>
          <EmojiGrid label="Avatar emoji" options={emojiOptions} value={avatar} onChange={setPicked} />
        </div>
        <Button size="lg" block icon="qr" loading={busy} onClick={submit}>Make QR code</Button>
      </Card>
      <p className="mt-4 px-1 text-[14px] text-muted">
        The code works once and runs out after 30 minutes. You can always make a new one from their profile.
      </p>

      {created && (
        <InviteScreen
          member={{ id: created.id, display_name: created.name, avatar: created.avatar, photo_path: null, theme: {} }}
          initialInvite={created.invite}
          purpose="join"
          onClose={() => navigate(`/family/${created.id}`, { replace: true })}
        />
      )}
    </>
  );
}
