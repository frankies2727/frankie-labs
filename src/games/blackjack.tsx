import { useEffect, useState } from 'react';
import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';

// A neon, suit-less take on Blackjack for 2–5 players (mix friends and bots).
// Each hand everyone builds toward 21; the best non-bust hand takes the round.
// Two ways to play, chosen in the lobby:
//   • Casino  — everyone starts with 1,000 in chips of mixed denominations,
//               bets before each hand, and the winner rakes the pot. Bust the
//               table (leave one player with chips) to win.
//   • Rounds  — no chips; play 15 hands and whoever wins the most rounds takes
//               the match.
// Cards are plain ranks on vivid gradients — no hearts or spades.

type Mode = 'rounds' | 'casino';
const ROUNDS_TARGET = 15; // hands played in "15 rounds" mode
const CASINO_HANDS = 20; // session length in casino mode (or end early on a bust-out)
const STARTING_CHIPS = 1000; // casino stake per player
const MIN_BET = 10;
const CHIP_DENOMS = [10, 25, 50, 100, 250, 500];
const CHIP_COLOR: Record<number, string> = {
  10: 'linear-gradient(145deg,#4CC9F0,#118AB2)',
  25: 'linear-gradient(145deg,#06D6A0,#118AB2)',
  50: 'linear-gradient(145deg,#8338EC,#3A0CA3)',
  100: 'linear-gradient(145deg,#F72585,#B5179E)',
  250: 'linear-gradient(145deg,#FF9E00,#FF5400)',
  500: 'linear-gradient(145deg,#FFD60A,#FF7B00)',
};

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

interface Card { id: string; rank: string }

// A vibrant gradient per rank family so the felt looks colourful, not stuffy.
const GRADIENT: Record<string, string> = {
  A: 'linear-gradient(145deg,#F72585,#7209B7)',
  J: 'linear-gradient(145deg,#FF9E00,#FF5400)',
  Q: 'linear-gradient(145deg,#FFBE0B,#FB5607)',
  K: 'linear-gradient(145deg,#FFD60A,#FF7B00)',
};
const NUM_GRADIENTS = [
  'linear-gradient(145deg,#4CC9F0,#4361EE)',
  'linear-gradient(145deg,#3A86FF,#4361EE)',
  'linear-gradient(145deg,#06D6A0,#118AB2)',
  'linear-gradient(145deg,#2EC4B6,#1B9AAA)',
  'linear-gradient(145deg,#8338EC,#3A0CA3)',
  'linear-gradient(145deg,#FF6392,#B5179E)',
];
const gradientFor = (rank: string) =>
  GRADIENT[rank] ?? NUM_GRADIENTS[(parseInt(rank, 10) || 0) % NUM_GRADIENTS.length];

const cardValue = (rank: string) => (rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10));

function handValue(cards: Card[]): number {
  let total = cards.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards) === 21;

function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 4; copy++) for (const rank of RANKS) deck.push({ id: `${rank}-${copy}-${Math.random().toString(36).slice(2, 7)}`, rank });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface BlackjackState extends BaseState {
  mode: Mode;
  deck: Card[];
  hands: Record<string, Card[]>;
  standing: Record<string, boolean>;
  doubled: Record<string, boolean>;
  inHand: string[]; // players dealt into the current hand, in seat order
  turnId: string | null;
  phase: 'betting' | 'playing' | 'reveal';
  round: number; // 1-based hand counter
  // Rounds mode
  scores: Record<string, number>; // rounds won
  // Casino mode
  chips: Record<string, number>;
  bets: Record<string, number>;
  betLocked: Record<string, boolean>;
  roundResult: string | null;
  revealWinners: string[]; // winners of the just-played hand
  ready: Record<string, boolean>; // reveal: who has clicked to deal on
}

const hostOf = (state: BlackjackState) => Object.keys(state.players)[0];
const nameOf = (state: BlackjackState, id: string | null | undefined) => (id && state.players[id]?.name) || '—';
const clampBet = (amt: number, max: number) => Math.max(0, Math.min(Math.floor(amt) || 0, max));
const potOf = (state: BlackjackState) => state.inHand.reduce((s, id) => s + (state.bets[id] ?? 0), 0);

