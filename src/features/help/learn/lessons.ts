// Money school lessons: the 6 core lessons and the lesson series (tracked: quiz, finished once on the server, +5 XP for
// kids) followed by the faith reflections. Texts use the family's own numbers through LessonCtx: their currency and their
// savings bonus.
import { money } from '../../../lib/format';
import { spendCurrencyOf } from '../../../lib/fx';
import type { Family, FeatureKey, Member } from '../../../lib/types';
import { FAITH_LESSONS } from '../../faith/reflections';
import { CORE_BY_ID } from './catalog';
import { DEFAULT_PCT_MONTH, compoundYears, familyYearPct, owedAfter, pct, simpleYears, weeklyBonus } from './math';
import { SERIES_LESSONS_FULL } from './seriesLessons';
import { isTracked, type Block, type CoreLessonId, type Lesson, type LessonCtx } from './types';

function core(id: CoreLessonId, steps: Lesson['steps'], quiz: NonNullable<Lesson['quiz']>): Lesson {
  const { emoji, title, summary, minutes, needs } = CORE_BY_ID[id];
  return { id, kind: 'core', emoji, title, summary, minutes, needs, steps, quiz };
}

/** % a month the family pays on savings (server default when never set). */
export const pctMonthOf = (ctx: LessonCtx) => ctx.settings.interest_pct_month ?? DEFAULT_PCT_MONTH;
/** The weekly savings bonus is really paid in this family. */
export const bonusOn = (ctx: LessonCtx) => ctx.on('interest') && pctMonthOf(ctx) > 0;
const periodWord = (ctx: LessonCtx) => (ctx.allowancePeriod === 'month' ? 'month' : 'week');
const perYear = (ctx: LessonCtx) => (ctx.allowancePeriod === 'month' ? 12 : 52);
const roundWhole = (cents: number) => Math.round(cents / 100) * 100;

const purpose = core(
  'purpose',
  (ctx) => {
    const { m, on } = ctx;
    const pts = on('points');
    const pm = pctMonthOf(ctx);
    const saving: Block[] = [{ kind: 'text', text: 'Money you don’t spend today is still there tomorrow. That’s **saving**.' }];
    if (on('savings')) saving.push({ kind: 'text', text: 'In the app you have two pots: **Wallet** 👛 and **Savings** 🐷.' });
    if (bonusOn(ctx)) {
      saving.push({
        kind: 'example',
        text: `Our family adds a savings bonus every week (${pct(pm)} a month). ${m(10000)} in Savings → about +${m(weeklyBonus(10000, pm))} every week, without doing anything.`,
      });
    }
    if (on('goals')) saving.push({ kind: 'text', text: 'With a **Goal** you can see how close you are to something you really want.' });
    return [
      {
        title: 'Cause and effect', emoji: '🔁', blocks: [
          { kind: 'text', text: 'Everything you do has a result. That’s called **cause and effect**.' },
          { kind: 'example', text: `Dishes done before 19:00 → +${m(200)}${pts ? ' and +10 points' : ''}. Not done in time → −${m(50)}.` },
          { kind: 'text', text: 'Sow & Grow shows you the result straight away, while the amounts are still small. Your parents choose the tasks and the amounts.' },
        ],
      },
      {
        title: 'Responsibility and rewards', emoji: '🙌', blocks: [
          { kind: 'text', text: '**Responsibility** and **rewards** go together. When you show you can handle small things, you get trusted with bigger ones.' },
          {
            kind: 'list', items: [
              'You decide when to do a task, as long as it’s done before the deadline.',
              on('requests') ? 'You decide what to spend your money on (and ask in the app first).' : 'You decide what to spend your money on.',
              on('savings') ? 'You decide how much to keep in Savings.' : 'You decide how much to keep for later.',
            ],
          },
          { kind: 'text', text: 'Mistakes are part of learning. Better to learn with small amounts now than with big ones later.' },
        ],
      },
      {
        title: 'It works both ways', emoji: '🤝', blocks: [
          on('challenges')
            ? { kind: 'text', text: 'Grown-ups have to keep their word too. With **Challenges** you can challenge a parent. For example: “Dad, no phone at dinner all week!”' }
            : { kind: 'text', text: 'Grown-ups have to keep their word too. If something feels unfair, say so. A parent will explain why.' },
          { kind: 'text', text: 'This is **teamwork, not punishment**. Were you ill, or was there a good reason? A parent can excuse a missed task and you get it all back.' },
        ],
      },
      { title: 'Saving grows', emoji: '🌱', blocks: saving },
      {
        title: 'How a task works', emoji: '✅', blocks: [
          { kind: 'text', text: 'Every task goes in four steps:' },
          {
            kind: 'list', items: [
              '1. Open **Tasks** and see what’s due, and by when.',
              '2. Do the job, and do it well.',
              '3. Take a photo of the result (sometimes a note is enough) and send it.',
              `4. A grown-up checks it and says OK. Your reward lands in **Money**${pts ? ' and your points go up' : ''}. 🎉`,
            ],
          },
          { kind: 'reflect', prompt: 'Which task are you best at? And which one do you forget most?' },
        ],
      },
    ];
  },
  () => [
    {
      q: 'The time for a task runs out and it isn’t done. What happens?',
      options: ['Nothing at all', 'It costs a little: cause and effect', 'You can never use the app again'],
      answer: 1,
      why: 'Leaving a task costs a little. It’s the result, not a punishment. If there was a good reason, a parent can excuse it.',
    },
    {
      q: 'Why do you send a photo when a task is done?',
      options: ['It’s just for fun', 'So a grown-up can see it’s done and say OK', 'So you get double money'],
      answer: 1,
      why: 'The photo is your proof. Even a parent who isn’t at home can see the job is done.',
    },
    {
      q: 'What is Sow & Grow really about?',
      options: ['Catching kids doing things wrong', 'Teamwork: doing your part and seeing the result', 'Getting as much money from parents as possible'],
      answer: 1,
      why: 'It’s about cause and effect, and teamwork. It works both ways, and mistakes can always be fixed.',
    },
  ],
);

