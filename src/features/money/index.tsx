// Money feature — mounted lazily at /money/* (src/App.tsx). Wallets, tallies, history, savings, requests,
// goals, targets and the "Spotted" reward / consequence flow.
import { Navigate, Route, Routes } from 'react-router';
import { GoalsPage } from './Goals';
import { MoneyHome } from './MoneyHome';
import { RequestsPage } from './Requests';
import { SpotPage } from './Spot';
import { TargetsPage } from './Targets';
import { WalletPage } from './Wallet';

export default function MoneyModule() {
  return (
    <Routes>
      <Route index element={<MoneyHome />} />
      <Route path="spot" element={<SpotPage />} />
      <Route path="requests" element={<RequestsPage />} />
      <Route path=":memberId" element={<WalletPage />} />
      <Route path=":memberId/targets" element={<TargetsPage />} />
      <Route path=":memberId/goals" element={<GoalsPage />} />
      <Route path="*" element={<Navigate replace to="/money" />} />
    </Routes>
  );
}
