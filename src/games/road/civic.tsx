import { useState } from 'react';
import { GameAction } from '../../types';
import { cn } from '../../lib/utils';
import { CheckCircle2, XCircle, Landmark, Hammer, Repeat, HandCoins, GraduationCap, ChevronRight, ScrollText } from 'lucide-react';
import { buildDeck, CATEGORIES, CATEGORY_META, Category, dealFromCategory, randomCategory } from './questions';
import {
  BotPersona,
  CivicPlayer,
  CivicState,
  DIFFICULTY_ACCURACY,
  Difficulty,
  Players,
  SubResult,
  TradeOffer,
} from './types';

// ---------------------------------------------------------------------------
// The Civic Path (a Road to Citizenship sub-game). A strategic board game for
// 1–6 players (fill empty seats with bots). On your turn you answer a random
// civics question to earn a resource card in that category; collect a full set
// (one of each of History / Geography / Legislative / Rights) to build a Civic
// Milestone. Trade with the bank (4:1) or negotiate with other players to
// complete your sets. Build 3 milestones to unlock the citizenship exam, then
// answer 6 of 10 official USCIS questions to win.
//
// Bots have difficulty tiers (Novice / Citizen / Scholar set the odds they
// answer correctly) and personas — "Govbot-y" aggressively hoards Legislative &
// History cards, forcing humans to adapt.
// ---------------------------------------------------------------------------

const MILESTONES_TO_EXAM = 3;
const EXAM_QUESTIONS = 10;
const EXAM_PASS = 6;
const BANK_RATE = 4; // give 4 of one category to the bank for 1 of another

// Offline sessions seat bots as cpu0/cpu1…, online as bot-N — cover both.
const looksLikeBot = (id: string) => id.startsWith('bot-') || id.startsWith('cpu');

const emptyResources = (): Record<Category, number> => ({ history: 0, geography: 0, legislative: 0, rights: 0 });
const hasFullSet = (r: Record<Category, number>) => CATEGORIES.every((c) => r[c] >= 1);
const totalCards = (r: Record<Category, number>) => CATEGORIES.reduce((n, c) => n + r[c], 0);

// Distinct personas handed to bots in seating order (Govbot-y always first).
const PERSONA_ORDER: BotPersona[] = ['govboty', 'scholar', 'trader', 'balanced'];
const PERSONA_META: Record<BotPersona, { name: string; blurb: string }> = {
  govboty: { name: 'Govbot-y', blurb: 'Hoards Legislative & History' },
  scholar: { name: 'Scholar Bot', blurb: 'Plays the long game' },
  trader: { name: 'Trader Bot', blurb: 'Loves a deal' },
  balanced: { name: 'Civic Bot', blurb: 'Steady and balanced' },
};

const say = (log: string[], line: string) => [...log, line].slice(-8);

// ---- setup ----------------------------------------------------------------

export function civicStart(players: Players, difficulty: Difficulty): CivicState {
  const order = Object.keys(players);
  const civicPlayers: Record<string, CivicPlayer> = {};
  let botN = 0;
  for (const id of order) {
    const bot = looksLikeBot(id);
    civicPlayers[id] = {
      resources: emptyResources(),
      milestones: 0,
      passedExam: false,
      bot,
      persona: bot ? PERSONA_ORDER[botN++ % PERSONA_ORDER.length] : null,
    };
  }
  const firstCat = randomCategory();
  return {
    order,
    turn: 0,
    phase: 'question',
    question: dealFromCategory(firstCat),
    questionCategory: firstCat,
    lastQuestionCorrect: null,
    players: civicPlayers,
    difficulty,
    trade: null,
    exam: null,
    log: ['The path to citizenship begins — answer a question to earn a resource.'],
  };
}

const currentId = (s: CivicState) => s.order[s.turn];
export const displayName = (players: Players, id: string) => players[id]?.name ?? 'Player';

function beginTurn(s: CivicState): CivicState {
  const cat = randomCategory();
  return {
    ...s,
    turn: (s.turn + 1) % s.order.length,
    phase: 'question',
    question: dealFromCategory(cat),
    questionCategory: cat,
    lastQuestionCorrect: null,
    trade: null,
  };
}

