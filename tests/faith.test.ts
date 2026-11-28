// Faith, hope and love (feature 'faith'): the reflections only use reviewed verses, are never scored, and family verses
// go both ways. Pure data checks (no database).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FAITH_LESSONS } from '../src/features/faith/reflections';
import { VERSES, VERSE_BY_ID, bibleAppUrl, verseOfTheDay } from '../src/features/faith/verses';
import { LESSONS } from '../src/features/help/learn/lessons';
import { CHRISTMAS_LESSONS } from '../src/features/help/learn/themes/christmas';
import { FAITH_LESSON_IDS, type Block, type LessonCtx } from '../src/features/help/learn/types';
import { APPROVED_VERSES } from '../supabase/functions/ask/verses';

const ctx = (over: Partial<LessonCtx> = {}): LessonCtx => ({
  m: (c) => `R ${(c / 100).toFixed(c % 100 ? 2 : 0)}`,
  currency: 'ZAR', second: null, on: () => true, settings: {}, isKid: true, name: 'Sam',
  allowanceCents: 5000, allowancePeriod: 'week', ...over,
});
const readers = [ctx(), ctx({ isKid: false, allowanceCents: 0, allowancePeriod: null }), ctx({ allowanceCents: 1250, allowancePeriod: 'month' })];
const textOf = (b: Block): string[] =>
  b.kind === 'text' || b.kind === 'example' ? [b.text] : b.kind === 'list' ? b.items : b.kind === 'reflect' ? [b.prompt] : b.kind === 'verse' && b.note ? [b.note] : [];
const verseIdsIn = (file: string, attr: RegExp) => [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(attr)].map((x) => x[1]);
// The verses added for the December theme "Christmas: why we celebrate" (WEBBE, lesson context only).
const CHRISTMAS_VERSE_IDS = [
  'great-light', 'child-is-born', 'wait-for-the-lord', 'angel-to-mary', 'no-room', 'good-news-great-joy', 'immanuel',
  'his-star', 'wise-men-gifts', 'enter-with-thanks', 'in-everything-thanks', 'unspeakable-gift',
];

describe('faith reflections', () => {
  it('are the six faith lessons in order: no quiz, short', () => {
    expect(FAITH_LESSONS.map((l) => l.id)).toEqual([...FAITH_LESSON_IDS]);
    for (const l of FAITH_LESSONS) {
      expect(l.kind).toBe('faith');
      expect(l.quiz).toBeUndefined();
      expect(l.minutes).toBeGreaterThanOrEqual(3);
      expect(l.minutes).toBeLessThanOrEqual(5);
      for (const r of readers) {
        const steps = l.steps(r);
        expect(steps.length).toBeGreaterThanOrEqual(4);
        expect(steps.length).toBeLessThanOrEqual(6);
        const blocks = steps.flatMap((s) => s.blocks);
        expect(blocks.filter((b) => b.kind === 'verse').length, l.id).toBeGreaterThanOrEqual(3);
        expect(blocks.some((b) => b.kind === 'reflect'), l.id).toBe(true);
        for (const s of steps) {
          expect(s.title.trim()).not.toBe('');
          // Still makes sense when the reader hides verses: every step has words of its own.
          expect(s.blocks.some((b) => b.kind !== 'verse'), `${l.id}: ${s.title}`).toBe(true);
        }
      }
    }
  });

  it('only use reviewed verses, and family verses go both ways', () => {
    for (const l of FAITH_LESSONS) {
      for (const r of readers) {
        for (const s of l.steps(r)) {
          const ids = s.blocks.flatMap((b) => (b.kind === 'verse' ? [b.id] : []));
          for (const id of ids) expect(VERSE_BY_ID[id], `${l.id}: ${id}`).toBeDefined();
          if (ids.includes('children-obey')) expect(ids).toContain('fathers-nurture');
          for (const b of s.blocks) if (b.kind === 'widget') expect(b.widget).toBe('jars');
          // Malachi 3:10 only with its context: trust, not a deal.
          if (ids.includes('storehouse')) {
            expect(l.id).toBe('faith-tithing');
            expect(s.blocks.flatMap(textOf).join(' ')).toMatch(/not a trick/);
          }
        }
      }
    }
  });

  it('never talk about fines, Spotted or punishment, and use the family’s money format', () => {
    for (const l of FAITH_LESSONS) {
      const texts = l.steps(ctx()).flatMap((s) => s.blocks.flatMap(textOf));
      for (const t of texts) expect(t).not.toMatch(/spotted|\bfine[sd]?\b|punish|xp\b|points?\b|score/i);
      for (const t of texts) expect(t, 'kind words about other faiths').not.toMatch(/pagan|heathen|false (god|religion)|\bcult\b|idol/i);
    }
    const examples = FAITH_LESSONS.flatMap((l) => l.steps(ctx()).flatMap((s) => s.blocks.filter((b) => b.kind === 'example')));
    expect(examples.length).toBeGreaterThan(0);
    for (const e of examples) expect(e.kind === 'example' && e.text).toMatch(/R \d/);
  });

  it('tithing does the sums with the family’s money', () => {
    const tithing = FAITH_LESSONS.find((l) => l.id === 'faith-tithing')!;
    const text = tithing.steps(ctx()).flatMap((s) => s.blocks.flatMap(textOf)).join(' ');
    expect(text).toContain('If you get R 50, a tithe is R 5.');
    const month = tithing.steps(ctx({ allowanceCents: 1250, allowancePeriod: 'month' })).flatMap((s) => s.blocks.flatMap(textOf)).join(' ');
    expect(month).toContain('From your R 12.50 a month, it would be R 1.25.');
  });
});