// Who sits in the next hand: casino skips anyone who's out of chips.
function participantsOf(state: BlackjackState): string[] {
  const ids = Object.keys(state.players);
  return state.mode === 'casino' ? ids.filter((id) => (state.chips[id] ?? 0) > 0) : ids;
}

function createInitialState(roomId: string): BlackjackState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    mode: 'casino',
    deck: [],
    hands: {},
    standing: {},
    doubled: {},
    inHand: [],
    turnId: null,
    phase: 'betting',
    round: 0,
    scores: {},
    chips: {},
    bets: {},
    betLocked: {},
    roundResult: null,
    revealWinners: [],
    ready: {},
  };
}

// Deal two cards to every participant and open the playing phase.
function deal(state: BlackjackState): BlackjackState {
  const deck = freshDeck();
  const hands: Record<string, Card[]> = {};
  const standing: Record<string, boolean> = {};
  const doubled: Record<string, boolean> = {};
  for (const id of state.inHand) {
    hands[id] = [deck.pop()!, deck.pop()!];
    standing[id] = false;
    doubled[id] = false;
  }
  return { ...state, deck, hands, standing, doubled, phase: 'playing', turnId: state.inHand[0] ?? null };
}

// Open a fresh hand: casino pauses for betting first, rounds deals straight in.
function beginHand(state: BlackjackState): BlackjackState {
  const inHand = participantsOf(state);
  const common: BlackjackState = {
    ...state,
    round: state.round + 1,
    inHand,
    hands: {},
    standing: {},
    doubled: {},
    bets: {},
    betLocked: {},
    turnId: null,
    roundResult: null,
    revealWinners: [],
    ready: {},
  };
  return state.mode === 'casino' ? { ...common, phase: 'betting', deck: [] } : deal(common);
}

function start(state: BlackjackState): BlackjackState {
  const ids = Object.keys(state.players);
  const scores: Record<string, number> = {};
  const chips: Record<string, number> = {};
  for (const id of ids) { scores[id] = 0; chips[id] = STARTING_CHIPS; }
  return beginHand({ ...state, status: 'playing', scores, chips, round: 0 });
}

// Best non-bust hand(s) this round; empty when everyone busted.
function roundWinners(state: BlackjackState): string[] {
  let best = -1;
  let winners: string[] = [];
  for (const id of state.inHand) {
    const v = handValue(state.hands[id] ?? []);
    if (v > 21) continue;
    if (v > best) { best = v; winners = [id]; }
    else if (v === best) winners.push(id);
  }
  return winners;
}

// The unique score leader, or null on a tie.
function leader(scores: Record<string, number>, ids: string[]): string | null {
  let best = -Infinity;
  let top: string[] = [];
  for (const id of ids) {
    const s = scores[id] ?? 0;
    if (s > best) { best = s; top = [id]; }
    else if (s === best) top.push(id);
  }
  return top.length === 1 ? top[0] : null;
}

function resolveRounds(state: BlackjackState, winners: string[]): BlackjackState {
  const scores = { ...state.scores };
  for (const w of winners) scores[w] = (scores[w] ?? 0) + 1;

  let result: string;
  if (winners.length === 0) result = 'Everyone busts — no points this round';
  else {
    const v = handValue(state.hands[winners[0]]);
    const names = winners.map((w) => nameOf(state, w)).join(' & ');
    result = winners.length === 1 ? `${names} wins the round with ${v} (+1)` : `Tie at ${v} — ${names} each +1`;
  }

  if (state.round >= ROUNDS_TARGET) {
    const winnerId = leader(scores, Object.keys(state.players));
    return { ...state, scores, phase: 'reveal', turnId: null, roundResult: `${result} · final round`, revealWinners: winners, status: 'gameover', winnerId };
  }
  return { ...state, scores, phase: 'reveal', turnId: null, roundResult: result, revealWinners: winners };
}

