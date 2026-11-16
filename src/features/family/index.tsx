// Family feature — mounted at /family/* (lazy-loaded in src/App.tsx).
import { Route, Routes } from 'react-router';
import AddMember from './AddMember';
import Devices from './Devices';
import EditProfile from './EditProfile';
import FamilyList from './FamilyList';
import { FeatureGate } from './FeatureGate';
import Features from './Features';
import MemberDetail from './MemberDetail';
import Settings from './Settings';

export default function FamilyModule() {
  return (
    <Routes>
      <Route index element={<FamilyList />} />
      <Route path="add" element={<AddMember />} />
      <Route path="devices" element={<FeatureGate feature="devices" title="Devices" back="/family"><Devices /></FeatureGate>} />
      <Route path="features" element={<Features />} />
      <Route path="settings" element={<Settings />} />
      <Route path=":memberId" element={<MemberDetail />} />
      <Route path=":memberId/edit" element={<EditProfile />} />
      <Route path="*" element={<FamilyList />} />
    </Routes>
  );
}