describe('verses in pages', () => {
  it('the Help section and the page lines only use reviewed verses', () => {
    const ids = [
      ...verseIdsIn('../src/features/faith/FaithSection.tsx', /verse="([^"]+)"/g),
      ...['../src/features/money/MoneyHome.tsx', '../src/features/tasks/TasksHome.tsx', '../src/features/family/FamilyList.tsx']
        .flatMap((f) => verseIdsIn(f, /<VerseLine id="([^"]+)"/g)),
    ];
    expect(ids).toEqual(expect.arrayContaining(['little-by-little',     'work-heartily', 'sets-the-lonely']));
        // Page lines stand alone, without a lesson's context: no warnings (Ps 68:6 is kept to its first, good-news half).
        for (const id of ids) expect(VERSE_BY_ID[id]?.text ?? '', id).not.toMatch(/rebellious|wrath|punish|curse|destroy/i);
    expect(ids.length).toBeGreaterThanOrEqual(7);
    for (const id of ids) expect(VERSE_BY_ID[id], id).toBeDefined();
  });
});

describe('verses', () => {
  it('the verse of the day is the same all day and only a daily verse', () => {
    const v = verseOfTheDay('2026-11-17');
    expect(verseOfTheDay('2026-11-17')).toBe(v);
    expect(v.daily).toBe(true);
    const week = new Set(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map((d) => verseOfTheDay(d).id));
    expect(week.size).toBe(4);
  });

  it('no daily verse can read as a judgement next to a missed task (lessons only, with context)', () => {
    const harsh = /poor|poverty|sluggard|lazy|rebellious|wrath|punish|curse|destroy|discipline|chasten|wicked/i;
    for (const v of VERSES.filter((x) => x.daily)) expect(v.text, v.id).not.toMatch(harsh);
    for (const id of ['storehouse', 'honour-with-wealth', 'love-of-money', 'borrower', 'reap-sow', 'righteous-repay', 'prudent-sees-danger', 'store-for-famine', 'yes-be-yes']) {
      expect(VERSE_BY_ID[id]?.daily, id).toBe(false);
    }
    for (const id of ['owe-no-one', 'do-not-withhold']) expect(VERSE_BY_ID[id]?.daily, id).toBe(true);
  });

  it('every verse a lesson uses exists (core, series and faith; any reader)', () => {
    const used = new Set<string>();
    for (const l of LESSONS) {
      for (const r of [...readers, ctx({ on: (k) => k !== 'loans' })]) {
        for (const s of l.steps(r)) for (const b of s.blocks) if (b.kind === 'verse') used.add(b.id);
      }
    }
    for (const id of used) expect(VERSE_BY_ID[id], id).toBeDefined();
    for (const id of ['borrower', 'owe-no-one', 'righteous-repay', 'do-not-withhold', 'yes-be-yes', 'prudent-sees-danger', 'store-for-famine']) {
      expect(used.has(id), id).toBe(true);
    }
  });

  it('Christmas verses are lesson context only: never daily, so never the verse of the day or in Ask Pocket', () => {
    const christmas = VERSES.filter((v) => v.themes.includes('christmas'));
    expect(christmas.map((v) => v.id)).toEqual(expect.arrayContaining(CHRISTMAS_VERSE_IDS));
    for (const id of CHRISTMAS_VERSE_IDS) expect(VERSE_BY_ID[id]?.daily, id).toBe(false);
    for (const v of christmas) expect(v.daily, v.id).toBe(false);
  });

  it('Ask Pocket’s approved verses are exactly the daily verses (regenerate supabase/functions/ask/verses.ts)', () => {
    expect(APPROVED_VERSES).toEqual(VERSES.filter((x) => x.daily).map(({ ref, text }) => ({ ref, text })));
  });

  it('every verse has text and a Bible App link', () => {
    expect(new Set(VERSES.map((x) => x.id)).size).toBe(VERSES.length);
    for (const v of VERSES) {
      expect(v.text.trim().length, v.id).toBeGreaterThan(10);
      expect(v.ref, v.id).toMatch(new RegExp(`\\b${v.ch}:${v.from}(-${v.to})?$`));
      expect(v.to, v.id).toBeGreaterThanOrEqual(v.from);
      expect(bibleAppUrl(v), v.id).toMatch(/^https:\/\/www\.bible\.com\/bible\/111\/[1-3A-Z]{3}\.\d+\.\d+(-\d+)?\.NIV$/);
    }
  });

  it('links open the Bible App', () => {
    expect(bibleAppUrl(VERSE_BY_ID['little-by-little'])).toBe('https://www.bible.com/bible/111/PRO.13.11.NIV');
    expect(bibleAppUrl(VERSE_BY_ID['children-parents'])).toBe('https://www.bible.com/bible/111/COL.3.20-21.NIV');
  });
});

