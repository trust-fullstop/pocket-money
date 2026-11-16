// =====================================================================
// Pocket Money — Supabase Edge Function `ask` ("Ask Pocket", the in-app helper, powered by Claude).
//
// Deploy:
//   supabase functions deploy ask
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...          (required; without it the app gets `ask_not_configured`)
//   supabase secrets set ASK_MODEL=claude-haiku-4-5            (optional, this is the default)
//   supabase secrets set ALLOWED_ORIGINS=https://a.example,https://b.example
//                                                              (optional; default: pocketmoney.nl-dot.com, the Pages
//                                                               preview and http://localhost:5173)
//   SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//   Keep JWT verification on (the default): only signed-in members can call this function.
//
// Flow: ask_begin (member's own JWT: feature switch, limits, stores the question as 'pending', returns the context)
//       → Claude (server-side key, never in the app) → ask_finish (service role only: stores answer or 'failed').
// Privacy: Claude gets the question plus role / relation / age / currency and the switched-on features — never
// names, the family name, balances or profile data. Parents can read every question in the app.
// Errors: JSON { error: code } with codes from src/lib/errors.ts.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_ORIGINS = 'https://pocketmoney.nl-dot.com,https://pocket-money-d6z.pages.dev,http://localhost:5173';
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean);
const MODEL = Deno.env.get('ASK_MODEL') || 'claude-haiku-4-5';

type Features = Record<string, boolean>;
interface Begin {
  id: string;
  member: { display_name: string; role: string; relation: string | null; age: number | null };
  family: { name: string; currency: string };
  features: Features;
}

// One line per switch (src/lib/types.ts FeatureKey); only the switched-on ones go into the prompt.
const FEATURES: Record<string, string> = {
  challenges: 'Challenges: anyone can challenge anyone — kids can challenge parents too, or do one together as a partnership; finishing earns points.',
  spotted: 'Spotted: a parent who sees something good (or not so good) can give a reward or a consequence on the spot, with a reason; grandparents can give gifts.',
  allowance: 'Pocket money: a fixed amount arrives every week.',
  requests: 'Requests: ask a parent to approve spending money (and, when switched on, taking money out of savings or using screen time).',
  savings: "Savings: move money from Spending to Savings at any time; taking it out again needs a parent's OK.",
  interest: 'Interest: savings grow a little every week — the more you save, the more it grows.',
  saver_rules: 'Saver rules: bonus points when savings grew this week; points off when you earned money but saved nothing and have nothing left.',
  goals: 'Goals: save up for something; the app shows progress and about how many weeks to go.',
  targets: 'Targets: reach a weekly or monthly target (for example 80% of tasks done) and a prize is paid automatically.',
  time: "Screen time: earn minutes (wifi, game, fun) with tasks and use them with a parent's OK.",
  points: 'Points: earned with tasks, challenges and good behaviour; they show effort.',
  calendar: 'Calendar: family events, reminders and birthdays.',
  emergency: 'Emergency card: important contacts and health info everyone in the family can see.',
  devices: "Devices: the family's list of phones, tablets, consoles and who uses them.",
  ask: 'Ask Pocket: this helper; parents can read the questions.',
};

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ALLOWED.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

const STATUS: Record<string, number> = {
  feature_off: 403, not_allowed: 403, ask_limit: 429, not_member: 401, not_signed_in: 401, invalid: 400,
};

function who(m: Begin['member']): string {
  const kind = m.role === 'kid' ? 'a child' : m.role === 'grandparent' ? 'a grandparent'
    : m.role === 'guardian' ? 'a guardian' : 'a parent';
  const rel = m.relation ? ` (${m.relation})` : '';
  const age = m.age != null ? `, ${m.age} years old` : ', age unknown';
  return `${kind}${rel}${age}`;
}

