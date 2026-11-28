import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from './Icon';
import { cx } from './styles';

export interface ListRowProps {
  /** Avatar / emoji / icon on the left. */
  left?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Value / badge / button on the right. */
  right?: ReactNode;
  /** Makes the row a button. With href: also runs when the link is clicked (the link still opens). */
  onClick?: () => void;
  /** Makes the row a router link. */
  to?: string;
  /** Makes the row an external link (opens in a new tab). */
  href?: string;
  /** Show › on the right (default: true for links/buttons). */
  chevron?: boolean;
  danger?: boolean;
  className?: string;
}

/** One line in a list/card: left · title/subtitle · right. Interactive rows are ≥ 56px tall. */
export function ListRow({ left, title, subtitle, right, onClick, to, href, chevron, danger, className }: ListRowProps) {
  const interactive = !!(onClick || to || href);
  const showChevron = chevron ?? interactive;
  const body = (
    <>
      {left && <span className="shrink-0">{left}</span>}
      <span className="min-w-0 flex-1 text-left">
        <span className={cx('block line-clamp-2 font-semibold leading-snug', danger && 'text-bad')}>{title}</span>
        {subtitle && <span className="block text-[14px] leading-snug text-muted">{subtitle}</span>}
      </span>
      {right && <span className="shrink-0 text-right">{right}</span>}
      {showChevron && <Icon name={href ? 'external' : 'chevron-right'} size={href ? 18 : 20} className="shrink-0 text-muted" />}
    </>
  );
  const cls = cx(
    'flex w-full min-h-14 items-center gap-3 px-4 py-2.5',
    interactive && 'transition hover:bg-surface-2 active:bg-surface-2',
    className,
  );
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** true = go back in history (or home); a string = link to that path. */
  back?: boolean | string;
  /** Action(s) on the right. */
  right?: ReactNode;
  className?: string;
}

/** Big page title with optional back button and right-side action. */
export function PageHeader({ title, subtitle, back, right, className }: PageHeaderProps) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate('/');
  };
  return (
    <header className={cx('flex items-center gap-1 pb-3 pt-2', className)}>
      {back && (
        <button type="button" onClick={goBack} aria-label="Back" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-2">
          <Icon name="back" size={26} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.75rem] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-[15px] text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
  );
}
