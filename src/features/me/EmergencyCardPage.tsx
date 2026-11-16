import { useNavigate } from 'react-router';
import { EmptyState, LinkButton, PageHeader, PageSpinner } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { useApp } from '../../lib/session';
import { EmergencyCardForm } from './EmergencyCardForm';

export default function EmergencyCardPage() {
  const { me, refresh } = useApp();
  const features = useFeatures();
  const navigate = useNavigate();
  if (!me) return <PageSpinner />;
  if (!features.on('emergency')) {
    return (
      <>
        <PageHeader title="My emergency card" back="/me" />
        <EmptyState
          emoji="❤️" title="Not used in your family"
          message="Emergency cards are switched off. A parent can switch them on in Family → Features."
          action={<LinkButton to="/me" icon="back">Back to Me</LinkButton>}
        />
      </>
    );
  }
  return (
    <>
      <PageHeader title="My emergency card" subtitle="Your family can see this if something happens." back="/me" />
      <EmergencyCardForm
        key={me.id} member={me}
        onSaved={async () => { await refresh(); navigate('/me'); }}
      />
    </>
  );
}