// ---- reducer --------------------------------------------------------------

export function civicReducer(
  state: CivicState,
  players: Players,
  pid: string,
  action: GameAction,
): SubResult<CivicState> {
  const cur = currentId(state);

  // Trade responses can come from the target even when it isn't their turn.
  if (action.type === 'respondTrade') {
    const t = state.trade;
    if (!t || t.to !== pid) return { state };
    if (!action.accept) return { state: { ...state, trade: null, log: say(state.log, `${displayName(players, pid)} declined the trade.`) } };
    return { state: applyTrade(state, players, t) };
  }
  if (action.type === 'cancelTrade') {
    if (!state.trade || (state.trade.from !== pid && state.trade.to !== pid)) return { state };
    return { state: { ...state, trade: null } };
  }

  // Everything else is the current player's move.
  if (pid !== cur) return { state };

  switch (state.phase) {
    case 'question': {
      if (action.type !== 'answer') return { state };
      const q = state.question;
      if (!q) return { state };
      const opt = action.option;
      if (typeof opt !== 'number') return { state };
      const correct = opt === q.correctIndex;
      const p = state.players[pid];
      const resources = { ...p.resources };
      const cat = state.questionCategory!;
      if (correct) resources[cat] += 1;
      const players2 = { ...state.players, [pid]: { ...p, resources } };
      const log = say(
        state.log,
        correct
          ? `${displayName(players, pid)} answered correctly — +1 ${CATEGORY_META[cat].label} ${CATEGORY_META[cat].emoji}`
          : `${displayName(players, pid)} missed the ${CATEGORY_META[cat].label} question — no card.`,
      );
      return { state: { ...state, players: players2, phase: 'action', lastQuestionCorrect: correct, log } };
    }

    case 'action': {
      const p = state.players[pid];
      switch (action.type) {
        case 'build': {
          if (p.milestones >= MILESTONES_TO_EXAM || !hasFullSet(p.resources)) return { state };
          const resources = { ...p.resources };
          for (const c of CATEGORIES) resources[c] -= 1;
          const players2 = { ...state.players, [pid]: { ...p, resources, milestones: p.milestones + 1 } };
          return {
            state: {
              ...state,
              players: players2,
              log: say(state.log, `${displayName(players, pid)} built a Civic Milestone! (${p.milestones + 1}/${MILESTONES_TO_EXAM})`),
            },
          };
        }
        case 'bankTrade': {
          const from = action.from as Category;
          const to = action.to as Category;
          if (!CATEGORIES.includes(from) || !CATEGORIES.includes(to) || from === to) return { state };
          if (p.resources[from] < BANK_RATE) return { state };
          const resources = { ...p.resources, [from]: p.resources[from] - BANK_RATE, [to]: p.resources[to] + 1 };
          const players2 = { ...state.players, [pid]: { ...p, resources } };
          return {
            state: {
              ...state,
              players: players2,
              log: say(state.log, `${displayName(players, pid)} traded ${BANK_RATE} ${CATEGORY_META[from].emoji} to the bank for 1 ${CATEGORY_META[to].emoji}`),
            },
          };
        }
        case 'proposeTrade': {
          if (state.trade) return { state };
          const offer = normalizeOffer(pid, action);
          if (!offer || offer.to === pid || !state.players[offer.to]) return { state };
          if (!canAfford(p.resources, offer.give)) return { state };
          return { state: { ...state, trade: offer, log: say(state.log, `${displayName(players, pid)} proposed a trade to ${displayName(players, offer.to)}.`) } };
        }
        case 'takeExam': {
          if (p.milestones < MILESTONES_TO_EXAM || state.exam) return { state };
          return {
            state: {
              ...state,
              phase: 'exam',
              exam: { taker: pid, deck: buildDeck(EXAM_QUESTIONS), index: 0, correct: 0, lastAnswer: null },
              log: say(state.log, `${displayName(players, pid)} is taking the citizenship exam!`),
            },
          };
        }
        case 'endTurn':
          return { state: beginTurn(state) };
        default:
          return { state };
      }
    }

    case 'exam': {
      if (action.type !== 'examAnswer') return { state };
      const ex = state.exam;
      if (!ex || ex.taker !== pid) return { state };
      const q = ex.deck[ex.index];
      const opt = action.option;
      if (typeof opt !== 'number' || !q) return { state };
      const correct = ex.correct + (opt === q.correctIndex ? 1 : 0);
      const index = ex.index + 1;

      if (correct >= EXAM_PASS) {
        const players2 = { ...state.players, [pid]: { ...state.players[pid], passedExam: true } };
        return {
          state: { ...state, players: players2, exam: { ...ex, index, correct, lastAnswer: opt }, log: say(state.log, `🎉 ${displayName(players, pid)} passed the exam and became a citizen!`) },
          status: 'gameover',
          winnerId: pid,
        };
      }
      const remaining = EXAM_QUESTIONS - index;
      if (correct + remaining < EXAM_PASS) {
        // Can no longer reach 6 — fail the exam, lose a milestone, back to actions.
        const p = state.players[pid];
        const players2 = { ...state.players, [pid]: { ...p, milestones: Math.max(0, p.milestones - 1) } };
        return {
          state: {
            ...state,
            players: players2,
            phase: 'action',
            exam: null,
            log: say(state.log, `${displayName(players, pid)} didn't pass (${correct}/${EXAM_QUESTIONS}) — lost a milestone. Regroup and try again.`),
          },
        };
      }
      return { state: { ...state, exam: { ...ex, index, correct, lastAnswer: opt } } };
    }

    default:
      return { state };
  }
}

