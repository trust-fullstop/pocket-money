import { useNavigate, useParams } from 'react-router';
import { EmptyState, LinkButton, PageHeader } from '../../components/ui';
import { useApp } from '../../lib/session';
import { EmergencyCardForm } from '../me/EmergencyCardForm';
import { canEditMember } from './perms';

/** /family/:memberId/edit — the emergency card form (Pixel's EmergencyCardForm) for any member you may edit. */
export default function EditProfile() {
  const { memberId = '' } = useParams();
  const { me, membersById, refresh } = useApp();
  const navigate = useNavigate();
  const m = membersById[memberId];
  if (!me) return null;

  if (!m) {
    return (
      <>
        <PageHeader title="Emergency card" back="/family" />
        <EmptyState emoji="🤷" title="We couldn’t find this person." action={<LinkButton to="/family" variant="secondary">Back to family</LinkButton>} />
      </>
    );
  }
  if (!canEditMember(me, m)) {
    return (
      <>
        <PageHeader title="Emergency card" back={`/family/${m.id}`} />
        <EmptyState
          emoji="🔒"
          title={m.role === 'kid' || m.role === 'grandparent'
            ? `Only ${m.display_name} or a parent can change this.`
            : `Only ${m.display_name} or the family owner can change this.`}
          action={<LinkButton to={`/family/${m.id}`} variant="secondary">Back</LinkButton>}
        />
      </>
    );
  }

  const self = m.id === me.id;
  return (
    <>
      <PageHeader
        title={self ? 'My emergency card' : `${m.display_name}’s card`}
        subtitle="The family can see this if something happens."
        back={`/family/${m.id}`}
      />
      <EmergencyCardForm
        key={m.id}
        member={m}
        onSaved={async () => {
          await refresh();
          navigate(`/family/${m.id}`, { replace: true });
        }}
      />
    </>
  );
}
