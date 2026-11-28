// Money school theme "Borrowing and insurance" (lesson bank, ./bank.ts): six tracked lessons, quiz + XP like the core
// lessons. Warm, factual and never scary. Product names differ by country, so both are given. Amounts use the family's
// own currency (ctx.m); "in our family" bits only when Loans is switched on.
import { THEME_LESSON_BY_ID } from './bank';
import { exampleCents, loanTotals } from './math';
import type { Block, Lesson, LessonCtx, SeriesLessonId, Step } from './types';

function series(id: SeriesLessonId, steps: Lesson['steps'], quiz: NonNullable<Lesson['quiz']>): Lesson {
  const { emoji, title, summary, minutes } = THEME_LESSON_BY_ID[id];
  return { id, kind: 'series', emoji, title, summary, minutes, steps, quiz };
}

const when = (cond: boolean, step: Step): Step[] => (cond ? [step] : []);
/** "your" for kids, "the" for grown-ups reading along. */
const yourOrThe = (ctx: LessonCtx) => (ctx.isKid ? 'your' : 'the');

/**
 * Fixed real-world example amounts below are written in rand cents. `x` turns one into the family's currency (a tenth
 * outside South Africa, see math.ts exampleCents); sums and differences are worked out from the scaled amounts, so the
 * maths in a text always adds up. Pocket money (ctx.allowanceCents) is the family's own and never scaled.
 */
const scaler = (ctx: LessonCtx) => (randCents: number) => exampleCents(ctx.currency, randCents);

/** The example loan used in "Paying a loan back": R1 000 (100 in other currencies) at 20% a year. */
export const EXAMPLE_LOAN = { randCents: 100_000, pct: 20 };
/** The example loan's schedule. Takes the already scaled principal, so its results are never scaled twice. */
const exampleLoan = (principalCents: number, months: number) => loanTotals(principalCents, EXAMPLE_LOAN.pct, months);

