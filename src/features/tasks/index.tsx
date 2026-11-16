// Tasks feature — mounted lazily at /tasks/* (src/App.tsx). Chores, challenges, partnership, photo evidence, approvals.
import { Navigate, Route, Routes } from 'react-router';
import { ApprovalsPage } from './Approvals';
import TaskDetail from './TaskDetail';
import TaskFormPage from './TaskForm';
import TasksHome from './TasksHome';

export default function TasksModule() {
  return (
    <Routes>
      <Route index element={<TasksHome />} />
      <Route path="new" element={<TaskFormPage />} />
      <Route path="edit/:groupId" element={<TaskFormPage />} />
      <Route path="approvals" element={<ApprovalsPage />} />
      <Route path=":instanceId" element={<TaskDetail />} />
      <Route path="*" element={<Navigate replace to="/tasks" />} />
    </Routes>
  );
}
