// Money feature — mounted lazily at /money/* (src/App.tsx). Wallets, tallies, history, savings, requests,
// goals, targets and the "Spotted" reward / consequence flow. Parts switched off in Family → Features show a
// friendly "switched off" page instead (FeatureGate).
import { Navigate, Route, Routes } from 'react-router';
import { GoalsPage } from './Goals';
import { MoneyHome } from './MoneyHome';
import { FeatureGate } from './parts';
import { RequestsPage } from './Requests';
import { SpotPage } from './Spot';
import { TargetsPage } from './Targets';
import { WalletPage } from './Wallet';

export default function MoneyModule() {
  return (
    <Routes>
      <Route index element={<MoneyHome />} />
      <Route path="spot" element={<FeatureGate feature="spotted"><SpotPage /></FeatureGate>} />
      <Route path="requests" element={<FeatureGate feature="requests"><RequestsPage /></FeatureGate>} />
      <Route path=":memberId" element={<WalletPage />} />
      <Route path=":memberId/targets" element={<FeatureGate feature="targets"><TargetsPage /></FeatureGate>} />
      <Route path=":memberId/goals" element={<FeatureGate feature="goals"><GoalsPage /></FeatureGate>} />
      <Route path="*" element={<Navigate replace to="/money" />} />
    </Routes>
  );
}