const earn = core(
  'earn',
  (ctx) => {
    const { m, on } = ctx;
    const extras: string[] = [];
    if (on('challenges')) extras.push('**Challenges**: take one on, or do one together, for points or a reward.');
    if (on('targets')) extras.push('**Targets**: reach the weekly or monthly aim and the prize is paid automatically.');
    if (on('spotted')) extras.push('**Spotted**: grown-ups notice good moments. Helping without being asked counts!');
    if (bonusOn(ctx)) extras.push(`**Savings bonus**: money in Savings grows by ${pct(pctMonthOf(ctx))} a month.`);
    if (on('saver_rules')) extras.push('**Saver bonus**: points when your savings grew this week.');
    if (on('time')) extras.push('**Time**: some tasks give game or Wi-Fi minutes too.');
    return [
      {
        title: 'On time, with a good photo', emoji: '⏰', blocks: [
          { kind: 'text', text: 'The easiest way to earn more: do every task **on time** and send a **clear photo**.' },
          { kind: 'example', text: 'A good photo shows the whole job: the clean kitchen counter, the made bed, the bin bag outside. Before and after is even better.' },
          { kind: 'text', text: 'Was a task sent back? Read the note, fix it and send it again. That’s normal, not a fail.' },
        ],
      },
      {
        title: 'Ask for an extra job', emoji: '🙋', blocks: [
          { kind: 'text', text: 'Grown-ups often have jobs they’d happily pay for: washing the car, weeding the garden, sorting out a cupboard.' },
          { kind: 'example', text: `Ask: “Is there an extra job I can do this weekend?” Agree first on the job, the price (say ${m(2000)}) and when it will be done.` },
          { kind: 'text', text: 'Asking shows you’re keen. People remember that.' },
        ],
      },
      {
        title: 'More ways to earn', emoji: '✨', blocks: extras.length > 0
          ? [{ kind: 'text', text: 'Our family also uses:' }, { kind: 'list', items: extras }]
          : [{ kind: 'text', text: 'Your parents choose which extra parts of the app your family uses. Ask them what’s possible.' }],
      },
      {
        title: 'Quality and reliability', emoji: '🏅', blocks: [
          { kind: 'text', text: 'People pay more to someone they can **count on**. That’s true at home, and later at work too.' },
          { kind: 'list', items: ['Do it right the first time.', 'Do it without being reminded.', 'Keep your word: if you say you’ll do it, do it.'] },
          { kind: 'text', text: '**Trust** grows a little with every job done well. With trust come bigger jobs and bigger rewards.' },
        ],
      },
      {
        title: 'Your plan', emoji: '📝', blocks: [
          { kind: 'text', text: 'Home shows what you can still earn this week. Start there!' },
          { kind: 'reflect', prompt: 'Which extra job could you offer to do this week? Who will you ask?' },
        ],
      },
    ];
  },
  () => [
    {
      q: 'Which photo helps a grown-up say OK the fastest?',
      options: ['A blurry photo of the ceiling', 'A clear photo of the whole job, maybe before and after', 'No photo, just the word “done”'],
      answer: 1,
      why: 'A clear photo of the whole job shows it’s really done, so nobody has to ask questions.',
    },
    {
      q: 'You want to earn extra. What’s a good first step?',
      options: ['Ask a parent for an extra job and agree on the price first', 'Do a random job and send a bill', 'Wait until someone offers you one'],
      answer: 0,
      why: 'Asking first means everyone agrees on the job, the price and the deadline. No surprises.',
    },
    {
      q: 'Why does being reliable help you earn more?',
      options: ['It doesn’t matter at all', 'People trust you with bigger jobs and bigger rewards', 'Because then you can skip tasks later'],
      answer: 1,
      why: 'When people can count on you, they give you more responsibility, and more rewards.',
    },
  ],
);