describe('Christmas lessons and their verses', () => {
  const christmasReaders = [
    ...readers,
    ctx({ currency: 'EUR' }),
    ctx({ on: (k) => k !== 'faith' }),
    ctx({ currency: 'EUR', allowanceCents: 1250, allowancePeriod: 'month' }),
  ];
  const versesIn = (blocks: Block[]) => blocks.flatMap((b) => (b.kind === 'verse' ? [b.id] : []));
  const quizText = (r: LessonCtx) => (l: (typeof CHRISTMAS_LESSONS)[number]) => l.quiz!(r).flatMap((x) => [x.q, x.why, ...x.options]);

  it('every verse they use exists, and every new Christmas verse is used', () => {
    const used = new Set<string>();
    for (const l of CHRISTMAS_LESSONS) {
      for (const r of christmasReaders) for (const s of l.steps(r)) for (const id of versesIn(s.blocks)) used.add(id);
    }
    for (const id of used) expect(VERSE_BY_ID[id], id).toBeDefined();
    for (const id of [...CHRISTMAS_VERSE_IDS, 'god-so-loved', 'more-blessed', 'cheerful-giver']) expect(used.has(id), id).toBe(true);
  });

  it('Scripture is only quoted through verse blocks: no six words in a row from a verse in the lesson’s own text', () => {
    const words = (t: string) => t.toLowerCase().replace(/[’‘]/g, "'").replace(/\*\*/g, '').split(/[^a-z']+/).filter(Boolean);
    const sixes = (t: string) => { const w = words(t); return w.slice(0, Math.max(0, w.length - 5)).map((_, i) => w.slice(i, i + 6).join(' ')); };
    for (const l of CHRISTMAS_LESSONS) {
      const r = ctx();
      const steps = l.steps(r);
      const quoted = new Set(versesIn(steps.flatMap((s) => s.blocks)).flatMap((id) => sixes(VERSE_BY_ID[id].text)));
      const own = [...steps.flatMap((s) => s.blocks.flatMap(textOf)), ...quizText(r)(l)];
      for (const t of own) for (const six of sixes(t)) expect(quoted.has(six), `${l.id}: “${six}” in “${t}”`).toBe(false);
    }
  });

  it('no verse sits next to fines, debts or consequences, and other traditions are spoken of kindly', () => {
    for (const l of CHRISTMAS_LESSONS) {
      for (const r of christmasReaders) {
        for (const s of l.steps(r)) {
          const texts = s.blocks.flatMap(textOf);
          for (const t of texts) expect(t, l.id).not.toMatch(/spotted|\bfine[sd]?\b|punish|xp\b|points?\b|score/i);
          for (const t of texts) expect(t, l.id).not.toMatch(/pagan|heathen|false (god|religion)|\bcult\b|idol/i);
          if (versesIn(s.blocks).length === 0) continue;
          expect(texts.join(' '), `${l.id}: ${s.title}`).not.toMatch(/penalt|late fee|consequence|\bdebts?\b|\bowe|borrow|pay later|in trouble/i);
        }
      }
    }
  });

  it('the new verses are gentle, even though they are lessons only', () => {
    const harsh = /poor|poverty|sluggard|lazy|rebellious|wrath|punish|curse|destroy|discipline|chasten|wicked/i;
    for (const id of CHRISTMAS_VERSE_IDS) expect(VERSE_BY_ID[id].text, id).not.toMatch(harsh);
  });
});
