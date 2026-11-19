// Built-in answers for "Ask Pocket": the demo's helper, a fallback when the AI helper isn't set up, and the
// FAQ on the Help page. Pure: no session/app imports, so the demo backend can lazy-load it on its own.
import type { FeatureKey } from '../../lib/types';

export interface FaqEntry {
  id: string;
  /** Question as listed in the Help FAQ (null = only used for matching, e.g. "hi" or "thanks"). */
  q: string | null;
  /** Answer in English. */
  en: string;
  /** Answer in Dutch (used when the question looks Dutch). */
  nl: string;
  /**
   * Keywords, English + Dutch, lower case. A phrase (with a space) counts 2, a word 1, a leading `*` makes it 3.
   * Words of 5+ letters also match longer words ("saving" → "savings"); shorter words must match exactly.
   */
  keys: string[];
  /** Part of the app this is about: the Help FAQ only lists it when that part is switched on. */
  feature?: FeatureKey;
}

// Order matters: on a tie the earlier (more specific) entry wins.
export const FAQ: FaqEntry[] = [
  {
    id: 'purpose',
    q: "What's the point of Sow & Grow?",
    en: 'Sow & Grow shows that what you do has a result. Do your tasks and you earn money, time or points. Leave them and it costs you a little. Save, and your money can grow. And it works both ways: you can challenge grown-ups too. It’s teamwork, not punishment. 💛',
    nl: 'Sow & Grow laat zien dat wat je doet gevolgen heeft. Doe je taken en je verdient geld, tijd of punten. Laat je ze liggen, dan kost het je een beetje. Spaar je, dan kan je geld groeien. En het werkt twee kanten op: jij kunt volwassenen ook uitdagen. Het is samenwerken, geen straf. 💛',
    keys: [
      '*point of', '*purpose', '*what is pocket money', '*what is this app', '*what does this app', 'whats this app', 'why this app',
      'why do we use', 'about the app', 'what is it for', '*doel van', '*nut van', '*wat is pocket money', '*wat is deze app',
      '*what is sow grow', '*what is sow and grow', '*wat is sow grow', '*wat is sow and grow', 'sow grow', 'sow and grow',
      'waarom deze app', 'wat doet deze app', 'waar is het voor', 'waarom gebruiken',
    ],
  },
  {
    id: 'missed',
    q: 'What happens if I miss a task?',
    en: 'If the time runs out and the task isn’t done, it says “Not done this time” and the cost comes off — for example −€0.50. That’s cause and effect, not a punishment. Were you ill, or was there a good reason? Tell a parent: they can excuse it and you get it all back. 🤝',
    nl: 'Is de tijd om en is de taak niet gedaan? Dan staat er “Not done this time” en gaat het bedrag eraf — bijvoorbeeld −€0,50. Dat is oorzaak en gevolg, geen straf. Was je ziek of had je een goede reden? Zeg het tegen een ouder: die kan het kwijtschelden en dan krijg je alles terug. 🤝',
    keys: [
      '*miss', '*missed', '*missing', '*gemist', '*missen', 'forgot', 'forget', 'vergeten', 'vergeet', 'late', 'too late', 'te laat',
      '*excuse', '*excused', 'kwijtschelden', 'sick', 'ill', 'ziek', 'not done', 'niet gedaan', 'deadline', 'ran out', 'happens if',
      'gebeurt er als',
    ],
  },
  {
    id: 'photo',
    q: 'Why do I need a photo?',
    en: 'The photo is your proof. 📸 A grown-up who isn’t at home can still see the job is done, so they can say OK quickly — no arguing needed. A before-and-after photo is extra clear. Sometimes a parent says a note is enough. Only your family can see the photos.',
    nl: 'De foto is je bewijs. 📸 Ook een ouder die niet thuis is, ziet zo dat het klaar is en kan snel OK zeggen — zonder discussie. Een foto van ervoor en erna is extra duidelijk. Soms mag een notitie ook. Alleen jouw gezin kan de foto’s zien.',
    keys: ['*photo', '*foto', '*fotos', 'picture', 'pic', 'camera', 'proof', 'bewijs', 'evidence', 'before and after', 'voor en na', 'selfie'],
  },
  {
    id: 'spotted',
    q: 'What is “Spotted”?',
    en: 'Spotted is when a grown-up notices something and records it on the spot, often with a photo. Something good, like helping Grandma with her shopping, is a reward. Something not OK, like leaving your bike in the rain, is a consequence.     The amount is a fixed family rule, the same for everyone, and there’s always a reason you can read. Grandparents and other family, like aunts, uncles and godparents, can only give gifts. 🎁',
        nl: 'Spotted is als een volwassene iets ziet en het meteen vastlegt, vaak met een foto. Iets goeds, zoals oma helpen met de boodschappen, is een beloning. Iets wat niet OK is, zoals je fiets in de regen laten staan, is een gevolg. Het bedrag is een vaste gezinsregel, voor iedereen hetzelfde, en er staat altijd een reden bij die je kunt lezen. Opa, oma en andere familie, zoals tantes, ooms en peetouders, kunnen alleen cadeaus geven. 🎁',
    keys: ['*spotted', '*spot', '*gespot', 'caught', 'betrapt', 'noticed', 'gezien', 'bonus', 'gift', 'gifts', 'cadeau', 'present'],
    feature: 'spotted',
  },
  {
    id: 'fines',
    q: 'Why did money come off my wallet?',
    en: 'Money only comes off with a reason, and you can always read it in Money → History. Usually a task wasn’t done in time, or a grown-up spotted something not OK (a fine). Every line says why and who did it. Think it’s a mistake? Ask a parent — they can undo it.',
    nl: 'Er gaat alleen geld af met een reden, en die lees je altijd in Money → History. Meestal was een taak niet op tijd af, of zag een volwassene iets wat niet OK was (een boete). Bij elke regel staat waarom en wie het deed. Denk je dat het een vergissing is? Vraag het een ouder — die kan het terugdraaien.',
    keys: [
      '*fine', '*fined', '*fines', '*boete', '*boetes', '*consequence', 'consequentie', 'gevolg', 'gevolgen', 'lost money',
      'lose money', 'geld kwijt', 'geld eraf', 'taken off', 'came off', 'minus', 'afgetrokken', 'punish', 'punished', 'punishment',
      'straf', 'owe', 'owes', 'schuld', 'negative', 'negatief', 'unfair', 'oneerlijk', 'mistake', 'vergissing', 'history',
    ],
  },
  {
    id: 'saver_rules',
    q: 'What is the saver bonus?',
    en: 'If your savings grew this week, you get bonus points. 🐷 But if you earned money and ended the week with nothing saved and nothing left, you can lose a few points. Tip: move a little to Savings every week, even €0.50.',
    nl: 'Is je spaargeld deze week gegroeid? Dan krijg je bonuspunten. 🐷 Maar als je geld verdiende en de week eindigt met niks gespaard en niks over, kun je een paar punten verliezen. Tip: zet elke week een klein beetje opzij, al is het maar €0,50.',
    keys: ['*saver', '*saver bonus', '*spaarbonus', 'nothing saved', 'niks gespaard', 'niets gespaard', 'spent everything', 'alles uitgegeven'],
    feature: 'saver_rules',
  },
  {
    id: 'interest',
    q: 'How do my savings grow?',
    en: 'Every week your savings get a little extra. That’s called interest. 🌱 Your parents choose how much. Say it’s 2% a month and you have €20 saved: that’s about €0.40 extra a month, for doing nothing! The more you keep in Savings and the longer you wait, the faster it grows.',
    nl: 'Elke week krijgt je spaargeld een beetje extra. Dat heet rente. 🌱 Je ouders kiezen hoeveel. Stel: het is 2% per maand en je hebt €20 gespaard. Dan krijg je ongeveer €0,40 per maand erbij, zonder iets te doen! Hoe meer je spaart en hoe langer je wacht, hoe sneller het groeit.',
    keys: ['*interest', '*rente', 'grow', 'grows', 'growing', 'groeien', 'groeit', 'percent', 'procent', 'extra money', 'compound'],
    feature: 'interest',
  },
  {
    id: 'goals',
    q: 'How do savings goals work?',
    en: 'Pick something you want, like headphones for €40, and make it a goal with an emoji. 🎯 The bar shows how far you are (“€12 of €40”) and about how many weeks to go at your saving pace. Save a bit more each week and watch the weeks drop.',
    nl: 'Kies iets wat je wilt, zoals een koptelefoon van €40, en maak er een doel van met een emoji. 🎯 De balk laat zien hoe ver je bent (“€12 of €40”) en hoeveel weken het nog ongeveer duurt. Spaar elke week wat meer en zie de weken dalen.',
    keys: ['*goal', '*goals', '*spaardoel', 'doel', 'doelen', 'save for', 'saving for', 'sparen voor', 'how long', 'hoe lang', 'how many weeks'],
    feature: 'goals',
  },
  {
    id: 'why_save',
    q: 'Why should I save?',
    en: 'Saving gives you choices. 🐷 First come the needs (things you must have, like food and school shoes), then the wants (nice to have, like a new game). Savings help when surprises happen, like broken earphones, and let you buy bigger things without borrowing. Waiting for something better later is a real superpower, and it gets easier with practice.',
    nl: 'Sparen geeft je keuzes. 🐷 Eerst komt wat je nodig hebt (zoals eten en schoenen voor school), dan wat je graag wilt (leuk om te hebben, zoals een nieuwe game). Spaargeld helpt als er iets onverwachts gebeurt, zoals kapotte oortjes, en zo koop je grotere dingen zonder te lenen. Wachten op iets beters later is een echte superkracht, en het wordt makkelijker als je het oefent.',
    keys: [
      '*why should i save', '*should i save', '*why save', '*why saving', '*point of saving', '*waarom sparen', '*waarom zou ik sparen',
      '*waarom moet ik sparen', '*needs and wants', '*need or want', '*nodig of willen', 'reason to save', 'delayed gratification',
      'superpower', 'superkracht', 'saving', 'save',
    ],
  },
  {
    id: 'how_save',
    q: 'How do I save more?',
    en: 'Five tips 💰: 1) Pay yourself first: save a part the moment money arrives, not what’s left at the end. 2) Pick a part to save, like 20% (one fifth). 3) Want something you don’t need? Wait 24 hours first. 4) Compare prices in two or three shops. 5) Write down your goal and how much you’ll save each week. If your family uses Savings, tap Move to savings in Money.',
    nl: 'Vijf tips 💰: 1) Betaal jezelf eerst: zet een deel opzij zodra je geld krijgt, niet wat er aan het eind over is. 2) Kies een deel om te sparen, bijvoorbeeld 20% (een vijfde). 3) Wil je iets wat je niet nodig hebt? Wacht dan eerst 24 uur. 4) Vergelijk prijzen in twee of drie winkels. 5) Schrijf je doel op en hoeveel je elke week spaart. Gebruikt jullie gezin Savings? Tik dan in Money op Move to savings.',
    keys: [
      '*how do i save', '*how to save', '*how can i save', '*save more', '*saving tips', '*tips for saving', '*hoe spaar ik',
      '*hoe kan ik sparen', '*hoe moet ik sparen', '*meer sparen', '*spaartips', 'save money', 'geld sparen', 'pay yourself first',
      '24 hour rule', '24 hours', '24 uur', 'jars', 'potjes',
    ],
  },
  {
    id: 'savings',
    q: 'How does saving work?',
    en: 'You have two pots: Wallet 👛 and Savings 🐷. You can move money to Savings any time. There it stays safe for later. Want to take some out? Ask for it in Money and a parent says OK.',
    nl: 'Je hebt twee potjes: Wallet 👛 (portemonnee) en Savings 🐷 (sparen). Je kunt altijd geld naar Savings zetten. Daar blijft het veilig voor later. Wil je er iets uit halen? Vraag het in Money en een ouder zegt OK.',
    keys: [
      '*save', '*saved', '*saving', '*sparen', '*spaar', '*gespaard', 'piggy', 'pot', 'pots', 'potje', 'withdraw', 'opnemen',
      'take out', 'eruit halen', 'move money', 'transfer', 'overzetten', 'wallet', 'portemonnee',
    ],
    feature: 'savings',
  },
  {
    id: 'targets',
    q: 'What are targets and prizes?',
    en: 'A target is a weekly or monthly aim from your parents, like “do 80% of your tasks this week” or “collect 100 points”. Reach it or beat it and the prize is paid automatically when the week or month ends — for example +€2. 🏆',
    nl: 'Een target is een doel voor de week of maand van je ouders, zoals “doe 80% van je taken deze week” of “verzamel 100 punten”. Haal je het (of meer), dan krijg je automatisch de prijs als de week of maand voorbij is — bijvoorbeeld +€2. 🏆',
    keys: ['*target', '*targets', '*prize', '*prizes', '*prijs', 'prijzen', 'doelstelling', 'weekdoel', 'maanddoel', 'win', 'winnen'],
    feature: 'targets',
  },
  {
    id: 'challenges',
    q: 'Can I challenge my parents?',
    en: 'Yes! 💪 Anyone can challenge anyone, so you can challenge Mum, Dad or a bonus parent too. Pick a challenge and add points and a reward in words, like “I’ll make you breakfast”. You can also do one together as a team. Whoever set it checks if it’s done.',
    nl: 'Ja! 💪 Iedereen kan iedereen uitdagen, dus jij kunt ook mama, papa of je bonusouder uitdagen. Kies een uitdaging en voeg punten en een beloning in woorden toe, zoals “Ik maak ontbijt voor je”. Je kunt er ook samen één doen als team. Wie de uitdaging maakte, checkt of het gelukt is.',
    keys: ['*challenge', '*challenges', '*uitdaging', '*uitdagen', 'uitdagingen', 'dare', 'beat me', 'together', 'samen', 'partnership', 'team'],
    feature: 'challenges',
  },
  {
    id: 'requests',
    q: 'How do I ask to spend my money?',
    en: 'Go to Money and make a request: “I want to buy a game for €8”. A parent says yes or no.     If it’s yes, the €8 comes off your Wallet and the parent pays you in real life (cash or a bank transfer). The money in the app is like a bank book.',
        nl: 'Ga naar Money en doe een verzoek: “Ik wil een game kopen voor €8”. Een ouder zegt ja of nee. Bij ja gaat de €8 van je Wallet af en betaalt je ouder je echt uit (contant of overmaken). Het geld in de app is als een spaarboekje.',
    keys: [
      '*buy', '*spend', '*kopen', '*uitgeven', 'request', 'requests', 'verzoek', 'can i buy', 'mag ik', 'pay out', 'paid out',
      'uitbetalen', 'real money', 'echt geld', 'cash', 'contant', 'bank', 'shop', 'winkel', 'want to buy', 'wil kopen',
      'bank transfer', 'overmaken', 'to my bank', 'naar mijn bank', 'naar mijn rekening',
    ],
    feature: 'requests',
  },
  {
    id: 'time',
    q: 'How do time minutes work?',
    en: 'Besides money you can earn time: minutes for Wi-Fi 📶, games 🎮 or fun 🎈. Homework done might give +30 min game time. The minutes go into your time bank. Want to use them? Ask in Money and a parent says OK.',
    nl: 'Naast geld kun je tijd verdienen: minuten voor wifi 📶, games 🎮 of iets leuks 🎈. Huiswerk af kan +30 min gametijd opleveren. De minuten gaan in je tijdbank. Wil je ze gebruiken? Vraag het in Money en een ouder zegt OK.',
    keys: [
      '*minutes', '*minuten', '*time bank', '*tijdbank', '*game time', '*gametijd', '*screen time', '*schermtijd', 'wifi', 'wi fi',
      'gaming', 'game', 'games', 'tijd', 'time', 'xbox', 'playstation', 'fortnite', 'minecraft', 'roblox',
    ],
    feature: 'time',
  },
  {
    id: 'look',
    q: 'How do I change my colour or character?',
    en: 'Tap your avatar at the top right to open Me. There you pick your colour, light or dark, and your character (fox, dragon, robot…). Tap “Name & avatar” to change your emoji or add a photo. It’s only a look: everything works the same for everyone.',
    nl: 'Tik rechtsboven op je avatar om Me te openen. Daar kies je je kleur, licht of donker, en je karakter (vos, draak, robot…). Tik op “Name & avatar” om je emoji te veranderen of een foto toe te voegen. Het is alleen het uiterlijk: alles werkt voor iedereen hetzelfde.',
    keys: [
      '*colour', '*color', '*kleur', 'dark mode', 'light mode', 'donker', 'dark', 'licht', 'avatar', 'emoji', 'theme', 'thema',
      'my look', 'change my', 'veranderen', 'verander', 'aanpassen', 'profile picture', 'profielfoto', 'character', 'karakter',
    ],
  },
  {
    id: 'points',
    q: 'What are points and levels?',
    en: 'Points (XP) are for effort. ✨ You get them for tasks, challenges and bonuses. Collect points and your character levels up: 50 points is level 2, 120 is level 3, and so on. Points aren’t money — they show how much you’ve done.',
    nl: 'Punten (XP) krijg je voor inzet. ✨ Je krijgt ze voor taken, uitdagingen en bonussen. Verzamel punten en je karakter gaat een level omhoog: 50 punten is level 2, 120 is level 3, enzovoort. Punten zijn geen geld — ze laten zien hoeveel je gedaan hebt.',
    keys: ['*points', '*punten', '*level', '*levels', 'xp', 'level up', 'niveau', 'character', 'karakter', 'fox', 'dragon', 'unicorn', 'vos', 'draak'],
    feature: 'points',
  },
  {
    id: 'privacy',
    q: 'Who can see my money?',
    en: 'Your parents and bonus parents can see your money, tasks and questions. Grandparents and other family, like aunts, uncles and godparents, may see how you’re doing, but they can only give, never take. Your brothers and sisters can’t see your money. Nobody outside the family can see anything. 🔒',
    nl: 'Je ouders en bonusouders kunnen je geld, taken en vragen zien. Opa, oma en andere familie, zoals tantes, ooms en peetouders, kunnen soms zien hoe het gaat, maar ze kunnen alleen geven, nooit afpakken. Je broers en zussen zien jouw geld niet. Niemand buiten het gezin kan iets zien. 🔒',
    keys: [
      '*who can see', '*wie kan', '*wie ziet', 'can see', 'kan zien', 'see my', 'mijn geld zien', '*privacy', 'private', 'prive',
      'secret', 'geheim', 'read my', 'lezen',
    ],
  },
  {
    id: 'allowance',
    q: 'When do I get pocket money?',
    en: 'Your parents can set pocket money for you: every week on a set day (say €5 every Monday) or every month on a set date (say €20 on the 1st).     💰 It goes into your Wallet automatically at midnight — you don’t have to do anything for it. Money shows how much you get and when. Plan it well: spend some, save some.',
        nl: 'Je ouders kunnen zakgeld voor je instellen: elke week op een vaste dag (bijvoorbeeld €5 elke maandag) of elke maand op een vaste datum (bijvoorbeeld €20 op de 1e). 💰 Het komt om middernacht vanzelf in je Wallet — je hoeft er niks voor te doen. In Money zie je hoeveel je krijgt en wanneer. Plan het goed: een deel uitgeven, een deel sparen.',
    keys: [
      '*allowance', '*zakgeld', 'weekly money', 'every week', 'elke week', 'weekgeld', 'when do i get', 'wanneer krijg', 'get paid',
      'pocket money', 'every month', 'elke maand', 'per month', 'per maand', 'monthly', 'maandelijks', 'maandgeld', 'weekly', 'wekelijks',
    ],
    feature: 'allowance',
  },
  {
    id: 'bank',
    q: 'What is the real bank balance?',
    en: 'Some kids also have a real bank account, like Revolut. 🏦 You (or a parent) can type in what the banking app says: open Money, find “Real bank account” and tap Update balance. In the red? Switch on “Overdrawn (negative)”.     It’s only for looking: it doesn’t change your money in Sow & Grow, and the app never touches your bank.',
        nl: 'Sommige kinderen hebben ook een echte bankrekening, zoals Revolut. 🏦 Jij (of een ouder) kunt invullen wat de bank-app zegt: open Money, zoek “Real bank account” en tik op Update balance. Sta je rood? Zet dan “Overdrawn (negative)” aan. Het is alleen om te kijken: het verandert je geld in Sow & Grow niet, en de app komt nooit aan je bank.',
    keys: [
      '*bank', '*banks', '*revolut', '*rekening', '*bankrekening', '*saldo', 'banksaldo', 'banking', 'bank account', 'bank balance',
      'bank app', 'banking app', 'real bank', 'echte bank', 'echte rekening', 'overdrawn', 'rood staan', 'sta ik rood', 'bunq', 'rabobank',
    ],
    feature: 'bank',
  },
  {
    id: 'exchange',
    q: 'How much is my money in rand?',
    en: 'The app counts in one currency, but money can come in euro and the shop can be in rand. 💱 When a parent picks “Also show money in” (Family rules), Money shows today’s rate, like €1 = R 18.66, and the other currency next to your money (“≈ R 373”).     There’s a calculator on your Money page, and when you ask to spend or set a goal you can type in the other currency. Banks and Revolut use their own rate, so the shop can be a little different.',
        nl: 'De app rekent in één munt, maar geld kan in euro komen en de winkel kan in rand zijn. 💱 Als een ouder “Also show money in” kiest (Family rules), laat Money de koers van vandaag zien, zoals €1 = R 18,66, en de andere munt naast je geld (“≈ R 373”). Op je Money-pagina staat een rekenmachine, en als je vraagt om iets te kopen of een doel maakt kun je in de andere munt typen. Banken en Revolut gebruiken hun eigen koers, dus in de winkel kan het een beetje anders zijn.',
    keys: [
      '*rand', '*rands', '*exchange', '*exchange rate', '*wisselkoers', '*koers', '*zar', 'convert', 'omrekenen', 'south africa',
      'south african', 'zuid afrika', 'currency', 'valuta', 'in rand', 'how much in', 'hoeveel in', 'euro to rand', 'euro naar rand',
    ],
  },
  {
    id: 'earn',
    q: 'How can I earn more?',
    en: 'Do your tasks on time, with a good photo. ✅ Ask a parent if there’s an extra job you can do. Take on challenges, and keep some money in Savings so it can grow. Look at “This week” in Money: it shows what you can still earn.',
    nl: 'Doe je taken op tijd, met een goede foto. ✅ Vraag een ouder of er een extra klusje is. Doe mee met uitdagingen, en houd wat geld in Savings zodat het kan groeien. Kijk bij “This week” in Money: daar zie je wat je nog kunt verdienen.',
    keys: ['*earn', '*earning', '*verdienen', '*verdien', 'more money', 'meer geld', 'extra job', 'extra klusje', 'rich', 'rijk', 'how much can i'],
  },
  {
    id: 'tasks',
    q: 'How do I finish a task?',
    en: 'Open Tasks and tap the task. Do the job, take a photo (or write a note if that’s allowed) and send it. A grown-up checks it and says OK, and then your reward lands in Money. ✅ Does it say “Try again”? Read their note, fix it and send it again.',
    nl: 'Open Tasks en tik op de taak. Doe het klusje, maak een foto (of schrijf een notitie als dat mag) en stuur het in. Een volwassene kijkt ernaar en zegt OK, en dan komt je beloning in Money. ✅ Staat er “Try again”? Lees de notitie, verbeter het en stuur het opnieuw.',
    keys: [
      'task', 'tasks', 'chore', 'chores', 'taak', 'taken', 'klus', 'klusje', 'klusjes', 'finish', 'done', 'klaar', 'afmaken',
      'waiting', 'wachten', 'approve', 'approved', 'approval', 'goedkeuren', 'goedkeuring', 'try again', 'send back', 'opnieuw',
      'how do i do', 'hoe doe ik',
    ],
  },
  {
    id: 'sign_in',
    q: 'What if I lose my phone?',
    en: 'Go to Me → Sign-in & devices and add a username and password (or Google). Then you can sign in on a new phone and keep everything. Nothing set up? A parent can make a new QR code for you in Family. Your money is never lost: it’s kept in the family, not on the phone. 📱',
    nl: 'Ga naar Me → Sign-in & devices en maak een gebruikersnaam en wachtwoord (of gebruik Google). Dan kun je op een nieuwe telefoon inloggen en blijft alles bewaard. Niks ingesteld? Een ouder kan in Family een nieuwe QR-code voor je maken. Je geld raakt nooit kwijt: het staat bij het gezin, niet op je telefoon. 📱',
    keys: [
      '*lost my phone', '*lose my phone', '*new phone', '*nieuwe telefoon', '*telefoon kwijt', 'phone', 'telefoon', 'mobiel',
      '*password', '*wachtwoord', '*login', 'log in', 'sign in', 'inloggen', 'username', 'gebruikersnaam', 'qr', 'pin',
      'pattern', 'lock', 'slot',
    ],
  },
  {
    id: 'learn',
    q: 'Where is Money school?',
    en: 'Money school has short lessons about money: why and how to save, how interest works, how to earn more and how to save for a goal. 🎓 Tap Help at the top of the app, then Money school. Each lesson takes about 3 minutes and ends with a short quiz. If your family uses points, kids get +5 XP the first time they finish a lesson.',
    nl: 'Money school heeft korte lessen over geld: waarom en hoe je spaart, hoe rente werkt, hoe je meer verdient en hoe je spaart voor een doel. 🎓 Tik bovenaan de app op Help en dan op Money school. Elke les duurt ongeveer 3 minuten en eindigt met een korte quiz. Gebruikt jullie gezin punten? Dan krijgen kinderen +5 XP de eerste keer dat ze een les afmaken.',
    keys: [
      '*money school', '*geldschool', '*lesson', '*lessons', '*les', '*lessen', '*quiz', '*learn', '*leren', 'cursus',
      'school', 'teach me', 'leer me', 'interest', 'rente',
    ],
    feature: 'learn',
  },
  {
    id: 'faith',
    q: 'Where are the Bible verses?',
    en: 'There’s a verse of the day on Home 🕊️, the same one for the whole family all day. In Money school there are also short reflections about faith, money and family. Tap “Read in the Bible App” to read the verse with the verses around it. Rather not see them? Everyone can switch them off for themselves: tap your avatar at the top right to open Me, then switch off “Show Bible verses”.',
    nl: 'Op Home staat een tekst van de dag 🕊️, de hele dag dezelfde voor het hele gezin. In Money school vind je ook korte overdenkingen over geloof, geld en gezin. Tik op “Read in the Bible App” om de tekst te lezen, met de verzen eromheen. Zie je ze liever niet? Iedereen kan ze voor zichzelf uitzetten: tik rechtsboven op je avatar om Me te openen en zet “Show Bible verses” uit.',
    keys: [
      '*bible', '*bijbel', '*verse', '*verses', '*bible verses', '*bijbeltekst', '*bijbelteksten', '*faith', '*geloof', '*verse of the day',
      '*tekst van de dag', 'bible app', 'bijbel app', 'hide verses', 'hide the verses', 'god', 'jesus', 'jezus', 'reflection',
      'reflections', 'overdenking', 'church', 'kerk', 'pray', 'bidden',
    ],
    feature: 'faith',
  },
  {
    id: 'tithing',
    q: 'What is tithing?',
    en: 'A tithe means a tenth: 10% of what you get. 🕊️ In the Bible, people gave the first tenth back to God, to say thank you for everything they had. It’s about a thankful, free heart, not about having to. Want to know more? Open Money school and look under the faith reflections. And ask your parents what our family does.',
    nl: 'Tiende betekent een tiende deel: 10% van wat je krijgt. 🕊️ In de Bijbel gaven mensen het eerste tiende deel terug aan God, als dank voor alles wat ze hadden. Het gaat om een dankbaar, vrij hart, niet om moeten. Wil je meer weten? Open Money school en kijk bij de overdenkingen over geloof. En vraag je ouders hoe ons gezin het doet.',
    keys: [
      '*tithe', '*tithes', '*tithing', '*tiende', '*tienden', '*tiende deel', 'a tenth', 'one tenth', 'tenth', 'give to god',
      'give to church', 'geven aan god', 'geven aan de kerk', 'offering', 'collecte',
    ],
    feature: 'faith',
  },
  {
    id: 'helper',
    q: 'Who answers my questions here?',
    en: 'I’m Pocket 🐷, the app’s helper. I explain how the app works. I can’t change your money or tasks — only grown-ups can do that. Your parents can read your questions, so for anything personal, just talk to them.',
    nl: 'Ik ben Pocket 🐷, de helper van de app. Ik leg uit hoe de app werkt. Ik kan je geld of taken niet veranderen — dat kunnen alleen volwassenen. Je ouders kunnen je vragen lezen, dus voor iets persoonlijks praat je gewoon met hen.',
    keys: ['*who are you', '*wie ben jij', '*wie ben je', 'are you real', 'ben je echt', 'ai', 'chatgpt', 'claude', 'helper', 'answers my', 'beantwoordt'],
    feature: 'ask',
  },
  {
    id: 'thanks',
    q: null,
    en: 'You’re welcome! 😊 Good luck with your tasks.',
    nl: 'Graag gedaan! 😊 Succes met je taken.',
    keys: ['*thanks', '*thank', '*thx', '*bedankt', '*dankje', '*dank je', '*dankjewel', '*merci', 'cool', 'nice', 'top'],
  },
  {
    id: 'hello',
    q: null,
    en: 'Hi! 👋 I’m Pocket. Ask me how the app works, like “How does saving work?” or “Why do I need a photo?”',
    nl: 'Hoi! 👋 Ik ben Pocket. Vraag me hoe de app werkt, bijvoorbeeld “Hoe werkt sparen?” of “Waarom moet ik een foto maken?”',
    keys: ['*hi', '*hello', '*hey', '*hallo', '*hoi', '*hee', 'good morning', 'goedemorgen', 'yo'],
  },
];

