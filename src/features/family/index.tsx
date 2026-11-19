// Family feature — mounted at /family/* (lazy-loaded in src/App.tsx).
import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { EmptyState, LinkButton, PageHeader } from '../../components/ui';
import { useApp } from '../../lib/session';
import AddMember from './AddMember';
import Devices from './Devices';
import EditProfile from './EditProfile';
import FamilyList from './FamilyList';
import { FeatureGate } from './FeatureGate';
import Features from './Features';
import MemberDetail from './MemberDetail';
import Needs from './Needs';
import Settings from './Settings';

/** Pages kids must never see (e.g. "What we need": surprises stay surprises). The server refuses kids too. */
function GrownUpsOnly({ title, children }: { title: string; children: ReactNode }) {
  const { me } = useApp();
  if (!me) return null;
  if (me.role !== 'kid') return <>{children}</>;
  return (
    <>
      <PageHeader title={title} back="/family" />
      <EmptyState
        emoji="🧑‍🤝‍🧑"
        title="This is for the grown-ups"
        message="This page is only for the grown-ups in your family."
        action={<LinkButton to="/" icon="home">Back home</LinkButton>}
      />
    </>
  );
}

export default function FamilyModule() {
  return (
    <Routes>
      <Route index element={<FamilyList />} />
      <Route path="add" element={<AddMember />} />
      <Route path="devices" element={<FeatureGate feature="devices" title="Devices" back="/family"><Devices /></FeatureGate>} />
      <Route
        path="needs"
        element={
          <GrownUpsOnly title="What we need">
            <FeatureGate feature="needs" title="What we need" back="/family"><Needs /></FeatureGate>
          </GrownUpsOnly>
        }
      />
      <Route path="features" element={<Features />} />
      <Route path="settings" element={<Settings />} />
      <Route path=":memberId" element={<MemberDetail />} />
      <Route path=":memberId/edit" element={<EditProfile />} />
      <Route path="*" element={<FamilyList />} />
    </Routes>
  );
}