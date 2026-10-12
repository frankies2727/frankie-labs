import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';
import { gameCard } from './catalog';

const CARD_MIN = 1;
const CARD_MAX = 12;
const TARGET_SCORE = 6;

const draw = () => CARD_MIN + Math.floor(Math.random() * (CARD_MAX - CARD_MIN + 1));

type Guess = 'higher' | 'lower';
type Outcome = 'correct' | 'wrong' | 'push';

export interface HighLowState extends BaseState {
  currentCard: number;
  scores: Record<string, number>;
  guesserId: string | null; // whose turn it is to call higher/lower
  pendingGuess: Guess | null; // the SECRET call (redacted from the dealer)
  guessCommitted: boolean; // public flag so the dealer knows a call is locked in
  lastResult: { guesserId: string; giverId: string; guess: Guess; prev: number; given: number; outcome: Outcome } | null;
}

function createInitialState(roomId: string): HighLowState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    currentCard: draw(),
    scores: {},
    guesserId: null,
    pendingGuess: null,
    guessCommitted: false,
    lastResult: null,
  };
}

function start(state: HighLowState): HighLowState {
  const ids = Object.keys(state.players);
  const scores: Record<string, number> = {};
  for (const id of ids) scores[id] = 0;
  return {
    ...state,
    status: 'playing',
    scores,
    guesserId: ids[0],
    currentCard: draw(),
    pendingGuess: null,
    guessCommitted: false,
    lastResult: null,
  };
}

function reducer(state: HighLowState, pid: string, action: GameAction): HighLowState {
  if (state.status !== 'playing') return state;
  const ids = Object.keys(state.players);

  // 1) Guesser locks in a secret higher/lower call.
  if (action.guess) {
    if (pid !== state.guesserId || state.guessCommitted) return state;
    const guess = action.guess as Guess;
    if (guess !== 'higher' && guess !== 'lower') return state;
    return { ...state, pendingGuess: guess, guessCommitted: true };
  }

  // 2) Dealer hands over a card (blind to the call), which resolves the round.
  if (typeof action.give === 'number') {
    if (!state.guessCommitted || pid === state.guesserId) return state; // only the dealer, only after a call
    const given = action.give;
    if (given < CARD_MIN || given > CARD_MAX) return state;

    const guesserId = state.guesserId!;
    const guess = state.pendingGuess!;
    const prev = state.currentCard;
    const trueDir = given === prev ? 'push' : given > prev ? 'higher' : 'lower';
    const outcome: Outcome = trueDir === 'push' ? 'push' : trueDir === guess ? 'correct' : 'wrong';

    const scores = { ...state.scores };
    if (outcome === 'correct') scores[guesserId] = (scores[guesserId] ?? 0) + 1;

    const lastResult = { guesserId, giverId: pid, guess, prev, given, outcome };
    const base = { ...state, scores, lastResult, pendingGuess: null, guessCommitted: false };

    if (scores[guesserId] >= TARGET_SCORE) {
      return { ...base, currentCard: given, status: 'gameover', winnerId: guesserId, guesserId: null };
    }
    // Each new round starts from a fresh random card rather than carrying the
    // dealt card over, so the base value can't be steered round-to-round.
    return { ...base, currentCard: draw(), guesserId: guesserId === ids[0] ? ids[1] : ids[0] };
  }

  return state;
}

// Bot opponent: as guesser, call based on where the current card sits in the
// range; as dealer, hand over a blind random card (it can't see the call).
function botMove(state: HighLowState, botId: string): GameAction | null {
  if (state.status !== 'playing') return null;
  if (state.guesserId === botId) {
    if (state.guessCommitted) return null; // already called, waiting on dealer
    const mid = (CARD_MIN + CARD_MAX) / 2;
    return { guess: state.currentCard <= mid ? 'higher' : 'lower' };
  }
  // Bot is the dealer — only deal once the guesser has locked in a call.
  if (!state.guessCommitted) return null;
  return { give: draw() };
}

// Keep the guesser's secret call away from the dealer until the round resolves.
function redact(state: HighLowState, viewerId: string): HighLowState {
  if (state.pendingGuess == null || viewerId === state.guesserId) return state;
  return { ...state, pendingGuess: null };
}

function Card({ value }: { value: number }) {
  return (
    <div className="bg-[#1A1D24] border-2 border-[#39414E] flex items-center justify-center font-black font-mono text-[#F5F6F7] shadow-[4px_4px_0px_#454C5A] w-28 h-40 sm:w-32 sm:h-44 text-6xl sm:text-7xl">
      {value}
    </div>
  );
}