const whySave = core(
  'why-save',
  ({ m }) => [
    {
      title: 'Needs and wants', emoji: '🤔', blocks: [
        { kind: 'text', text: 'A **need** is something you must have to live and be OK: food, a safe home, clothes for school.' },
        { kind: 'text', text: 'A **want** is something nice to have: a new game, sweets, a cool cap. Wants are fine, once the needs are covered.' },
        { kind: 'text', text: 'Try it: is it a need or a want?' },
        { kind: 'widget', widget: 'needs-wants' },
      ],
    },
    {
      title: 'Surprises happen', emoji: '☔', blocks: [
        { kind: 'text', text: 'Earphones break. Shoes wear out. A friend has a birthday. Surprises happen to everyone.' },
        { kind: 'example', text: `Your earphones break and new ones cost ${m(15000)}. With savings, that’s a small problem. Without, it’s a big one.` },
      ],
    },
    {
      title: 'Bigger things', emoji: '🎧', blocks: [
        { kind: 'text', text: 'Some things cost more than you get in one go. Saving is how you get them, without borrowing.' },
        { kind: 'example', text: `Want something that costs ${m(60000)}? Save ${m(5000)} a week and you have it in 12 weeks.` },
      ],
    },
    {
      title: 'Choices and less stress', emoji: '😌', blocks: [
        { kind: 'text', text: 'Savings give you **choices**. You can say yes when friends plan a day out, or help someone who needs it.' },
        { kind: 'text', text: 'People with some savings worry less about money. Money for later gives you peace of mind now.' },
        { kind: 'verse', id: 'treasure-of-the-wise', note: 'Wise people keep something for later, instead of using it all up straight away.' },
      ],
    },
    {
      title: 'Waiting is a superpower', emoji: '⏳', blocks: [
        { kind: 'text', text: 'Choosing something better later over something small now is called **delayed gratification**. It’s hard for everyone, grown-ups too!' },
        { kind: 'text', text: 'The good news: it’s a skill. The more you practise, the easier it gets.' },
        { kind: 'list', items: ['Wait a day before you buy something.', 'Keep your savings out of sight.', 'Think about what you’re saving for.'] },
        { kind: 'reflect', prompt: 'What would you love to save for?' },
      ],
    },
  ],
  () => [
    {
      q: 'Which one is a need?',
      options: ['A new game', 'School shoes that fit', 'Sweets'],
      answer: 1,
      why: 'You need shoes for school. A game and sweets are nice, but they’re wants.',
    },
    {
      q: 'Why is it smart to have some savings?',
      options: ['So surprises are small problems, not big ones', 'So you never have to spend anything', 'Savings don’t really help'],
      answer: 0,
      why: 'Savings are there when something unexpected happens, or when you want something bigger.',
    },
    {
      q: 'What does “delayed gratification” mean?',
      options: ['Buying things straight away', 'Waiting for something better later, instead of something small now', 'Being late with your tasks'],
      answer: 1,
      why: 'It means waiting for the bigger reward. It’s a skill you can practise, like a sport.',
    },
  ],
);

