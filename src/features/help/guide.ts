// Help page content: one short card per switched-on part of the app, plus small text helpers for Ask Pocket.
import { familySpotRules, type FamilySettings, type FeatureKey } from '../../lib/types';

export interface GuideCard {
  key: FeatureKey | 'tasks';
  emoji: string;
  title: string;
  /** What it is. */
  what: string;
  /** Why it matters. */
  why: string;
  /** A tiny example with real numbers. */
  example: string;
}

/**
 * Cards for the parts of the app that are switched on (tasks are always on).
 * `m` formats cents in the family currency for prose (e.g. "€2", "€0.50").
 */
export function featureGuide(
  on: (key: FeatureKey) => boolean, m: (cents: number) => string, settings: Partial<FamilySettings>,
  /** The reader's own pocket money, e.g. "R 50.00 every Monday" (allowanceText). */
  mine?: { allowance?: string | null },
): GuideCard[] {
  const pts = on('points');
  const time = on('time');
  const rate = settings.interest_pct_month && settings.interest_pct_month > 0 ? settings.interest_pct_month : 2;
  const saverBonus = settings.saver_bonus_points ?? 0;
  const noSavings = settings.no_savings_penalty_points ?? 0;

  const cards: (GuideCard | false)[] = [
    {
      key: 'tasks', emoji: '✅', title: 'Tasks',
      what: 'Jobs at home, each with a time it’s due.',
      why: 'Doing what you said you’d do pays off. Leaving it costs a little.',
      example: `Dishes done by 19:00: +${m(200)}${pts ? ' and +10 points' : ''}. Not done in time: −${m(50)}.`,
    },
    on('allowance') && {
      key: 'allowance', emoji: '💰', title: 'Pocket money',
      what: 'A set amount lands in your Wallet all by itself: every week on a set day, or every month on a set date.'
        + (mine?.allowance ? ` Yours: ${mine.allowance}.` : ''),
      why: 'A fixed amount teaches you to plan ahead.',
      example: on('savings')
        ? `${m(500)} every Monday: spend ${m(300)}, save ${m(200)}. Or ${m(2000)} on the 1st of every month.`
        : `${m(500)} every Monday, or ${m(2000)} on the 1st of every month: spend some now, keep some for later.`,
    },
    on('requests') && {
      key: 'requests', emoji: '🙋', title: 'Asking to spend',
      what: 'Want to buy something? Ask in Money.',
      why: 'A parent says OK and pays you in real life. The app keeps the score.',
      example: `“A game for ${m(800)}?” OK! Then −${m(800)} from your Wallet.${time ? ' Or ask to use 30 min of game time.' : ''}`,
    },
    on('savings') && {
      key: 'savings', emoji: '🐷', title: 'Savings',
      what: 'A second pot for money you keep for later.',
      why: 'Money you don’t spend now is there when you really want something.',
      example: `Move ${m(300)} to Savings. Taking it out needs a parent’s OK.`,
    },
    on('interest') && {
      key: 'interest', emoji: '🌱', title: 'Savings grow',
      what: `Every week your savings get a little extra: interest${settings.interest_pct_month ? ` (${rate}% a month)` : ''}.`,
      why: 'Waiting pays off. The longer you save, the more you get.',
      example: `${m(2000)} saved at ${rate}% a month: about +${m(Math.round(2000 * rate / 100))} a month, for doing nothing.`,
    },
    on('saver_rules') && {
      key: 'saver_rules', emoji: '🏅', title: 'Saver bonus',
      what: 'A bonus when your savings grew this week.',
      why: 'Small steps add up. Even a little counts.',
      example: `Saved ${m(100)} this week: +${saverBonus || 5} points.` +
        (noSavings > 0 ? ` Earned money but saved nothing and spent it all: −${noSavings} points.` : ''),
    },
    on('goals') && {
      key: 'goals', emoji: '🎯', title: 'Savings goals',
      what: 'Pick something to save for and watch the bar fill up.',
      why: 'Seeing the finish line helps you keep going.',
      example: `Headphones: ${m(1200)} of ${m(4000)}, about 7 weeks to go.`,
    },
    on('targets') && {
      key: 'targets', emoji: '🏆', title: 'Targets and prizes',
      what: 'A weekly or monthly aim, with a prize when you make it.',
      why: 'Extra effort gets an extra reward.',
      example: `Do 80% of your tasks this week: +${m(200)} prize.`,
    },
    on('bank') && {
      key: 'bank', emoji: '🏦', title: 'Real bank balance',
      what: 'Type in what your real bank account (e.g. Revolut) says, so you see it next to the app.',
      why: 'The app and the bank are two different things. Seeing both helps you keep track.',
      example: `Revolut says ${m(12345)}: Money → Update balance → ${m(12345)}. It doesn’t change your money in Sow & Grow.`,
    },
    on('challenges') && {
      key: 'challenges', emoji: '🤝', title: 'Challenges',
      what: 'Anyone can challenge anyone. Kids can challenge parents too!',
      why: 'We’re a team. It works both ways.',
      example: '“Dad, no phone at dinner all week.” Reward: “I’ll make you breakfast.” Or do one together.',
    },
    on('spotted') && {
      key: 'spotted', emoji: '📸', title: 'Spotted',
      what: 'A grown-up notices something and records it on the spot: a reward or a consequence, with what happened. The amount is a fixed family rule.',
      why: 'Good moments get noticed, not only chores. There’s always a reason you can read, and the same rule for everyone.',
      example: (() => {
        const r = familySpotRules(settings);
        return `Helped carry the shopping: +${m(r.reward.cents)}. Bike left in the rain: −${m(r.consequence.cents)}.`;
      })(),
    },
    time && {
      key: 'time', emoji: '⏱️', title: 'Time',
      what: 'Minutes for Wi-Fi, games or fun, kept in your time bank.',
      why: 'Screen time is earned, just like money.',
      example: 'Homework done: +30 min game time. Ask to use it when you want.',
    },
    pts && {
      key: 'points', emoji: '✨', title: 'Points and levels',
      what: 'Points (XP) level up your character.',
      why: 'They show all the effort you’ve put in.',
      example: 'Dishes: +10 points. At 50 points you reach level 2.',
    },
    on('calendar') && {
      key: 'calendar', emoji: '📅', title: 'Calendar',
      what: 'Family dates, reminders and birthdays, for everyone or just some of you.',
      why: 'Nobody forgets the important stuff, in any home.',
      example: 'Football on Saturday at 10:00, for you and Dad.',
    },
    on('emergency') && {
      key: 'emergency', emoji: '🆘', title: 'Emergency card',
      what: 'Allergies, medicine, doctor and important phone numbers.',
      why: 'If something happens, the family knows what to do.',
      example: 'Fill in yours in Me → My emergency card.',
    },
    on('devices') && {
      key: 'devices', emoji: '📱', title: 'Devices',
      what: 'A list of the family’s phones, consoles and computers.',
      why: 'Parents keep track of what’s in the house.',
      example: 'Xbox, living room, owner: Sam.',
    },
    on('learn') && {
      key: 'learn', emoji: '🎓', title: 'Money school',
      what: 'Short lessons about money: why and how to save, interest, earning more and saving for a goal.',
      why: 'Knowing how money works helps you make good choices, now and later.',
      example: `“How interest works”: ${m(10000)} at 10% a year is ${m(11000)} after one year, and ${m(12100)} after two.`,
    },
    on('faith') && {
      key: 'faith', emoji: '🕊️', title: 'Faith, hope and love',
      what: 'A Bible verse every day, and short reflections about faith, money and family. Each person can hide the verses in Me.',
      why: 'Faith is part of our family. Nothing here is scored or tested.',
      example: 'The verse of the day is on Home. Tap “Read in the Bible App” to read more.',
    },
    on('ask') && {
      key: 'ask', emoji: '💬', title: 'Ask Pocket',
      what: 'A helper that answers questions about the app.',
      why: 'Help any time. Parents can read the questions.',
      example: '“How does saving work?”',
    },
  ];
  return cards.filter((c): c is GuideCard => !!c);
}

/** Questions a kid can tap to get started. */
export const STARTERS = [
  'Why do I need a photo?', 'How does saving work?', 'Why should I save?', 'How does interest work?',
  'What happens if I miss a task?', 'Hoe werkt sparen?',
];

/** Make an AI answer readable as plain text (drop markdown bold, headings and bullets). */
export function plainAnswer(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}
