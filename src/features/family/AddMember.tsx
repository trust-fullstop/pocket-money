import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AVATAR_EMOJIS, Avatar, Button, Card, Chip, EmojiGrid, EmptyState, Input, LinkButton, PageHeader, cx, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { roleChoiceLabel, roleLabel } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Invite, Role } from '../../lib/types';
import { InviteScreen } from './InviteScreen';
import { DEFAULT_AVATAR, addableRoles } from './perms';

type NewRole = Exclude<Role, 'owner'>;

const ROLE_HELP: Record<NewRole, string> = {
  parent: 'Can approve tasks, pay out money and change the rules.',
  step_parent: 'Same as a parent (bonus mum, bonus dad…): approves tasks and pays out money.',
  guardian: 'Approves tasks, pays out money and changes the rules. Only for someone who looks after the kids like a parent, such as a foster parent. Aunts, uncles and godparents go under “Grandparents and other family”.',
  grandparent: 'Can see all the children, their tasks, their needs and, if your Family rules allow it, their money. Can send gifts and set fun challenges. Can’t change rules or give consequences.',
  kid: 'Any age from 0 to 21. Does tasks, earns money, time and points.',
};

const RELATION_IDEAS: Record<NewRole, string[]> = {
  parent: ['Mum', 'Dad', 'Mama', 'Papa'],
  step_parent: ['Bonus mum', 'Bonus dad', 'Partner of Dad', 'Partner of Mum'],
  guardian: ['Foster parent', 'Legal guardian'],
  grandparent: [],
  kid: ['Son', 'Daughter', 'Bonus son', 'Bonus daughter', 'Cousin'],
};

/** Ideas for "Other family", who type their own label. */
const OTHER_FAMILY_IDEAS = ['Great-grandma', 'Great-aunt', 'Great-uncle', 'Cousin', 'Bonus oma'];

interface Preset {
  key: string;
  label: string;
  emoji: string;
  role: NewRole;
  /** The "What do you call them?" label it fills in ('' = none, the role name shows). */
  relation: string;
  /** "Other family": they type the label themselves (required). */
  custom?: boolean;
}

const relative = (key: string, label: string, emoji: string): Preset => ({ key, label, emoji, role: 'grandparent', relation: label });

// Aunts, uncles and godparents look out for the kids "much the same as grandparents": same limited role, own label.
const PRESET_GROUPS: { title: string; presets: Preset[] }[] = [
  {
    title: 'Kids and parents',
    presets: [
      { key: 'kid', label: 'Kid', emoji: DEFAULT_AVATAR.kid, role: 'kid', relation: '' },
      { key: 'parent', label: 'Parent', emoji: DEFAULT_AVATAR.parent, role: 'parent', relation: '' },
      { key: 'step_parent', label: 'Bonus parent', emoji: DEFAULT_AVATAR.step_parent, role: 'step_parent', relation: '' },
    ],
  },
  {
    title: 'Grandparents and other family',
    presets: [
      relative('grandma', 'Grandma', '👵'), relative('grandpa', 'Grandpa', '👴'),
      relative('oma', 'Oma', '👵'), relative('opa', 'Opa', '👴'),
      relative('aunt', 'Aunt', '👩'), relative('uncle', 'Uncle', '👨'),
      relative('godmother', 'Godmother', '👩'), relative('godfather', 'Godfather', '👨'),
      { key: 'other', label: 'Other family', emoji: '🧑', role: 'grandparent', relation: '', custom: true },
    ],
  },
  {
    title: 'Cares for the kids like a parent',
    presets: [{ key: 'guardian', label: 'Guardian', emoji: DEFAULT_AVATAR.guardian, role: 'guardian', relation: '' }],
  },
];
const PRESETS = PRESET_GROUPS.flatMap((g) => g.presets);