const howSave = core(
  'how-save',
  (ctx) => {
    const { m, on } = ctx;
    const own = ctx.allowanceCents > 0;
    const a = own ? ctx.allowanceCents : 10000;
    const fifth = Math.round(a / 5);
    const inApp: string[] = [];
    if (on('savings')) inApp.push('In the app: open **Money** and tap **Move to savings**.');
    if (on('goals')) inApp.push('Make a **Goal** in Money and watch the bar fill up.');
    return [
      {
        title: 'Pay yourself first', emoji: '🥇', blocks: [
          { kind: 'text', text: 'Save **the moment money arrives**, not what’s left at the end. If you wait, there’s usually nothing left!' },
          {
            kind: 'example',
            text: `${own ? `You get ${m(a)} pocket money` : `Say you get ${m(a)}`}. Put ${m(fifth)} away straight away, then spend from the other ${m(a - fifth)}.`,
          },
          ...(on('savings') ? [{ kind: 'text', text: 'In the app: open **Money** and tap **Move to savings**.' } satisfies Block] : []),
        ],
      },
      {
        title: 'Pick a part to save', emoji: '🍰', blocks: [
          { kind: 'text', text: 'Pick a part of **every** amount to save. Lots of people use **20%**: one fifth.' },
          {
            kind: 'example',
            text: `20% of ${m(a)} is ${m(fifth)}. Every ${periodWord(ctx)} for a year, that’s ${m(fifth * perYear(ctx))}${bonusOn(ctx) ? ', plus the savings bonus' : ''}.`,
          },
        ],
      },
      {
        title: 'Spend, save, give', emoji: '👛', blocks: [
          { kind: 'text', text: 'Some people split their money into three jars: **Spend**, **Save** and **Give**. Try it:' },
          { kind: 'widget', widget: 'jars' },
        ],
      },
      {
        title: 'The 24-hour rule', emoji: '⏰', blocks: [
          { kind: 'text', text: 'Want to buy something you don’t need? Wait **24 hours**. Still want it tomorrow? Then it may be a good buy. Often the feeling is gone.' },
          { kind: 'text', text: '**Compare prices** too. The same thing can cost a lot less in another shop or online. Check two or three places.' },
        ],
      },
      {
        title: 'Write it down', emoji: '📝', blocks: [
          { kind: 'text', text: 'Write down what you’re saving for and how much you’ll save each week. A goal on paper is easier to keep.' },
          ...(inApp.length > 0 ? [{ kind: 'list', items: inApp } satisfies Block] : []),
          { kind: 'verse', id: 'little-by-little', note: 'Small amounts, saved again and again, add up.' },
        ],
      },
    ];
  },
  (ctx) => {
    const { m } = ctx;
    const own = ctx.allowanceCents > 0;
    const a = own ? ctx.allowanceCents : 10000;
    return [
      {
        q: 'What does “pay yourself first” mean?',
        options: ['Buy yourself a treat first', 'Save a part as soon as money arrives', 'Ask for your pocket money early'],
        answer: 1,
        why: 'Saving first means it really happens. What’s left is for spending.',
      },
      {
        q: `You get ${m(a)} and save 20%. How much do you save?`,
        options: [m(Math.round(a / 10)), m(Math.round(a / 5)), m(Math.round(a / 2))],
        answer: 1,
        why: `20% is one fifth: ${m(a)} ÷ 5 = ${m(Math.round(a / 5))}.`,
      },
      {
        q: 'What is the 24-hour rule?',
        options: ['Wait a day before buying something you want', 'Spend everything within 24 hours', 'Save for 24 hours, then spend it all'],
        answer: 0,
        why: 'Waiting a day helps you see if you really want it, or if it was just a feeling.',
      },
    ];
  },
);

