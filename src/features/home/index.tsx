// Home feature — mounted at / (index route, lazy-loaded in src/App.tsx).
import { useEffect, useRef } from 'react';
import { useApp } from '../../lib/session';
import GrandparentHome from './GrandparentHome';
import KidHome from './KidHome';
import ManagerHome from './ManagerHome';

const STALE_MS = 60_000;

export default function HomeModule() {
  const { me, state, now, refresh } = useApp();
  const checked = useRef(false);

  // Home is the "what's happening now" page: refresh once on arrival if the state is older than a minute
  // (refresh() also runs the timed rules at most every 5 minutes).
  useEffect(() => {
    if (checked.current || !state) return;
    checked.current = true;
    if (now().getTime() - Date.parse(state.now) > STALE_MS) void refresh();
  }, [state, now, refresh]);

  if (!me) return null;
  if (me.role === 'kid') return <KidHome />;
  if (me.role === 'grandparent') return <GrandparentHome />;
  return <ManagerHome />;
}