const loansHow = series(
  'loans-how',
  (ctx) => {
    const { m, on } = ctx;
    const x = scaler(ctx);
    const borrow = x(100_000);
    const fee = x(10_000);
    return [
      {
        title: 'What is a loan?', emoji: '🤝', blocks: [
          { kind: 'text', text: 'A **loan** is money you get now and pay back later. The one who borrows is the **borrower**. The one who lends is the **lender**.' },
          {
            kind: 'list', items: [
              '**Capital**: the amount you borrow.',
              '**Interest** or a **fee**: what borrowing costs. It’s the lender’s price for waiting.',
              '**Term**: how long you take to pay it all back.',
              '**Instalment**: the part you pay back each time, often every month.',
            ],
          },
          { kind: 'example', text: `You borrow ${m(borrow)} for 10 months, with a fee of ${m(fee)}. You pay back ${m(borrow + fee)}: ${m(Math.round((borrow + fee) / 10))} a month.` },
        ],
      },
      {
        title: 'Who lends money?', emoji: '🏦', blocks: [
          { kind: 'text', text: 'Lots of companies lend money. Some names differ from country to country.' },
          {
            kind: 'list', items: [
              '**Banks**: personal loans and overdrafts.',
              '**Credit cards**: spend now, pay the bank later. If you don’t pay it all back each month, the interest is high.',
              '**Store cards** and **“buy now, pay later”**: pay for clothes or gadgets in parts. Easy to say yes to, and late fees add up fast.',
              '**Car finance**: a loan to buy a car.',
              '**Home loan**: a big loan for a house, over 20 years or more. Also called a **bond** or a **mortgage**.',
              '**Student loan**: to pay for studying after school.',
            ],
          },
        ],
      },
      {
        title: 'Good debt and bad debt', emoji: '⚖️', blocks: [
          { kind: 'text', text: 'Not all borrowing is the same.' },
          {
            kind: 'list', items: [
              '**Good debt** pays for something that lasts or helps you earn: a home, studies, a tool for your work.',
              '**Bad debt** pays for things that are gone quickly: takeaways, a party, the newest sneakers.',
            ],
          },
          { kind: 'text', text: 'A simple rule: **never borrow for wants you could save for.** Saving first is cheaper, and the thing is really yours.' },
          { kind: 'verse', id: 'borrower', note: 'Whoever you owe has a hold on you. That’s why it’s wise to borrow little, and only for good reasons.' },
        ],
      },
      {
        title: 'Your credit record', emoji: '⭐', blocks: [
          { kind: 'text', text: 'Lenders keep track of how people pay back. That’s your **credit record**. In some countries it becomes a number: your **credit score**.' },
          {
            kind: 'list', items: [
              'Paying **on time**, every time, builds trust. Next time borrowing is easier and cheaper.',
              'Paying **late** stays on your record. Future loans get harder to get, and dearer.',
            ],
          },
          { kind: 'text', text: 'It’s like trust in a family: keep your word and people trust you with more. Break it, and it takes time to win back.' },
          { kind: 'verse', id: 'righteous-repay', note: 'Paying back what you owe is part of being honest. Being generous is even better.' },
        ],
      },
      {
        title: 'Borrowing from friends', emoji: '👫', blocks: [
          { kind: 'text', text: 'Friends borrow from each other all the time: a pen, a book, some money for a snack.' },
          { kind: 'text', text: 'Money can hurt a friendship when it isn’t paid back. Agree on **how much** and **when**, and pay back when you said you would. If you can’t, say so early.' },
          { kind: 'verse', id: 'owe-no-one', note: 'Paul isn’t saying every loan is wrong. Keep your promises and pay what you owe. Then the only debt left is love, and that one you never finish paying.' },
          { kind: 'reflect', prompt: 'Has someone ever not paid you back? How did it feel? What would you have wanted them to do?' },
        ],
      },
      ...when(on('loans'), {
        title: 'Borrowing in our family', emoji: '🏡', blocks: [
          {
            kind: 'text',
            text: ctx.isKid
              ? 'In our family you can borrow from a parent too: in **Money**, tap **🤝 Ask for a loan**. The next lesson shows how paying it back works.'
              : 'In our family a kid can borrow from a parent too: in **Money**, they tap **🤝 Ask for a loan**. The next lesson shows how paying it back works.',
          },
        ],
      }),
    ];
  },
  () => [
    {
      q: 'What is the “capital” of a loan?',
      options: ['The city where the bank is', 'The amount you borrow', 'The fee for borrowing'],
      answer: 1,
      why: 'The capital is the amount you borrow. Interest or a fee comes on top.',
    },
    {
      q: 'Which of these is usually “good debt”?',
      options: ['A loan for a party', 'A student loan to train for a job', '“Buy now, pay later” for new sneakers'],
      answer: 1,
      why: 'Studying helps you earn more for years. A party and sneakers are gone or worn out long before the loan is paid.',
    },
    {
      q: 'You always pay your loans back on time. What happens to your credit record?',
      options: ['It gets better: lenders trust you more', 'Nothing, nobody keeps track', 'It gets worse, because you borrowed'],
      answer: 0,
      why: 'Paying on time builds trust. Next time borrowing is easier, and often cheaper.',
    },
  ],
);

