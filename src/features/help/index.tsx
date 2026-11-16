// PLACEHOLDER (Superman) — replaced by the Help/Ask builder. Mounted at /help/* (lazy-loaded in src/App.tsx).
import { Route, Routes } from 'react-router';
import { EmptyState, PageHeader } from '../../components/ui';

function ComingSoon() {
  return (
    <>
      <PageHeader title="Help" back />
      <EmptyState emoji="💡" title="Coming soon" message="How Pocket Money works, and a helper you can ask questions." />
    </>
  );
}

export default function HelpModule() {
  return (
    <Routes>
      <Route index element={<ComingSoon />} />
      <Route path="*" element={<ComingSoon />} />
    </Routes>
  );
}