const DEFAULT = {
  en: 'Good question! I don’t know that one yet. 🤔 Try asking about tasks, photos, savings, fines or points. Or ask a parent — they know your family’s rules best.',
  nl: 'Goede vraag! Die weet ik nog niet. 🤔 Vraag me iets over taken, foto’s, sparen, boetes of punten. Of vraag het een ouder — die kent jullie regels het best.',
};
const EMPTY = {
  en: 'Ask me anything about how Sow & Grow works! 🐷',
  nl: 'Vraag me alles over hoe Sow & Grow werkt! 🐷',
};
const MAYBE_OFF = {
  en: ' (Don’t see this in the app? Your family may not use it yet.)',
  nl: ' (Zie je dit niet in de app? Dan gebruikt jullie gezin het misschien nog niet.)',
};

/** Lower case, no accents, only letters/digits/%/€ separated by single spaces. */
export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%€]+/g, ' ').trim();
}

interface Key { text: string; phrase: boolean; weight: number }
const INDEX: Key[][] = FAQ.map((e) => e.keys.flatMap((raw) => {
  const strong = raw.startsWith('*');
  const text = normalize(strong ? raw.slice(1) : raw);
  if (!text) return [];
  const phrase = text.includes(' ');
  return [{ text, phrase, weight: strong ? 3 : phrase ? 2 : 1 }];
}));