const interest = core(
  'interest',
  (ctx) => {
    const { m } = ctx;
    const pm = pctMonthOf(ctx);
    const year = Math.round(familyYearPct(pm));
    const simple = simpleYears(10000, 10, 3);
    const comp = compoundYears(10000, 10, 3);
    const years = (list: number[]) => list.map((c, i) => `year ${i + 1}: ${m(c)}`).join(', ');
    const bank: Block = { kind: 'text', text: 'Real banks pay **a few percent a year**. Ask a parent what your bank pays.' };
    return [
      {
        title: 'What is interest?', emoji: '💡', blocks: [
          { kind: 'text', text: '**Interest** is a reward for letting your money stay somewhere. A bank uses your money while it’s there, and pays you a little extra for it.' },
          { kind: 'text', text: 'The more you keep there, and the longer you leave it, the more you get.' },
        ],
      },
      {
        title: 'Simple or compound', emoji: '📈', blocks: [
          { kind: 'text', text: '**Simple interest**: you only get interest on the money you put in.' },
          { kind: 'text', text: '**Compound interest**: you also get interest on the interest. Your growth grows!' },
          { kind: 'example', text: `Start with ${m(10000)} at 10% a year.` },
          { kind: 'list', items: [`**Simple**: ${years(simple)}.`, `**Compound**: ${years(comp)}.`] },
          { kind: 'text', text: `After 3 years compound is ${m(comp[2] - simple[2])} ahead. The longer you wait, the bigger the gap.` },
        ],
      },
      bonusOn(ctx)
        ? {
          title: 'Our savings bonus and real banks', emoji: '🐷', blocks: [
            { kind: 'text', text: `In our family your parents pay a **savings bonus** of ${pct(pm)} a month. Every week the app adds a little to your Savings.` },
            {
              kind: 'example',
              text: `The rule: every week you get savings × ${pct(pm)} × 12 ÷ 52. With ${m(10000)} saved that’s +${m(weeklyBonus(10000, pm))} this week. Because it compounds, it’s about ${year}% a year.`,
            },
            { kind: 'text', text: 'That’s much more than a real bank pays. It’s a gift from your parents to reward saving.' },
            bank,
          ],
        }
        : {
          title: 'Interest at a real bank', emoji: '🏦', blocks: [
            { kind: 'text', text: 'Our family doesn’t use a savings bonus right now. But the idea is the same at a real bank.' },
            bank,
          ],
        },
      {
        title: 'Try it', emoji: '🧮', blocks: [
          { kind: 'text', text: 'Change the numbers and see what happens.' },
          { kind: 'widget', widget: 'interest' },
        ],
      },
      {
        title: 'When interest works against you', emoji: '⚠️', blocks: [
          { kind: 'text', text: 'When you **borrow** money, you pay interest. Now it grows **against** you.' },
          {
            kind: 'example',
            text: `You owe ${m(100000)} on a credit card at 20% a year and pay nothing back. After one year you owe about ${m(roundWhole(owedAfter(100000, 20, 12)))}.`,
          },
          { kind: 'text', text: 'Credit cards and store accounts can cost **20% a year or more**. That’s why it’s smart to save first and buy later.' },
          { kind: 'text', text: 'Borrowing from a parent works the same way: a fee means you pay back **more** than you got, and every repayment means less pocket money later.' },
        ],
      },
      {
        title: 'Bonus fact: the rule of 72', emoji: '🎲', blocks: [
          { kind: 'text', text: 'How long until your money **doubles**? Divide 72 by the interest per year.' },
          { kind: 'example', text: 'At 6% a year: 72 ÷ 6 = about 12 years. At 9% a year: 72 ÷ 9 = about 8 years.' },
          ...(bonusOn(ctx) && year >= 1
            ? [{ kind: 'text', text: `With our family bonus (about ${year}% a year) it’s about ${Math.max(1, Math.round(72 / year))} years.` } satisfies Block]
            : []),
        ],
      },
    ];
  },
  ({ m }) => {
    const simple = simpleYears(10000, 10, 2);
    const comp = compoundYears(10000, 10, 2);
    return [
      {
        q: 'What is compound interest?',
        options: ['Interest only on the money you put in', 'Interest on your money and on the interest you already got', 'A fee the bank charges you'],
        answer: 1,
        why: 'Compound means your interest earns interest too. That’s why waiting longer helps so much.',
      },
      {
        q: `You have ${m(10000)} at 10% a year, compound. How much do you have after 2 years?`,
        options: [m(simple[0]), m(simple[1]), m(comp[1])],
        answer: 2,
        why: `Year 1: ${m(10000)} + 10% = ${m(comp[0])}. Year 2: ${m(comp[0])} + 10% = ${m(comp[1])}. The extra ${m(comp[1] - simple[1])} is interest on the interest.`,
      },
      {
        q: 'You borrow money with a credit card. What does interest do?',
        options: ['It makes what you owe grow', 'It makes what you owe smaller', 'Nothing, borrowing is free'],
        answer: 0,
        why: 'When you borrow, interest works against you: you pay back more than you got.',
      },
    ];
  },
);

