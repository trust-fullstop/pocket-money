// "This part is switched off" page, used by routes whose feature a parent can switch off in Family → Features.
import type { ReactNode } from 'react';
import { EmptyState, LinkButton, PageHeader } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { useApp } from '../../lib/session';
import type { FeatureKey } from '../../lib/types';
import { FEATURE_INFO } from './featureList';

export function SwitchedOff({ feature, title, back }: { feature: FeatureKey; title: string; back?: string | boolean }) {
  const { isManager } = useApp();
  const info = FEATURE_INFO[feature];
  return (
    <>
      <PageHeader title={title} back={back} />
      <EmptyState
        emoji={info.emoji}
        title={`${info.label} is switched off`}
        message={isManager
          ? 'Your family isn’t using this yet. Switch it on in Family → Features when everyone is ready.'
          : 'Your family isn’t using this yet. A parent can switch it on.'}
        action={isManager ? <LinkButton to="/family/features" icon="settings">Open Features</LinkButton> : undefined}
      />
    </>
  );
}

/** Renders `children` only when `feature` is on; otherwise the friendly "switched off" page (no data is loaded). */
export function FeatureGate({ feature, title, back, children }: {
  feature: FeatureKey; title: string; back?: string | boolean; children: ReactNode;
}) {
  const features = useFeatures();
  return features.on(feature) ? <>{children}</> : <SwitchedOff feature={feature} title={title} back={back} />;
}
