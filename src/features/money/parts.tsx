// Small shared building blocks for the Money screens (components only; helpers live in moneyUtils.ts).
import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { Button, Card, EmptyState, LinkButton, PageHeader, ProgressBar, Sheet, cx } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { amount } from '../../lib/format';
import { usePhotoUrl } from '../../lib/photos';
import { useApp } from '../../lib/session';
import { characterOf, levelFromPoints } from '../../lib/theme';
import { FEATURE_NEEDS, type Currency, type FeatureKey, type Member } from '../../lib/types';
import { deltaWords, pointsWords } from './moneyUtils';
import { TONE_TEXT, type TxTone } from './txMeta';

/** Page copy for the Money parts that have their own route. */
const OFF_COPY: Partial<Record<FeatureKey, { emoji: string; title: string; headline: string }>> = {
  spotted: { emoji: '📸', title: 'Spotted 📸', headline: 'Spotted is switched off' },
  requests: { emoji: '📨', title: 'Requests', headline: 'Requests are switched off' },
  goals: { emoji: '🎯', title: 'Goals', headline: 'Savings goals are switched off' },
  targets: { emoji: '🏆', title: 'Targets', headline: 'Targets are switched off' },
};
const FEATURE_NAME: Partial<Record<FeatureKey, string>> = { savings: 'Savings' };

/** Friendly page for a part of Money that is switched off in Family → Features (also used on a `feature_off` answer). */
export function FeatureOff({ feature }: { feature: FeatureKey }) {
  const { memberId } = useParams();
  const { me, isManager } = useApp();
  const features = useFeatures();
  const gift = feature === 'spotted' && me?.role === 'grandparent';
  const copy = OFF_COPY[feature] ?? { emoji: '💤', title: 'Money', headline: 'This part is switched off' };
  const back = memberId ? `/money/${memberId}` : '/money';
  const need = FEATURE_NEEDS[feature];
  const needText = need && !features.on(need) ? ` It needs ${FEATURE_NAME[need] ?? need} switched on too.` : '';
  return (
    <div className="space-y-4">
      <PageHeader title={gift ? 'Send a gift 🎁' : copy.title} back={back} />
      <Card>
        <EmptyState
          emoji={gift ? '🎁' : copy.emoji}
          title={gift ? 'Gifts are switched off' : copy.headline}
          message={isManager
            ? `You can switch it on in Family → Features whenever your family is ready.${needText}`
            : 'A parent can switch it on later.'}
          action={isManager
            ? <LinkButton to="/family/features" icon="settings">Family features</LinkButton>
            : <LinkButton to={back} variant="secondary" icon="back">{memberId ? 'Back' : 'Back to Money'}</LinkButton>}
        />
      </Card>
    </div>
  );
}

/** Renders `children` only when `feature` is switched on; otherwise the friendly switched-off page. */
export function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const features = useFeatures();
  return features.on(feature) ? <>{children}</> : <FeatureOff feature={feature} />;
}

/** Signed amount with colour + explicit sign; screen readers hear "plus €2.50". */
export function Delta({ currency, value, cur, tone, struck, className }: {
  currency: Currency; value: number; cur: string; tone: TxTone; struck?: boolean; className?: string;
}) {
  return (
    <span className={cx('whitespace-nowrap font-extrabold tabular-nums', TONE_TEXT[tone], struck && 'line-through decoration-2 opacity-70', className)}>
      <span aria-hidden="true">{amount(currency, value, cur, { sign: true })}</span>
      <span className="sr-only">{deltaWords(currency, value, cur)}{struck ? ' (undone)' : ''}</span>
    </span>
  );
}

/** Pill showing a signed amount, e.g. "+€1.00" in green or "−€0.50" in orange. */
export function DeltaChip({ currency, value, cur, tone, extra }: { currency: Currency; value: number; cur: string; tone: TxTone; extra?: string }) {
  const bg = tone === 'plus' ? 'bg-good-soft' : tone === 'minus' ? 'bg-warn-soft' : 'bg-surface-2';
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-[15px]', bg)}>
      <Delta currency={currency} value={value} cur={cur} tone={tone} />
      {extra && <span className="text-[14px] font-semibold text-muted">{extra}</span>}
    </span>
  );
}

/** "That's not for you" + Go home (UX §0.6). */
export function NotForYou({ message, action }: { message?: string; action?: ReactNode }) {
  return (
    <EmptyState
      emoji="🔒" title="That's not for you" message={message ?? 'This money belongs to someone else.'}
      action={action ?? <LinkButton to="/" icon="home">Go home</LinkButton>}
    />
  );
}

/** Inline load error with Try again (UX §0.6). */
export function LoadFailed({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <Card tone="warn" role="alert" className="space-y-3">
      <p className="font-bold">We couldn't load this.</p>
      {message && <p className="text-[15px]">{message}</p>}
      <Button variant="secondary" icon="reset" onClick={onRetry}>Try again</Button>
    </Card>
  );
}

