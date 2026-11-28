// Money school theme "🎄 Christmas: why we celebrate" (December): five tracked lessons with a quiz each, only shown
// when 'faith' is on. Faith is invited, never tested: the quizzes ask about the facts of the Bible story and plain
// facts (dates, customs, sums), never about what you believe. What the text says is told as "the Bible tells / Luke
// says", what Christians believe as "Christians believe", and later traditions are called traditions.
// Scripture is only quoted through verse blocks (features/faith/verses.ts, WEBBE); plain text may name a passage
// ("Luke 2") and retell it in its own words. Every step still makes sense when the reader hides verses, and no verse
// sits next to money trouble or family rules. Other churches and traditions are described with respect, and some
// readers celebrate in two homes.
// Quiz answers are fixed indexes: amounts in the options follow the family's currency, the right option never moves.
// Real-world amounts are written in rand cents and scaled (math.ts exampleCents); the reader's pocket money never is.
import { THEME_LESSON_BY_ID } from '../bank';
import { exampleCents } from '../math';
import type { Block, Lesson, LessonCtx, ThemeLessonId } from '../types';

type ChristmasLessonId = Extract<ThemeLessonId, `xmas-${string}`>;

/** A tracked theme lesson ('series'): emoji, title, summary and minutes from the lesson bank (./bank, server whitelist). */
function christmas(id: ChristmasLessonId, steps: Lesson['steps'], quiz: NonNullable<Lesson['quiz']>): Lesson {
  const { emoji, title, summary, minutes } = THEME_LESSON_BY_ID[id];
  // The theme needs 'faith' too (./bank); the lesson says so itself as well, so it is never shown without it.
  return { id, kind: 'series', emoji, title, summary, minutes, needs: ['faith'], steps, quiz };
}

/** A real-world example amount (written in rand cents) in the family's currency. */
const scaler = (ctx: LessonCtx) => (randCents: number) => exampleCents(ctx.currency, randCents);
const periodOf = (ctx: LessonCtx): 'week' | 'month' => (ctx.allowancePeriod === 'month' ? 'month' : 'week');
/** "You get R 50 a week." for kids, "The pocket money is R 50 a week." for grown-ups reading along. */
const pocketMoneyLine = (ctx: LessonCtx) => `${ctx.isKid ? 'You get' : 'The pocket money is'} ${ctx.m(ctx.allowanceCents)} a ${periodOf(ctx)}.`;

