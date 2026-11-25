// Money school gate: a friendly page when 'learn' is switched off for the family.
import type { ReactNode } from 'react';
import { EmptyState, LinkButton, PageHeader, PageSpinner } from '../../../components/ui';
import { useFeatures } from '../../../lib/features';
import { useApp } from '../../../lib/session';

export function LearnGate({ children }: { children: ReactNode }) {
  const { me } = useApp();
  const { on } = useFeatures();
  if (!me) return <PageSpinner />;
  if (!on('learn')) return <LearnOff />;
  return <>{children}</>;
}

export function LearnOff() {
  const { isManager } = useApp();
  return (
    <div className="pb-6">
      <PageHeader title="Money school" back="/help" />
      <EmptyState
        emoji="🎓"
        title="Money school is switched off"
        message={isManager
          ? 'Short lessons about saving, interest, earning, borrowing and insurance. You can switch it on for the family in Features.'
          : 'Short lessons about saving, interest, earning, borrowing and insurance. Ask a parent if you’d like to use it.'}
        action={
          <div className="flex flex-col items-center gap-2">
            {isManager && <LinkButton to="/family/features" icon="settings">Open Features</LinkButton>}
            <LinkButton to="/help" variant={isManager ? 'ghost' : 'primary'} icon="help">Back to Help</LinkButton>
          </div>
        }
      />
    </div>
  );
}
