// Faith reflections for Money school (feature 'faith'): kind 'faith', no quiz, nothing tracked or scored.
// Faith is invited, never tested. Stewardship and gratitude, not prosperity: God gives what we need, giving is free
// and glad (never a deal to get more back), and family verses always go both ways. Other churches and faiths are
// described accurately and kindly ("Christians believe… / Muslims believe…"), numbers are approximate.
// Verse ids: ./verses.ts. Every step must still make sense when the reader hides verses.
import type { Lesson, LessonCtx } from '../help/learn/types';

/** The reader's pocket money (or a small round example) and "a week" / "a month" / "". */
function pocket(ctx: LessonCtx, fallbackCents = 2000): { cents: number; per: string } {
  if (ctx.allowanceCents > 0) {
    const per = ctx.allowancePeriod === 'month' ? ' a month' : ctx.allowancePeriod === 'week' ? ' a week' : '';
    return { cents: ctx.allowanceCents, per };
  }
  return { cents: fallbackCents, per: '' };
}

export const FAITH_LESSONS: Lesson[] = [
  {
    id: 'faith-stewardship',
    kind: 'faith',
    emoji: '🤲',
    title: 'Faith and money',
    summary: 'It all belongs to God, and we get to look after it.',
    minutes: 3,
    steps: (ctx) => {
      const p = pocket(ctx);
      return [
        {
          title: 'It all belongs to God',
          emoji: '🌍',
          blocks: [
            { kind: 'text', text: 'Your money, your things, your talents, even your time: **it all belongs to God**. He trusts us to look after it.' },
            { kind: 'verse', id: 'earth-is-the-lords' },
            { kind: 'text', text: 'Someone who looks after what belongs to someone else is a **steward**. That’s us!' },
            { kind: 'reflect', prompt: 'What is one thing you’re thankful for this week?' },
          ],
        },
        {
          title: 'Faithful with a little',
          emoji: '🌱',
          blocks: [
            { kind: 'text', text: 'God cares about small things. How we handle a little shows how we would handle a lot.' },
            {
              kind: 'example',
              text: ctx.isKid && ctx.allowanceCents > 0
                ? `Your ${ctx.m(p.cents)}${p.per}: spend some, save some, give some, and know where it went. That’s being faithful with a little.`
                : `${ctx.m(p.cents)} is a little. Spend some, save some, give some, and know where it went. That’s being faithful with a little.`,
            },
            { kind: 'verse', id: 'faithful-in-little' },
            { kind: 'verse', id: 'well-done', note: 'From Jesus’ story of the talents: the servants who used what they were given well heard “Well done”.' },
          ],
        },
        {
          title: 'Work with all your heart',
          emoji: '💪',
          blocks: [
            {
              kind: 'text',
              text: ctx.isKid
                ? 'When you do a job, you can do it **as for the Lord**: with a willing heart, even the small jobs nobody sees.'
                : 'Every job, paid or not, can be done **as for the Lord**: with a willing heart, even the small jobs nobody sees.',
            },
            { kind: 'verse', id: 'work-heartily' },
            { kind: 'reflect', prompt: 'Which job could you do with a happy heart this week?' },
          ],
        },
        {
          title: 'Money is good. Loving it isn’t.',
          emoji: '❤️',
          blocks: [
            { kind: 'text', text: 'Money itself isn’t bad. It buys food, pays for good things and helps people. The Bible warns about **loving** money: when wanting more takes first place in our hearts.' },
            { kind: 'verse', id: 'love-of-money', note: 'Paul says the love of money, not money itself.' },
            { kind: 'verse', id: 'be-content', note: 'Being content means enough is enough. And God never leaves us.' },
            { kind: 'reflect', prompt: 'What helps you feel you have enough?' },
          ],
        },
        {
          title: 'Treasure in heaven',
          emoji: '✨',
          blocks: [
            { kind: 'text', text: 'Things wear out, break or get lost. Love, kindness and faith last for ever. What we treasure shows what our heart cares about.' },
            { kind: 'verse', id: 'treasures-in-heaven' },
            { kind: 'reflect', prompt: 'What is a treasure you have that money can’t buy?' },
          ],
        },
      ];
    },
  },
  {
    id: 'faith-giving',
    kind: 'faith',
    emoji: '🎁',
    title: 'Giving, blessing and provision',
    summary: 'Every good gift comes from God, and we get to pass it on.',
    minutes: 3,
    steps: (ctx) => {
      const p = pocket(ctx);
      const first = Math.max(100, Math.round(p.cents / 1000) * 100);
      return [
        {
          title: 'Every good gift',
          emoji: '🎁',
          blocks: [
            { kind: 'text', text: 'Family, friends, food, a sunny day, and yes, pocket money: **every good gift comes from God**. Being blessed starts with noticing, and saying thank you.' },
            { kind: 'verse', id: 'every-good-gift' },
            { kind: 'reflect', prompt: 'Name three good gifts from this week, big or small.' },
          ],
        },
        {
          title: 'God provides what we need',
          emoji: '🐦',
          blocks: [
            { kind: 'text', text: 'God looks after the birds, and you matter even more to him. He knows what we **need**.' },
            { kind: 'verse', id: 'my-shepherd' },
            { kind: 'verse', id: 'birds-of-the-sky' },
          ],
        },
        {
          title: 'Needs and wants',
          emoji: '🧺',
          blocks: [
            { kind: 'text', text: 'A **need** is something you can’t do without, like food, clothes and a safe home. A **want** is nice to have. God promises what we need; the extras are gifts, not a reward.' },
            { kind: 'verse', id: 'every-need', note: 'Paul wrote this to friends who had shared with him. It’s about needs, not wants.' },
            { kind: 'verse', id: 'seek-first', note: '“All these things” means food and clothes: the everyday things Jesus was just talking about.' },
            { kind: 'reflect', prompt: 'What is one want you could happily wait for?' },
          ],
        },
        {
          title: 'Give with a happy heart',
          emoji: '😊',
          blocks: [
            { kind: 'text', text: 'Giving is **free and glad**. It’s not a rule you must follow, and never a deal to get more back. You decide in your heart.' },
            { kind: 'verse', id: 'cheerful-giver' },
            { kind: 'list', items: ['Your time: help someone without being asked.', 'Your things: share, or pass on what you’ve outgrown.', 'Your money: a little from your give jar.'] },
            { kind: 'verse', id: 'do-good-and-share' },
          ],
        },
        {
          title: 'First, say thank you',
          emoji: '🌾',
          blocks: [
            { kind: 'text', text: 'An old way to say thank you: give God the **first part**, not the leftovers. It’s about gratitude and trust, not a trick to get rich.' },
            { kind: 'verse', id: 'honour-with-wealth', note: 'Farmers gave the first part of the harvest as a thank-you. The full barns are a picture of God’s care, not a promise of riches.' },
            { kind: 'example', text: `From ${ctx.m(p.cents)}, you could set ${ctx.m(first)} aside to give first, before you spend. Or any amount you choose: small and glad is perfect.` },
            { kind: 'widget', widget: 'jars' },
            { kind: 'verse', id: 'more-blessed' },
            { kind: 'reflect', prompt: 'Who could you bless this month? How?' },
          ],
        },
      ];
    },
  },
  {
    id: 'faith-tithing',
    kind: 'faith',
    emoji: '🌾',
    title: 'Tithing: giving the first tenth',
    summary: 'What a tithe is, where it comes from, and how you could give.',
    minutes: 4,
    steps: (ctx) => {
      const p = pocket(ctx);
      const tenth = Math.round(p.cents / 10);
      const own = ctx.isKid && ctx.allowanceCents > 0 && ctx.allowanceCents !== 5000;
      return [
        {
          title: 'A tithe is a tenth',
          emoji: '🔟',
          blocks: [
            { kind: 'text', text: 'The old word **tithe** simply means **a tenth**: 10% of what you get.' },
            {
              kind: 'example',
              text: `If you get ${ctx.m(5000)}, a tithe is ${ctx.m(500)}.`
                + (own ? ` From your ${ctx.m(p.cents)}${p.per}, it would be ${ctx.m(tenth)}.` : ''),
            },
            { kind: 'text', text: 'Giving a tenth is very old. **Abraham** gave a tenth to God’s priest Melchizedek, after God helped him rescue his nephew Lot.' },
            { kind: 'verse', id: 'abram-tenth' },
            { kind: 'text', text: 'Later his grandson **Jacob** promised God a tenth of everything God would give him.' },
            { kind: 'verse', id: 'jacob-tenth', note: 'Jacob said this after God met him in a dream and promised to be with him wherever he went.' },
          ],
        },
        {
          title: 'The tithe in the Old Testament',
          emoji: '🏛️',
          blocks: [
            { kind: 'text', text: 'In the Law of Moses, a tenth of the harvest and the animals **belonged to God**. It was used to care for people:' },
            { kind: 'verse', id: 'tithe-is-holy' },
            {
              kind: 'list',
              items: [
                'The **priests** and Levites, who served God and had no farmland of their own.',
                'The **temple**, God’s house, where people came to worship.',
                'People **in need**: the poor, foreigners, orphans and widows, so they had enough to eat.',
              ],
            },
            { kind: 'text', text: 'And it taught people to **put God first**, year after year.' },
            { kind: 'verse', id: 'tithe-learn', note: 'Families even ate part of it together, as a thank-you feast before God.' },
          ],
        },
        {
          title: 'Trust, not a trick',
          emoji: '🪟',
          blocks: [
            { kind: 'text', text: 'Malachi was a prophet. In his time God’s people had drifted away from God and stopped bringing the tithe. God invited them to come back, **trust him** and put him first again.' },
            { kind: 'verse', id: 'storehouse', note: 'The storehouse was a store room at the temple, with food for the priests and for people in need.' },
            { kind: 'text', text: 'This is about **trust**, not a trick to get rich. Giving is never a deal to get more back. God’s blessing can be many things: what we need, peace, family, friends and joy.' },
            { kind: 'reflect', prompt: 'What blessings do you have that aren’t money?' },
          ],
        },
        {
          title: 'Jesus and the first Christians',
          emoji: '✝️',
          blocks: [
            { kind: 'text', text: 'Jesus said tithing is good, but that **justice, mercy and faith** matter even more. He said it to religious leaders who carefully gave a tenth of their kitchen herbs, but forgot to be fair and kind.' },
            { kind: 'verse', id: 'justice-mercy' },
            { kind: 'text', text: 'The first Christians **planned** their giving: they set money aside regularly, every week.' },
            { kind: 'verse', id: 'first-day-set-aside', note: 'Paul was collecting a gift for poor Christians in Jerusalem.' },
            { kind: 'text', text: 'And they gave **gladly**, as each one decided in their own heart.' },
            { kind: 'verse', id: 'cheerful-giver' },
            {
              kind: 'text',
              text: 'Christians differ here. Many see **10% as a good guide**; others freely give a different amount. '
                + (ctx.isKid ? 'Ask your parents what our family does.' : 'You could tell the kids what you do, and why.'),
            },
          ],
        },
        {
          title: 'How you could do it',
          emoji: '🫙',
          blocks: [
            { kind: 'text', text: 'One simple way: **give first, then save, then spend**. Try it with the jars.' },
            { kind: 'example', text: `From ${ctx.m(p.cents)}${p.per}: give ${ctx.m(tenth)} first, save some, and spend the rest.` },
            { kind: 'widget', widget: 'jars' },
            { kind: 'text', text: 'Your giving could go to:' },
            { kind: 'list', items: ['Your **church**.', 'People **in need**.', 'A **good cause** you care about.'] },
            { kind: 'text', text: 'It’s **your choice**, with a happy heart. Nobody in the app checks it or keeps count. The app has no Give pot: you give in real life, for example in the offering at church, or straight to someone who needs it.' },
            { kind: 'reflect', prompt: 'If you decided to give, where would you like your giving to go?' },
          ],
        },
      ];
    },
  },
  {
    id: 'faith-family',
    kind: 'faith',
    emoji: '🏡',
    title: 'Family: parents and children',
    summary: 'Parents and children love and honour each other, both ways.',
    minutes: 4,
    steps: (ctx) => [
      {
        title: 'A gift, all of us',
        emoji: '🎁',
        blocks: [
          { kind: 'text', text: 'The Bible calls children a **gift** from God. Not a job, not a cost: a gift.' },
          { kind: 'verse', id: 'heritage' },
          { kind: 'text', text: 'And grown-ups are children too: God’s children, loved just as much.' },
          { kind: 'verse', id: 'children-of-god' },
          { kind: 'reflect', prompt: 'Who in our family makes you feel loved? Have you told them?' },
        ],
      },
      {
        title: 'Love goes both ways',
        emoji: '🔁',
        blocks: [
          { kind: 'text', text: 'God gives each of us a part. Children listen to and honour their parents. Parents don’t make their children angry or discouraged; they guide them, patiently. **Both ways.**' },
          { kind: 'verse', id: 'children-obey' },
          { kind: 'verse', id: 'fathers-nurture', note: 'Right after the words for children come words for parents.' },
          { kind: 'verse', id: 'children-parents', note: 'Colossians says it the same way: both sides together.' },
          {
            kind: 'reflect',
            prompt: ctx.isKid
              ? 'What helps you listen to each other, even when you don’t agree?'
              : 'How could you encourage one of the kids this week?',
          },
        ],
      },
      {
        title: 'God sets the lonely in families',
        emoji: '🏡',
        blocks: [
          { kind: 'text', text: 'Our family has parents, bonus parents and grandparents, sometimes in more than one home. That’s good news: **God builds families in many ways.**' },
          { kind: 'verse', id: 'sets-the-lonely', note: 'This psalm praises God, who gives a home to people who have none and sets prisoners free. The first line is our good news.' },
          { kind: 'verse', id: 'where-you-go', note: 'Ruth chose her mother-in-law’s people as her own. A chosen family is a real family.' },
          { kind: 'text', text: 'God does the same: he adopts us, kids and grown-ups, as his own children.' },
          { kind: 'verse', id: 'adoption' },
        ],
      },
      {
        title: 'Learning from each other',
        emoji: '📖',
        blocks: [
          { kind: 'text', text: 'Families learn together in everyday moments: at dinner, in the car, at bedtime. Grandparents bring love, stories and wisdom too.' },
          { kind: 'verse', id: 'teach-diligently' },
          { kind: 'verse', id: 'train-up', note: 'Small, patient steps, every day. And kids teach grown-ups too!' },
          { kind: 'verse', id: 'grandchildren-crown' },
          { kind: 'reflect', prompt: 'What could you teach someone in our family? What could they teach you?' },
        ],
      },
      {
        title: 'Patient love and a fresh start',
        emoji: '🌅',
        blocks: [
          { kind: 'text', text: 'Every family has hard days. Love is patient and kind, and it doesn’t keep a list of wrongs.' },
          { kind: 'verse', id: 'love-is' },
          { kind: 'text', text: 'When we get it wrong, we can say sorry and put it right. **Every morning is a fresh start**, with God and with each other.' },
          { kind: 'verse', id: 'new-every-morning' },
          { kind: 'reflect', prompt: 'Is there something you’d like to put right with someone? What could you say?' },
        ],
      },
    ],
  },
  {
    id: 'faith-churches',
    kind: 'faith',
    emoji: '⛪',
    title: 'One faith, many churches',
    summary: 'Catholic, Orthodox, Protestant: what we share and how we differ.',
    minutes: 5,
    steps: (ctx) => [
      {
        title: 'What all Christians share',
        emoji: '🤝',
        blocks: [
          { kind: 'text', text: 'There are many churches, but **all Christians** share the most important things:' },
          {
            kind: 'list',
            items: [
              'One God: **Father, Son and Holy Spirit**.',
              '**Jesus** died for our sins and rose again.',
              'We’re saved by God’s **grace**, through faith: a gift, not something we earn.',
              'The **Bible** is God’s word.',
            ],
          },
          { kind: 'verse', id: 'father-son-spirit', note: 'Jesus said this to his friends before he went back to heaven. Churches everywhere baptise in this name.' },
          { kind: 'verse', id: 'died-and-raised' },
          { kind: 'verse', id: 'grace-through-faith' },
          { kind: 'verse', id: 'one-lord-one-faith' },
        ],
      },
      {
        title: 'Why are there different churches?',
        emoji: '🕰️',
        blocks: [
          { kind: 'text', text: 'Over 2,000 years, Christians sometimes **disagreed**: about how the church should be led, how to worship, and some teachings. Groups went their own way. Two big moments:' },
          {
            kind: 'list',
            items: [
              '**1054**: the church in the East and the church in the West split. The East became the **Orthodox** churches, the West the **Catholic** Church.',
              '**1517**: Martin Luther, a German monk and teacher, called for changes in the Catholic Church. This **Reformation** started the **Protestant** churches.',
            ],
          },
          { kind: 'text', text: 'Those splits were sad, and Christians haven’t always treated each other well. Today most churches respect each other, and many pray and work together.' },
          { kind: 'verse', id: 'unity' },
        ],
      },
      {
        title: 'Catholic and Orthodox',
        emoji: '⛪',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Catholic**: the largest church, with more than 1.3 billion people, led by the **Pope** in Rome. Catholics follow the Bible together with the Church’s tradition. They have **seven sacraments** (holy signs, like baptism and communion) and celebrate the **Mass**. They honour **Mary** and the saints, and ask them to pray for them, the way you’d ask a friend to pray for you.',
              '**Orthodox** (Greek, Russian and others): led by bishops and patriarchs, not by the Pope in Rome. They use **icons** (holy pictures) and ancient, beautiful ways of worship.',
          'Even older: the **Oriental Orthodox** churches, like the **Coptic** church of Egypt and the **Ethiopian** church, went their own way around the year **451**, long before 1054.',
            ],
          },
        ],
      },
      {
        title: 'Protestant and African churches',
        emoji: '📖',
        blocks: [
          { kind: 'text', text: 'Protestants hold on to three big ideas: **the Bible alone** is the highest guide, and we’re saved by **grace alone**, through **faith alone**. There are many Protestant churches, called **denominations**:' },
          {
            kind: 'list',
            items: [
              '**Lutheran**: named after Martin Luther.',
              '**Anglican**: started in England. Here it’s the Anglican Church of Southern Africa.',
              '**Reformed and Presbyterian**: like the Dutch Reformed Church (NG Kerk), big in South Africa, with roots in the Netherlands.',
              '**Methodist**: started by John Wesley in the 1700s, with a “method” of holy living, Bible study and caring for the poor. One of the largest churches in South Africa.',
              '**Baptist**: they baptise people who choose to believe for themselves, fully under the water.',
              '**Pentecostal and Charismatic**: the gifts of the Holy Spirit and lively worship. Very large in Africa.',
            ],
          },
          { kind: 'text', text: 'Africa also has **African Independent Churches**, started and led by Africans, with worship that feels deeply African. The **Zion Christian Church (ZCC)** is one of the largest churches in South Africa.' },
        ],
      },
      {
        title: 'What does “Evangelical” mean?',
        emoji: '📣',
        blocks: [
          { kind: 'text', text: '**Evangelical** isn’t one church. It’s a way of believing that you’ll find in many churches: Anglican, Baptist, Methodist, Pentecostal and more. Evangelicals stress:' },
          {
            kind: 'list',
            items: [
              'A **personal relationship** with Jesus (some call it being “born again”).',
              'The **Bible** as the highest guide for life.',
              '**Sharing the good news** about Jesus.',
            ],
          },
          { kind: 'text', text: 'The word comes from the Greek for “good news”. An **evangelist** is a person who shares the good news.' },
          { kind: 'verse', id: 'god-so-loved', note: 'Many people call this the good news in one verse.' },
        ],
      },
      {
        title: 'Many houses, one family',
        emoji: '🏘️',
        blocks: [
          { kind: 'text', text: 'Different churches are like **different houses in one big family**. Christians share far more than what divides them, so we **respect other churches**, even when they do things differently.' },
          { kind: 'verse', id: 'all-be-one', note: 'Jesus prayed this for everyone who would believe in him, the night before he died.' },
          { kind: 'text', text: 'People in one family can go to different churches, and that’s OK. What matters most is loving God and loving each other.' },
          { kind: 'reflect', prompt: 'Which church does our family go to? What do you like about it?' },
          {
            kind: 'reflect',
            prompt: ctx.isKid ? 'Ask a parent: what does our church believe?' : 'What would you like the kids to know about our church?',
          },
        ],
      },
    ],
  },
  {
    id: 'faith-world',
    kind: 'faith',
    emoji: '🌍',
    title: 'Christians and other faiths',
    summary: 'What Jews, Muslims, Hindus and Buddhists believe, and how we love our neighbours.',
    minutes: 5,
    steps: (ctx) => [
      {
        title: 'Many people, many beliefs',
        emoji: '🌍',
        blocks: [
          { kind: 'text', text: 'About **8 billion** people live in the world, with many different beliefs. Roughly:' },
          {
            kind: 'list',
            items: [
              '**Christians**: about 2.4 billion, the largest group.',
              '**Muslims**: about 2 billion.',
              '**Hindus**: about 1.2 billion.',
              '**Buddhists**: about 500 million.',
              'And **Jews**, **Sikhs**, people who follow **African traditional religion**, and many people with **no religion**.',
            ],
          },
          { kind: 'text', text: 'In South Africa you’ll meet many of them: there are big **Hindu** and **Muslim** communities in Durban and Cape Town, for example. They’re our **neighbours**, and God loves them.' },
        ],
      },
      {
        title: 'Judaism: the roots of our faith',
        emoji: '🕎',
        blocks: [
          { kind: 'text', text: 'Christianity grew out of **Judaism**. Jews and Christians share a lot:' },
          {
            kind: 'list',
            items: [
              'One God, who made everything.',
              'The **Hebrew Bible**, which Christians call the Old Testament.',
              '**Abraham**, **Moses** and the prophets.',
              'The **Sabbath**: a weekly day of rest, from Friday evening to Saturday evening.',
            ],
          },
          { kind: 'text', text: '**Jesus was Jewish**, and so were his first followers. Most Jewish people believe the **Messiah**, the promised king God would send, is still to come. Christians believe **Jesus is the Messiah**.' },
        ],
      },
      {
        title: 'Islam',
        emoji: '🕌',
        blocks: [
          { kind: 'text', text: '**Muslims** believe in one God. **Allah** is simply the Arabic word for God; Arab Christians use it too. Muslims believe **Muhammad** was the last prophet, and their holy book is the **Qur’an**. Islam has **Five Pillars**:' },
          {
            kind: 'list',
            items: [
              '1. **Faith**: there is no god but God, and Muhammad is his messenger.',
              '2. **Prayer**, five times a day.',
              '3. **Giving to the poor** (zakat).',
              '4. **Fasting** in daylight during the month of Ramadan.',
              '5. **Pilgrimage** to Mecca, once in a lifetime if they can.',
            ],
          },
          { kind: 'example', text: `Zakat is about 2.5% of savings above a set amount, once a year: about ${ctx.m(250)} for every ${ctx.m(10000)}. A bit like a tithe.` },
          { kind: 'text', text: 'Muslims **honour Jesus** (they call him Isa) as a great prophet, born of the virgin Mary. But they don’t believe he is God’s Son, or that he died on the cross and rose again.' },
          { kind: 'text', text: '**The big difference:** Christians believe Jesus is God’s Son, who died for us and rose again, because God loves the world.' },
          { kind: 'verse', id: 'god-so-loved' },
        ],
      },
      {
        title: 'Hinduism and Buddhism',
        emoji: '🪔',
        blocks: [
          { kind: 'text', text: '**Hinduism** is a very old faith from India.' },
          {
            kind: 'list',
            items: [
              'It has many **gods and goddesses**. Many Hindus see them as different faces of **one ultimate reality**, called Brahman.',
              '**Karma**: good and bad actions shape what comes next. **Reincarnation**: after death the soul is born into a new life, again and again, until it is set free (**moksha**).',
              '**Diwali**, the festival of lights, is a big celebration, in Durban too.',
            ],
          },
          { kind: 'text', text: '**Buddhism** started about 2,500 years ago in ancient India with Siddhartha Gautama, called **the Buddha**: “the awakened one”.' },
          {
            kind: 'list',
            items: [
              'It doesn’t focus on a **creator God**.',
              'It teaches that suffering comes from **craving** (always wanting more), and that the **Eightfold Path** and **meditation** lead to peace (**nirvana**).',
            ],
          },
          { kind: 'text', text: '**The difference:** Christians believe in **one personal God** who made us and loves us, and that we’re saved as a **gift of grace**, not by building up good karma or by our own effort.' },
          { kind: 'verse', id: 'grace-through-faith' },
        ],
      },
      {
        title: 'Spirits, ancestors and “spiritual”',
        emoji: '🕯️',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Spiritualists** believe the living can contact the spirits of people who have died, through a person called a **medium**.',
              'In South Africa many people **honour their ancestors** in African traditional religion, sometimes alongside going to church.',
              'Some people call themselves **“spiritual but not religious”**: they believe in things like energy, horoscopes or crystals, without a religion.',
            ],
          },
          { kind: 'text', text: 'Christians believe we come to God **through Jesus alone**, and we don’t try to contact the dead.' },
          { kind: 'verse', id: 'one-mediator' },
          { kind: 'verse', id: 'consult-god', note: 'Isaiah told God’s people to go to God himself, not to mediums.' },
          { kind: 'text', text: 'We **remember and honour** loved ones who have died, with love and thankfulness. But we **talk to God**.' },
        ],
      },
      {
        title: 'Love your neighbour',
        emoji: '💛',
        blocks: [
          { kind: 'text', text: 'What makes a Christian different? Christians believe **Jesus is the way to God**, and that God’s love is a **gift**, not something we earn.' },
          { kind: 'verse', id: 'way-truth-life' },
          { kind: 'text', text: 'Jesus also told us to **love our neighbour**. In his story of the **Good Samaritan**, the hero is a Samaritan: from a group that worshipped differently and that Jesus’ listeners didn’t get along with. He stopped to help when others walked past.' },
          { kind: 'verse', id: 'love-neighbour', note: 'A teacher of the law said this, and Jesus agreed. Then he told the story of the Good Samaritan.' },
          {
            kind: 'list',
            items: [
              'If someone asks, explain your hope **kindly and humbly**.',
              'Live **at peace** with everyone.',
              '**Never mock** anyone’s faith. Ask, listen, and be a good friend.',
            ],
          },
          { kind: 'verse', id: 'gentle-answer' },
          { kind: 'verse', id: 'peace-with-all' },
          { kind: 'reflect', prompt: 'Do you have a friend with a different faith? What could you kindly ask them?' },
          { kind: 'reflect', prompt: 'What would you say if someone asked why you believe in Jesus?' },
        ],
      },
    ],
  },
];
