// Calendar feature (Diesel). Mounted at /calendar/* (lazy-loaded in src/App.tsx).
import { Route, Routes } from 'react-router';
import CalendarPage from './CalendarPage';

export default function CalendarModule() {
  return (
    <Routes>
      <Route index element={<CalendarPage />} />
      <Route path="*" element={<CalendarPage />} />
    </Routes>
  );
}