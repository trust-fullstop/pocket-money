import { Avatar, Badge, ListRow } from '../../components/ui';
import { useApp } from '../../lib/session';
import type { EventOccurrence } from '../../lib/types';
import { KIND_META, eventTime, eventWhen, forWhomText, repeatText } from './events';

export interface EventRowProps {
  occ: EventOccurrence;
  /** Show the day too ("Tomorrow 18:30") — for lists that aren't grouped by day. */
  withDay?: boolean;
  onClick?: () => void;
  to?: string;
}

/** One calendar item: emoji · title · time + kind badge + repeat · who it's for. */
export function EventRow({ occ, withDay, onClick, to }: EventRowProps) {
  const { family, now } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const when = withDay ? eventWhen(occ, tz, now()) : eventTime(occ, tz);
  const repeat = occ.repeat && occ.repeat !== 'none' ? repeatText(occ.repeat) : '';
  return (
    <ListRow
      onClick={onClick}
      to={to}
      left={
        <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-2xl leading-none" aria-hidden="true">
          {occ.emoji || KIND_META[occ.kind].emoji}
        </span>
      }
      title={occ.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="tabular-nums">{when}</span>
          {occ.kind !== 'event' && (
            <Badge tone={occ.kind === 'birthday' ? 'accent' : 'neutral'}>{KIND_META[occ.kind].label}</Badge>
          )}
          {repeat && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">🔁</span>
              <span className="sr-only">{repeat}</span>
            </span>
          )}
        </span>
      }
      right={<WhoStack ids={occ.for_members} />}
    />
  );
}

/** Small avatar stack (max 3 + "+n") or the word "Everyone". */
function WhoStack({ ids }: { ids: string[] }) {
  const { membersById } = useApp();
  const label = `For ${forWhomText(ids, membersById)}`;
  if (ids.length === 0) return <span className="text-[13px] font-semibold text-muted">Everyone</span>;
  const shown = ids.slice(0, 3);
  const extra = ids.length - shown.length;
  return (
    <span className="flex items-center" role="img" aria-label={label}>
      {shown.map((id, i) => (
        <Avatar key={id} member={membersById[id]} name="" size="xs" className={i > 0 ? '-ml-2 ring-2 ring-surface' : 'ring-2 ring-surface'} />
      ))}
      {extra > 0 && <span className="ml-1 text-[13px] font-semibold text-muted" aria-hidden="true">+{extra}</span>}
    </span>
  );
}
