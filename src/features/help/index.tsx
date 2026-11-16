// Help module, mounted at /help/* (lazy-loaded in src/App.tsx).
import { Navigate, Route, Routes } from 'react-router';
import AllAsks from './AllAsks';
import AskPage from './AskPage';
import HelpHome from './HelpHome';

export default function HelpModule() {
  return (
    <Routes>
      <Route index element={<HelpHome />} />
      <Route path="ask" element={<AskPage />} />
      <Route path="ask/all" element={<AllAsks />} />
      <Route path="*" element={<Navigate replace to="/help" />} />
    </Routes>
  );
}