function Board({ state, myId, dispatch }: BoardProps<HighLowState>) {
  const me = Object.values(state.players).find((p) => p.id === myId);
  const opponent = Object.values(state.players).find((p) => p.id !== myId);
  const iAmGuesser = state.guesserId === myId;
  const guesser = state.guesserId ? state.players[state.guesserId] : null;
  const r = state.lastResult;

  const resultText = r
    ? `${state.players[r.guesserId]?.name ?? '—'} called ${r.guess.toUpperCase()} · ${state.players[r.giverId]?.name ?? '—'} dealt ${r.given} · ` +
      (r.outcome === 'correct' ? '✓ point!' : r.outcome === 'push' ? '= push (tie)' : '✗ miss')
    : 'Secretly call higher or lower — your rival deals the card blind.';

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-6 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">High-Low</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
      </div>

      {/* Scoreboard */}
      <div className="flex items-stretch gap-4 w-full max-w-md mb-8">
        {[me, opponent].map((p, i) => p && (
          <div key={p.id} className={cn(
            "flex-1 border-2 border-[#39414E] p-3 text-center",
            state.guesserId === p.id ? "bg-[#9D4EDD] text-white" : "bg-[#1A1D24] text-[#F5F6F7]"
          )}>
            <div className="text-[10px] font-mono uppercase tracking-widest truncate">{i === 0 ? 'You' : p.name}</div>
            <div className="text-3xl font-black font-mono">{state.scores[p.id] ?? 0}<span className="text-sm text-[#E2E4E8]">/{TARGET_SCORE}</span></div>
          </div>
        ))}
      </div>

      {/* Current card */}
      <div className="flex flex-col items-center gap-2 mb-6">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">Current card</span>
        <Card value={state.currentCard} />
      </div>

      {/* Result banner */}
      <div className={cn(
        "w-full max-w-md text-center text-xs font-mono font-bold uppercase tracking-wider px-4 py-3 border-2 border-[#39414E] mb-8",
        r?.outcome === 'correct' ? "bg-green-900/40 text-green-200" :
        r?.outcome === 'wrong' ? "bg-red-900/40 text-red-200" :
        r?.outcome === 'push' ? "bg-yellow-900/40 text-yellow-100" : "bg-[#1A1D24] text-[#E2E4E8]"
      )}>
        {resultText}
      </div>

      {/* Phase-aware controls */}
      {!state.guessCommitted ? (
        iAmGuesser ? (
          <div className="w-full max-w-md flex flex-col items-center gap-3">
            <p className="text-[11px] font-mono uppercase tracking-widest text-[#9D4EDD] font-bold">Your secret call</p>
            <div className="flex gap-4 w-full">
              <button onClick={() => dispatch({ guess: 'higher' })} className="flex-1 py-5 bg-[#262B34] text-white font-bold uppercase tracking-[0.2em] border-2 border-[#39414E] shadow-[4px_4px_0px_#9D4EDD] hover:shadow-[2px_2px_0px_#9D4EDD] active:translate-y-1 active:shadow-none transition-all">▲ Higher</button>
              <button onClick={() => dispatch({ guess: 'lower' })} className="flex-1 py-5 bg-[#262B34] text-white font-bold uppercase tracking-[0.2em] border-2 border-[#39414E] shadow-[4px_4px_0px_#9D4EDD] hover:shadow-[2px_2px_0px_#9D4EDD] active:translate-y-1 active:shadow-none transition-all">▼ Lower</button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">
            Waiting for {guesser?.name ?? 'opponent'} to make a secret call…
          </p>
        )
      ) : iAmGuesser ? (
        <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">
          You called <span className="text-[#9D4EDD] font-bold">{state.pendingGuess?.toUpperCase()}</span>.
          <br />Waiting for {opponent?.name ?? 'opponent'} to deal a card…
        </p>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center gap-3">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#9D4EDD] font-bold text-center">
            Deal a card to {guesser?.name ?? 'opponent'} — you can't see their call
          </p>
          <div className="grid grid-cols-6 gap-2 w-full">
            {Array.from({ length: CARD_MAX }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                onClick={() => dispatch({ give: v })}
                className="aspect-[3/4] bg-[#1A1D24] text-[#F5F6F7] font-black font-mono text-xl border-2 border-[#39414E] shadow-[3px_3px_0px_#454C5A] hover:shadow-[1px_1px_0px_#454C5A] hover:bg-[#262B34] active:translate-y-0.5 active:shadow-none transition-all"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] mt-6">cards run {CARD_MIN}–{CARD_MAX} · first to {TARGET_SCORE} wins</p>
    </div>
  );
}

export const highLow: GameDefinition<HighLowState> = {
  ...gameCard('high-low'),
  createInitialState,
  start,
  reducer,
  redact,
  botMove,
  Board,
  gameOverMessage: (state, myId) =>
    state.winnerId === myId
      ? `🎉 You hit ${TARGET_SCORE} first!`
      : `${state.players[state.winnerId ?? '']?.name ?? 'Opponent'} reached ${TARGET_SCORE} first!`,
};