function systemPrompt(ctx: Begin): string {
  const on = Object.keys(FEATURES).filter((k) => ctx.features?.[k]).map((k) => `- ${FEATURES[k]}`);
  return [
    'You are "Pocket", the friendly helper inside a PRIVATE family pocket-money app. A member of the family asks you',
    'how the app works. Explain HOW it works and WHY: cause and effect. Doing tasks earns rewards; a missed task can cost',
    'something — responsibility and rewards go together. Saving makes money grow. Challenges go both ways: kids can',
    'challenge their parents too — the family is a partnership, not a punishment app.',
    '',
    `Who is asking: ${who(ctx.member)}. The family's currency is ${ctx.family?.currency ?? 'EUR'}.`,
    '',
    'Always available: Tasks (chores) — a parent sets a task with a reward and maybe a penalty; do it before the due time,',
    'show a photo or note if asked, a parent approves and the reward is paid; a missed task can cost the penalty, and a',
    'parent can excuse it (for example when you were ill). Every change is in the history; parents can undo mistakes.',
    '',
    'Switched ON in this family (talk ONLY about these and the tasks above; if asked about anything else in the app, say it',
    'is not switched on and the parents can decide to switch it on):',
    ...(on.length ? on : ['- (nothing extra)']),
    '',
    'Rules:',
    '- Reply in the language of the question (Dutch or English).',
    '- Short: at most 120 words. Plain text, no headings or tables.',
    "- Match the asker's age: simple words and short sentences for young children.",
    '- Warm and encouraging. Never shame or blame anyone.',
    '- Never decide about money, rewards, penalties, rules or disputes, and never promise anything: say "ask a parent"',
    '  ("vraag het aan je ouders") for decisions.',
    '- No medical, legal or investment advice; only simple saving tips (save a part of what you get, set a goal).',
    '- If a question is unsafe, adult or upsetting, or not about the app, money or family tasks, kindly decline and',
    '  suggest talking to a parent or another trusted adult.',
    '- Never ask for personal data (address, school, phone numbers, passwords) and never repeat personal data the asker',
    '  shares.',
    '- When relevant (private or worrying topics), mention that parents can read the questions asked here.',
  ].join('\n');
}

async function callClaude(key: string, ctx: Begin, question: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt(ctx),
      messages: [{ role: 'user', content: question }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const answer = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  if (!answer) throw new Error('anthropic: empty answer');
  return answer;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'invalid' });

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req, 401, { error: 'not_signed_in' });

  let question = '';
  try {
    const body = (await req.json()) as { question?: unknown };
    question = typeof body?.question === 'string' ? body.question : '';
  } catch {
    return json(req, 400, { error: 'invalid' });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: noSession,
  });
  const finish = async (id: string, answer: string | null, status: 'answered' | 'failed', model: string | null) => {
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: noSession });
    const { error } = await service.rpc('ask_finish', { p_id: id, p_answer: answer, p_status: status, p_model: model });
    if (error) console.error('ask_finish', id, status, error.message);
  };

  // ask_begin raises the app's error codes as the Postgres message (detail = which switch / limit)
  const { data, error } = await user.rpc('ask_begin', { p_question: question });
  if (error) {
    const code = (error.message ?? '').trim();
    if (Object.hasOwn(STATUS, code)) return json(req, STATUS[code], { error: code });
    if (/jwt|token/i.test(code)) return json(req, 401, { error: 'not_signed_in' });
    console.error('ask_begin', error.message);
    return json(req, 500, { error: 'unknown' });
  }
  const ctx = data as Begin;

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) {
    await finish(ctx.id, null, 'failed', null);
    return json(req, 503, { error: 'ask_not_configured' });
  }

  let answer: string;
  try {
    answer = await callClaude(key, ctx, question.trim());
  } catch (e) {
    console.error('claude', e instanceof Error ? e.message : String(e));
    await finish(ctx.id, null, 'failed', MODEL);
    return json(req, 502, { error: 'unknown' });
  }
  await finish(ctx.id, answer, 'answered', MODEL);
  return json(req, 200, { id: ctx.id, answer });
});