const NL_WORDS = new Set([
  'hoe', 'wat', 'waarom', 'wie', 'wanneer', 'waar', 'ik', 'mijn', 'jij', 'jouw', 'het', 'een', 'de', 'niet', 'werkt', 'kan', 'kun',
  'mag', 'moet', 'als', 'ben', 'heb', 'krijg', 'krijgen', 'van', 'voor', 'met', 'zijn', 'wordt', 'gebeurt', 'dat', 'er', 'geen',
  'ook', 'maar', 'nog', 'wel', 'hallo', 'hoi', 'bedankt', 'dank', 'geld', 'sparen', 'zakgeld', 'taak', 'taken', 'klusje', 'boete',
  'punten', 'kopen', 'uitgeven', 'rente', 'tijd', 'uitdaging', 'gemist', 'vergeten', 'mama', 'papa', 'oma', 'opa',
  'spaar', 'zou', 'les', 'leren', 'bijbel', 'geloof',
]);
const EN_WORDS = new Set([
  'how', 'what', 'why', 'who', 'when', 'where', 'i', 'my', 'you', 'your', 'the', 'a', 'an', 'not', 'does', 'do', 'can', 'are', 'if',
  'get', 'have', 'of', 'for', 'with', 'it', 'happens', 'hi', 'hello', 'thanks', 'money', 'task', 'tasks', 'mum', 'dad',
]);