function normalizeOffer(from: string, action: GameAction): TradeOffer | null {
  const to = action.to;
  if (typeof to !== 'string') return null;
  const clean = (v: unknown): Partial<Record<Category, number>> => {
    const out: Partial<Record<Category, number>> = {};
    if (v && typeof v === 'object') {
      for (const c of CATEGORIES) {
        const n = (v as Record<string, unknown>)[c];
        if (typeof n === 'number' && n > 0) out[c] = Math.floor(n);
      }
    }
    return out;
  };
  const give = clean(action.give);
  const want = clean(action.want);
  if (totalOf(give) === 0 && totalOf(want) === 0) return null;
  return { from, to, give, want };
}

const totalOf = (r: Partial<Record<Category, number>>) => CATEGORIES.reduce((n, c) => n + (r[c] ?? 0), 0);
const canAfford = (have: Record<Category, number>, cost: Partial<Record<Category, number>>) =>
  CATEGORIES.every((c) => have[c] >= (cost[c] ?? 0));

function applyTrade(state: CivicState, players: Players, t: TradeOffer): CivicState {
  const from = state.players[t.from];
  const to = state.players[t.to];
  if (!from || !to || !canAfford(from.resources, t.give) || !canAfford(to.resources, t.want)) {
    return { ...state, trade: null, log: say(state.log, 'That trade fell through — someone was short a card.') };
  }
  const fr = { ...from.resources };
  const tr = { ...to.resources };
  for (const c of CATEGORIES) {
    const g = t.give[c] ?? 0;
    const w = t.want[c] ?? 0;
    fr[c] = fr[c] - g + w;
    tr[c] = tr[c] - w + g;
  }
  return {
    ...state,
    players: { ...state.players, [t.from]: { ...from, resources: fr }, [t.to]: { ...to, resources: tr } },
    trade: null,
    log: say(state.log, `${displayName(players, t.from)} and ${displayName(players, t.to)} made a trade. 🤝`),
  };
}

// ---- bots -----------------------------------------------------------------