const loansRepay = series(
  'loans-repay',
  (ctx) => {
    const { m, on } = ctx;
    const principal = scaler(ctx)(EXAMPLE_LOAN.randCents);
    const year = exampleLoan(principal, 12);
    const long = exampleLoan(principal, 36);
    const first = year.schedule[0];
    const last = year.schedule[year.months - 1];
    const your = yourOrThe(ctx);
    const per = ctx.allowancePeriod === 'month' ? 'month' : 'week';
    const sayYouGet = scaler(ctx)(20_000);
    const budget: Block = ctx.allowanceCents > 0
      ? {
        kind: 'example',
        text: `${ctx.isKid ? 'You get' : 'The pocket money is'} ${m(ctx.allowanceCents)} a ${per}. A quarter of it is ${m(Math.round(ctx.allowanceCents / 4))}. Keep loan payments below that, so there’s still money for everything else.`,
      }
      : { kind: 'example', text: `Say you get ${m(sayYouGet)} a month. A quarter of it is ${m(Math.round(sayYouGet / 4))}. Keep loan payments below that, so there’s still money for everything else.` };
    return [
      {
        title: 'What each payment pays for', emoji: '🧾', blocks: [
          { kind: 'text', text: 'Most loans are paid back in equal monthly **instalments**. Each one pays two things: the **interest** for that month, and a part of the **capital**.' },
          {
            kind: 'example',
            text: `You borrow ${m(principal)} at ${EXAMPLE_LOAN.pct}% a year over 12 months: ${m(year.installment)} a month. In month 1, ${m(first.interest)} of it is interest and ${m(first.capital)} pays back the capital. In month 12, only ${m(last.interest)} is interest.`,
          },
          { kind: 'text', text: 'At the start you owe the most, so you pay the most interest. As the capital shrinks, so does the interest.' },
        ],
      },
      {
        title: 'Longer term, higher cost', emoji: '📏', blocks: [
          { kind: 'text', text: 'A longer term makes each instalment smaller. That feels easier, but you pay interest for longer.' },
          {
            kind: 'list', items: [
              `**12 months**: ${m(year.installment)} a month, ${m(year.total)} in total (${m(year.interest)} interest).`,
              `**36 months**: ${m(long.installment)} a month, ${m(long.total)} in total (${m(long.interest)} interest).`,
            ],
          },
          { kind: 'example', text: `Same ${m(principal)}, same ${EXAMPLE_LOAN.pct}% a year: the long loan costs ${m(long.interest - year.interest)} more.` },
          { kind: 'text', text: 'A small instalment doesn’t mean a cheap loan. Always look at the **total** you’ll pay.' },
        ],
      },
      {
        title: 'Try it', emoji: '🧮', blocks: [
          { kind: 'text', text: 'Change the amount, the interest and the months. Watch what happens to the total.' },
          { kind: 'widget', widget: 'loan' },
        ],
      },
      {
        title: 'Pay on time, or early', emoji: '⏰', blocks: [
          { kind: 'text', text: 'Paying **early** saves interest: you owe less, for less time. Some lenders charge an **early-settlement fee**, so ask first.' },
          { kind: 'text', text: 'Missing payments is expensive:' },
          {
            kind: 'list', items: [
              '**Late fees**, and more interest.',
              'A damaged **credit record**, so future loans are harder to get and dearer.',
              'For a car or a house, the lender can **take it back** (repossess it) and sell it.',
            ],
          },
          { kind: 'verse', id: 'do-not-withhold', note: 'When you can pay what you owe today, don’t make the other person wait.' },
        ],
      },
      {
        title: 'Before you say yes', emoji: '✍️', blocks: [
          { kind: 'text', text: 'Before you sign, check that the instalment fits your budget **every month**: also in a month with birthdays or a broken bike.' },
          budget,
          { kind: 'verse', id: 'yes-be-yes', note: 'Signing for a loan is saying “yes”. Mean it, and keep it.' },
          { kind: 'reflect', prompt: 'Think of something you’d like to buy. Would you rather save for it, or borrow and pay more? Why?' },
        ],
      },
      ...when(on('loans'), {
        title: 'Loans in our family', emoji: '🤝', blocks: [
          { kind: 'text', text: ctx.isKid ? 'In our family you can borrow from a parent:' : 'In our family a kid can borrow from a parent:' },
          {
            kind: 'list', items: [
              'In **Money**, tap **🤝 Ask for a loan**: say how much and what it’s for, and choose a plan.',
              'A parent says yes or no, and may add a **small fee**, like interest at a bank.',
              `The instalment comes off ${your} pocket money on **pocket money day**: never more than what’s in ${your} Wallet.`,
              '**Pay back now** finishes it early.',
              'Parents can also **forgive** a loan. That’s grace: a gift, not something you earned. 💛',
            ],
          },
        ],
      }),
    ];
  },
  (ctx) => {
    const { m } = ctx;
    const principal = scaler(ctx)(EXAMPLE_LOAN.randCents);
    const year = exampleLoan(principal, 12);
    const long = exampleLoan(principal, 36);
    return [
      {
        q: `A loan of ${m(principal)} at ${EXAMPLE_LOAN.pct}% a year. Which costs more in total?`,
        options: [`12 months of ${m(year.installment)}`, `36 months of ${m(long.installment)}`, 'They cost the same'],
        answer: 1,
        why: `36 months comes to about ${m(long.total)}, 12 months to about ${m(year.total)}. A longer term means paying interest for longer.`,
      },
      {
        q: 'When do you pay the most interest on a loan?',
        options: ['At the start', 'At the end', 'The same every month'],
        answer: 0,
        why: 'At the start you still owe the most, so the interest is highest. Every payment makes the capital smaller.',
      },
      {
        q: 'Someone stops paying their car loan. What can happen?',
        options: ['Nothing, the bank forgets about it', 'Late fees, a damaged credit record, and the lender can take the car back', 'The car becomes free'],
        answer: 1,
        why: 'Missed payments cost extra and hurt your credit record. The car was the lender’s security, so they can repossess it.',
      },
    ];
  },
);