/** Does the question look Dutch rather than English? */
export function isDutch(question: string): boolean {
  let nl = 0;
  let en = 0;
  for (const t of normalize(question).split(' ')) {
    if (NL_WORDS.has(t)) nl++;
    if (EN_WORDS.has(t)) en++;
  }
  return nl > en;
}

/** Matching FAQ entries, best first (on a tie the earlier entry wins). Empty when nothing matches. */
export function rankFaq(question: string): FaqEntry[] {
  const text = normalize(question);
  if (!text) return [];
  const tokens = text.split(' ');
  const padded = ` ${text} `;
  const hits: { i: number; score: number }[] = [];
  INDEX.forEach((keys, i) => {
    let score = 0;
    for (const k of keys) {
      const hit = k.phrase
        ? padded.includes(` ${k.text} `)
        : tokens.some((t) => (k.text.length >= 5 ? t.startsWith(k.text) : t === k.text));
      if (hit) score += k.weight;
    }
    if (score > 0) hits.push({ i, score });
  });
  return hits.sort((a, b) => b.score - a.score || a.i - b.i).map((h) => FAQ[h.i]);
}

/** The best matching FAQ entry, or null when nothing matches. */
export function matchFaq(question: string): FaqEntry | null {
  return rankFaq(question)[0] ?? null;
}

/**
 * A friendly built-in answer (English or Dutch, following the question). With `on`, answers about parts of the app
 * that are switched off are skipped (the next best match is used); without it they get a "may be off" note.
 */
export function localAnswer(question: string, on?: (key: FeatureKey) => boolean): string {
  const lang = isDutch(question) ? 'nl' : 'en';
  if (!normalize(question)) return EMPTY[lang];
  const hit = rankFaq(question).find((e) => !on || !e.feature || on(e.feature));
  if (!hit) return DEFAULT[lang];
  const optional = !on && hit.feature && hit.feature !== 'ask';
  return hit[lang] + (optional ? MAYBE_OFF[lang] : '');
}
