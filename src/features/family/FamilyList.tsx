import { useState } from 'react';
import {
  Avatar, Badge, Button, Card, EmptyState, Icon, LinkButton, ListRow, PageHeader, Section, cx, type IconName,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { memberRoleLabel, plural, todayISO } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { Member } from '../../lib/types';
import { FEATURE_TOTAL, countOn } from './featureList';
import { InviteScreen } from './InviteScreen';
import { ROLE_GROUPS, ageFrom, canManageLogin } from './perms';

export default function FamilyList() {
  const { me, members, isManager, family, now, state } = useApp();
  const features = useFeatures();
  const [qrFor, setQrFor] = useState<Member | null>(null);
  const tz = family?.timezone ?? 'UTC';
  const today = todayISO(tz, now());

  // "On 2 devices" needs list_logins, which is only allowed for people you manage — ask in the background.
  const opts = { managersAddAdults: !!family?.settings.managers_add_adults };
  const countable = me ? members.filter((m) => m.linked && canManageLogin(me, m, opts)) : [];
  const countKey = countable.map((m) => m.id).join(',');
  const deviceCounts = useLoad(async () => {
    const pairs = await Promise.all(countable.map(async (m) => {
      try { return [m.id, (await api.listLogins(m.id)).length] as const; } catch { return [m.id, null] as const; }
    }));
    return Object.fromEntries(pairs) as Record<string, number | null>;
  }, [countKey, state?.now]);

  if (!me) return null;

  const groups = ROLE_GROUPS
    .map((g) => ({ ...g, list: members.filter((m) => g.roles.includes(m.role)) }))
    .filter((g) => g.list.length > 0);

  const status = (m: Member) => {
    if (!m.linked) return <Badge tone="warn"><span aria-hidden="true">⏳</span> Not connected yet</Badge>;
    const n = deviceCounts.data?.[m.id];
    return <Badge tone="good"><span aria-hidden="true">✓</span> {typeof n === 'number' && n > 0 ? `On ${plural(n, 'device')}` : 'Connected'}</Badge>;
  };

  return (
    <>
      <PageHeader
        title="Family"
        subtitle={family?.name}
        right={isManager ? <LinkButton to="/family/add" size="sm" icon="plus">Add</LinkButton> : undefined}
      />

      {members.length <= 1 ? (
        <EmptyState
          emoji="👋"
          title="Just you so far"
          message="Add your family."
          action={isManager ? <LinkButton to="/family/add" icon="plus">Add a person</LinkButton> : undefined}
        />
      ) : null}

      <div className="space-y-6">
        {groups.map((g) => (
          <Section key={g.key} title={g.title}>
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-line">
                {g.list.map((m) => {
                  const age = ageFrom(m.profile?.birthday, today);
                  const showQr = isManager && !m.linked && canManageLogin(me, m, opts);
                  return (
                    <li key={m.id} className="flex items-center">
                      <ListRow
                        to={`/family/${m.id}`}
                        className="min-w-0 flex-1"
                        chevron={!showQr}
                        left={<Avatar member={m} size="md" name="" />}
                        title={
                          <>
                            {m.display_name}
                            {m.id === me.id && <span className="font-normal text-muted"> (you)</span>}
                          </>
                        }
                        subtitle={
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>{memberRoleLabel(m)}{age !== null ? ` · ${plural(age, 'year')}` : ''}</span>
                            {status(m)}
                          </span>
                        }
                      />
                      {showQr && (
                        <Button
                          variant="secondary" size="sm" icon="qr" className="mr-3 shrink-0"
                          onClick={() => setQrFor(m)}
                          aria-label={`Show QR code for ${m.display_name}`}
                        >
                          Show QR
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        ))}

        <Section title={isManager ? 'Manage' : undefined}>
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            <ListRow
              to="/family/features"
              left={<RowIcon icon="sparkles" />}
              title={isManager ? 'Features' : 'What’s switched on'}
              subtitle={`${countOn(features.raw)} of ${FEATURE_TOTAL} on`}
            />
            {isManager && (
              <ListRow
                to="/family/settings"
                left={<RowIcon icon="settings" />}
                title="Family rules"
                subtitle="Money, tasks, privacy and the activity log"
              />
            )}
            {features.on('devices') && (
              <ListRow
                to="/family/devices"
                left={<RowIcon icon="device" />}
                title={isManager ? 'Devices' : 'My devices'}
                subtitle={isManager ? 'Phones, tablets and consoles in the family' : 'Phones and gadgets that are yours'}
              />
            )}
          </Card>
        </Section>
      </div>

      {qrFor && <InviteScreen member={qrFor} purpose="join" onClose={() => setQrFor(null)} />}
    </>
  );
}

function RowIcon({ icon }: { icon: IconName }) {
  return (
    <span className={cx('grid size-10 place-items-center rounded-full bg-accent-soft text-accent-ink')}>
      <Icon name={icon} size={20} />
    </span>
  );
}