function resolveCasino(state: BlackjackState, winners: string[]): BlackjackState {
  const pot = potOf(state);
  const chips = { ...state.chips };

  if (winners.length === 0) {
    return { ...state, chips, phase: 'reveal', turnId: null, roundResult: 'Everyone busts — bets returned', revealWinners: [] };
  }

  for (const id of state.inHand) chips[id] = (chips[id] ?? 0) - (state.bets[id] ?? 0);
  const share = Math.floor(pot / winners.length);
  let rem = pot - share * winners.length;
  for (const w of winners) { chips[w] += share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }

  const v = handValue(state.hands[winners[0]]);
  const names = winners.map((w) => nameOf(state, w)).join(' & ');
  const result = winners.length === 1 ? `${names} rakes the ${pot} pot with ${v}` : `Split ${pot} pot at ${v} — ${names}`;

  const ids = Object.keys(state.players);
  const solvent = ids.filter((id) => (chips[id] ?? 0) > 0);
  if (solvent.length <= 1) {
    return { ...state, chips, phase: 'reveal', turnId: null, roundResult: `${result} · table cleaned out!`, revealWinners: winners, status: 'gameover', winnerId: solvent[0] ?? winners[0] };
  }
  // Session limit reached: the biggest stack takes it (a tie leaves no winner).
  if (state.round >= CASINO_HANDS) {
    return { ...state, chips, phase: 'reveal', turnId: null, roundResult: `${result} · final hand`, revealWinners: winners, status: 'gameover', winnerId: leader(chips, ids) };
  }
  return { ...state, chips, phase: 'reveal', turnId: null, roundResult: result, revealWinners: winners };
}

function resolve(state: BlackjackState): BlackjackState {
  const winners = roundWinners(state);
  return state.mode === 'casino' ? resolveCasino(state, winners) : resolveRounds(state, winners);
}

// Hand the turn to the next player who still has decisions; else score the hand.
function advance(state: BlackjackState): BlackjackState {
  const order = state.inHand;
  const from = state.turnId ? order.indexOf(state.turnId) : -1;
  for (let k = 1; k <= order.length; k++) {
    const cand = order[(from + k) % order.length];
    if (!state.standing[cand]) return { ...state, turnId: cand };
  }
  return resolve(state);
}

function reducer(state: BlackjackState, pid: string, action: GameAction): BlackjackState {
  // Pre-game config (host only), handled while the room is still waiting.
  if (action.a === 'setMode') {
    if (state.status !== 'waiting' || pid !== hostOf(state)) return state;
    const mode = action.mode as Mode;
    if (mode !== 'rounds' && mode !== 'casino') return state;
    return { ...state, mode };
  }

  if (state.status !== 'playing') return state;

  if (state.phase === 'reveal') {
    // Hold on the result until everyone has clicked to deal the next hand.
    if (action.a === 'next') {
      if (state.ready[pid]) return state;
      const ready = { ...state.ready, [pid]: true };
      const ids = Object.keys(state.players);
      return ids.every((id) => ready[id]) ? beginHand(state) : { ...state, ready };
    }
    return state;
  }

  if (state.phase === 'betting') {
    if (!state.inHand.includes(pid) || state.betLocked[pid]) return state;
    const chips = state.chips[pid] ?? 0;
    if (action.a === 'setBet') {
      return { ...state, bets: { ...state.bets, [pid]: clampBet(Number(action.amount), chips) } };
    }
    if (action.a === 'lockBet') {
      const desired = action.amount != null ? Number(action.amount) : (state.bets[pid] ?? 0);
      const amt = clampBet(desired, chips);
      if (amt < Math.min(MIN_BET, chips) || amt <= 0) return state;
      const bets = { ...state.bets, [pid]: amt };
      const betLocked = { ...state.betLocked, [pid]: true };
      const next = { ...state, bets, betLocked };
      return state.inHand.every((id) => betLocked[id]) ? deal(next) : next;
    }
    return state;
  }

  // playing
  if (pid !== state.turnId || state.standing[pid]) return state;

  if (action.a === 'hit') {
    const deck = state.deck.slice();
    const card = deck.pop();
    if (!card) return state;
    const hand = [...state.hands[pid], card];
    const hands = { ...state.hands, [pid]: hand };
    if (handValue(hand) > 21) {
      return advance({ ...state, deck, hands, standing: { ...state.standing, [pid]: true } });
    }
    return { ...state, deck, hands }; // still my turn
  }

  if (action.a === 'stand') {
    return advance({ ...state, standing: { ...state.standing, [pid]: true } });
  }

  if (action.a === 'double') {
    if (state.hands[pid].length !== 2) return state;
    let bets = state.bets;
    if (state.mode === 'casino') {
      const bet = state.bets[pid] ?? 0;
      if ((state.chips[pid] ?? 0) < bet * 2) return state; // can't cover the double
      bets = { ...state.bets, [pid]: bet * 2 };
    }
    const deck = state.deck.slice();
    const card = deck.pop();
    if (!card) return state;
    const hands = { ...state.hands, [pid]: [...state.hands[pid], card] };
    return advance({ ...state, deck, hands, bets, standing: { ...state.standing, [pid]: true }, doubled: { ...state.doubled, [pid]: true } });
  }

  return state;
}

