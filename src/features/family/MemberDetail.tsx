import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Avatar, Badge, Card, EmptyState, Icon, LinkButton, ListRow, PageHeader, Section, buttonClass, cx, type IconName,
} from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, memberRoleLabel, money, plural, roleLabel, todayISO, life360Href } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import { characterOf, levelFromPoints } from '../../lib/theme';
import type { Member, Profile } from '../../lib/types';
import { InviteScreen } from './InviteScreen';
import { AllowanceSheet, CredentialsSheet, IdentitySheet, LoginsSheet, RemoveSheet, RoleSheet } from './MemberSheets';
import {
  ageFrom, canChangeRole, canEditMember, canManageLogin, canRemoveMember, canSetAllowance,
} from './perms';

type SheetKind = 'logins' | 'credentials' | 'role' | 'allowance' | 'identity' | 'remove';

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const firstName = (name: string) => name.split(/\s+/)[0] || name;

export default function MemberDetail() {
  const { memberId = '' } = useParams();
  const { me, family, membersById, members, isManager, now, state, refresh } = useApp();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [qr, setQr] = useState(false);
  const m: Member | undefined = membersById[memberId];
  const manageLogin = !!(me && m && m.id !== me.id && canManageLogin(me, m));

  const logins = useLoad(
    () => (manageLogin ? api.listLogins(memberId) : Promise.resolve(null)),
    [memberId, manageLogin, state?.now],
  );

  if (!me || !family) return null;
  if (!m) {
    return (
      <>
        <PageHeader title="Family" back="/family" />
        <EmptyState
          emoji="🤷"
          title="We couldn’t find this person."
          message="They may have been removed from the family."
          action={<LinkButton to="/family" variant="secondary">Back to family</LinkButton>}
        />
      </>
    );
  }

  const self = m.id === me.id;
  const tz = family.timezone;
  const today = todayISO(tz, now());
  const age = ageFrom(m.profile?.birthday, today);
  const canEdit = canEditMember(me, m);
  const balances = state?.balances[m.id];
  const char = characterOf(m.theme);
  const level = m.role === 'kid' && balances ? levelFromPoints(balances.points, char?.key) : null;
  const deviceCount = logins.data?.length;
  const owner = members.find((x) => x.role === 'owner');
  const showBankNote = self || isManager;

  const manageRows: ReactNode[] = [];
  if (!self) {
    if (manageLogin) {
      manageRows.push(
        <ListRow
          key="connect" onClick={() => setQr(true)} left={<RowIcon icon="qr" />}
          title="Connect a device"
          subtitle={m.linked ? 'Lost their phone or got a new one? Show a QR code.' : 'Show a QR code so they can join.'}
        />,
        <ListRow
          key="logins" onClick={() => setSheet('logins')} left={<RowIcon icon="device" />}
          title="Devices signed in"
          subtitle={deviceCount === undefined ? (m.linked ? 'Connected' : 'None yet') : deviceCount === 0 ? 'None yet' : plural(deviceCount, 'device')}
        />,
        <ListRow
          key="credentials" onClick={() => setSheet('credentials')} left={<RowIcon icon="key" />}
          title="Reset sign-in"
          subtitle={m.has_password ? `Password set ✅${m.username ? ` · “${m.username}”` : ''}` : 'No password yet'}
        />,
      );
    }
    if (canChangeRole(me, m)) {
      manageRows.push(
        <ListRow key="role" onClick={() => setSheet('role')} left={<RowIcon icon="swap" />} title="Change role" subtitle={roleLabel(m.role)} />,
      );
    }
    if (m.role === 'kid' && canSetAllowance(me, m)) {
      manageRows.push(
        <ListRow
          key="allowance" onClick={() => setSheet('allowance')} left={<RowIcon icon="money" />}
          title="Weekly pocket money"
          subtitle={m.allowance_cents > 0 ? `${money(m.allowance_cents, family.currency)} every week` : 'Not set'}
        />,
      );
    }
    if (canEdit) {
      manageRows.push(
        <ListRow
          key="identity" onClick={() => setSheet('identity')} left={<RowIcon icon="edit" />}
          title={m.role === 'kid' ? 'Name, avatar & look' : 'Name & avatar'}
          subtitle={m.role === 'kid' ? 'Photo or emoji, colour and character' : 'Photo or emoji'}
        />,
      );
    }
    if (canRemoveMember(me, m)) {
      manageRows.push(
        <ListRow
          key="remove" onClick={() => setSheet('remove')} danger chevron={false}
          left={<RowIcon icon="trash" tone="bad" />}
          title={`Remove ${m.display_name}`}
          subtitle="Signs them out everywhere"
        />,
      );
    }
  }
  const lockedForMe = !self && isManager && !manageLogin && m.role !== 'owner' && m.linked;

  return (
    <>
      <PageHeader title={m.display_name} subtitle={memberRoleLabel(m)} back="/family" />

      {/* Hero */}
      <Card className="flex flex-col items-center gap-3 text-center">
        <Avatar member={m} size="xl" ring name="" />
        <div className="flex flex-wrap justify-center gap-2">
          <Badge tone="neutral">{memberRoleLabel(m)}{self ? ' · you' : ''}</Badge>
          {m.linked
            ? <Badge tone="good"><span aria-hidden="true">✅</span> Connected</Badge>
            : <Badge tone="warn"><span aria-hidden="true">⏳</span> Not connected yet</Badge>}
          {age !== null && <Badge tone="neutral">{plural(age, 'year')}</Badge>}
          {level && (
            <Badge tone="accent">
              {char && <span aria-hidden="true">{char.emoji}</span>} Level {level.level} · {level.title}
            </Badge>
          )}
        </div>
        {self && (
          <LinkButton to="/me" variant="ghost" size="sm" icon="user">My look & sign-in</LinkButton>
        )}
      </Card>

      {m.role === 'kid' && balances && (
        <Card padded={false} className="mt-3 overflow-hidden">
          <ListRow
            to={`/money/${m.id}`}
            left={<RowIcon icon="money" />}
            title="Money & history"
            subtitle={`Spending ${money(balances.spending, family.currency)} · Savings ${money(balances.savings, family.currency)}`}
          />
        </Card>
      )}

      <Section title="Contact" className="mt-6">
        {m.profile === null ? (
          <LockedCard />
        ) : (
          <ContactCard m={m} profile={m.profile} canEdit={canEdit} />
        )}
      </Section>

      <Section
        title="Emergency card"
        className="mt-6"
        action={canEdit && m.profile !== null ? (
          <LinkButton to={`/family/${m.id}/edit`} variant="ghost" size="sm" icon="edit">Edit</LinkButton>
        ) : undefined}
      >
        {m.profile === null ? <LockedCard /> : <EmergencyCard m={m} profile={m.profile} showBankNote={showBankNote} />}
      </Section>

      {manageRows.length > 0 && (
        <Section title="Manage" className="mt-6">
          <Card padded={false} className="divide-y divide-line overflow-hidden">{manageRows}</Card>
        </Section>
      )}
      {lockedForMe && (
        <p className="mt-3 px-1 text-[14px] text-muted">
          <Icon name="lock" size={16} className="mr-1 inline align-[-2px]" />
          {m.display_name} is already connected, so only {m.display_name} or {owner && owner.id !== me.id ? owner.display_name : 'the owner'} can change their sign-in.
        </p>
      )}
      {self && (
        <Card padded={false} className="mt-6 overflow-hidden">
          <ListRow to="/me/secure" left={<RowIcon icon="shield" />} title="Sign-in & devices" subtitle="Password, Google and your phones" />
        </Card>
      )}

      {qr && <InviteScreen member={m} purpose={m.linked ? 'device' : 'join'} onClose={() => setQr(false)} />}
      {sheet === 'logins' && <LoginsSheet member={m} logins={logins} onClose={() => setSheet(null)} />}
      {sheet === 'credentials' && <CredentialsSheet member={m} onClose={() => setSheet(null)} />}
      {sheet === 'role' && <RoleSheet member={m} onClose={() => setSheet(null)} />}
      {sheet === 'allowance' && <AllowanceSheet member={m} onClose={() => setSheet(null)} />}
      {sheet === 'identity' && (
        <IdentitySheet member={m} familyId={family.id} withLook={m.role === 'kid'} onClose={() => setSheet(null)} />
      )}
      {sheet === 'remove' && (
        <RemoveSheet
          member={m}
          onClose={() => setSheet(null)}
          onRemoved={() => { void refresh(); navigate('/family', { replace: true }); }}
        />
      )}
    </>
  );
}