export function civicBot(state: CivicState, botId: string): GameAction | null {
  const me = state.players[botId];
  if (!me) return null;

  // Respond to a trade offered to me (even out of turn).
  if (state.trade && state.trade.to === botId) {
    return { type: 'respondTrade', accept: botTradeAccepts(state, botId) };
  }

  // Only act on my own turn otherwise.
  if (currentId(state) !== botId) return null;

  const acc = DIFFICULTY_ACCURACY[state.difficulty];

  if (state.phase === 'question') {
    const q = state.question;
    if (!q || q.correctIndex < 0) return null;
    if (Math.random() < acc) return { type: 'answer', option: q.correctIndex };
    const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
    return { type: 'answer', option: wrong[Math.floor(Math.random() * wrong.length)] };
  }

  if (state.phase === 'exam') {
    const ex = state.exam;
    if (!ex || ex.taker !== botId) return null;
    const q = ex.deck[ex.index];
    if (!q || q.correctIndex < 0) return null;
    if (Math.random() < acc) return { type: 'examAnswer', option: q.correctIndex };
    const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
    return { type: 'examAnswer', option: wrong[Math.floor(Math.random() * wrong.length)] };
  }

  // action phase
  if (me.milestones >= MILESTONES_TO_EXAM) return { type: 'takeExam' };
  if (hasFullSet(me.resources)) return { type: 'build' };

  // Bank-trade a surplus into a missing category when possible. Govbot-y refuses
  // to give away Legislative or History.
  const hoard: Category[] = me.persona === 'govboty' ? ['legislative', 'history'] : [];
  const missing = CATEGORIES.filter((c) => me.resources[c] === 0);
  const surplus = CATEGORIES.filter((c) => me.resources[c] >= BANK_RATE && !hoard.includes(c));
  if (missing.length && surplus.length) {
    // Prefer converting toward a needed category (Govbot-y prefers its hoard).
    const want = me.persona === 'govboty'
      ? (missing.find((c) => hoard.includes(c)) ?? missing[0])
      : missing[0];
    return { type: 'bankTrade', from: surplus[0], to: want };
  }

  return { type: 'endTurn' };
}

// Accept a trade if it hands the bot a category it's missing and it can afford
// the ask. Govbot-y will never give up Legislative/History and only trades to
// gain them.
function botTradeAccepts(state: CivicState, botId: string): boolean {
  const t = state.trade!;
  const me = state.players[botId];
  if (!canAfford(me.resources, t.want)) return false; // t.want is what the bot gives up
  if (me.persona === 'govboty') {
    const givesHoard = (t.want.legislative ?? 0) > 0 || (t.want.history ?? 0) > 0;
    const gainsHoard = (t.give.legislative ?? 0) > 0 || (t.give.history ?? 0) > 0;
    return gainsHoard && !givesHoard;
  }
  // Gains at least one category it currently lacks.
  return CATEGORIES.some((c) => (t.give[c] ?? 0) > 0 && me.resources[c] === 0);
}

// ---- redact ---------------------------------------------------------------

export function civicRedact(state: CivicState, viewerId: string): CivicState {
  // Hide the turn question's answer until the current player has answered it.
  let question = state.question;
  if (question && state.phase === 'question') {
    question = { ...question, correctIndex: -1, explanation: '' };
  }
  // Hide exam answers: everything for a non-taker; unanswered ones for the taker.
  let exam = state.exam;
  if (exam) {
    const isTaker = exam.taker === viewerId;
    exam = {
      ...exam,
      deck: exam.deck.map((q, i) => (isTaker && i < exam!.index ? q : { ...q, correctIndex: -1, explanation: '' })),
    };
  }
  return { ...state, question, exam };
}

export function civicGameOverMessage(state: CivicState, players: Players, winnerId: string | null, myId: string): string {
  if (winnerId === myId) return '🗽 You passed the exam and became a U.S. citizen — you win!';
  if (winnerId) return `${displayName(players, winnerId)} became a citizen first and wins the game!`;
  return 'The path ends here.';
}

// ---- board ----------------------------------------------------------------

interface CivicBoardProps {
  state: CivicState;
  players: Players;
  myId: string;
  dispatch: (a: GameAction) => void;
}

function ResourceRow({ resources }: { resources: Record<Category, number> }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CATEGORIES.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1 px-2 py-0.5 border border-[#39414E] bg-[#0F1117] text-xs font-mono"
          style={{ color: CATEGORY_META[c].color }}
          title={CATEGORY_META[c].label}
        >
          {CATEGORY_META[c].emoji}
          <span className="font-bold text-[#F5F6F7]">{resources[c]}</span>
        </span>
      ))}
    </div>
  );
}