const advent = christmas(
  'xmas-advent',
  (ctx) => {
    const { m } = ctx;
    const perWeek = scaler(ctx)(2_000);
    const quarter = Math.round(ctx.allowanceCents / 4);
    const saving: Block = ctx.allowanceCents > 0
      ? {
        kind: 'example',
        text: periodOf(ctx) === 'week'
          ? `${pocketMoneyLine(ctx)} Put a quarter of it, ${m(quarter)}, aside every week of Advent. After four weeks there’s ${m(4 * quarter)}, ready for Christmas.`
          : `${pocketMoneyLine(ctx)} Put a quarter of it, ${m(quarter)}, aside every month. After four months of waiting there’s ${m(4 * quarter)}.`,
      }
      : { kind: 'example', text: `Say you put ${m(perWeek)} aside every week of Advent. After four weeks there’s ${m(4 * perWeek)}, ready for Christmas.` };
    return [
      {
        title: 'What is Advent?', emoji: '🕯️', blocks: [
          { kind: 'text', text: 'In many churches, Christmas starts long before 25 December, with **Advent**.' },
          { kind: 'text', text: 'Advent comes from a Latin word that means **coming** or **arrival**. It’s a time of **getting ready** to celebrate that Jesus came into the world, the way a family gets ready for a very special visitor.' },
          { kind: 'text', text: 'Advent starts on the **fourth Sunday before Christmas**, somewhere between 27 November and 3 December. Christians believe Jesus will come again one day, so Advent looks forward as well as back.' },
          { kind: 'text', text: 'Many **Orthodox** Christians get ready for longer: about 40 days, called the **Nativity Fast**, when they eat more simply.' },
        ],
      },
      {
        title: 'The Advent wreath', emoji: '🌲', blocks: [
          { kind: 'text', text: 'An **Advent wreath** is a ring of evergreen branches with **four candles**. Each Sunday of Advent one more candle is lit, so it gets a little brighter every week as Christmas comes closer.' },
          {
            kind: 'list', items: [
              'Many churches give the candles a meaning: **hope**, **peace**, **joy** and **love**. Traditions vary: some use another order, or other names like the prophets, Bethlehem, the shepherds and the angels.',
              'The candles are often **purple** or **blue**, sometimes with one **pink** candle for joy on the third Sunday.',
              'Many wreaths have a fifth, **white** candle in the middle, lit at Christmas: the **Christ candle**.',
            ],
          },
          { kind: 'text', text: 'The idea began in **Germany** in the 1800s, at a home for children: a big wheel with a candle for every day until Christmas, so the children could see how long they still had to wait.' },
        ],
      },
      {
        title: 'Advent calendars', emoji: '📅', blocks: [
          { kind: 'text', text: 'An **Advent calendar** counts the days, usually from **1 to 24 December**, with a little door to open each day. It started in Germany too, more than 100 years ago.' },
          {
            kind: 'list', items: [
              'Behind the doors: a picture, a chocolate, a small toy, or a **Bible verse** for the day.',
              'A **kindness calendar**: one small kind thing to do each day, like helping without being asked.',
              'A **reverse Advent calendar**: each day you **put something in** a box, like a tin of food, and before Christmas the box goes to a **food bank**.',
            ],
          },
        ],
      },
      {
        title: 'Waiting well', emoji: '⏳', blocks: [
          { kind: 'text', text: 'Waiting is hard: for a birthday, for the holidays, for someone you love to come home. Advent is a time to practise **waiting well**: with hope, without grumbling, using the time to get ready.' },
          { kind: 'verse', id: 'wait-for-the-lord', note: 'For Christians, waiting for God isn’t wasted time. It’s waiting with hope.' },
          { kind: 'text', text: 'Waiting well is a money skill too. **Saving** is waiting for something good: you don’t have it yet, but every week you get a bit closer.' },
          saving,
        ],
      },
      {
        title: 'Isaiah’s promise', emoji: '📜', blocks: [
          { kind: 'text', text: 'About 700 years before Jesus was born, the prophet **Isaiah** wrote about people in darkness seeing a **great light**, and about a **child** who would bring **peace**.' },
          { kind: 'verse', id: 'great-light' },
          { kind: 'verse', id: 'child-is-born', note: 'Many churches read these words in Advent and at carol services.' },
          { kind: 'text', text: 'Jewish readers understand these words in their own way. Christians read them as a promise about **Jesus**, and that’s why they belong to getting ready for Christmas.' },
          { kind: 'reflect', prompt: 'Advent is about getting ready. How could you get ready for Christmas this year: not just your home, but your heart?' },
        ],
      },
    ];
  },
  () => [
    {
      q: 'What does the word “Advent” mean?',
      options: ['Coming, or arrival', 'Candle', 'Countdown'],
      answer: 0,
      why: 'Advent comes from a Latin word for coming or arrival: the time of getting ready to celebrate that Jesus came.',
    },
    {
      q: 'How many Sundays does Advent have?',
      options: ['Two', 'Four', 'Twelve'],
      answer: 1,
      why: 'Advent has four Sundays, and on an Advent wreath one more candle is lit each Sunday. Twelve is the twelve days of Christmas, after 25 December.',
    },
    {
      q: 'Which prophet wrote about a child who would bring peace, words many churches read in Advent?',
      options: ['Jonah', 'Elijah', 'Isaiah'],
      answer: 2,
      why: 'Isaiah wrote it about 700 years before Jesus was born. Christians read it as a promise about Jesus.',
    },
  ],
);

