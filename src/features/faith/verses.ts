// Bible verses for the "Faith, hope and love" part of the app (feature 'faith').
// Text: World English Bible, British Edition (WEBBE) — public domain. Fetched once from bible-api.com and reviewed;
// do NOT replace with NIV/ESV/NLT text (copyrighted). Links open the same verse in the YouVersion Bible App (NIV).
// Left out on purpose: verses about God's discipline (Heb 12:11, Prov 3:11-12) — app consequences are parents' rules, not
// God's discipline — and 2 Thess 3:10, which is easily misused. Mal 3:10 is only in the tithing lesson, with context. `daily: false` = only shown inside a lesson
// with context, never in the verse of the day — e.g. the Proverbs about laziness and poverty, which could read as a judgement next to a missed task.

export type VerseTheme = 'faith' | 'grace' | 'work' | 'save' | 'steward' | 'give' | 'tithe' | 'church' | 'world' | 'provision' | 'content' | 'family' | 'kids' | 'parents' | 'grandparents';

export interface Verse {
  id: string;
  /** "Proverbs 13:11" */
  ref: string;
  /** USFM book code for Bible App links, e.g. PRO */
  usfm: string;
  ch: number;
  from: number;
  to: number;
  themes: VerseTheme[];
  /** May appear as the verse of the day. */
  daily: boolean;
  /** WEBBE text. */
  text: string;
}

export const TRANSLATION = 'WEB';
/** YouVersion version id for links (111 = NIV). */
export const BIBLE_APP_VERSION = { id: 111, code: 'NIV' };