// Bot: bet ~10% of its stack, then dealer-style basic strategy — double a
// two-card 10/11 (when it can cover it), otherwise hit below 17, stand at 17+.
function botMove(state: BlackjackState, botId: string): GameAction | null {
  if (state.status !== 'playing') return null;
  if (state.phase === 'reveal') return state.ready[botId] ? null : { a: 'next' };
  if (state.phase === 'betting') {
    if (!state.inHand.includes(botId) || state.betLocked[botId]) return null;
    const chips = state.chips[botId] ?? 0;
    if (chips <= 0) return null;
    const bet = Math.min(chips, Math.max(MIN_BET, Math.round((chips * 0.1) / 10) * 10));
    return { a: 'lockBet', amount: bet };
  }
  if (state.turnId !== botId || state.standing[botId]) return null;
  const hand = state.hands[botId] ?? [];
  const v = handValue(hand);
  if (hand.length === 2 && (v === 10 || v === 11)) {
    const canCover = state.mode !== 'casino' || (state.chips[botId] ?? 0) >= (state.bets[botId] ?? 0) * 2;
    if (canCover) return { a: 'double' };
  }
  return v < 17 ? { a: 'hit' } : { a: 'stand' };
}

// Hide every other player's second-and-later cards until the reveal — you only
// see their up-card, like reading a dealer's hand.
function redact(state: BlackjackState, viewerId: string): BlackjackState {
  if (state.phase !== 'playing') return { ...state, deck: [] };
  const hands: Record<string, Card[]> = {};
  for (const [pid, cards] of Object.entries(state.hands)) {
    hands[pid] = pid === viewerId ? cards : cards.map((c, i) => (i === 0 ? c : { id: `hidden-${pid}-${i}`, rank: '?' }));
  }
  return { ...state, hands, deck: [] };
}

function PlayingCard({ rank, small }: { key?: string; rank: string; small?: boolean }) {
  const hidden = rank === '?';
  return (
    <div
      className={cn(
        'rounded-xl border-2 border-white/70 shadow-[0_5px_14px_rgba(0,0,0,0.45)] flex items-center justify-center font-black text-white shrink-0',
        small ? 'w-9 h-14 text-lg rounded-lg' : 'w-14 h-20 sm:w-16 sm:h-24 text-2xl sm:text-3xl',
      )}
      style={{ background: hidden ? 'linear-gradient(145deg,#3A3F4B,#20242C)' : gradientFor(rank) }}
    >
      {hidden ? <span className="text-xl">✦</span> : rank}
    </div>
  );
}

function Chip({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center justify-center w-9 h-9 rounded-full border-2 border-white/70 text-[10px] font-black text-white shadow-[0_3px_8px_rgba(0,0,0,0.4)]"
      style={{ background: CHIP_COLOR[value] ?? 'linear-gradient(145deg,#4CC9F0,#118AB2)' }}
    >
      {value}
    </span>
  );
}