export default function AddMember() {
  const { me, isManager, refresh, family } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const relationId = useId();
  const roles = me ? addableRoles(me, { managersAddAdults: !!family?.settings.managers_add_adults }) : [];
  const [name, setName] = useState('');
  const [presetKey, setPresetKey] = useState('kid');
  const [relation, setRelation] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [relationError, setRelationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; avatar: string; invite: Invite } | null>(null);
  const sending = useRef(false);

  if (!me || !isManager) {
    return (
      <>
        <PageHeader title="Add someone" back="/family" />
        <EmptyState emoji="🔒" title="Only parents can add people." action={<LinkButton to="/family" variant="secondary">Back to family</LinkButton>} />
      </>
    );
  }

  const groups = PRESET_GROUPS
    .map((g) => ({ ...g, presets: g.presets.filter((p) => roles.includes(p.role)) }))
    .filter((g) => g.presets.length > 0);
  const preset = PRESETS.find((p) => p.key === presetKey && roles.includes(p.role)) ?? groups[0]?.presets[0] ?? PRESETS[0];
  const role = preset.role;
  const avatar = picked ?? preset.emoji;
  const emojiOptions = AVATAR_EMOJIS.includes(avatar) ? AVATAR_EMOJIS : [avatar, ...AVATAR_EMOJIS];
  const ideas = preset.custom ? OTHER_FAMILY_IDEAS : RELATION_IDEAS[role];
  const focusRelation = () => requestAnimationFrame(() => document.getElementById(relationId)?.focus());

  const choose = (p: Preset) => {
    setPresetKey(p.key);
    setRelation(p.relation);
    setRelationError(null);
    setPicked(null);
    if (p.custom) focusRelation();
  };

  const submit = async () => {
    if (sending.current) return;
    const clean = name.trim();
    const rel = relation.trim().slice(0, 30);
    if (!clean) { setNameError('Please type a name.'); return; }
    setNameError(null);
    if (preset.custom && !rel) { setRelationError('Please type what the kids call them.'); focusRelation(); return; }
    setRelationError(null);
    sending.current = true;
    setBusy(true);
    try {
      const res = await api.addMember(clean.slice(0, 40), role, avatar, rel || null);
      setCreated({ id: res.member_id, name: clean, avatar, invite: res.invite });
      void refresh();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'invalid' && err.detail === 'too_many_members') toast.show('A family can have up to 30 people.', 'error');
      else if (err.code === 'invalid') setNameError('Please check the name.');
      else toast.show(friendlyError(e), 'error');
    } finally {
      sending.current = false;
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
        <fieldset className="space-y-3">
          <legend className="mb-2 text-[15px] font-semibold text-ink">Who are they?</legend>
          {groups.map((g) => (
            <div key={g.title} className="space-y-1.5">
              <p className="text-sm font-semibold text-muted" aria-hidden="true">{g.title}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={g.title}>
                {g.presets.map((p) => (
                  <Chip key={p.key} emoji={p.emoji} selected={p.key === preset.key} onClick={() => choose(p)}>{p.label}</Chip>
                ))}
              </div>
            </div>
          ))}
          <div
            className={cx('rounded-2xl px-4 py-3 text-[15px] leading-snug', role === 'guardian' ? 'bg-warn-soft text-warn' : 'bg-surface-2')}
            aria-live="polite"
          >
            <p className="font-bold">
              {role === 'guardian'
                ? <><span aria-hidden="true">⚠️ </span>Guardian: can do everything a parent can.</>
                : <>Role: {roleChoiceLabel(role)}</>}
            </p>
            <p className={cx('mt-0.5', role !== 'guardian' && 'text-muted')}>{ROLE_HELP[role]}</p>
          </div>
        </fieldset>
        <div>
          <Input
            id={relationId}
            label="What do you call them?"
            value={relation}
            maxLength={30}
            autoComplete="off"
            onChange={(e) => { setRelation(e.target.value); setRelationError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            placeholder={preset.custom ? 'Great-aunt' : preset.relation || RELATION_IDEAS[role][0] || ''}
            hint={preset.custom
              ? 'Type what the kids call them. It’s shown instead of a role name.'
              : `Shown instead of “${roleLabel(role)}”. Type anything you like.`}
            error={relationError ?? undefined}
            optional={!preset.custom}
          />
          {ideas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Ideas">
              {ideas.map((idea) => (
                <Chip key={idea} selected={relation === idea} onClick={() => { setRelation(relation === idea ? '' : idea); setRelationError(null); }}>{idea}</Chip>
              ))}
            </div>
          )}
        </div>
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