function RowIcon({ icon, tone }: { icon: IconName; tone?: 'bad' }) {
  return (
    <span className={cx('grid size-10 place-items-center rounded-full', tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-accent-soft text-accent-ink')}>
      <Icon name={icon} size={20} />
    </span>
  );
}

function LockedCard() {
  return (
    <Card className="flex items-center gap-3">
      <span className="text-2xl" aria-hidden="true">🔒</span>
      <p>Emergency info is only shared with adults.</p>
    </Card>
  );
}

function Missing({ text, add }: { text: string; add?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      <span className="text-muted">{text}</span>
      {add && <LinkButton to={add} variant="ghost" size="sm" icon="plus">Add</LinkButton>}
    </div>
  );
}

function ContactCard({ m, profile: p, canEdit }: { m: Member; profile: Profile; canEdit: boolean }) {
  const editTo = canEdit ? `/family/${m.id}/edit` : undefined;
  const phone = p.phone?.trim();
  const life = p.life360?.trim();
  const lifeIsLink = !!life && /^https?:\/\//i.test(life);
  return (
    <Card className="space-y-3">
      {phone ? (
        <div>
          <a href={telHref(phone)} className={buttonClass('primary', 'lg', true)}>
            <Icon name="phone" /> Call {firstName(m.display_name)}
          </a>
          <p className="mt-1 text-center text-[15px] tabular-nums text-muted">{phone}</p>
        </div>
      ) : (
        <Missing text="No phone number yet" add={editTo} />
      )}
      {life ? (
        <div>
          <a href={life360Href(life)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'lg', true)}>
            <span aria-hidden="true">📍</span> Open Life360 <Icon name="external" size={18} />
          </a>
          {!lifeIsLink && <p className="mt-1 text-center text-[15px] text-muted">In Life360: {life}</p>}
        </div>
      ) : (
        <Missing text="No Life360 link yet" add={editTo} />
      )}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value?: ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-32 shrink-0 font-semibold text-muted">{label}</dt>
      <dd className={cx('min-w-0 flex-1 whitespace-pre-line break-words', empty && 'text-muted')}>{empty ? 'Not filled in yet' : value}</dd>
    </div>
  );
}

function EmergencyCard({ m, profile: p, showBankNote }: { m: Member; profile: Profile; showBankNote: boolean }) {
  const contacts = (p.emergency_contacts ?? []).filter((c) => c.name || c.phone);
  return (
    <Card className="!border-2 !border-bad/40">
      <h3 className="flex items-center gap-2 text-lg font-extrabold">
        <span aria-hidden="true">🆘</span> {m.display_name}
      </h3>

      <div className="mt-3 grid gap-3">
        <div className="flex items-center gap-3">
          <span className="w-32 shrink-0 font-semibold text-muted">Blood type</span>
          {p.blood_type
            ? <span className="rounded-xl bg-bad-soft px-3 py-0.5 text-[1.75rem] font-extrabold leading-tight text-bad">{p.blood_type}</span>
            : <span className="text-muted">Not filled in yet</span>}
        </div>
        <div className="rounded-2xl border border-warn/40 bg-warn-soft p-3">
          <div className="font-bold text-warn"><span aria-hidden="true">⚠️</span> Allergies</div>
          <p className={cx('mt-0.5 whitespace-pre-line text-lg', p.allergies ? 'font-semibold' : 'text-muted')}>
            {p.allergies || 'Not filled in yet'}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <div className="font-bold"><span aria-hidden="true">💊</span> Medication</div>
          <p className={cx('mt-0.5 whitespace-pre-line text-lg', p.medication ? 'font-semibold' : 'text-muted')}>
            {p.medication || 'Not filled in yet'}
          </p>
        </div>
      </div>

      <dl className="mt-2 divide-y divide-line">
        <Detail label="Medical notes" value={p.medical_notes} />
        <Detail label="Doctor" value={p.doctor} />
        <Detail label="School" value={p.school} />
        <Detail label="Height" value={p.height_cm ? `${p.height_cm} cm` : undefined} />
        <Detail label="Birthday" value={p.birthday ? formatDate(p.birthday, { long: true, year: true }) : undefined} />
        {showBankNote && <Detail label="Bank note" value={p.revolut_note} />}
      </dl>

      <h4 className="mt-3 font-bold">Emergency contacts</h4>
      {contacts.length === 0 ? (
        <p className="py-2 text-muted">Not filled in yet</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {contacts.map((c, i) => (
            <li key={`${c.name}-${i}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.name || 'No name'}</div>
                <div className="text-[14px] text-muted">{[c.relation, c.phone].filter(Boolean).join(' · ')}</div>
              </div>
              {c.phone && (
                <a
                  href={telHref(c.phone)}
                  className={buttonClass('secondary', 'sm')}
                  aria-label={`Call ${c.name || c.phone}`}
                >
                  <Icon name="phone" size={18} /> Call
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