function Journey({ milestones }: { milestones: number }) {
  const stops = ['Start', '⭐', '⭐', '⭐', '📝'];
  return (
    <div className="flex items-center gap-1">
      {stops.map((s, i) => {
        const reached = i <= milestones;
        return (
          <div key={i} className="flex items-center gap-1">
            <span className={cn('text-[10px] w-5 h-5 flex items-center justify-center border', reached ? 'border-[#06D6A0] bg-[#06D6A0]/15' : 'border-[#39414E] text-[#E2E4E8]')}>
              {i === 0 ? '' : s}
            </span>
            {i < stops.length - 1 && <span className={cn('w-2 h-px', reached ? 'bg-[#06D6A0]' : 'bg-[#39414E]')} />}
          </div>
        );
      })}
    </div>
  );
}

// A compact multiple-choice question card used for both the turn question and
// the exam. `showResult` reveals the correct answer once the viewer has picked.
function QuestionCard({
  title,
  q,
  disabled,
  chosen,
  onPick,
}: {
  title: string;
  q: { question: string; options: string[]; correctIndex: number; explanation: string };
  disabled: boolean;
  chosen: number | null;
  onPick: (i: number) => void;
}) {
  const revealed = chosen !== null && q.correctIndex >= 0;
  return (
    <div>
      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#3A86FF] mb-2">{title}</div>
      <h3 className="text-xl md:text-2xl font-bold text-[#F5F6F7] mb-5 leading-tight">{q.question}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {q.options.map((opt, i) => {
          const isChosen = chosen === i;
          const isCorrect = revealed && q.correctIndex === i;
          let sc = 'bg-[#262B34] border-[#39414E] text-[#E2E4E8] hover:bg-[#323A47]';
          let icon = null;
          if (revealed) {
            if (isCorrect) { sc = 'bg-[#06D6A0]/15 border-[#06D6A0] text-[#F5F6F7]'; icon = <CheckCircle2 className="text-[#06D6A0]" size={20} />; }
            else if (isChosen) { sc = 'bg-[#E63946]/15 border-[#E63946] text-[#F5F6F7]'; icon = <XCircle className="text-[#E63946]" size={20} />; }
            else sc = 'bg-[#262B34] border-[#2E343F] text-[#E2E4E8]';
          } else if (isChosen) sc = 'bg-[#3A86FF]/15 border-[#3A86FF] text-[#F5F6F7]';
          return (
            <button
              key={i}
              disabled={disabled || chosen !== null}
              onClick={() => onPick(i)}
              className={cn('relative flex items-center justify-between text-left p-4 border-2 font-semibold transition-all', !(disabled || chosen !== null) && 'hover:-translate-y-0.5 cursor-pointer', sc)}
            >
              <span className="flex-1 pr-3">{opt}</span>
              {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CivicBoard({ state, players, myId, dispatch }: CivicBoardProps) {
  const cur = state.order[state.turn];
  const isMyTurn = cur === myId;
  const me = state.players[myId];
  const curName = displayName(players, cur);
  const [chosen, setChosen] = useState<number | null>(null);

  // A locally tracked pick for question/exam cards; reset when the question changes.
  const pick = (i: number, kind: 'answer' | 'examAnswer') => {
    setChosen(i);
    dispatch({ type: kind, option: i });
    // Clear shortly so the next question starts fresh (host state advances too).
    setTimeout(() => setChosen(null), 900);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      {/* Turn banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#F5F6F7]">
          <Landmark className="w-5 h-5 text-[#E63946]" />
          {isMyTurn ? 'Your turn' : `${curName}'s turn`}
          <span className="text-[10px] font-mono text-[#E2E4E8]">· {state.phase}</span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] border border-[#39414E] px-2 py-1">
          Bots: {state.difficulty}
        </span>
      </div>

      {/* Players */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {state.order.map((id) => {
          const cp = state.players[id];
          return (
            <div key={id} className={cn('p-3 border-2 bg-[#1A1D24] space-y-2', id === cur ? 'border-[#E63946]' : 'border-[#39414E]')}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#F5F6F7] uppercase tracking-wider text-sm truncate">
                  {displayName(players, id)}
                  {id === myId && <span className="text-[#E63946] text-[10px]"> ·you</span>}
                  {cp.persona && <span className="text-[#06D6A0] text-[10px] normal-case tracking-normal"> · {PERSONA_META[cp.persona].name}</span>}
                </span>
                <span className="text-[10px] font-mono text-[#E2E4E8]">⭐{cp.milestones}/{MILESTONES_TO_EXAM}</span>
              </div>
              <ResourceRow resources={cp.resources} />
              <Journey milestones={cp.milestones} />
            </div>
          );
        })}
      </div>

      {/* Incoming trade offer (I'm the target) */}
      {state.trade && state.trade.to === myId && (
        <div className="border-2 border-[#E9C46A] bg-[#E9C46A]/10 p-4 space-y-3">
          <div className="text-sm font-bold text-[#F5F6F7]">
            {displayName(players, state.trade.from)} offers you {fmtCards(state.trade.give)} for your {fmtCards(state.trade.want)}
          </div>
          <div className="flex gap-3">
            <button onClick={() => dispatch({ type: 'respondTrade', accept: true })} className="px-5 py-2 bg-[#06D6A0] text-[#0F1117] font-bold border-2 border-[#39414E] uppercase tracking-widest text-xs">Accept</button>
            <button onClick={() => dispatch({ type: 'respondTrade', accept: false })} className="px-5 py-2 bg-[#262B34] text-[#F5F6F7] font-bold border-2 border-[#39414E] uppercase tracking-widest text-xs">Decline</button>
          </div>
        </div>
      )}
      {state.trade && state.trade.from === myId && (
        <div className="border-2 border-[#39414E] bg-[#1A1D24] p-3 text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">
          Waiting on {displayName(players, state.trade.to)} to answer your trade…
          <button onClick={() => dispatch({ type: 'cancelTrade' })} className="ml-3 underline">cancel</button>
        </div>
      )}

      {/* Main action area */}
      <div className="bg-[#1A1D24] border-2 border-[#39414E] shadow-[6px_6px_0px_#454C5A] p-6">
        {/* QUESTION PHASE */}
        {state.phase === 'question' && state.question && (
          isMyTurn ? (
            <QuestionCard
              title={`Answer to earn a ${CATEGORY_META[state.questionCategory!].label} ${CATEGORY_META[state.questionCategory!].emoji} card`}
              q={state.question}
              disabled={false}
              chosen={chosen}
              onPick={(i) => pick(i, 'answer')}
            />
          ) : (
            <p className="text-center text-sm font-mono uppercase tracking-widest text-[#E2E4E8] py-8">{curName} is answering a {CATEGORY_META[state.questionCategory!].label} question…</p>
          )
        )}

        {/* ACTION PHASE */}
        {state.phase === 'action' && (
          isMyTurn ? (
            <ActionPanel state={state} players={players} me={me} dispatch={dispatch} />
          ) : (
            <p className="text-center text-sm font-mono uppercase tracking-widest text-[#E2E4E8] py-8">{curName} is planning their move…</p>
          )
        )}

        {/* EXAM PHASE */}
        {state.phase === 'exam' && state.exam && (
          state.exam.taker === myId ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">
                <span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-[#E63946]" /> Exam {Math.min(state.exam.index + 1, EXAM_QUESTIONS)}/{EXAM_QUESTIONS}</span>
                <span>{state.exam.correct} correct · need {EXAM_PASS}</span>
              </div>
              {state.exam.deck[state.exam.index] && (
                <QuestionCard title="Citizenship exam" q={state.exam.deck[state.exam.index]} disabled={false} chosen={chosen} onPick={(i) => pick(i, 'examAnswer')} />
              )}
            </div>
          ) : (
            <p className="text-center text-sm font-mono uppercase tracking-widest text-[#E2E4E8] py-8">
              <GraduationCap className="w-5 h-5 inline mr-2 text-[#E63946]" />
              {displayName(players, state.exam.taker)} is taking the exam — {state.exam.correct} right so far ({state.exam.index}/{EXAM_QUESTIONS})
            </p>
          )
        )}
      </div>

      {/* Activity log */}
      <div className="border-2 border-[#2E343F] bg-[#0F1117] p-3">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-1"><ScrollText className="w-3 h-3" /> Activity</div>
        <ul className="space-y-0.5">
          {state.log.slice(-4).map((l, i) => (
            <li key={i} className="text-xs text-[#E2E4E8] leading-snug">{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function fmtCards(r: Partial<Record<Category, number>>): string {
  const parts = CATEGORIES.filter((c) => (r[c] ?? 0) > 0).map((c) => `${r[c]}${CATEGORY_META[c].emoji}`);
  return parts.length ? parts.join(' ') : 'nothing';
}

function ActionPanel({ state, players, me, dispatch }: { state: CivicState; players: Players; me: CivicPlayer; dispatch: (a: GameAction) => void }) {
  const canBuild = me.milestones < MILESTONES_TO_EXAM && hasFullSet(me.resources);
  const canExam = me.milestones >= MILESTONES_TO_EXAM;
  const [showTrade, setShowTrade] = useState(false);

  return (
    <div className="space-y-4">
      {state.lastQuestionCorrect !== null && (
        <p className={cn('text-sm font-bold', state.lastQuestionCorrect ? 'text-[#06D6A0]' : 'text-[#E63946]')}>
          {state.lastQuestionCorrect ? 'Nice — resource earned. Now make your moves.' : 'No card this time. Trade or build with what you have.'}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button disabled={!canBuild} onClick={() => dispatch({ type: 'build' })}
          className={cn('flex items-center gap-2 px-4 py-3 border-2 font-bold uppercase tracking-widest text-xs transition-all', canBuild ? 'bg-[#06D6A0] text-[#0F1117] border-[#39414E] hover:-translate-y-0.5' : 'bg-[#262B34] text-[#E2E4E8] border-[#2E343F] cursor-not-allowed')}>
          <Hammer className="w-4 h-4" /> Build Milestone
        </button>
        <button disabled={!!state.trade} onClick={() => setShowTrade((s) => !s)}
          className="flex items-center gap-2 px-4 py-3 border-2 border-[#39414E] bg-[#262B34] text-[#F5F6F7] font-bold uppercase tracking-widest text-xs hover:-translate-y-0.5 transition-all disabled:cursor-not-allowed">
          <HandCoins className="w-4 h-4" /> Trade
        </button>
        {canExam && (
          <button onClick={() => dispatch({ type: 'takeExam' })}
            className="flex items-center gap-2 px-4 py-3 border-2 border-[#E63946] bg-[#E63946] text-white font-bold uppercase tracking-widest text-xs hover:-translate-y-0.5 transition-all">
            <GraduationCap className="w-4 h-4" /> Take the Exam
          </button>
        )}
        <button onClick={() => dispatch({ type: 'endTurn' })}
          className="flex items-center gap-2 px-4 py-3 border-2 border-[#39414E] bg-[#1A1D24] text-[#E2E4E8] font-bold uppercase tracking-widest text-xs hover:text-[#F5F6F7] ml-auto transition-all">
          End Turn <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">
        Build costs one of each: {CATEGORIES.map((c) => CATEGORY_META[c].emoji).join(' ')} · bank trade is {BANK_RATE}-of-a-kind → 1
      </p>
      {showTrade && <TradeForm state={state} players={players} me={me} dispatch={dispatch} onClose={() => setShowTrade(false)} />}
    </div>
  );
}

function TradeForm({ state, players, me, dispatch, onClose }: { state: CivicState; players: Players; me: CivicPlayer; dispatch: (a: GameAction) => void; onClose: () => void }) {
  const others = state.order.filter((id) => id !== state.order[state.turn]);
  const [to, setTo] = useState(others[0] ?? '');
  const [give, setGive] = useState<Record<Category, number>>(emptyResources());
  const [want, setWant] = useState<Record<Category, number>>(emptyResources());

  const bump = (setter: typeof setGive, cur: Record<Category, number>, c: Category, d: number, cap?: number) => {
    const n = Math.max(0, Math.min(cap ?? 99, cur[c] + d));
    setter({ ...cur, [c]: n });
  };

  const bankMode = !others.length;

  return (
    <div className="border-2 border-[#39414E] bg-[#0F1117] p-4 space-y-4">
      {/* Bank trade shortcut */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-2 flex items-center gap-2"><Repeat className="w-3 h-3" /> Bank trade ({BANK_RATE} → 1)</div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((from) =>
            CATEGORIES.filter((t) => t !== from).map((toCat) => (
              me.resources[from] >= BANK_RATE ? (
                <button key={from + toCat} onClick={() => dispatch({ type: 'bankTrade', from, to: toCat })}
                  className="px-2 py-1 border border-[#39414E] bg-[#262B34] text-[11px] font-mono text-[#F5F6F7] hover:bg-[#323A47]">
                  {BANK_RATE}{CATEGORY_META[from].emoji}→{CATEGORY_META[toCat].emoji}
                </button>
              ) : null
            )),
          )}
          {CATEGORIES.every((c) => me.resources[c] < BANK_RATE) && (
            <span className="text-[11px] font-mono text-[#E2E4E8]">Need {BANK_RATE} of one kind to bank-trade.</span>
          )}
        </div>
      </div>

      {!bankMode && (
        <div className="space-y-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] flex items-center gap-2"><HandCoins className="w-3 h-3" /> Offer a player</div>
          <label className="flex items-center gap-2 text-xs text-[#E2E4E8]">
            To:
            <select value={to} onChange={(e) => setTo(e.target.value)} className="bg-[#262B34] border border-[#39414E] text-[#F5F6F7] px-2 py-1 text-xs">
              {others.map((id) => <option key={id} value={id}>{displayName(players, id)}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase text-[#E2E4E8] mb-1">You give</div>
              {CATEGORIES.map((c) => (
                <div key={c} className="flex items-center justify-between text-xs text-[#E2E4E8] mb-1">
                  <span>{CATEGORY_META[c].emoji} {give[c]}<span className="text-[#E2E4E8]"> /{me.resources[c]}</span></span>
                  <span className="flex gap-1">
                    <button onClick={() => bump(setGive, give, c, -1)} className="w-5 h-5 border border-[#39414E] bg-[#262B34]">–</button>
                    <button onClick={() => bump(setGive, give, c, +1, me.resources[c])} className="w-5 h-5 border border-[#39414E] bg-[#262B34]">+</button>
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-[#E2E4E8] mb-1">You want</div>
              {CATEGORIES.map((c) => (
                <div key={c} className="flex items-center justify-between text-xs text-[#E2E4E8] mb-1">
                  <span>{CATEGORY_META[c].emoji} {want[c]}</span>
                  <span className="flex gap-1">
                    <button onClick={() => bump(setWant, want, c, -1)} className="w-5 h-5 border border-[#39414E] bg-[#262B34]">–</button>
                    <button onClick={() => bump(setWant, want, c, +1)} className="w-5 h-5 border border-[#39414E] bg-[#262B34]">+</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!to || (totalCards(give) === 0 && totalCards(want) === 0)}
              onClick={() => { dispatch({ type: 'proposeTrade', to, give, want }); onClose(); }}
              className="px-4 py-2 bg-[#3A86FF] text-white font-bold border-2 border-[#39414E] uppercase tracking-widest text-xs disabled:cursor-not-allowed">
              Send offer
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-[#262B34] text-[#E2E4E8] font-bold border-2 border-[#39414E] uppercase tracking-widest text-xs">Close</button>
          </div>
        </div>
      )}
      {bankMode && (
        <button onClick={onClose} className="px-4 py-2 bg-[#262B34] text-[#E2E4E8] font-bold border-2 border-[#39414E] uppercase tracking-widest text-xs">Close</button>
      )}
    </div>
  );
}
