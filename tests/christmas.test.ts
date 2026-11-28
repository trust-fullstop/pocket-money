// The December theme "🎄 Christmas: why we celebrate" (themes/christmas.ts): five tracked lessons that need 'faith'.
// Faith is invited, never tested: the quizzes ask about the story and plain facts, with a fixed right answer that the
// server checks (app.lesson_answers()), whatever the family's currency. Pure data checks (no database).
import { describe, expect, it } from 'vitest';
import { exampleCents } from '../src/features/help/learn/math';
import { CHRISTMAS_LESSONS } from '../src/features/help/learn/themes/christmas';
import type { Block, Lesson, LessonCtx, QuizQuestion } from '../src/features/help/learn/types';
import { money } from '../src/lib/format';

const MARK = '¤';
const fmt = (c: number) => `${MARK}${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const ctx = (over: Partial<LessonCtx> = {}): LessonCtx => ({
  m: fmt,
  currency: 'ZAR', second: null, on: () => true, settings: {}, isKid: true, name: 'Sam',
  allowanceCents: 5000, allowancePeriod: 'week', ...over,
});
const readers = [
  ctx(),
  ctx({ isKid: false, allowanceCents: 0, allowancePeriod: null }),
  ctx({ allowanceCents: 1250, allowancePeriod: 'month' }),
  ctx({ currency: 'EUR' }),
  ctx({ currency: 'EUR', isKid: false, allowanceCents: 0, allowancePeriod: null, m: (c) => money(c, 'EUR', { whole: true }) }),
  ctx({ m: (c) => money(c, 'ZAR', { whole: true }) }),
  ctx({ currency: 'USD', allowanceCents: 800 }),
];
const textOf = (b: Block): string[] =>
  b.kind === 'text' || b.kind === 'example' ? [b.text] : b.kind === 'list' ? b.items : b.kind === 'reflect' ? [b.prompt] : b.kind === 'verse' && b.note ? [b.note] : [];
const quizText = (x: QuizQuestion) => [x.q, x.why, ...x.options];
const allText = (l: Lesson, r: LessonCtx) => [...l.steps(r).flatMap((s) => s.blocks.flatMap(textOf)), ...l.quiz!(r).flatMap(quizText)];
const plain = (l: Lesson, r: LessonCtx = ctx()) => allText(l, r).join(' ').replace(/\*\*/g, '');
const amounts = (texts: string[]) => texts.flatMap((t) => [...t.matchAll(/¤(\d+(?:\.\d+)?)/g)].map((x) => Math.round(Number(x[1]) * 100)));
const lesson = (id: string) => CHRISTMAS_LESSONS.find((l) => l.id === id)!;
const noPocketMoney = { allowanceCents: 0, allowancePeriod: null } as const;

describe('Christmas: why we celebrate', () => {
  it('five lessons in order (one a week from 1 December: the budget before the shopping, thanks to end the year), with the titles the server knows', () => {
    expect(CHRISTMAS_LESSONS.map(({ id, emoji, title, summary }) => ({ id, emoji, title, summary }))).toEqual([
      { id: 'xmas-advent', emoji: '🕯️', title: 'Advent: waiting and getting ready', summary: 'Why Christians count down to Christmas' },
      { id: 'xmas-generous', emoji: '🎁', title: 'A generous Christmas on a budget', summary: 'Gifts that don’t cost the earth, and giving to others' },
      { id: 'xmas-birth', emoji: '👶', title: 'The birth of Jesus', summary: 'The Christmas story from Luke and Matthew' },
      { id: 'xmas-wise-men', emoji: '⭐', title: 'The wise men and their gifts', summary: 'Why we give presents at Christmas' },
      { id: 'xmas-thanks', emoji: '🙏', title: 'Thanks and giving: what is Thanksgiving?', summary: 'Harvest festivals, Thanksgiving and a thankful heart' },
    ]);
    for (const l of CHRISTMAS_LESSONS) {
      expect(l.kind, l.id).toBe('series');
      expect(l.needs, l.id).toEqual(['faith']);
      expect(l.minutes, l.id).toBe(4);
    }
  });

  it('4–6 steps with an emoji, words of their own next to every verse, and one thing to think about', () => {
    for (const l of CHRISTMAS_LESSONS) {
      for (const r of readers) {
        const steps = l.steps(r);
        expect(steps.length, l.id).toBeGreaterThanOrEqual(4);
        expect(steps.length, l.id).toBeLessThanOrEqual(6);
        for (const s of steps) {
          expect(s.emoji, `${l.id}: ${s.title}`).toBeTruthy();
          expect(s.title.trim()).not.toBe('');
          expect(s.blocks.some((b) => b.kind !== 'verse'), `${l.id}: ${s.title}`).toBe(true);
        }
        const blocks = steps.flatMap((s) => s.blocks);
        expect(blocks.filter((b) => b.kind === 'reflect'), l.id).toHaveLength(1);
        expect(blocks.some((b) => b.kind === 'verse'), l.id).toBe(true);
        expect(blocks.flatMap(textOf).join(' '), l.id).toMatch(/\*\*[^*]+\*\*/);
      }
      // About 4 minutes of reading for 12–14 year olds.
      const words = l.steps(ctx()).flatMap((s) => s.blocks.flatMap(textOf)).join(' ').split(/\s+/).length;
      expect(words, l.id).toBeGreaterThanOrEqual(300);
      expect(words, l.id).toBeLessThanOrEqual(800);
    }
  });

  it('every quiz: 3 questions, 3 different options, a why', () => {
    for (const l of CHRISTMAS_LESSONS) {
      for (const r of readers) {
        const quiz = l.quiz!(r);
        expect(quiz, l.id).toHaveLength(3);
        for (const x of quiz) {
          expect(x.options, x.q).toHaveLength(3);
          expect(new Set(x.options).size, x.q).toBe(3);
          expect(Number.isInteger(x.answer), x.q).toBe(true);
          expect(x.answer).toBeGreaterThanOrEqual(0);
          expect(x.answer).toBeLessThan(3);
          expect(x.why.trim().length, x.q).toBeGreaterThan(10);
        }
      }
    }
  });

  it('the right answers never move, whatever the currency or reader (the server checks them)', () => {
    const answers = (r: LessonCtx) => Object.fromEntries(CHRISTMAS_LESSONS.map((l) => [l.id, l.quiz!(r).map((x) => x.answer)]));
    expect(answers(ctx())).toEqual({
      'xmas-advent': [0, 1, 2], 'xmas-generous': [0, 1, 2], 'xmas-birth': [0, 1, 2], 'xmas-wise-men': [1, 0, 2], 'xmas-thanks': [1, 2, 0],
    });
    for (const r of readers) expect(answers(r)).toEqual(answers(ctx()));
    // The questions without money read the same for everyone.
    for (const l of CHRISTMAS_LESSONS.filter((x) => x.id !== 'xmas-generous')) {
      for (const r of readers) expect(l.quiz!(r), l.id).toEqual(l.quiz!(ctx()));
    }
  });

  it('the budget sum is right in rand and in euro', () => {
    for (const currency of ['ZAR', 'EUR', 'USD']) {
      const [budget] = lesson('xmas-generous').quiz!(ctx({ currency }));
      const [total, giveAway] = amounts([budget.q]);
      expect(amounts([budget.options[budget.answer]]), currency).toEqual([(total - giveAway) / 4]);
      for (const [i, o] of budget.options.entries()) if (i !== budget.answer) expect(amounts([o])[0], currency).not.toBe((total - giveAway) / 4);
    }
  });

  it('faith is invited, never tested: the quizzes ask about the story and facts, never what you believe', () => {
    for (const l of CHRISTMAS_LESSONS) {
      for (const x of l.quiz!(ctx())) {
        for (const t of quizText(x)) expect(t, l.id).not.toMatch(/believ|faith|do you think|true or false/i);
      }
    }
    // Belief is told as belief.
    for (const id of ['xmas-advent', 'xmas-birth', 'xmas-wise-men']) expect(plain(lesson(id)), id).toContain('Christians believe');
  });

  it('tells what the Bible does and doesn’t say, and respects other traditions', () => {
    const advent = plain(lesson('xmas-advent'));
    expect(advent).toContain('Traditions vary');
    expect(advent).toMatch(/hope.+peace.+joy.+love/);
    const birth = plain(lesson('xmas-birth'));
    expect(birth).toContain('The Bible doesn’t give a date.');
    expect(birth).toContain('25 December is the traditional day');
    expect(birth).toMatch(/Orthodox churches celebrate on 7 January/);
    expect(birth).toContain('guest room');
    expect(birth).toContain('Immanuel');
    const wise = plain(lesson('xmas-wise-men'));
    expect(wise).toContain('doesn’t say there were three');
    expect(wise).toContain('they came to a house');
    expect(wise).toMatch(/gold.+frankincense.+myrrh/i);
    expect(wise).toContain('Saint Nicholas');
    const thanks = plain(lesson('xmas-thanks'));
    expect(thanks).toContain('fourth Thursday in November');
    expect(thanks).toContain('second Monday in October');
    expect(thanks).toContain('Wampanoag');
    expect(thanks).toContain('Many churches');
    expect(thanks).toContain('remember it differently');
    expect(plain(lesson('xmas-generous'))).toMatch(/two homes/);
    for (const l of CHRISTMAS_LESSONS) {
      for (const t of allText(l, ctx())) {
        expect(t, l.id).not.toMatch(/spotted|\bfine[sd]?\b|punish|xp\b|points?\b|score/i);
        expect(t, l.id).not.toMatch(/pagan|heathen|false (god|religion)|\bcult\b|idol/i);
      }
    }
  });

  it('use the family’s own money, never a hard-coded currency', () => {
    for (const l of CHRISTMAS_LESSONS) {
      for (const r of readers.filter((x) => x.m === fmt)) {
        for (const t of allText(l, r)) expect(t, l.id).not.toMatch(/(^|[^A-Za-z])R ?\d|€|\$|£|\b(ZAR|EUR|USD|GBP)\b/);
      }
    }
  });

  it('real-world example amounts fit the currency: a tenth in euro', () => {
    for (const id of ['xmas-advent', 'xmas-generous']) {
      const zar = amounts(allText(lesson(id), ctx(noPocketMoney)));
      const eur = amounts(allText(lesson(id), ctx({ ...noPocketMoney, currency: 'EUR' })));
      expect(zar.length, id).toBeGreaterThan(0);
      expect(eur.length, id).toBe(zar.length);
      eur.forEach((c, i) => expect(c * 10, `${id} amount #${i + 1}`).toBe(zar[i]));
      expect(Math.max(...eur), id).toBeLessThanOrEqual(exampleCents('EUR', 100_000));
    }
    const generous = plain(lesson('xmas-generous'), ctx({ ...noPocketMoney, currency: 'EUR' }));
    expect(generous).toContain(`You have ${MARK}19. Presents for 4 people at ${MARK}4 each, and ${MARK}3 to give away: 4 × ${MARK}4 + ${MARK}3 = ${MARK}19.`);
    expect(generous).toContain(`about ${MARK}1.50 a present`);
  });

  it('pocket money is the family’s own number: never scaled', () => {
    for (const currency of ['ZAR', 'EUR']) {
      const advent = plain(lesson('xmas-advent'), ctx({ currency }));
      expect(advent, currency).toContain(`You get ${MARK}50 a week. Put a quarter of it, ${MARK}12.50, aside every week of Advent. After four weeks there’s ${MARK}50`);
      const generous = plain(lesson('xmas-generous'), ctx({ currency }));
      expect(generous, currency).toContain(`You get ${MARK}50 a week. Saving a quarter of it, ${MARK}12.50, in each of the two weeks left before Christmas gives ${MARK}25.`);
    }
    const grownUp = plain(lesson('xmas-generous'), ctx({ isKid: false, allowanceCents: 2000, allowancePeriod: 'month' }));
    expect(grownUp).toContain(`The pocket money is ${MARK}20 a month.`);
    // No pocket money: the example amount instead, and no pocket-money line.
    expect(plain(lesson('xmas-advent'), ctx(noPocketMoney))).toContain(`Say you put ${MARK}20 aside every week of Advent.`);
    expect(plain(lesson('xmas-generous'), ctx(noPocketMoney))).not.toMatch(/You get|pocket money is/);
  });
});