const goals = core(
  'goals',
  ({ m, on }) => [
    {
      title: 'Pick a goal', emoji: '🎯', blocks: [
        { kind: 'text', text: 'Choose something you **really** want. Be specific: not “something cool”, but “wireless headphones”.' },
        { kind: 'text', text: 'A clear goal is much easier to save for.' },
      ],
    },
    {
      title: 'Find the price', emoji: '🏷️', blocks: [
        { kind: 'text', text: 'Look up the real price. Check two or three shops, and add a little extra in case the price goes up.' },
        { kind: 'verse', id: 'count-the-cost', note: 'Before you start something big, work out what it costs.' },
      ],
    },
    {
      title: 'Do the maths', emoji: '➗', blocks: [
        { kind: 'text', text: 'Price ÷ what you save each week = how many weeks.' },
        { kind: 'example', text: `Headphones cost ${m(60000)}. You save ${m(5000)} a week. ${m(60000)} ÷ ${m(5000)} = 12 weeks.` },
        { kind: 'widget', widget: 'goal' },
      ],
    },
    {
      title: 'Small steps', emoji: '👣', blocks: [
        { kind: 'text', text: 'Big goals are made of small steps.' },
        { kind: 'list', items: ['Save on the same day every week.', 'Celebrate when you’re halfway! 🎉', 'Earn a bit extra to get there faster.'] },
        ...(on('goals')
          ? [{ kind: 'text', text: 'In the app: **Goals** in Money shows how far you are, and about how many weeks to go.' } satisfies Block]
          : []),
      ],
    },
    {
      title: 'When you’re tempted', emoji: '🍭', blocks: [
        { kind: 'text', text: 'Everyone gets tempted. That’s normal!' },
        {
          kind: 'list', items: [
            'Look at a picture of your goal.',
            'Use the 24-hour rule.',
            'Ask yourself: do I want this more than my goal?',
            'Slipped up? No stress. Start again next week.',
          ],
        },
        { kind: 'reflect', prompt: 'What tempts you most? What could you do instead?' },
      ],
    },
  ],
  ({ m }) => [
    {
      q: `Something costs ${m(30000)}. You save ${m(3000)} a week. How many weeks until you have it?`,
      options: ['3 weeks', '10 weeks', '30 weeks'],
      answer: 1,
      why: `${m(30000)} ÷ ${m(3000)} = 10, so 10 weeks.`,
    },
    {
      q: 'You’re tempted to spend your goal money on sweets. What could help?',
      options: ['Just spend it, goals are boring', 'Think about your goal and wait 24 hours', 'Hide it from your parents'],
      answer: 1,
      why: 'Thinking about your goal and waiting a day helps the feeling pass.',
    },
    {
      q: 'Which goal is easiest to save for?',
      options: ['“Something cool, some day”', `“Headphones for ${m(60000)}, in 12 weeks”`, '“Lots of money”'],
      answer: 1,
      why: 'A clear goal with a price and a time is much easier to plan and to keep.',
    },
  ],
);

export const CORE_LESSONS_FULL: Lesson[] = [purpose, earn, whySave, howSave, interest, goals];

/** All lessons: the 6 core lessons, the lesson series (December: borrowing and insurance), then the faith reflections. */
export const LESSONS: Lesson[] = [...CORE_LESSONS_FULL, ...SERIES_LESSONS_FULL, ...FAITH_LESSONS];

/**
 * Lessons this reader can open: Money school on, tracked lessons (core + series) always, faith reflections only with
 * 'faith', and every `needs` on. A series that hasn't opened yet is still listed here; its date gate is ./series.ts.
 */
export function visibleLessons(ctx: Pick<LessonCtx, 'on'>): Lesson[] {
  if (!ctx.on('learn')) return [];
  return LESSONS.filter((l) => (isTracked(l.kind) || ctx.on('faith')) && (l.needs ?? []).every(ctx.on));
}

/** Build the lesson context for a reader. */
export function lessonCtx({ family, me, on }: { family: Family | null; me: Member | null; on: (key: FeatureKey) => boolean }): LessonCtx {
  const currency = family?.currency ?? 'EUR';
  const allowance = on('allowance') && me?.allowance_cents && me.allowance_cents > 0 ? me.allowance_cents : 0;
  return {
    m: (cents) => money(cents, currency, { whole: true }),
    currency,
    second: spendCurrencyOf(family),
    on,
    settings: family?.settings ?? {},
    isKid: me?.role === 'kid',
    name: me?.display_name ?? '',
    allowanceCents: allowance,
    allowancePeriod: allowance ? me?.allowance_period ?? 'week' : null,
  };
}
