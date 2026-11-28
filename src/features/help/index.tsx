// Help module, mounted at /help/* (lazy-loaded in src/App.tsx).
import { Navigate, Route, Routes } from 'react-router';
import AllAsks from './AllAsks';
import AskPage from './AskPage';
import HelpHome from './HelpHome';
import LearnHome from './learn/LearnHome';
import LearnProgress from './learn/LearnProgress';
import LessonPlanPage from './learn/LessonPlanPage';
import LessonPage from './learn/LessonPage';
import { LearnGate } from './learn/LearnOff';

export default function HelpModule() {
  return (
    <Routes>
      <Route index element={<HelpHome />} />
      <Route path="ask" element={<AskPage />} />
      <Route path="ask/all" element={<AllAsks />} />
      <Route path="learn" element={<LearnGate><LearnHome /></LearnGate>} />
      <Route path="learn/progress" element={<LearnGate><LearnProgress /></LearnGate>} />
      <Route path="learn/plan" element={<LearnGate><LessonPlanPage /></LearnGate>} />
      <Route path="learn/:id" element={<LearnGate><LessonPage /></LearnGate>} />
      <Route path="*" element={<Navigate replace to="/help" />} />
    </Routes>
  );
}
