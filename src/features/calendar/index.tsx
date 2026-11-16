// Calendar feature (Diesel). Mounted at /calendar/* (lazy-loaded in src/App.tsx).
import { Route, Routes } from 'react-router';
import { FeatureGate } from '../family/FeatureGate';
import CalendarPage from './CalendarPage';

export default function CalendarModule() {
  // A parent can switch the calendar off in Family → Features: then show a friendly page and load nothing.
  const page = <FeatureGate feature="calendar" title="Calendar"><CalendarPage /></FeatureGate>;
  return (
    <Routes>
      <Route index element={page} />
      <Route path="*" element={page} />
    </Routes>
  );
}