const birth = christmas(
  'xmas-birth',
  () => [
    {
      title: 'Two Gospels, one story', emoji: '📖', blocks: [
        { kind: 'text', text: 'The Bible tells the Christmas story twice: in the Gospel of **Luke** (chapters 1 and 2) and the Gospel of **Matthew** (chapters 1 and 2).' },
        {
          kind: 'list', items: [
            '**Luke** tells it more from **Mary’s** side: the angel’s visit, the journey to Bethlehem, the manger and the shepherds.',
            '**Matthew** tells it more from **Joseph’s** side: his dream, the name Immanuel, and the wise men (that’s the next lesson).',
          ],
        },
        { kind: 'text', text: 'Nativity plays and Christmas cards mix both together, and add a few things of their own. Here we stick to what the Bible tells.' },
      ],
    },
    {
      title: 'An angel’s message', emoji: '👼', blocks: [
        { kind: 'text', text: 'Luke tells that God sent the angel **Gabriel** to **Mary**, a young woman in the town of **Nazareth**. She was engaged to **Joseph**, from the family of King **David**.' },
        { kind: 'verse', id: 'angel-to-mary' },
        { kind: 'text', text: 'Gabriel told Mary she would have a son by the power of the Holy Spirit, and should call him **Jesus**. Mary was troubled at first and asked how this could happen. Then she said yes: she called herself the Lord’s servant.' },
        { kind: 'text', text: 'Matthew tells Joseph’s side: an angel spoke to him in a **dream**, told him not to be afraid to marry Mary, and to call the baby Jesus. The name **Jesus** means **“God saves”**.' },
      ],
    },
    {
      title: 'The journey to Bethlehem', emoji: '🗺️', blocks: [
        { kind: 'text', text: 'The Roman emperor, **Caesar Augustus**, ordered a **census**: a count of the people. The Romans used counts like this to collect **taxes**. Everyone had to be registered in their family’s own town.' },
        { kind: 'text', text: 'Joseph belonged to the family of David, and David’s town was **Bethlehem**. So he went there from Nazareth with Mary, who was expecting the baby: more than 100 kilometres, several days of travelling.' },
        { kind: 'text', text: 'Christmas cards often show Mary on a donkey. The Bible doesn’t say how they travelled.' },
      ],
    },
    {
      title: 'No room', emoji: '🏠', blocks: [
        { kind: 'text', text: 'While they were in Bethlehem, Mary gave birth to her first son. She wrapped him snugly in strips of cloth, and his first bed was a **manger**: a feeding trough for animals. Luke says the inn had no room for them.' },
        { kind: 'verse', id: 'no-room' },
        { kind: 'text', text: 'The Greek word Luke uses can mean an **inn**, but also a **guest room** in a family home. So maybe the house was full of relatives, and they stayed where the animals were kept. Either way, it was a simple place, not a palace.' },
        { kind: 'text', text: 'Luke doesn’t mention a grumpy innkeeper, or an ox and a donkey either: they came later, in how people tell the story.' },
      ],
    },
    {
      title: 'Shepherds and angels', emoji: '🐑', blocks: [
        { kind: 'text', text: 'That night, **shepherds** were looking after their sheep in the fields near Bethlehem. Suddenly an **angel** stood in front of them, and they were terrified.' },
        { kind: 'verse', id: 'good-news-great-joy' },
        { kind: 'text', text: 'The angel told them the **good news**: their Saviour had been born in David’s town, and they would find the baby in a manger. Then a crowd of angels appeared, praising God and announcing **peace on earth**.' },
        { kind: 'text', text: 'The shepherds hurried to Bethlehem, found Mary, Joseph and the baby, and told everyone what they had heard. Mary kept it all in her heart and thought about it.' },
        { kind: 'reflect', prompt: 'The good news came first to shepherds on the night shift, not to kings or rich people. Why do you think that was?' },
      ],
    },
    {
      title: 'God with us', emoji: '💛', blocks: [
        { kind: 'text', text: 'Matthew says Jesus would also be called **Immanuel**, a Hebrew name that means **“God with us”**. Matthew links it to words of the prophet Isaiah.' },
        { kind: 'verse', id: 'immanuel' },
        { kind: 'text', text: 'Christians believe that in Jesus, God himself came to live among us, as a baby. That’s the heart of Christmas: the word comes from **Christ’s Mass**, a church service for Jesus.' },
        { kind: 'text', text: 'When was he born? **The Bible doesn’t give a date.** **25 December** is the traditional day: Christians chose it centuries later (by the 300s), and nobody knows for sure why that day. Many **Orthodox** churches celebrate on **7 January**, because they follow an older calendar.' },
      ],
    },
  ],
  () => [
    {
      q: 'In which town was Jesus born?',
      options: ['Bethlehem', 'Nazareth', 'Jerusalem'],
      answer: 0,
      why: 'Luke and Matthew both say Bethlehem, the town of King David. Luke tells that Mary and Joseph came from Nazareth.',
    },
    {
      q: 'Where did Mary lay the newborn baby, as Luke tells it?',
      options: ['In a bed at the inn', 'In a manger: a feeding trough for animals', 'In a basket in the reeds by a river'],
      answer: 1,
      why: 'The inn (or guest room) had no room for them, so the baby’s first bed was a manger. The basket in the reeds is baby Moses, in Exodus.',
    },
    {
      q: 'What does the name “Immanuel” mean?',
      options: ['God saves', 'Son of David', 'God with us'],
      answer: 2,
      why: 'Matthew explains it: Immanuel means God with us. The name Jesus means God saves.',
    },
  ],
);