const insuranceWhat = series(
  'insurance-what',
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const phone = x(500_000);
    const premium = x(15_000);
    const laptop = x(800_000);
    const excess = x(100_000);
    return [
      {
        title: 'One bad day', emoji: '☂️', blocks: [
          { kind: 'text', text: 'Some things don’t happen often, but when they do, they cost a lot: a fire, a car crash, a stolen bike, a long stay in hospital.' },
          { kind: 'text', text: 'Some losses are **too big to save for**. That’s what **insurance** is for.' },
          { kind: 'verse', id: 'prudent-sees-danger', note: 'Wise people look ahead and get ready. Insurance is one way to do that.' },
        ],
      },
      {
        title: 'Sharing the risk', emoji: '🧺', blocks: [
          { kind: 'text', text: 'Insurance works by **pooling**: many people each pay a small amount into one pot. The few who have bad luck are paid from it.' },
          {
            kind: 'example',
            text: `100 families each have a phone worth ${m(phone)}. Every year about 2 phones break. Each family pays ${m(premium)} a year into the pot: 100 × ${m(premium)} = ${m(100 * premium)}. Two new phones cost ${m(2 * phone)}. The rest pays the insurance company’s costs.`,
          },
          { kind: 'text', text: 'Nobody knows **whose** phone will break. Everyone pays a little, so nobody has to pay a lot alone.' },
          { kind: 'verse', id: 'bear-burdens', note: 'Insurance is a bit like carrying each other’s burdens, with money.' },
        ],
      },
      {
        title: 'Insurance words', emoji: '📖', blocks: [
          {
            kind: 'list', items: [
              '**Policy**: the contract with the insurer. It says what is covered.',
              '**Premium**: what you pay for the cover, every month or every year.',
              '**Cover** or **sum insured**: the most the insurer will pay.',
              '**Claim**: asking the insurer to pay after something happened.',
              '**Excess** (in some countries called a **deductible**): the part of a claim you pay yourself. It can be a fixed amount, a percentage, or more than one.',
              '**Exclusions**: what is **not** covered. They’re in the **small print**, so read it.',
            ],
          },
          { kind: 'example', text: `Your laptop worth ${m(laptop)} is stolen. The excess is ${m(excess)}. You pay ${m(excess)} yourself and the insurer pays ${m(laptop - excess)}.` },
        ],
      },
      {
        title: 'Insure or save?', emoji: '⚖️', blocks: [
          { kind: 'text', text: 'Insurance turns a **big unknown cost** into a **small known cost**. You pay a little every month, so one bad day doesn’t sink you.' },
          {
            kind: 'list', items: [
              '**Big and rare** (a house fire, a car crash, a hospital stay): insure it.',
              '**Small and common** (a lost cap, a broken charger): pay from your savings. Grown-ups keep an **emergency fund** for this.',
            ],
          },
          { kind: 'text', text: 'If you could easily replace something yourself, you can **self-insure**: save the premium instead.' },
        ],
      },
      {
        title: 'Smart and honest', emoji: '🧾', blocks: [
          {
            kind: 'list', items: [
              'Compare **quotes** from a few insurers. Look at the cover and the excess, not just the price.',
              'Keep **receipts**, photos and serial numbers of valuable things. Like the photo proof in our app, it shows what you had.',
              'Claim **honestly**. Making a claim bigger than the real loss is **fraud**: it steals from everyone in the pool.',
            ],
          },
          { kind: 'reflect', prompt: 'What do you own that would be hard to replace? Would you insure it, or save for it?' },
        ],
      },
    ];
  },
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const claim = x(400_000);
    const excess = x(50_000);
    return [
      {
        q: 'What is a premium?',
        options: ['What you pay for insurance cover', 'What the insurer pays after a claim', 'A prize for never claiming'],
        answer: 0,
        why: 'The premium is the price of the cover. You pay it every month or year, even when nothing happens.',
      },
      {
        q: `You claim ${m(claim)} for a stolen bike. The excess is ${m(excess)}. What does the insurer pay?`,
        options: [m(claim), m(claim - excess), m(excess)],
        answer: 1,
        why: `You pay the excess yourself: ${m(claim)} − ${m(excess)} = ${m(claim - excess)}.`,
      },
      {
        q: 'How can insurance pay out much more than one person paid in?',
        options: ['Insurers print their own money', 'Many people pay in, and only a few need to claim', 'The government pays every claim'],
        answer: 1,
        why: 'That’s pooling: lots of small premiums pay for the few bad days.',
      },
    ];
  },
);

