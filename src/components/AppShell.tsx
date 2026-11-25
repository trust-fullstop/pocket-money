import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useFeatures } from '../lib/features';
import { useApp } from '../lib/session';
import { DemoBar } from './DemoBar';
import { Avatar, CountBadge, Icon, PageSpinner, cx, type IconName } from './ui';

interface NavItem { to: string; label: string; icon: IconName; end?: boolean; badge?: number; badgeLabel?: string }

/** Member layout: (demo bar) · top bar (Help, Me) · page · bottom nav · "Spotted" button. */
export function AppShell() {
  const { me, family, state, isManager, mode } = useApp();
  const features = useFeatures();
  const { pathname } = useLocation();
  // Proud moments ⭐ are checked on the Tasks → Check page too.
  const approvals = (state?.counts.approvals ?? 0) + (isManager ? (state?.counts.initiatives ?? 0) : 0);
  const requests = isManager ? (state?.counts.requests ?? 0) + (state?.counts.loans ?? 0) : 0;
  const canSpot = (isManager || me?.role === 'grandparent') && features.on('spotted');
  // Only on overview pages: on forms and detail pages it would cover their sticky action buttons.
  const overview = /^\/(tasks(\/approvals)?|money|calendar|family)?\/?$/.test(pathname);
  const showSpot = canSpot && overview;

  const nav: NavItem[] = [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/tasks', label: 'Tasks', icon: 'tasks', badge: approvals, badgeLabel: `${approvals} waiting for approval` },
    { to: '/money', label: 'Money', icon: 'money', badge: requests, badgeLabel: `${requests} requests to answer` },
    ...(features.on('calendar') ? [{ to: '/calendar', label: 'Calendar', icon: 'calendar' } satisfies NavItem] : []),
    { to: '/family', label: 'Family', icon: 'family' },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-md">
        {mode === 'demo' && <DemoBar />}
        <header className="mx-auto flex h-14 w-full max-w-md items-center gap-2 px-4">
          <Link to="/" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7 shrink-0" />
            <span className="truncate text-lg font-extrabold">{family?.name ?? 'Sow & Grow'}</span>
          </Link>
          <NavLink
            to="/help" aria-label="Help, Money school and questions" title="Help, Money school and questions"
            className={({ isActive }) => cx(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold transition',
              isActive ? 'border border-transparent bg-accent-soft text-accent-ink' : 'border border-line bg-surface text-ink hover:bg-surface-2',
            )}
          >
            <Icon name="help" size={22} />
            <span aria-hidden="true">Help</span>
          </NavLink>
          <Link
            to="/me" aria-label={`Me: ${me?.display_name ?? ''} – profile, look and sign-in`}
            className="grid size-11 shrink-0 place-items-center rounded-full"
          >
            {me && <Avatar member={me} size="sm" ring={pathname.startsWith('/me')} />}
          </Link>
        </header>
      </div>

      <main
        id="main"
        className={cx(
          'mx-auto w-full max-w-md flex-1 px-4',
          // Extra room under the content when the floating Spotted button shows, so the last item (e.g. a verse) can scroll clear of it.
          showSpot ? 'pb-[calc(env(safe-area-inset-bottom)+10.5rem)]' : 'pb-[calc(env(safe-area-inset-bottom)+6.5rem)]',
        )}
      >
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>

      {showSpot && (
        <Link
          to="/money/spot" aria-label="Spotted! Reward or consequence with a photo"
          style={{ right: 'max(1rem, calc(50vw - 13rem))', bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
          className="fixed z-30 flex min-h-14 items-center gap-2 rounded-full bg-accent-strong pl-4 pr-5 font-bold text-white shadow-lg shadow-black/20 transition active:scale-95"
        >
          <Icon name="camera" size={24} />
          <span aria-hidden="true">Spotted</span>
        </Link>
      )}

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur-md">
        <ul className="mx-auto flex max-w-md">
          {nav.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to} end={n.end}
                className={({ isActive }) => cx(
                  'relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold transition',
                  isActive ? 'text-accent-ink' : 'text-muted hover:text-ink',
                )}
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('relative grid h-8 w-14 place-items-center rounded-full transition', isActive && 'bg-accent-soft')}>
                      <Icon name={n.icon} size={24} strokeWidth={isActive ? 2.4 : 2} />
                      {!!n.badge && <CountBadge count={n.badge} label={n.badgeLabel} className="absolute -right-0.5 -top-1" />}
                    </span>
                    <span className={cx(isActive && 'font-extrabold')}>{n.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
