import { Avatar, Badge, Button, Card, EmptyState, LinkButton, PageHeader, PageSpinner } from '../../components/ui';
import { api } from '../../lib/api';
import { memberRoleLabel, plural, timeAgo } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { AskEntry, Member } from '../../lib/types';
import { plainAnswer } from './guide';
import { Disclosure } from './parts';

/** /help/ask/all — managers read everyone's questions to Ask Pocket, grouped by person. */
export default function AllAsks() {
  const { isManager } = useApp();
  if (!isManager) {
    return (
      <>
        <PageHeader title="Questions" back="/help" />
        <EmptyState emoji="🔒" title="That’s not for you" message="Only parents can see everyone’s questions." action={<LinkButton to="/" icon="home">Go home</LinkButton>} />
      </>
    );
  }
  return <AllAsksList />;
}

interface Group { id: string; member: Member | null; entries: AskEntry[] }

function AllAsksList() {
  const { members, membersById, now } = useApp();
  const { data, loading, error, reload } = useLoad(() => api.listAsks(null, 200), []);

  const groups: Group[] = [];
  if (data) {
    const byMember = new Map<string, AskEntry[]>();
    for (const e of data) {
      const list = byMember.get(e.member_id);
      if (list) list.push(e); else byMember.set(e.member_id, [e]);
    }
    // Family order (kids first), then people who are no longer in the family.
    const ordered = [...members.filter((m) => m.role === 'kid'), ...members.filter((m) => m.role !== 'kid')];
    for (const m of ordered) {
      const entries = byMember.get(m.id);
      if (entries) groups.push({ id: m.id, member: m, entries });
    }
    for (const [id, entries] of byMember) if (!membersById[id]) groups.push({ id, member: null, entries });
  }

  return (
    <>
      <PageHeader title="Everyone’s questions" subtitle="What the family asked Pocket" back="/help/ask" />
      {loading && !data ? (
        <PageSpinner label="Loading questions…" />
      ) : error && !data ? (
        <Card className="space-y-3">
          <p>We couldn’t load this. {error}</p>
          <Button variant="secondary" icon="reset" onClick={() => void reload()}>Try again</Button>
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState emoji="💬" title="No questions yet" message="When someone asks Pocket a question, it shows up here." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`asks-${g.id}`} className="space-y-2">
              <div className="flex items-center gap-3 px-1">
                {g.member ? <Avatar member={g.member} size="sm" /> : <Avatar emoji="👤" size="sm" />}
                <div className="min-w-0 flex-1">
                  <h2 id={`asks-${g.id}`} className="truncate font-bold">{g.member?.display_name ?? 'Someone who left'}</h2>
                  <p className="text-sm text-muted">
                    {g.member ? `${memberRoleLabel(g.member)} · ` : ''}{plural(g.entries.length, 'question')}
                  </p>
                </div>
              </div>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {g.entries.map((e) => (
                  <Disclosure
                    key={e.id}
                    summary={
                      <span className="block">
                        <span className="block whitespace-pre-wrap wrap-break-word">{e.question}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-normal text-muted">
                          {timeAgo(e.created_at, now())}
                          {e.status === 'pending' && <Badge tone="warn">Waiting for answer</Badge>}
                          {e.status === 'failed' && <Badge tone="bad" icon="alert">No answer</Badge>}
                        </span>
                      </span>
                    }
                  >
                    {e.answer
                      ? <p className="whitespace-pre-wrap wrap-break-word text-muted"><span className="font-semibold text-ink">🐷 Pocket: </span>{plainAnswer(e.answer)}</p>
                      : <p className="italic text-muted">No answer yet.</p>}
                  </Disclosure>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