const insurancePeople = series(
  'insurance-people',
  ({ m, currency }) => [
    {
      title: 'Planning is caring', emoji: '❤️', blocks: [
        { kind: 'text', text: 'Some insurance isn’t for things. It’s for **people**: when someone gets ill, can’t work, or dies.' },
        { kind: 'text', text: 'Nobody likes to think about it, but planning is a way of caring. Grown-ups plan so the family is OK, whatever happens.' },
        { kind: 'verse', id: 'store-for-famine', note: 'Joseph stored food in the good years, so Egypt was ready for the hard ones. Planning ahead is wise, not fearful.' },
      ],
    },
    {
      title: 'Life insurance', emoji: '🕊️', blocks: [
        { kind: 'text', text: '**Life insurance** pays money to the **beneficiaries** (the people named in the policy, often the family) if the insured person dies. Then the family can keep paying for the home and school.' },
        {
          kind: 'list', items: [
            'It’s **cheaper** when you’re young and healthy.',
            'Tell the **truth** on the application, for example about smoking or an illness. If you don’t, a claim can be refused.',
            '**Funeral cover** is smaller and pays out quickly, for the costs of a funeral.',
          ],
        },
      ],
    },
    {
      title: 'Health', emoji: '🏥', blocks: [
        { kind: 'text', text: 'Doctors and hospitals can cost a lot. Grown-ups pay a monthly amount so that big bills are covered.' },
        {
          kind: 'list', items: [
            'In South Africa this is often **medical aid**. **Gap cover** can pay the part medical aid doesn’t.',
            'In other countries it’s called **health insurance**. In some, like the Netherlands, basic health insurance is required by law.',
          ],
        },
      ],
    },
    {
      title: 'When you can’t work', emoji: '💼', blocks: [
        { kind: 'text', text: 'What if a grown-up is too ill or hurt to work for a long time? The pay stops, but the bills don’t.' },
        { kind: 'text', text: '**Disability cover** or **income protection** pays part of your income while you can’t work.' },
        { kind: 'example', text: `A carpenter earns ${m(exampleCents(currency, 2_000_000))} a month. After a bad fall she can’t work for six months. Income protection pays a big part of her pay each month, so the family can still buy food and pay the rent.` },
        { kind: 'verse', id: 'two-are-better', note: 'When one falls, the other helps them up. Insurance is one way of making sure someone is there.' },
      ],
    },
    {
      title: 'Start early', emoji: '🌱', blocks: [
        { kind: 'text', text: 'You don’t need this insurance yet. When you start working, it’s worth a look: young and healthy means cheaper.' },
        { kind: 'reflect', prompt: 'Ask a parent: what insurance does our family have, and why did they choose it?' },
      ],
    },
  ],
  () => [
    {
      q: 'Who gets the money from a life insurance policy?',
      options: ['The insured person', 'The beneficiaries, for example the family', 'The doctor'],
      answer: 1,
      why: 'Life insurance pays the beneficiaries named in the policy, so the family can keep going.',
    },
    {
      q: 'Why must you tell the truth on an insurance application?',
      options: ['Otherwise a claim can be refused', 'It doesn’t matter, nobody checks', 'So the premium is lower'],
      answer: 0,
      why: 'The premium is based on what you say. If you hide something like smoking or an illness, the insurer can refuse to pay.',
    },
    {
      q: 'A grown-up can’t work for months after an accident. What kind of insurance helps?',
      options: ['Car insurance', 'Income protection or disability cover', 'Phone insurance'],
      answer: 1,
      why: 'Income protection pays part of your income while you can’t work.',
    },
  ],
);

