// "Faith, hope and love" section for the Help page (feature 'faith'): why faith is part of our family app, the faith
// reflections in Money school and the Bible App. Invited, never tested: no quiz, score or XP, and beliefs are never
// evaluated. Parents may choose a small surprise gift for a kid who opens the Bible App from one of our links, like the
// one here (bibleTrack.ts); a tap only shows that the app was opened.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Card, ListRow, Section } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { useTrackBibleOpen } from './bibleTrack';
import { VERSES_SETTING_PATH, useVersesShown } from './prefs';
import { FAITH_LESSONS } from './reflections';
import { VerseLine } from './VerseCard';

const BIBLE_APP_HOME = 'https://www.bible.com/';

export function FaithSection() {
  const shown = useVersesShown();
  const { on } = useFeatures();
  const track = useTrackBibleOpen();
  if (!shown) return null;
  const learn = on('learn');

  return (
    <Section title={<><span aria-hidden="true">🕊️ </span>Faith, hope and love</>}>
      <Card padded={false} className="overflow-hidden">
        <h3 className="px-4 pt-4 text-lg font-bold">Why faith is part of our family app</h3>
        <ul className="divide-y divide-line">
          <Point emoji="🎁" title="It’s all a gift" verse="every-good-gift">
            Everything we have comes from God. We look after it well, say thank you, and learn that enough is a good place to be.
          </Point>
          <Point emoji="💪" title="Work as for the Lord" verse="work-heartily">
            We do our jobs with a willing heart, even the small ones nobody sees.
          </Point>
          <Point emoji="😊" title="Give with a happy heart" verse="cheerful-giver">
            Giving is free and glad, never a deal to get more back.
          </Point>
          <Point emoji="💛" title="Love goes both ways" verse="children-parents">
            Kids honour their parents, and parents are patient and kind with their kids. Bonus parents and grandparents too: God sets the lonely in families.
          </Point>
          <Point emoji="🌅" title="A fresh start every morning" verse="new-every-morning">
            Mistakes can be put right. The app’s rules are family rules: they never change how much God loves you. His mercy is new every morning.
          </Point>
        </ul>
      </Card>

      {learn && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-4 pt-3">
            <h3 className="font-bold">Reflections</h3>
            <p className="text-[15px] text-muted">A few minutes to think and talk about. Nothing to score.</p>
          </div>
          <div className="divide-y divide-line">
            {FAITH_LESSONS.map((l) => (
              <ListRow
                key={l.id} to={`/help/learn/${l.id}`} title={l.title} subtitle={`${l.summary} · ${l.minutes} min`}
                left={<span className="grid size-10 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">{l.emoji}</span>}
              />
            ))}
          </div>
        </Card>
      )}

      <Card padded={false} className="overflow-hidden">
        <ListRow
          href={BIBLE_APP_HOME} onClick={() => track('home')} title="Open the Bible App" subtitle="Read the whole Bible, reading plans and more"
          left={<span className="grid size-10 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">📖</span>}
        />
      </Card>

      <p className="px-1 text-sm text-muted">
        Everyone can switch the verses off for themselves in <Link to={VERSES_SETTING_PATH} className="font-semibold text-accent-ink underline underline-offset-2">Me</Link>.
        {' '}Verses here are from the World English Bible (WEB); the Bible App may show another translation.
      </p>
    </Section>
  );
}

function Point({ emoji, title, verse, children }: { emoji: string; title: string; verse: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="text-2xl leading-8" aria-hidden="true">{emoji}</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <h4 className="font-bold leading-8">{title}</h4>
        <p className="text-[16px] text-muted">{children}</p>
        <VerseLine id={verse} />
      </div>
    </li>
  );
}
