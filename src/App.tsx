import { lazy, Suspense, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppLock } from './components/AppLock';
import { AppShell } from './components/AppShell';
import { UpdateBar } from './components/UpdateBar';
import { Button, EmptyState, LinkButton, UIProvider } from './components/ui';
import { useBibleOpenFlush } from './features/faith/bibleTrack';
import { backend } from './lib/backend';
import { cloudConfigured, switchMode } from './lib/backend/select';
import { AppProvider, useApp } from './lib/session';

const Welcome = lazy(() => import('./features/auth/Welcome'));
const Join = lazy(() => import('./features/auth/Join'));
const Login = lazy(() => import('./features/auth/Login'));
const Me = lazy(() => import('./features/me'));
const Home = lazy(() => import('./features/home'));
const Tasks = lazy(() => import('./features/tasks'));
const Money = lazy(() => import('./features/money'));
const Calendar = lazy(() => import('./features/calendar'));
const Family = lazy(() => import('./features/family'));
const Help = lazy(() => import('./features/help'));

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;

export function App() {
  return (
    <BrowserRouter basename={basename}>
      <UIProvider>
        <AppProvider>
          <AppLock>
            <Root />
          </AppLock>
        </AppProvider>
        <UpdateBar />
      </UIProvider>
    </BrowserRouter>
  );
}

function Root() {
  const { loading, error, state } = useApp();
  if (loading) return <Splash />;
  if (error && !state) return <StartError message={error} />;
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/welcome/*" element={<GuestOnly><Welcome /></GuestOnly>} />
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/join/:code?" element={<Join />} />
        <Route element={<RequireMember><BibleOpenFlush /><AppShell /></RequireMember>}>
          <Route index element={<Home />} />
          <Route path="tasks/*" element={<Tasks />} />
          <Route path="money/*" element={<Money />} />
          <Route path="calendar/*" element={<Calendar />} />
          <Route path="family/*" element={<Family />} />
          <Route path="help/*" element={<Help />} />
          <Route path="me/*" element={<Me />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function RequireMember({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const location = useLocation();
  if (!state) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  return children;
}

/** A kid's Bible App tap that didn't get through is sent again (same day), and a surprise that came meanwhile shown. */
function BibleOpenFlush() {
  useBibleOpenFlush();
  return null;
}

/** Signed-in visitors of /welcome or /login go home. Only checked on arrival: after create/login the
 *  page itself navigates on (router navigations are transitions, so a later redirect here would win). */
function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const [signedInOnArrival] = useState(() => !!state);
  if (signedInOnArrival) return <Navigate to="/" replace />;
  return children;
}

function Splash() {
  const { mode } = useApp();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center" role="status">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-20 animate-pulse" />
      <p className="font-semibold text-muted">{mode === 'demo' ? 'Opening the demo… the first time takes a few seconds.' : 'Loading…'}</p>
    </div>
  );
}

function StartError({ message }: { message: string }) {
  const { mode } = useApp();
  const resetDemo = async () => {
    await backend().demo?.reset().catch(() => undefined);
    location.reload();
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <EmptyState
        emoji="😕" title="We couldn't load your family" message={message}
        action={
          <div className="flex flex-col gap-2">
            <Button onClick={() => location.reload()} icon="reset">Try again</Button>
            {mode === 'demo' && <Button variant="secondary" onClick={resetDemo}>Reset the demo</Button>}
            {mode === 'demo' && cloudConfigured && <Button variant="ghost" onClick={() => switchMode('cloud')}>Leave the demo</Button>}
          </div>
        }
      />
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState
      emoji="🧭" title="Page not found" message="That page doesn't exist (any more)."
      action={<LinkButton to="/" icon="home">Go home</LinkButton>}
    />
  );
}