const insuranceHomeCar = series(
  'insurance-home-car',
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const worth = x(10_000_000);
    const insured = x(5_000_000);
    const stolen = x(2_000_000);
    return [
      {
        title: 'Buildings and contents', emoji: '🏠', blocks: [
          {
            kind: 'list', items: [
              '**Buildings insurance** covers the house itself: the walls, the roof, and things fixed to it, like a built-in water heater (a **geyser** or **boiler**).',
              '**Household contents** insurance covers your movable things inside: furniture, clothes, the TV, a laptop.',
            ],
          },
          { kind: 'text', text: 'A handy test: if you could turn the house upside down, everything that falls out is contents.' },
          { kind: 'text', text: 'When you buy a home with a **home loan** (a bond or mortgage), the bank usually requires buildings insurance. People who **rent** only need contents: the building belongs to the landlord.' },
        ],
      },
      {
        title: 'Insure for the real value', emoji: '📉', blocks: [
          { kind: 'text', text: 'If you insure for **less** than the real value, you’re **under-insured**. Then the insurer may pay only **part** of a claim. This is called **average**.' },
          { kind: 'example', text: `Your things are really worth ${m(worth)}, but you insured them for ${m(insured)}: only half. A burglar takes ${m(stolen)} of stuff. The insurer pays only half: ${m(Math.round((stolen * insured) / worth))}.` },
          { kind: 'text', text: 'Check the values every year: prices go up, and you buy new things.' },
          { kind: 'verse', id: 'count-the-cost', note: 'Work out the real cost first. That goes for insurance too.' },
        ],
      },
      {
        title: 'Car insurance', emoji: '🚗', blocks: [
          { kind: 'text', text: 'The **third party** is the other person: you and the insurer are the first two.' },
          {
            kind: 'list', items: [
              '**Comprehensive**: your own car, damage you do to others, and theft, fire and hail.',
              '**Third party, fire and theft**: damage you do to others, and your own car only if it’s stolen or burnt.',
              '**Third party only**: only damage you cause to others. Never your own car.',
            ],
          },
          { kind: 'text', text: 'In many countries, at least third-party cover is **required by law**.' },
        ],
      },
      {
        title: 'What changes the price', emoji: '🏷️', blocks: [
          {
            kind: 'list', items: [
              '**Young drivers** pay more: they have more accidents.',
              'A **no-claim bonus**: every year without a claim, the premium goes down.',
              'A **higher excess** means a **lower premium**. Only choose it if you have that money saved.',
              'Where the car is parked at night, and how much you drive, count too.',
            ],
          },
        ],
      },
      {
        title: 'Look after it', emoji: '🛡️', blocks: [
          { kind: 'text', text: 'Insurance is no excuse to be careless. Lock the doors, park safely, and fix small problems before they get big.' },
          { kind: 'text', text: 'Fewer claims means lower premiums: for you, and for everyone in the pool.' },
          { kind: 'reflect', prompt: 'What could go wrong in your home? What could your family do to prevent it?' },
        ],
      },
    ];
  },
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const worth = x(8_000_000);
    const insured = x(4_000_000);
    const stolen = x(1_000_000);
    const pays = Math.round((stolen * insured) / worth);
    return [
      {
        q: 'A storm damages the roof. Which insurance pays?',
        options: ['Buildings insurance', 'Household contents insurance', 'Car insurance'],
        answer: 0,
        why: 'The roof is part of the building. Contents insurance is for your movable things inside.',
      },
      {
        q: 'You have “third party only” car insurance and crash into a wall. Who pays to fix your own car?',
        options: ['The insurer', 'You do', 'The owner of the wall'],
        answer: 1,
        why: 'Third party only pays for damage you do to others, never for your own car.',
      },
      {
        q: `Your things are worth ${m(worth)}, but insured for only ${m(insured)}. ${m(stolen)} is stolen. What might the insurer pay?`,
        options: [m(stolen), m(pays), m(insured)],
        answer: 1,
        why: `You insured only half the real value, so the insurer may pay only half: ${m(pays)}. Insure for the real value.`,
      },
    ];
  },
);