// One player's area: name/status header plus their cards.
function Seat({ state, id, viewerId }: { key?: string; state: BlackjackState; id: string; viewerId: string }) {
  const p = state.players[id];
  const cards = state.hands[id] ?? [];
  const inHand = state.inHand.includes(id);
  const isCasino = state.mode === 'casino';
  const isMe = id === viewerId;
  const isTurn = state.turnId === id && state.phase === 'playing';
  const showVal = state.phase === 'reveal' || isMe;
  const val = handValue(cards);
  const busted = showVal && val > 21;
  const won = state.phase === 'reveal' && state.revealWinners.includes(id);
  const bankrupt = isCasino && (state.chips[id] ?? 0) <= 0 && !inHand;

  return (
    <div className={cn(
      'rounded-2xl border-2 p-3 flex flex-col gap-2',
      won ? 'border-[#FFD60A] bg-[#FFD60A]/10' : isTurn ? 'border-white bg-white/5' : 'border-[#39414E] bg-[#1A1D24]',
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono uppercase tracking-widest truncate text-[#E2E4E8]">
          {isMe ? 'You' : p?.name ?? '—'}
          {won && <span className="ml-1 text-[#FFD60A]">🏆</span>}
        </span>
        <span className="flex items-center gap-1.5">
          {isCasino
            ? <span className="text-xs font-black font-mono px-2 py-0.5 rounded-lg bg-[#262B34] text-[#FFD60A]">🪙 {state.chips[id] ?? 0}</span>
            : <span className="text-xs font-black font-mono px-2 py-0.5 rounded-lg bg-[#262B34] text-[#F5F6F7]">{state.scores[id] ?? 0}<span className="text-white">/{ROUNDS_TARGET}</span></span>}
          {showVal && cards.length > 0 && (
            <span className={cn('text-xs font-black font-mono px-2 py-0.5 rounded-lg', busted ? 'bg-[#E63946] text-white' : 'bg-[#262B34] text-[#F5F6F7]')}>
              {busted ? `BUST ${val}` : val}
            </span>
          )}
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap items-center min-h-[3.75rem]">
        {cards.length > 0
          ? cards.map((c) => <PlayingCard key={c.id} rank={c.rank} small />)
          : (
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#E2E4E8]">
              {bankrupt ? 'Out of chips' : state.phase === 'betting'
                ? (state.betLocked[id] ? `Bet ${state.bets[id]} · ready` : 'Placing bet…')
                : '—'}
            </span>
          )}
        {state.phase === 'playing' && state.standing[id] && !busted && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-[#06D6A0] ml-1">stand</span>
        )}
        {isCasino && inHand && state.bets[id] > 0 && state.phase !== 'betting' && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-[#FFD60A] ml-auto">bet {state.bets[id]}</span>
        )}
      </div>
    </div>
  );
}

function Board({ state, myId, dispatch }: BoardProps<BlackjackState>) {
  const ids = Object.keys(state.players);
  const order = [myId, ...ids.filter((i) => i !== myId)].filter((id) => state.players[id]);
  const isCasino = state.mode === 'casino';
  const inBetting = state.phase === 'betting';
  const inReveal = state.phase === 'reveal';
  const myTurn = state.turnId === myId && state.phase === 'playing' && !state.standing[myId];
  const amParticipant = state.inHand.includes(myId);
  const myHand = state.hands[myId] ?? [];
  const myChips = state.chips[myId] ?? 0;
  const myLocked = state.betLocked[myId];
  const canDouble = myTurn && myHand.length === 2 && (!isCasino || myChips >= (state.bets[myId] ?? 0) * 2);

  const [pendingBet, setPendingBet] = useState(0);
  useEffect(() => { setPendingBet(0); }, [state.round, state.phase]);

  const turnName = state.turnId ? (state.turnId === myId ? 'you' : nameOf(state, state.turnId)) : '—';
  const pot = potOf(state);

  return (
    <div className="flex flex-col items-center p-4 sm:p-6 max-w-2xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-4 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg,#F72585,#4CC9F0)' }}>
          Blackjack 21
        </h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">
          {isCasino ? `Casino · Hand ${state.round} / ${CASINO_HANDS}${pot > 0 ? ` · Pot ${pot}` : ''}` : `Round ${state.round} / ${ROUNDS_TARGET}`} · Room #{state.roomId}
        </span>
      </div>

      {/* Player seats + hands */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {order.map((id) => <Seat key={id} state={state} id={id} viewerId={myId} />)}
      </div>

      {/* Result banner */}
      {inReveal && state.roundResult && (
        <div className="w-full mt-5 text-center text-sm font-mono font-bold uppercase tracking-wider px-4 py-3 rounded-2xl border-2 border-[#39414E] bg-[#1A1D24] text-[#F5F6F7]">
          {state.roundResult}
        </div>
      )}

      {/* Controls */}
      <div className="w-full mt-5 flex flex-col items-center gap-3">
        {inBetting ? (
          !amParticipant ? (
            <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">Out of chips — spectating this hand…</p>
          ) : myLocked ? (
            <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">Bet {state.bets[myId]} locked — waiting for the table…</p>
          ) : (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-[#FFD60A] font-mono font-black text-lg">
                <span className="text-[10px] uppercase tracking-widest text-[#E2E4E8]">Bet</span>
                🪙 {pendingBet}
                <span className="text-[10px] uppercase tracking-widest text-[#E2E4E8]">of {myChips}</span>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {CHIP_DENOMS.map((d) => (
                  <button
                    key={d}
                    disabled={pendingBet + d > myChips}
                    onClick={() => setPendingBet((b) => Math.min(myChips, b + d))}
                    className="active:translate-y-0.5 transition-transform disabled:opacity-25 disabled:cursor-not-allowed"
                    aria-label={`Add ${d}`}
                  >
                    <Chip value={d} />
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
                <button onClick={() => setPendingBet(0)} className="py-3 rounded-xl font-black uppercase tracking-widest text-xs text-[#E2E4E8] border-2 border-[#39414E] hover:text-white active:translate-y-0.5 transition-all">Clear</button>
                <button onClick={() => setPendingBet(myChips)} className="py-3 rounded-xl font-black uppercase tracking-widest text-xs text-white border-2 border-[#39414E] hover:bg-[#262B34] active:translate-y-0.5 transition-all">All in</button>
                <button
                  onClick={() => dispatch({ a: 'lockBet', amount: pendingBet })}
                  disabled={pendingBet < Math.min(MIN_BET, myChips) || pendingBet <= 0}
                  className="py-3 rounded-xl font-black uppercase tracking-widest text-xs text-white active:translate-y-0.5 transition-all shadow-[0_4px_0_#118AB2] disabled:cursor-not-allowed disabled:shadow-none"
                  style={{ background: 'linear-gradient(145deg,#06D6A0,#118AB2)' }}
                >
                  Deal
                </button>
              </div>
            </div>
          )
        ) : myTurn ? (
          <div className="grid grid-cols-3 gap-3 w-full max-w-md">
            <button onClick={() => dispatch({ a: 'hit' })} className="py-4 rounded-2xl font-black uppercase tracking-widest text-white active:translate-y-0.5 transition-all shadow-[0_5px_0_#118AB2]" style={{ background: 'linear-gradient(145deg,#06D6A0,#118AB2)' }}>Hit</button>
            <button onClick={() => dispatch({ a: 'stand' })} className="py-4 rounded-2xl font-black uppercase tracking-widest text-white active:translate-y-0.5 transition-all shadow-[0_5px_0_#B5179E]" style={{ background: 'linear-gradient(145deg,#F72585,#B5179E)' }}>Stand</button>
            <button onClick={() => canDouble && dispatch({ a: 'double' })} disabled={!canDouble} className="py-4 rounded-2xl font-black uppercase tracking-widest text-white active:translate-y-0.5 transition-all shadow-[0_5px_0_#FF5400] disabled:cursor-not-allowed disabled:shadow-none" style={{ background: 'linear-gradient(145deg,#FF9E00,#FF5400)' }}>2×</button>
          </div>
        ) : inReveal ? (
          state.ready[myId] ? (
            <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">Ready — waiting for the table…</p>
          ) : (
            <button onClick={() => dispatch({ a: 'next' })} className="w-full max-w-md py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-white active:translate-y-0.5 transition-all shadow-[0_5px_0_#3A0CA3]" style={{ background: 'linear-gradient(145deg,#8338EC,#3A0CA3)' }}>
              ♻ {isCasino ? 'Next Hand' : 'Next Round'}
            </button>
          )
        ) : (
          <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">Waiting for {turnName}…</p>
        )}
        <p className="text-[10px] font-mono uppercase tracking-wider text-[#E2E4E8] text-center">Aces count 11 or 1 · face cards are 10 · best hand under 22 takes the {isCasino ? 'pot' : 'round'}</p>
      </div>
    </div>
  );
}

// Pre-game mode selector, shown in the lobby (online) and the solo setup screen.
// Only the host's choice sticks; everyone sees the current pick.
function ModePicker({ state, myId, dispatch }: BoardProps<BlackjackState>) {
  const isHost = myId === hostOf(state);
  const options: { id: Mode; label: string; blurb: string }[] = [
    { id: 'casino', label: '🎰 Casino Chips', blurb: `Everyone starts with 1,000 chips. Bet each hand — best hand rakes the pot. Bust the table, or hold the biggest stack after ${CASINO_HANDS} hands.` },
    { id: 'rounds', label: `🏆 ${ROUNDS_TARGET} Rounds`, blurb: `Play ${ROUNDS_TARGET} hands; whoever wins the most rounds takes the match.` },
  ];
  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-3 text-center">Game mode</p>
      <div className="grid grid-cols-1 gap-3">
        {options.map((o) => {
          const selected = state.mode === o.id;
          return (
            <button
              key={o.id}
              disabled={!isHost}
              onClick={() => dispatch({ a: 'setMode', mode: o.id })}
              className={cn(
                'text-left p-4 rounded-2xl border-2 transition-all',
                selected ? 'border-white bg-white/5' : 'border-[#39414E] bg-[#1A1D24] hover:border-[#8A92A0]',
                !isHost && 'cursor-not-allowed',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-black uppercase tracking-wider text-[#F5F6F7]">{o.label}</span>
                {selected && <span className="text-[10px] font-mono uppercase tracking-widest text-[#06D6A0]">selected ✓</span>}
              </div>
              <p className="text-xs text-[#E2E4E8] mt-1 leading-snug normal-case tracking-normal">{o.blurb}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[9px] font-mono uppercase tracking-wider text-[#E2E4E8] mt-3 text-center leading-relaxed">
        {isHost ? 'Your pick applies to the whole table.' : 'Only the host picks the mode.'}
      </p>
    </div>
  );
}

export const blackjack: GameDefinition<BlackjackState> = {
  id: 'blackjack',
  name: 'Blackjack 21',
  tagline: 'Neon, suit-free 21 for 2–5 — casino chips or a 15-round match, with friends & bots.',
  accent: '#F72585',
  emoji: '🃏',
  minPlayers: 2,
  maxPlayers: 5,
  createInitialState,
  start,
  reducer,
  redact,
  botMove,
  Board,
  LobbyExtra: ModePicker,
  gameOverMessage: (state, myId) => {
    if (state.mode === 'casino') {
      if (!state.winnerId) return 'Tie at the table — top stacks dead even!';
      const chips = state.chips[state.winnerId] ?? 0;
      return state.winnerId === myId
        ? `🎉 You top the table with ${chips} chips!`
        : `${nameOf(state, state.winnerId)} tops the table with ${chips} chips!`;
    }
    if (!state.winnerId) return `It's a tie after ${ROUNDS_TARGET} rounds!`;
    const wins = state.scores[state.winnerId] ?? 0;
    return state.winnerId === myId
      ? `🎉 You won ${wins} of ${ROUNDS_TARGET} rounds!`
      : `${nameOf(state, state.winnerId)} won ${wins} rounds!`;
  },
};