const wiseMen = christmas(
  'xmas-wise-men',
  () => [
    {
      title: 'Visitors from the East', emoji: '⭐', blocks: [
        { kind: 'text', text: 'Matthew tells that after Jesus was born, **wise men from the East** arrived in Jerusalem. In Greek they’re called **magi**: probably scholars who studied the stars.' },
        { kind: 'text', text: 'The Bible doesn’t say exactly where they came from. Many think of Persia or Babylon (today’s Iran and Iraq), or Arabia. They had seen a **star**, and asked where the newborn King of the Jews was, so they could worship him.' },
        { kind: 'verse', id: 'his-star' },
      ],
    },
    {
      title: 'King Herod and the star', emoji: '👑', blocks: [
        { kind: 'text', text: '**King Herod** ruled there, and news of another king worried him. His experts found the answer in the prophet **Micah**: the promised king would come from **Bethlehem**.' },
        { kind: 'text', text: 'Herod sent the wise men to Bethlehem and asked them to come back and tell him where the child was. He said he wanted to worship him too, but really he wanted to get rid of him.' },
        { kind: 'text', text: 'The star went ahead of them and stopped over the place where the child was. They were overjoyed, and gave him their gifts.' },
        { kind: 'verse', id: 'wise-men-gifts' },
        { kind: 'text', text: 'Warned in a dream, they went home another way. An angel warned Joseph too, and the family escaped to **Egypt** until Herod died. For a while, Jesus’ family were **refugees**.' },
      ],
    },
    {
      title: 'What the Bible does and doesn’t say', emoji: '🔍', blocks: [
        {
          kind: 'list', items: [
            'It **doesn’t say there were three**. There were **three gifts**, so people later guessed three men.',
            'It doesn’t call them kings or give their names. **Caspar, Melchior and Balthasar** come from later tradition.',
            'They didn’t come to the manger. Matthew says they came to a **house**, and calls Jesus a young child, not a newborn. So they probably came **later**: weeks or months, maybe even a year or more.',
          ],
        },
        { kind: 'text', text: 'Nativity scenes put the shepherds and the wise men together around the manger. That’s a picture of the whole story, not of one night.' },
        { kind: 'text', text: 'Many churches remember the wise men at **Epiphany**, on 6 January, after the **twelve days of Christmas**. In Spain and many Latin American countries, that’s when children get presents: **Three Kings’ Day**.' },
      ],
    },
    {
      title: 'Gold, frankincense and myrrh', emoji: '🎁', blocks: [
        {
          kind: 'list', items: [
            '**Gold**: a precious metal, a gift fit for a king.',
            '**Frankincense**: a sweet-smelling resin from a tree, burned as **incense** in worship.',
            '**Myrrh**: a resin used for perfume and medicine, and to prepare a body for **burial**.',
          ],
        },
        { kind: 'text', text: 'Frankincense and myrrh came a long way, from southern Arabia and the Horn of Africa, and were **very expensive**: real treasures.' },
        { kind: 'text', text: 'Since early times, Christians have seen a meaning in each gift: gold for a **king**, frankincense for **God**, and myrrh looking ahead to Jesus’ **death**.' },
      ],
    },
    {
      title: 'Why we give presents', emoji: '🎄', blocks: [
        { kind: 'text', text: 'Why do people give presents at Christmas? A few reasons, and they belong together:' },
        {
          kind: 'list', items: [
            '1. **God’s gift.** Christians believe Jesus is God’s gift to the world. Giving to each other passes that love on.',
            '2. **The wise men’s gifts.** They brought their best treasures for Jesus.',
            '3. **Saint Nicholas.** A kind bishop in Myra (in today’s Turkey) in the 300s, remembered for helping people in need, often **in secret**. His day is **6 December**. In the Netherlands and Belgium children still get presents from **Sinterklaas** around then, and that Dutch name is where **Santa Claus** comes from.',
          ],
        },
        { kind: 'verse', id: 'god-so-loved', note: 'The first Christmas gift, as Christians see it: God giving his Son, out of love.' },
      ],
    },
    {
      title: 'Gifts with love, not pressure', emoji: '💝', blocks: [
        { kind: 'text', text: 'A present is a way of saying **“I thought of you”**. The wise men’s gifts mattered because of **why** they gave them.' },
        {
          kind: 'list', items: [
            'A good gift fits the **person**, not the price tag.',
            'You don’t have to match what someone else spends.',
            'Giving should be a **joy**. If it starts to feel like pressure, it’s OK to give less, or to give something you made.',
          ],
        },
        { kind: 'reflect', prompt: 'What’s the best present you’ve ever been given? Was it the most expensive one?' },
      ],
    },
  ],
  () => [
    {
      q: 'Which gifts did the wise men bring?',
      options: ['Gold, silver and pearls', 'Gold, frankincense and myrrh', 'A lamb, bread and wine'],
      answer: 1,
      why: 'Matthew names three gifts: gold, frankincense and myrrh. All three were precious treasures.',
    },
    {
      q: 'Does the Bible say how many wise men there were?',
      options: ['No: it names three gifts, but not how many men came', 'Yes: there were three', 'Yes: three kings, and it gives their names'],
      answer: 0,
      why: 'Matthew gives no number and no names. Three gifts made people think of three men, and the names come from later tradition.',
    },
    {
      q: 'According to Matthew, where did the wise men find Jesus?',
      options: ['In the temple in Jerusalem', 'In the stable, on the night he was born', 'In a house, with his mother Mary'],
      answer: 2,
      why: 'Matthew says they found Jesus with Mary in a house, probably some time after his birth.',
    },
  ],
);