export const VERSES: Verse[] = [
  { id: 'faith-hope-love', ref: '1 Corinthians 13:13', usfm: '1CO', ch: 13, from: 13, to: 13, themes: ['faith'], daily: true,
    text: 'But now faith, hope, and love remain—these three. The greatest of these is love.' },
  { id: 'love-is', ref: '1 Corinthians 13:4-7', usfm: '1CO', ch: 13, from: 4, to: 7, themes: ['faith', 'family'], daily: true,
    text: 'Love is patient and is kind. Love doesn’t envy. Love doesn’t brag, is not proud, doesn’t behave itself inappropriately, doesn’t seek its own way, is not provoked, takes no account of evil; doesn’t rejoice in unrighteousness, but rejoices with the truth; bears all things, believes all things, hopes all things, and endures all things.' },
  { id: 'faith-is', ref: 'Hebrews 11:1', usfm: 'HEB', ch: 11, from: 1, to: 1, themes: ['faith'], daily: true,
    text: 'Now faith is assurance of things hoped for, proof of things not seen.' },
  { id: 'god-of-hope', ref: 'Romans 15:13', usfm: 'ROM', ch: 15, from: 13, to: 13, themes: ['faith'], daily: true,
    text: 'Now may the God of hope fill you with all joy and peace in believing, that you may abound in hope in the power of the Holy Spirit.' },
  { id: 'plans-hope', ref: 'Jeremiah 29:11', usfm: 'JER', ch: 29, from: 11, to: 11, themes: ['faith'], daily: true,
    text: 'For I know the thoughts that I think towards you,” says the LORD, “thoughts of peace, and not of evil, to give you hope and a future.' },
  { id: 'new-every-morning', ref: 'Lamentations 3:22-23', usfm: 'LAM', ch: 3, from: 22, to: 23, themes: ['faith', 'grace'], daily: true,
    text: 'It is because of The LORD’s loving kindnesses that we are not consumed, because his mercies don’t fail. They are new every morning. Great is your faithfulness.' },
  { id: 'love-one-another', ref: 'John 13:34', usfm: 'JHN', ch: 13, from: 34, to: 34, themes: ['faith', 'family'], daily: true,
    text: 'A new commandment I give to you, that you love one another. Just as I have loved you, you also love one another.' },
  { id: 'first-loved', ref: '1 John 4:19', usfm: '1JN', ch: 4, from: 19, to: 19, themes: ['faith'], daily: true,
    text: 'We love him, because he first loved us.' },
  { id: 'work-heartily', ref: 'Colossians 3:23', usfm: 'COL', ch: 3, from: 23, to: 23, themes: ['work'], daily: true,
    text: 'And whatever you do, work heartily, as for the Lord and not for men,' },
  { id: 'hard-work-profit', ref: 'Proverbs 14:23', usfm: 'PRO', ch: 14, from: 23, to: 23, themes: ['work'], daily: false,
    text: 'In all hard work there is profit, but the talk of the lips leads only to poverty.' },
  { id: 'diligent-hand', ref: 'Proverbs 10:4', usfm: 'PRO', ch: 10, from: 4, to: 4, themes: ['work'], daily: false,
    text: 'He becomes poor who works with a lazy hand, but the hand of the diligent brings wealth.' },
  { id: 'not-weary', ref: 'Galatians 6:9', usfm: 'GAL', ch: 6, from: 9, to: 9, themes: ['work', 'faith'], daily: true,
    text: 'Let’s not be weary in doing good, for we will reap in due season if we don’t give up.' },
  { id: 'reap-sow', ref: 'Galatians 6:7', usfm: 'GAL', ch: 6, from: 7, to: 7, themes: ['work'], daily: false,
    text: 'Don’t be deceived. God is not mocked, for whatever a man sows, that he will also reap.' },
  { id: 'with-your-might', ref: 'Ecclesiastes 9:10', usfm: 'ECC', ch: 9, from: 10, to: 10, themes: ['work'], daily: true,
    text: 'Whatever your hand finds to do, do it with your might; for there is no work, nor plan, nor knowledge, nor wisdom, in Sheol, where you are going.' },
  { id: 'little-by-little', ref: 'Proverbs 13:11', usfm: 'PRO', ch: 13, from: 11, to: 11, themes: ['save'], daily: true,
    text: 'Wealth gained dishonestly dwindles away, but he who gathers by hand makes it grow.' },
  { id: 'treasure-of-the-wise', ref: 'Proverbs 21:20', usfm: 'PRO', ch: 21, from: 20, to: 20, themes: ['save'], daily: true,
    text: 'There is precious treasure and oil in the dwelling of the wise, but a foolish man swallows it up.' },
  { id: 'the-ant', ref: 'Proverbs 6:6-8', usfm: 'PRO', ch: 6, from: 6, to: 8, themes: ['save', 'work'], daily: false,
    text: 'Go to the ant, you sluggard. Consider her ways, and be wise; which having no chief, overseer, or ruler, provides her bread in the summer, and gathers her food in the harvest.' },
  { id: 'count-the-cost', ref: 'Luke 14:28', usfm: 'LUK', ch: 14, from: 28, to: 28, themes: ['save'], daily: true,
    text: 'For which of you, desiring to build a tower, doesn’t first sit down and count the cost, to see if he has enough to complete it?' },
  { id: 'plans-of-the-diligent', ref: 'Proverbs 21:5', usfm: 'PRO', ch: 21, from: 5, to: 5, themes: ['save', 'work'], daily: false,
    text: 'The plans of the diligent surely lead to profit; and everyone who is hasty surely rushes to poverty.' },
  { id: 'borrower', ref: 'Proverbs 22:7', usfm: 'PRO', ch: 22, from: 7, to: 7, themes: ['save'], daily: false,
    text: 'The rich rule over the poor. The borrower is servant to the lender.' },
  { id: 'earth-is-the-lords', ref: 'Psalm 24:1', usfm: 'PSA', ch: 24, from: 1, to: 1, themes: ['steward'], daily: true,
    text: 'The earth is the LORD’s, with its fullness; the world, and those who dwell in it.' },
  { id: 'faithful-in-little', ref: 'Luke 16:10', usfm: 'LUK', ch: 16, from: 10, to: 10, themes: ['steward'], daily: true,
    text: 'He who is faithful in a very little is faithful also in much. He who is dishonest in a very little is also dishonest in much.' },
  { id: 'well-done', ref: 'Matthew 25:21', usfm: 'MAT', ch: 25, from: 21, to: 21, themes: ['steward'], daily: true,
    text: '“His lord said to him, ‘Well done, good and faithful servant. You have been faithful over a few things, I will set you over many things. Enter into the joy of your lord.’' },
  { id: 'use-your-gift', ref: '1 Peter 4:10', usfm: '1PE', ch: 4, from: 10, to: 10, themes: ['steward', 'give'], daily: true,
    text: 'As each has received a gift, employ it in serving one another, as good managers of the grace of God in its various forms.' },
  { id: 'cheerful-giver', ref: '2 Corinthians 9:7', usfm: '2CO', ch: 9, from: 7, to: 7, themes: ['give'], daily: true,
    text: 'Let each man give according as he has determined in his heart, not grudgingly or under compulsion, for God loves a cheerful giver.' },
  { id: 'more-blessed', ref: 'Acts 20:35', usfm: 'ACT', ch: 20, from: 35, to: 35, themes: ['give'], daily: true,
    text: 'In all things I gave you an example, that so labouring you ought to help the weak, and to remember the words of the Lord Jesus, that he himself said, ‘It is more blessed to give than to receive.’”' },
  { id: 'do-good-and-share', ref: 'Hebrews 13:16', usfm: 'HEB', ch: 13, from: 16, to: 16, themes: ['give'], daily: true,
    text: 'But don’t forget to be doing good and sharing, for with such sacrifices God is well pleased.' },
  { id: 'honour-with-wealth', ref: 'Proverbs 3:9-10', usfm: 'PRO', ch: 3, from: 9, to: 10, themes: ['give', 'provision'], daily: false,
    text: 'Honour the LORD with your substance, with the first fruits of all your increase; so your barns will be filled with plenty, and your vats will overflow with new wine.' },
  { id: 'every-need', ref: 'Philippians 4:19', usfm: 'PHP', ch: 4, from: 19, to: 19, themes: ['provision'], daily: true,
    text: 'My God will supply every need of yours according to his riches in glory in Christ Jesus.' },
  { id: 'my-shepherd', ref: 'Psalm 23:1', usfm: 'PSA', ch: 23, from: 1, to: 1, themes: ['provision'], daily: true,
    text: 'The LORD is my shepherd; I shall lack nothing.' },
  { id: 'seek-first', ref: 'Matthew 6:33', usfm: 'MAT', ch: 6, from: 33, to: 33, themes: ['provision'], daily: true,
    text: 'But seek first God’s Kingdom and his righteousness; and all these things will be given to you as well.' },
  { id: 'birds-of-the-sky', ref: 'Matthew 6:26', usfm: 'MAT', ch: 6, from: 26, to: 26, themes: ['provision'], daily: true,
    text: 'See the birds of the sky, that they don’t sow, neither do they reap, nor gather into barns. Your heavenly Father feeds them. Aren’t you of much more value than they?' },
  { id: 'every-good-gift', ref: 'James 1:17', usfm: 'JAS', ch: 1, from: 17, to: 17, themes: ['provision'], daily: true,
    text: 'Every good gift and every perfect gift is from above, coming down from the Father of lights, with whom can be no variation nor turning shadow.' },
  { id: 'good-gifts', ref: 'Matthew 7:11', usfm: 'MAT', ch: 7, from: 11, to: 11, themes: ['provision', 'family'], daily: true,
    text: 'If you then, being evil, know how to give good gifts to your children, how much more will your Father who is in heaven give good things to those who ask him!' },
  { id: 'be-content', ref: 'Hebrews 13:5', usfm: 'HEB', ch: 13, from: 5, to: 5, themes: ['content'], daily: true,
    text: 'Be free from the love of money, content with such things as you have, for he has said, “I will in no way leave you, neither will I in any way forsake you.”' },
  { id: 'learned-content', ref: 'Philippians 4:11-12', usfm: 'PHP', ch: 4, from: 11, to: 12, themes: ['content'], daily: true,
    text: 'Not that I speak because of lack, for I have learnt in whatever state I am, to be content in it. I know how to be humbled, and I also know how to abound. In any and all circumstances I have learnt the secret both to be filled and to be hungry, both to abound and to be in need.' },
  { id: 'love-of-money', ref: '1 Timothy 6:10', usfm: '1TI', ch: 6, from: 10, to: 10, themes: ['content'], daily: false,
    text: 'For the love of money is a root of all kinds of evil. Some have been led astray from the faith in their greed, and have pierced themselves through with many sorrows.' },
  { id: 'treasures-in-heaven', ref: 'Matthew 6:19-21', usfm: 'MAT', ch: 6, from: 19, to: 21, themes: ['content', 'save'], daily: true,
    text: '“Don’t lay up treasures for yourselves on the earth, where moth and rust consume, and where thieves break through and steal; but lay up for yourselves treasures in heaven, where neither moth nor rust consume, and where thieves don’t break through and steal; for where your treasure is, there your heart will be also.' },
  { id: 'never-satisfied', ref: 'Ecclesiastes 5:10', usfm: 'ECC', ch: 5, from: 10, to: 10, themes: ['content'], daily: true,
    text: 'He who loves silver shall not be satisfied with silver, nor he who loves abundance, with increase. This also is vanity.' },
  { id: 'children-obey', ref: 'Ephesians 6:1-3', usfm: 'EPH', ch: 6, from: 1, to: 3, themes: ['family', 'kids'], daily: false,
    text: 'Children, obey your parents in the Lord, for this is right. “Honour your father and mother,” which is the first commandment with a promise: “that it may be well with you, and you may live long on the earth.”' },
  { id: 'fathers-nurture', ref: 'Ephesians 6:4', usfm: 'EPH', ch: 6, from: 4, to: 4, themes: ['family', 'parents'], daily: false,
    text: 'You fathers, don’t provoke your children to wrath, but nurture them in the discipline and instruction of the Lord.' },
  { id: 'children-parents', ref: 'Colossians 3:20-21', usfm: 'COL', ch: 3, from: 20, to: 21, themes: ['family', 'kids', 'parents'], daily: true,
    text: 'Children, obey your parents in all things, for this pleases the Lord. Fathers, don’t provoke your children, so that they won’t be discouraged.' },
  { id: 'honour-parents', ref: 'Exodus 20:12', usfm: 'EXO', ch: 20, from: 12, to: 12, themes: ['family', 'kids'], daily: false,
    text: '“Honour your father and your mother, that your days may be long in the land which the LORD your God gives you.' },
  { id: 'train-up', ref: 'Proverbs 22:6', usfm: 'PRO', ch: 22, from: 6, to: 6, themes: ['family', 'parents'], daily: true,
    text: 'Train up a child in the way he should go, and when he is old he will not depart from it.' },
  { id: 'hear-instruction', ref: 'Proverbs 1:8', usfm: 'PRO', ch: 1, from: 8, to: 8, themes: ['family', 'kids'], daily: false,
    text: 'My son, listen to your father’s instruction, and don’t forsake your mother’s teaching;' },
  { id: 'heritage', ref: 'Psalm 127:3', usfm: 'PSA', ch: 127, from: 3, to: 3, themes: ['family', 'parents'], daily: true,
    text: 'Behold, children are a heritage of the LORD. The fruit of the womb is his reward.' },
  { id: 'grandchildren-crown', ref: 'Proverbs 17:6', usfm: 'PRO', ch: 17, from: 6, to: 6, themes: ['family', 'grandparents'], daily: true,
    text: 'Children’s children are the crown of old men; the glory of children is their parents.' },
  { id: 'sets-the-lonely', ref: 'Psalm 68:6', usfm: 'PSA', ch: 68, from: 6, to: 6, themes: ['family'], daily: true,
    text: 'God sets the lonely in families. He brings out the prisoners with singing…' }, // second half left out on purpose (reads as a warning to kids)
  { id: 'teach-diligently', ref: 'Deuteronomy 6:6-7', usfm: 'DEU', ch: 6, from: 6, to: 7, themes: ['family', 'parents'], daily: true,
    text: 'These words, which I command you today, shall be on your heart; and you shall teach them diligently to your children, and shall talk of them when you sit in your house, and when you walk by the way, and when you lie down, and when you rise up.' },
  { id: 'children-of-god', ref: '1 John 3:1', usfm: '1JN', ch: 3, from: 1, to: 1, themes: ['family', 'faith'], daily: true,
    text: 'See how great a love the Father has given to us, that we should be called children of God! For this cause the world doesn’t know us, because it didn’t know him.' },
  { id: 'adoption', ref: 'Romans 8:15', usfm: 'ROM', ch: 8, from: 15, to: 15, themes: ['family', 'faith'], daily: true,
    text: 'For you didn’t receive the spirit of bondage again to fear, but you received the Spirit of adoption, by whom we cry, “Abba! Father!”' },
  { id: 'where-you-go', ref: 'Ruth 1:16', usfm: 'RUT', ch: 1, from: 16, to: 16, themes: ['family'], daily: true,
    text: 'Ruth said, “Don’t urge me to leave you, and to return from following you, for where you go, I will go; and where you stay, I will stay. Your people will be my people, and your God my God.' },
  { id: 'grew-in-wisdom', ref: 'Luke 2:52', usfm: 'LUK', ch: 2, from: 52, to: 52, themes: ['family', 'kids'], daily: true,
    text: 'And Jesus increased in wisdom and stature, and in favour with God and men.' },
  { id: 'your-youth', ref: '1 Timothy 4:12', usfm: '1TI', ch: 4, from: 12, to: 12, themes: ['kids'], daily: true,
    text: 'Let no man despise your youth; but be an example to those who believe, in word, in your way of life, in love, in spirit, in faith, and in purity.' },
  { id: 'two-are-better', ref: 'Ecclesiastes 4:9-10', usfm: 'ECC', ch: 4, from: 9, to: 10, themes: ['family', 'work'], daily: true,
    text: 'Two are better than one, because they have a good reward for their labour. For if they fall, the one will lift up his fellow; but woe to him who is alone when he falls, and doesn’t have another to lift him up.' },
  { id: 'bear-burdens', ref: 'Galatians 6:2', usfm: 'GAL', ch: 6, from: 2, to: 2, themes: ['family'], daily: true,
    text: 'Bear one another’s burdens, and so fulfil the law of Christ.' },
  { id: 'interests-of-others', ref: 'Philippians 2:4', usfm: 'PHP', ch: 2, from: 4, to: 4, themes: ['family', 'give'], daily: true,
    text: 'each of you not just looking to his own things, but each of you also to the things of others.' },
  { id: 'devoted', ref: 'Romans 12:10', usfm: 'ROM', ch: 12, from: 10, to: 10, themes: ['family'], daily: true,
    text: 'In love of the brothers be tenderly affectionate to one another; in honour prefer one another,' },
  { id: 'unity', ref: 'Psalm 133:1', usfm: 'PSA', ch: 133, from: 1, to: 1, themes: ['family'], daily: true,
    text: 'See how good and how pleasant it is for brothers to live together in unity!' },
  // Tithing (lesson "faith-tithing" only — never the verse of the day; Malachi 3:10 always with context: trust, not a deal).
  { id: 'abram-tenth', ref: 'Genesis 14:20', usfm: 'GEN', ch: 14, from: 20, to: 20, themes: ['tithe', 'give'], daily: false,
    text: '“Blessed be God Most High, who has delivered your enemies into your hand.” Abram gave him a tenth of all.' },
  { id: 'jacob-tenth', ref: 'Genesis 28:22', usfm: 'GEN', ch: 28, from: 22, to: 22, themes: ['tithe', 'give'], daily: false,
    text: '“…this stone, which I have set up for a pillar, will be God’s house. Of all that you will give me I will surely give a tenth to you.”' },
  { id: 'tithe-is-holy', ref: 'Leviticus 27:30', usfm: 'LEV', ch: 27, from: 30, to: 30, themes: ['tithe'], daily: false,
    text: 'All the tithe of the land, whether of the seed of the land or of the fruit of the trees, is the LORD’s. It is holy to the LORD.' },
  { id: 'tithe-learn', ref: 'Deuteronomy 14:22-23', usfm: 'DEU', ch: 14, from: 22, to: 23, themes: ['tithe'], daily: false,
    text: 'You shall surely tithe all the increase of your seed, that which comes out of the field year by year. You shall eat before the LORD your God, in the place which he chooses to cause his name to dwell, the tithe of your grain, of your new wine, and of your oil, and the firstborn of your herd and of your flock; that you may learn to fear the LORD your God always.' },
  { id: 'storehouse', ref: 'Malachi 3:10', usfm: 'MAL', ch: 3, from: 10, to: 10, themes: ['tithe', 'provision'], daily: false,
    text: 'Bring the whole tithe into the storehouse, that there may be food in my house, and test me now in this,” says the LORD of Armies, “if I will not open you the windows of heaven, and pour you out a blessing, that there will not be enough room for.' },
  { id: 'justice-mercy', ref: 'Matthew 23:23', usfm: 'MAT', ch: 23, from: 23, to: 23, themes: ['tithe'], daily: false,
    text: '“Woe to you, scribes and Pharisees, hypocrites! For you tithe mint, dill, and cumin, and have left undone the weightier matters of the law: justice, mercy, and faith. But you ought to have done these, and not to have left the other undone.”' },
  { id: 'first-day-set-aside', ref: '1 Corinthians 16:2', usfm: '1CO', ch: 16, from: 2, to: 2, themes: ['tithe', 'give', 'save'], daily: false,
    text: 'On the first day of every week, let each one of you save as he may prosper, that no collections are made when I come.' },
  // One faith, many churches; Christians and other faiths (lessons faith-churches / faith-world).
  { id: 'way-truth-life', ref: 'John 14:6', usfm: 'JHN', ch: 14, from: 6, to: 6, themes: ['faith', 'world'], daily: false,
    text: 'Jesus said to him, “I am the way, the truth, and the life. No one comes to the Father, except through me.' },
  { id: 'god-so-loved', ref: 'John 3:16', usfm: 'JHN', ch: 3, from: 16, to: 16, themes: ['faith'], daily: true,
    text: 'For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.' },
  { id: 'grace-through-faith', ref: 'Ephesians 2:8-9', usfm: 'EPH', ch: 2, from: 8, to: 9, themes: ['faith', 'grace'], daily: true,
    text: 'for by grace you have been saved through faith, and that not of yourselves; it is the gift of God, not of works, that no one would boast.' },
  { id: 'one-lord-one-faith', ref: 'Ephesians 4:4-6', usfm: 'EPH', ch: 4, from: 4, to: 6, themes: ['faith', 'church'], daily: true,
    text: 'There is one body and one Spirit, even as you also were called in one hope of your calling, one Lord, one faith, one baptism, one God and Father of all, who is over all and through all and in us all.' },
  { id: 'all-be-one', ref: 'John 17:21', usfm: 'JHN', ch: 17, from: 21, to: 21, themes: ['church'], daily: true,
    text: 'that they may all be one; even as you, Father, are in me, and I in you, that they also may be one in us; that the world may believe that you sent me.' },
  { id: 'love-neighbour', ref: 'Luke 10:27', usfm: 'LUK', ch: 10, from: 27, to: 27, themes: ['faith', 'world'], daily: true,
    text: 'He answered, “You shall love the Lord your God with all your heart, with all your soul, with all your strength, and with all your mind; and your neighbour as yourself.”' },
  { id: 'gentle-answer', ref: '1 Peter 3:15', usfm: '1PE', ch: 3, from: 15, to: 15, themes: ['faith', 'world'], daily: true,
    text: 'But sanctify the Lord God in your hearts. Always be ready to give an answer to everyone who asks you a reason concerning the hope that is in you, with humility and fear,' },
  { id: 'peace-with-all', ref: 'Romans 12:18', usfm: 'ROM', ch: 12, from: 18, to: 18, themes: ['family', 'world'], daily: true,
    text: 'If it is possible, as much as it is up to you, be at peace with all men.' },
  { id: 'consult-god', ref: 'Isaiah 8:19', usfm: 'ISA', ch: 8, from: 19, to: 19, themes: ['world'], daily: false,
    text: 'When they tell you, “Consult with those who have familiar spirits and with the wizards, who chirp and who mutter,” shouldn’t a people consult with their God? Should they consult the dead on behalf of the living?' },
  { id: 'one-mediator', ref: '1 Timothy 2:5', usfm: '1TI', ch: 2, from: 5, to: 5, themes: ['faith', 'church', 'world'], daily: false,
    text: 'For there is one God and one mediator between God and men, the man Christ Jesus,' },
  { id: 'father-son-spirit', ref: 'Matthew 28:19', usfm: 'MAT', ch: 28, from: 19, to: 19, themes: ['faith', 'church'], daily: false,
    text: 'Go and make disciples of all nations, baptising them in the name of the Father and of the Son and of the Holy Spirit,' },
  { id: 'died-and-raised', ref: '1 Corinthians 15:3-4', usfm: '1CO', ch: 15, from: 3, to: 4, themes: ['faith', 'church'], daily: true,
    text: 'For I delivered to you first of all that which I also received: that Christ died for our sins according to the Scriptures, that he was buried, that he was raised on the third day according to the Scriptures,' },
  // Borrowing and insurance (December series). Romans 13:8 is about keeping commitments and love, not "every loan is sin".
  { id: 'prudent-sees-danger', ref: 'Proverbs 22:3', usfm: 'PRO', ch: 22, from: 3, to: 3, themes: ['save', 'steward'], daily: false,
    text: 'A prudent man sees danger and hides himself; but the simple pass on, and suffer for it.' },
  { id: 'owe-no-one', ref: 'Romans 13:8', usfm: 'ROM', ch: 13, from: 8, to: 8, themes: ['family', 'steward'], daily: true,
    text: 'Owe no one anything, except to love one another; for he who loves his neighbour has fulfilled the law.' },
  { id: 'righteous-repay', ref: 'Psalm 37:21', usfm: 'PSA', ch: 37, from: 21, to: 21, themes: ['give', 'steward'], daily: false,
    text: 'The wicked borrow, and don’t pay back, but the righteous give generously.' },
  { id: 'do-not-withhold', ref: 'Proverbs 3:27-28', usfm: 'PRO', ch: 3, from: 27, to: 28, themes: ['give', 'family'], daily: true,
    text: 'Don’t withhold good from those to whom it is due, when it is in the power of your hand to do it. Don’t say to your neighbour, “Go, and come again; tomorrow I will give it to you,” when you have it by you.' },
  { id: 'store-for-famine', ref: 'Genesis 41:36', usfm: 'GEN', ch: 41, from: 36, to: 36, themes: ['save', 'provision'], daily: false,
    text: 'The food will be to supply the land against the seven years of famine, which will be in the land of Egypt; so that the land will not perish through the famine.' },
  { id: 'yes-be-yes', ref: 'Matthew 5:37', usfm: 'MAT', ch: 5, from: 37, to: 37, themes: ['work', 'family'], daily: false,
    text: 'But let your ‘Yes’ be ‘Yes’ and your ‘No’ be ‘No.’ Whatever is more than these is of the evil one.' },
];

export const VERSE_BY_ID: Record<string, Verse> = Object.fromEntries(VERSES.map((x) => [x.id, x]));

/** https://www.bible.com/bible/111/PRO.13.11.NIV — opens the YouVersion Bible App on phones that have it. */
export function bibleAppUrl(v: Pick<Verse, 'usfm' | 'ch' | 'from' | 'to'>): string {
  const verses = v.to > v.from ? `${v.from}-${v.to}` : `${v.from}`;
  return `https://www.bible.com/bible/${BIBLE_APP_VERSION.id}/${v.usfm}.${v.ch}.${verses}.${BIBLE_APP_VERSION.code}`;
}

/** Same verse all day for everyone in the family: rotates through the daily verses by date (YYYY-MM-DD). */
export function verseOfTheDay(dateISO: string): Verse {
  const daily = VERSES.filter((x) => x.daily);
  const [y, m, d] = dateISO.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return daily[((day % daily.length) + daily.length) % daily.length];
}
