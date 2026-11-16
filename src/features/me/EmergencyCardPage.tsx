import { useNavigate } from 'react-router';
import { PageHeader, PageSpinner } from '../../components/ui';
import { useApp } from '../../lib/session';
import { EmergencyCardForm } from './EmergencyCardForm';

export default function EmergencyCardPage() {
  const { me, refresh } = useApp();
  const navigate = useNavigate();
  if (!me) return <PageSpinner />;
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