const insuranceStuff = series(
  'insurance-stuff',
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const phone = x(600_000);
    const monthly = x(9_000);
    const excess = x(100_000);
    return [
      {
        title: 'Phone and gadget insurance', emoji: '📱', blocks: [
          { kind: 'text', text: '**Phone** or **gadget insurance** usually covers **theft** and **accidental damage**, like a cracked screen. Some policies cover **loss** too.' },
          { kind: 'text', text: 'Before you buy it, check:' },
          {
            kind: 'list', items: [
              'The **excess**: how much you pay yourself for each claim.',
              'A **waiting period**: some cover only starts after a few weeks.',
              'What **proof** you need: a receipt, a police report after a theft, the phone’s serial number (IMEI).',
            ],
          },
        ],
      },
      {
        title: 'Is it worth it?', emoji: '🧮', blocks: [
          { kind: 'example', text: `A phone costs ${m(phone)}. Insurance is ${m(monthly)} a month: ${m(12 * monthly)} a year. Over two years you pay ${m(24 * monthly)} in premiums: more than a third of the phone’s price. And if it breaks, you still pay the excess of ${m(excess)}.` },
          { kind: 'text', text: 'Compare the **yearly premium** with what the phone is worth. Sometimes it’s worth it. Sometimes a good case, a screen protector and some savings are enough.' },
          { kind: 'text', text: 'And a repair that costs less than the excess? The insurer pays nothing.' },
        ],
      },
      {
        title: 'All-risk isn’t every risk', emoji: '💍', blocks: [
          { kind: 'text', text: '**All-risk** cover sounds like it covers everything. It doesn’t.' },
          {
            kind: 'list', items: [
              'It covers **listed portable things**, like a laptop, camera, jewellery, bicycle or phone, also **away from home**.',
              'It still has **exclusions**, for example normal wear and tear.',
              'Normal **contents** cover mostly works **inside the home**.',
            ],
          },
        ],
      },
      {
        title: 'Boats and jet skis', emoji: '🚤', blocks: [
          { kind: 'text', text: '**Pleasure craft** insurance is for boats and jet skis used for fun. It can cover:' },
          {
            kind: 'list', items: [
              'The **hull** (the boat itself), the **motor**, the **trailer** and the equipment: against damage and theft.',
              '**Third-party liability**: if your boat injures someone, or damages another boat or a jetty.',
            ],
          },
          { kind: 'text', text: 'Marinas and clubs often ask for liability cover. It’s separate from car insurance, though a small craft can sometimes be added to a household policy.' },
        ],
      },
      {
        title: 'Choosing wisely', emoji: '✅', blocks: [
          {
            kind: 'list', items: [
              '1. What would it cost to replace? Could I save for it instead?',
              '2. What exactly is covered, and what is excluded?',
              '3. How big is the excess?',
              '4. Compare at least two quotes.',
              '5. Keep receipts and photos, and claim honestly.',
            ],
          },
          { kind: 'verse', id: 'faithful-in-little', note: 'Looking after small things well is practice for bigger things.' },
          { kind: 'reflect', prompt: 'If you got a new phone, would you insure it? Work it out: the premium, the excess and the price.' },
        ],
      },
    ];
  },
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const repair = x(80_000);
    const excess = x(100_000);
    return [
      {
        q: `A screen repair costs ${m(repair)}. Your excess is ${m(excess)}. What does the insurer pay?`,
        options: ['Nothing', m(repair), m(excess - repair)],
        answer: 0,
        why: 'The repair costs less than the excess, so you pay it all yourself. Check the excess before you buy cover.',
      },
      {
        q: 'What does “all-risk” cover?',
        options: ['Absolutely everything that can go wrong', 'Listed portable things, also away from home, with some exclusions', 'Only things that never leave the house'],
        answer: 1,
        why: 'All-risk sounds like everything, but it covers listed portable things, and it still has exclusions.',
      },
      {
        q: 'A jet ski hits someone else’s boat at the jetty. Which cover pays for the damaged boat?',
        options: ['Third-party liability', 'Phone insurance', 'Funeral cover'],
        answer: 0,
        why: 'Third-party liability pays for damage you do to others, like another boat or a jetty.',
      },
    ];
  },
);

/** The Borrowing and insurance lessons, in theme order (./bank.ts: borrow-protect). */
export const SERIES_LESSONS_FULL: Lesson[] = [loansHow, loansRepay, insuranceWhat, insurancePeople, insuranceHomeCar, insuranceStuff];