/** Grey placeholder blocks shaped like the final rows. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-line/60 bg-surface p-3">
          <div className="size-10 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-surface-2" />
            <div className="h-3 w-3/4 rounded bg-surface-2" />
          </div>
          <div className="h-4 w-14 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/** Sheet footer: Cancel + one primary verb button (full width on its row). */
export function SheetActions({ onCancel, children, cancelLabel = 'Cancel', note }: { onCancel: () => void; children: ReactNode; cancelLabel?: string; note?: ReactNode }) {
  return (
    <div className="space-y-2">
      {note && <div className="text-center text-sm font-semibold text-muted" aria-live="polite">{note}</div>}
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" onClick={onCancel}>{cancelLabel}</Button>
        <div className="flex min-w-0 flex-1 [&>button]:w-full">{children}</div>
      </div>
    </div>
  );
}

/** A stored photo (signed URL). On a load error it refetches the URL once, then shows "Photo unavailable". */
export function TxPhoto({ path, src, alt, className, onOpen }: { path?: string | null; src?: string | null; alt: string; className?: string; onOpen?: () => void }) {
  const [attempt, setAttempt] = useState(0);
  if (src) return <PhotoImg url={src} alt={alt} className={className} onOpen={onOpen} />;
  if (!path) return null;
  return <PathPhoto key={attempt} path={path} alt={alt} className={className} onOpen={onOpen} failed={attempt > 0} onError={() => setAttempt((a) => a + 1)} />;
}

function PathPhoto({ path, alt, className, onOpen, failed, onError }: {
  path: string; alt: string; className?: string; onOpen?: () => void; failed: boolean; onError: () => void;
}) {
  const url = usePhotoUrl(path);
  const [broken, setBroken] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(t);
  }, []);
  if ((broken && failed) || (!url && slow)) {
    return (
      <span className={cx('grid place-items-center rounded-xl bg-surface-2 text-center text-[11px] font-semibold leading-tight text-muted', className)}>
        <span><span aria-hidden="true" className="block text-lg">🖼️</span>Photo unavailable</span>
      </span>
    );
  }
  if (!url) return <span className={cx('block animate-pulse rounded-xl bg-surface-2', className)} aria-hidden="true" />;
  return <PhotoImg url={url} alt={alt} className={className} onOpen={onOpen} onError={() => { setBroken(true); if (!failed) onError(); }} />;
}

function PhotoImg({ url, alt, className, onOpen, onError }: { url: string; alt: string; className?: string; onOpen?: () => void; onError?: () => void }) {
  const img = <img src={url} alt={alt} onError={onError} className={cx('rounded-xl object-cover', className)} draggable={false} />;
  if (!onOpen) return img;
  return (
    <button type="button" onClick={onOpen} className="shrink-0 rounded-xl" aria-label={`${alt} — show bigger`}>
      {img}
    </button>
  );
}

/** Full-size photo in a sheet. */
export function PhotoSheet({ path, alt, onClose }: { path: string; alt: string; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={alt}>
      <TxPhoto path={path} alt={alt} className="max-h-[70dvh] w-full !object-contain" />
    </Sheet>
  );
}

/** Character level line + XP bar for a kid ("Level 3 · Clever Fox · 85 points"). `name` = someone else's wallet. */
export function LevelLine({ member, pointsTotal, name }: { member: Pick<Member, 'theme'>; pointsTotal: number; name?: string }) {
  const ch = characterOf(member.theme);
  const lv = levelFromPoints(pointsTotal, ch?.key);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-3.5 py-2.5">
      <span className="text-3xl leading-none" aria-hidden="true">{ch?.emoji ?? '⭐'}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-accent-ink">Level {lv.level} · {lv.title} · {pointsWords(Math.max(0, pointsTotal))}</p>
        <ProgressBar
          className="mt-1" size="sm" value={lv.progressPct} label={`Progress to level ${lv.level + 1}`}
          valueText={`${lv.toNext} XP to level ${lv.level + 1}`}
        />
        <p className="mt-0.5 text-[13px] text-accent-ink/80">
          {name ? `${name} needs ${pointsWords(lv.toNext)} more for Level ${lv.level + 1}` : `${pointsWords(lv.toNext)} to Level ${lv.level + 1}`}
        </p>
      </div>
    </div>
  );
}

/** Row of quick-fill chips (reasons, notes). */
export function QuickChips({ options, value, onPick, label }: { options: string[]; value: string; onPick: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o} type="button" aria-pressed={value === o} onClick={() => onPick(o)}
          className={cx(
            'min-h-11 rounded-full border px-3.5 text-[15px] font-semibold transition',
            value === o ? 'border-transparent bg-accent-strong text-white' : 'border-line bg-surface text-ink hover:bg-surface-2',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Section heading row used inside cards. */
export function CardTitle({ children, right, id }: { children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="mb-2 flex min-h-11 items-center justify-between gap-2">
      <h3 id={id} className="text-lg font-bold leading-tight">{children}</h3>
      {right}
    </div>
  );
}