const thanks = christmas(
  'xmas-thanks',
  () => [
    {
      title: 'Thanksgiving Day', emoji: '🦃', blocks: [
        { kind: 'text', text: 'In the **USA**, **Thanksgiving Day** is on the **fourth Thursday in November**. Families travel to be together, share a big meal (often turkey and pumpkin pie) and say what they’re thankful for.' },
        { kind: 'text', text: 'In **Canada**, Thanksgiving is on the **second Monday in October**, closer to the harvest there.' },
        { kind: 'text', text: 'In 1863, in the middle of a war, President Abraham Lincoln made it a national day of thanks. And the day after US Thanksgiving is **Black Friday**, when the Christmas sales begin, now in many countries. The lesson “A generous Christmas on a budget” has more about that.' },
      ],
    },
    {
      title: 'One feast, two memories', emoji: '🌽', blocks: [
        { kind: 'text', text: 'Americans often trace the holiday back to **1621**. English settlers had sailed on the **Mayflower** and started **Plymouth Colony**, on land where the **Wampanoag** people had lived for thousands of years. Half the settlers died in the first winter. Tisquantum (often called Squanto), a local man who spoke English, helped them plant corn.' },
        { kind: 'text', text: 'After their first harvest, the settlers held a feast. About 90 Wampanoag men came with their leader, **Massasoit**, brought deer meat, and stayed for three days.' },
        { kind: 'text', text: 'For many **Native Americans**, it’s also a sad story. In the years after, settlers took more and more of their land, and many people died in wars and from new diseases. Since 1970, some gather in Plymouth on Thanksgiving Day for a **National Day of Mourning**.' },
        { kind: 'text', text: 'Being **thankful** and being **honest** about history go together: we can enjoy a good tradition and still listen to people who remember it differently.' },
      ],
    },
    {
      title: 'Harvest festivals', emoji: '🌾', blocks: [
        { kind: 'text', text: 'People thanked God for the harvest long before 1621. In the Bible, Israel had harvest festivals like the **Feast of Weeks** and the **Feast of Booths**, when families lived in huts for a week. Jewish people still celebrate them today, as **Shavuot** and **Sukkot**.' },
        { kind: 'text', text: '**Many churches** around the world, in Africa, Europe and elsewhere, hold a **harvest festival**: a thank-you service, with the church full of fruit, vegetables and bread. It’s usually when the harvest comes in where they live.' },
        { kind: 'text', text: 'The food people bring is often given to people who need it, for example through a **food bank**.' },
      ],
    },
    {
      title: 'Thank you in the Bible', emoji: '🙏', blocks: [
        { kind: 'text', text: 'The Bible is full of thank-yous. **Psalm 100** is a song of thanks for coming to worship God.' },
        { kind: 'verse', id: 'enter-with-thanks' },
        { kind: 'text', text: 'Paul wrote to the church in Thessalonica to give thanks **in** everything. Not **for** everything: bad things aren’t good. But even on a hard day, there’s something to be thankful for.' },
        { kind: 'verse', id: 'in-everything-thanks' },
        { kind: 'text', text: 'Luke tells of ten men Jesus healed of a skin disease. Only **one** came back to say thank you.' },
      ],
    },
    {
      title: 'Thanks turns into giving', emoji: '🤲', blocks: [
        { kind: 'text', text: 'Gratitude is a habit you can practise:' },
        {
          kind: 'list', items: [
            'Name **three good things** at bedtime or at dinner.',
            'Say **grace**: a short thank-you before a meal.',
            'Write a **thank-you note** for a present, or for someone’s help.',
            'Thank someone people often forget: the bus driver, the cleaner, the person who cooks.',
          ],
        },
        { kind: 'text', text: '**Thanks** and **giving** belong together. When you notice how much you’ve been given, you want to **share** it. That’s why many families and churches collect food and presents for people in need at Christmas.' },
        { kind: 'reflect', prompt: 'Who could you thank this week, who doesn’t hear “thank you” very often?' },
      ],
    },
  ],
  () => [
    {
      q: 'When is Thanksgiving Day in the USA?',
      options: ['The second Monday in October', 'The fourth Thursday in November', '25 December'],
      answer: 1,
      why: 'US Thanksgiving is on the fourth Thursday in November. The second Monday in October is Thanksgiving in Canada.',
    },
    {
      q: 'Who shared the 1621 harvest feast with the English settlers at Plymouth?',
      options: ['Sailors from Spain', 'Soldiers sent by the king of England', 'Wampanoag men, with their leader Massasoit'],
      answer: 2,
      why: 'About 90 Wampanoag men came with Massasoit and stayed three days. Many Native Americans also remember that time with sadness.',
    },
    {
      q: 'Many churches hold a harvest festival. What often happens to the food people bring?',
      options: ['It’s given to people who need it, for example through a food bank', 'It’s sold to pay the church’s bills', 'Everyone takes their own food home again'],
      answer: 0,
      why: 'A harvest festival says thank you for food, and shares it: the gifts often go to a food bank or to people nearby who need them.',
    },
  ],
);

const generous = christmas(
  'xmas-generous',
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const each = x(4_000);
    const giveAway = x(3_000);
    const total = 4 * each + giveAway;
    const batch = x(6_000);
    const jacket = x(40_000);
    const quarter = Math.round(ctx.allowanceCents / 4);
    const fromPocketMoney: Block[] = ctx.allowanceCents > 0
      ? [{
        kind: 'example',
        text: periodOf(ctx) === 'week'
          ? `${pocketMoneyLine(ctx)} Saving a quarter of it, ${m(quarter)}, in each of the two weeks left before Christmas gives ${m(2 * quarter)}. Next year, start in Advent’s first week and it’s ${m(4 * quarter)}.`
          : `${pocketMoneyLine(ctx)} Saving a quarter of it, ${m(quarter)}, every month from January gives ${m(12 * quarter)} by next Christmas. Start early!`,
      }]
      : [];
    return [
      {
        title: 'Make a Christmas budget', emoji: '📝', blocks: [
          { kind: 'text', text: 'Christmas can get expensive fast. A **budget** is a plan you make **before** you shop, so you can give with joy and still have money in January.' },
          {
            kind: 'list', items: [
              '1. **Who?** List the people you want to give to.',
              '2. **How much in total?** Only what you have saved. Never borrow for presents.',
              '3. **How much each?** Share the total out. Not every present has to cost the same.',
              '4. **Something to give away.** Keep a little for people in need.',
            ],
          },
          { kind: 'example', text: `You have ${m(total)}. Presents for 4 people at ${m(each)} each, and ${m(giveAway)} to give away: 4 × ${m(each)} + ${m(giveAway)} = ${m(total)}.` },
          ...fromPocketMoney,
          { kind: 'text', text: 'Celebrating in **two homes**? Put both on your list. A homemade present works in any home.' },
        ],
      },
      {
        title: 'Gifts that don’t cost the earth', emoji: '🧶', blocks: [
          { kind: 'text', text: 'The best presents show you **thought** about the person. They don’t have to cost much.' },
          {
            kind: 'list', items: [
              '**Homemade**: biscuits or fudge in a jar, a drawing, a photo book, a playlist.',
              '**Your time**: a voucher for a games afternoon, a walk together, washing the car or doing the dishes for a week.',
              '**Your words**: a letter saying what you love about someone. People keep those for years.',
            ],
          },
          { kind: 'example', text: `A batch of biscuits costs about ${m(batch)} in ingredients and fills 4 little bags: about ${m(Math.round(batch / 4))} a present.` },
        ],
      },
      {
        title: 'Adverts and sales pressure', emoji: '📺', blocks: [
          { kind: 'text', text: 'In December, adverts work overtime. They want you to feel you **need** more, **now**.' },
          {
            kind: 'list', items: [
              '**Black Friday** and **“today only”** deals rush you, so you don’t stop to think.',
              '**“Only 3 left!”** and countdown clocks make you afraid to miss out.',
              'Gift guides and influencers make expensive presents look normal.',
              '**“Buy now, pay later”** makes it easy to spend money you don’t have yet.',
            ],
          },
          { kind: 'example', text: `A jacket is “50% off”: ${m(jacket)} instead of ${m(2 * jacket)}. If it wasn’t on your list, you didn’t save ${m(jacket)}. You spent ${m(jacket)}.` },
          { kind: 'text', text: 'Try the **one-day rule**: when you see something you didn’t plan, wait a day. If you still want it and it fits your budget, then decide.' },
        ],
      },
      {
        title: 'Giving to others', emoji: '🥫', blocks: [
          { kind: 'text', text: 'For some people Christmas is hard: they’re lonely, ill, missing someone, or short of money. Giving to them is one of the best parts of Christmas.' },
          {
            kind: 'list', items: [
              'A **food bank** collects food and shares it with families who need it. A reverse Advent calendar box is perfect.',
              'A **neighbour** who lives alone: a card, a plate of biscuits, or a visit together with a parent.',
              'Your **church**: many churches collect money, food or presents for people in need at Christmas.',
            ],
          },
          { kind: 'verse', id: 'more-blessed', note: 'Paul reminded people of Jesus’ words: giving brings a joy that getting can’t.' },
          { kind: 'verse', id: 'cheerful-giver', note: 'Give what you decided, gladly, not because you feel pushed.' },
        ],
      },
      {
        title: 'Jesus at the heart of Christmas', emoji: '✝️', blocks: [
          { kind: 'text', text: 'Presents, food and lights are lovely. For Christians, the heart of Christmas is **Jesus**: God’s gift to the world. Every other present is a small echo of that one.' },
          { kind: 'verse', id: 'unspeakable-gift', note: 'Paul wrote this at the end of a part of his letter about giving to people in need. Many Christians hear it as a thank-you for Jesus.' },
          {
            kind: 'list', items: [
              'Read the Christmas story together: **Luke 2**.',
              'Go to a **carol service** or a Christmas Eve service.',
              'Light a candle at dinner, and say thank you to God together.',
              '**Make room** for someone who is alone at Christmas.',
            ],
          },
          { kind: 'text', text: 'If you celebrate in two homes, or on different days, Christmas can feel like twice the fun, and sometimes like missing someone. Both are normal. Wherever you are, you can give love and receive it.' },
          { kind: 'reflect', prompt: 'What’s one thing you could do at Christmas that’s about giving, not getting?' },
        ],
      },
    ];
  },
  (ctx) => {
    const { m } = ctx;
    const x = scaler(ctx);
    const each = x(5_000);
    const giveAway = x(2_000);
    const total = 4 * each + giveAway;
    return [
      {
        q: `Your Christmas budget is ${m(total)}. You keep ${m(giveAway)} to give away and share the rest equally between 4 presents. How much is each present?`,
        options: [m(each), m(Math.round(total / 4)), m(total - giveAway)],
        answer: 0,
        why: `${m(total)} − ${m(giveAway)} = ${m(total - giveAway)} for presents, and ${m(total - giveAway)} ÷ 4 = ${m(each)} each.`,
      },
      {
        q: 'A game is “30% off, today only!”, but it wasn’t on your list. What’s the wise thing to do?',
        options: ['Buy it quickly, before the deal ends', 'Wait a day, and check your list and budget first', 'Borrow money so you don’t miss out'],
        answer: 1,
        why: '“Today only” is there to rush you. A deal is only a saving if you were going to buy it anyway.',
      },
      {
        q: 'What is a food bank?',
        options: ['A bank that lends money to buy food', 'A shop that sells food cheaply', 'A place that collects food and shares it with people who need it'],
        answer: 2,
        why: 'Food banks collect food from shops, churches and families, and give it to people who are struggling.',
      },
    ];
  },
);

/** The December theme "🎄 Christmas: why we celebrate", in lesson order. Ids and titles match the server whitelist. */
export const CHRISTMAS_LESSONS: Lesson[] = [advent, generous, birth, wiseMen, thanks];
