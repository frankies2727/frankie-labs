import { GameAction } from '../../types';
import { cn } from '../../lib/utils';
import { CheckCircle2, XCircle, ChevronRight, Landmark, Loader2 } from 'lucide-react';
import { buildDeck } from './questions';
import { DIFFICULTY_ACCURACY, Difficulty, Players, SubResult, TriviaState } from './types';

// ---------------------------------------------------------------------------
// Citizenship Trivia (a Road to Citizenship sub-game). Everyone answers the
// SAME question at once; once the whole room has locked in, the round reveals —
// correct choice, a short fact, each player's result — and scores update. Most
// correct after 10 official USCIS questions wins; solo is scored against the
// USCIS 60% pass mark. The hub's redact keeps the answer key off the wire until
// the reveal.
// ---------------------------------------------------------------------------

const ROUNDS = 10;

export function triviaStart(players: Players): TriviaState {
  const scores: Record<string, number> = {};
  for (const id of Object.keys(players)) scores[id] = 0;
  return { deck: buildDeck(ROUNDS), index: 0, answers: {}, scores, revealed: false };
}

function decideWinner(scores: Record<string, number>): string | null {
  const entries = Object.entries(scores);
  if (entries.length === 0) return null;
  const top = Math.max(...entries.map(([, s]) => s));
  const leaders = entries.filter(([, s]) => s === top).map(([id]) => id);
  return leaders.length === 1 ? leaders[0] : null;
}

export function triviaReducer(
  state: TriviaState,
  players: Players,
  playerId: string,
  action: GameAction,
): SubResult<TriviaState> {
  switch (action.type) {
    case 'answer': {
      if (state.revealed || playerId in state.answers) return { state };
      const option = action.option;
      const current = state.deck[state.index];
      if (typeof option !== 'number' || option < 0 || option >= current.options.length) return { state };

      const answers = { ...state.answers, [playerId]: option };
      const everyoneAnswered = Object.keys(answers).length >= Object.keys(players).length;
      if (!everyoneAnswered) return { state: { ...state, answers } };

      // Reveal: score every answer at once so scores never move mid-round.
      const scores = { ...state.scores };
      for (const [pid, opt] of Object.entries(answers)) {
        if (opt === current.correctIndex) scores[pid] = (scores[pid] ?? 0) + 1;
      }
      return { state: { ...state, answers, scores, revealed: true } };
    }
    case 'next': {
      if (!state.revealed) return { state };
      const nextIndex = state.index + 1;
      if (nextIndex >= state.deck.length) {
        return { state, status: 'gameover', winnerId: decideWinner(state.scores) };
      }
      return { state: { ...state, index: nextIndex, answers: {}, revealed: false } };
    }
    default:
      return { state };
  }
}

// Bots run host-side and see the unredacted view, so they know the correct
// answer; difficulty decides how often they actually pick it.
export function triviaBot(
  state: TriviaState,
  botId: string,
  difficulty: Difficulty,
): GameAction | null {
  if (state.revealed || botId in state.answers) return null;
  const current = state.deck[state.index];
  if (!current || current.correctIndex < 0) return null; // answer masked (shouldn't happen for a bot)
  const willBeRight = Math.random() < DIFFICULTY_ACCURACY[difficulty];
  if (willBeRight) return { type: 'answer', option: current.correctIndex };
  const wrong = current.options.map((_, i) => i).filter((i) => i !== current.correctIndex);
  return { type: 'answer', option: wrong[Math.floor(Math.random() * wrong.length)] };
}

// Reveal the answer key and everyone's picks only once the whole room has
// answered; before that, a human viewer sees only their own pick.
export function triviaRedact(state: TriviaState, viewerId: string): TriviaState {
  const deck = state.deck.map((q, i) => {
    const show = i < state.index || (i === state.index && state.revealed);
    return show ? q : { ...q, correctIndex: -1, explanation: '' };
  });
  const answers: Record<string, number> = {};
  for (const [pid, opt] of Object.entries(state.answers)) {
    answers[pid] = state.revealed || pid === viewerId ? opt : -1;
  }
  return { ...state, deck, answers };
}

export function triviaGameOverMessage(state: TriviaState, players: Players, winnerId: string | null, myId: string): string {
  const total = state.deck.length;
  const mine = state.scores[myId] ?? 0;
  if (Object.keys(players).length <= 1) {
    const pct = total ? Math.round((mine / total) * 100) : 0;
    return mine / total >= 0.6
      ? `🎉 You scored ${mine}/${total} (${pct}%) — you'd pass!`
      : `You scored ${mine}/${total} (${pct}%) — keep studying!`;
  }
  if (!winnerId) return `It's a tie! You scored ${mine}/${total}.`;
  if (winnerId === myId) return `🏆 You win with ${mine}/${total}!`;
  const name = players[winnerId]?.name ?? 'Someone';
  return `${name} wins with ${state.scores[winnerId] ?? 0}/${total} — you had ${mine}.`;
}

// ---- board ----------------------------------------------------------------

interface TriviaBoardProps {
  state: TriviaState;
  players: Players;
  myId: string;
  dispatch: (a: GameAction) => void;
}

export function TriviaBoard({ state, players, myId, dispatch }: TriviaBoardProps) {
  const roster = Object.values(players);
  const current = state.deck[state.index];
  if (!current) return null;

  const iAnswered = myId in state.answers;
  const myChoice = state.answers[myId];
  const answeredCount = Object.keys(state.answers).length;
  const total = state.deck.length;
  const revealed = state.revealed;
  const solo = roster.length <= 1;

  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-[#E2E4E8]">
          <Landmark className="w-4 h-4 text-[#E63946]" />
          Question <span className="text-[#F5F6F7]">{state.index + 1}</span>
          <span className="text-[#E2E4E8]">/</span>
          {total}
        </div>
        <div className="flex gap-2 overflow-x-auto max-w-full">
          {roster.map((p) => {
            const answered = p.id in state.answers;
            const correctThisRound = revealed && state.answers[p.id] === current.correctIndex;
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 border-2 shrink-0 bg-[#1A1D24]',
                  p.id === myId ? 'border-[#E63946]' : 'border-[#39414E]',
                )}
              >
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#E2E4E8] max-w-[80px] truncate">
                  {p.name}
                  {p.id === myId && <span className="text-[#E63946]"> ·you</span>}
                </span>
                <span className="text-sm font-black text-[#F5F6F7]">{state.scores[p.id] ?? 0}</span>
                {revealed ? (
                  correctThisRound ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#06D6A0]" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-[#E63946]" />
                  )
                ) : answered ? (
                  <span className="w-2 h-2 rounded-full bg-[#06D6A0]" title="Answered" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-[#4B5563]" title="Thinking…" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#1A1D24] border-2 border-[#39414E] shadow-[8px_8px_0px_#454C5A]">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#E63946] via-[#F5F6F7] to-[#3A86FF]" />
        <div className="p-6 md:p-10">
          <h3 className="text-2xl md:text-3xl font-bold text-[#F5F6F7] mb-8 leading-tight">{current.question}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {current.options.map((option, i) => {
              const isMyChoice = myChoice === i;
              const isCorrect = revealed && current.correctIndex === i;
              let stateClass = 'bg-[#262B34] border-[#39414E] text-[#E2E4E8] hover:bg-[#323A47]';
              let icon = null;
              if (revealed) {
                if (isCorrect) {
                  stateClass = 'bg-[#06D6A0]/15 border-[#06D6A0] text-[#F5F6F7]';
                  icon = <CheckCircle2 className="text-[#06D6A0]" size={22} />;
                } else if (isMyChoice) {
                  stateClass = 'bg-[#E63946]/15 border-[#E63946] text-[#F5F6F7]';
                  icon = <XCircle className="text-[#E63946]" size={22} />;
                } else {
                  stateClass = 'bg-[#262B34] border-[#2E343F] text-[#E2E4E8]';
                }
              } else if (isMyChoice) {
                stateClass = 'bg-[#3A86FF]/15 border-[#3A86FF] text-[#F5F6F7]';
              }
              return (
                <button
                  key={i}
                  disabled={iAnswered}
                  onClick={() => dispatch({ type: 'answer', option: i })}
                  className={cn(
                    'relative flex items-center justify-between w-full text-left p-5 border-2 font-semibold text-lg transition-all duration-150',
                    !iAnswered && 'hover:-translate-y-0.5 active:translate-y-0 cursor-pointer',
                    stateClass,
                  )}
                >
                  <span className="flex-1 pr-4">{option}</span>
                  {icon}
                </button>
              );
            })}
          </div>

          {iAnswered && !revealed && !solo && (
            <div className="mt-8 flex items-center justify-center gap-3 text-sm font-mono uppercase tracking-widest text-[#E2E4E8]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Waiting for others… ({answeredCount}/{roster.length})
            </div>
          )}

          {revealed && (
            <div className="mt-8 bg-[#0F1117] border-2 border-[#2E343F] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="text-[10px] font-mono font-bold text-[#3A86FF] uppercase tracking-widest mb-2">
                  {myChoice === current.correctIndex ? 'Correct!' : 'Fact'}
                </div>
                <p className="text-[#E2E4E8] font-medium text-base leading-relaxed">{current.explanation}</p>
              </div>
              <button
                onClick={() => dispatch({ type: 'next' })}
                className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-[#E63946] hover:bg-[#D90429] active:translate-y-0.5 transition-all text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] uppercase tracking-[0.15em] shrink-0"
              >
                {state.index + 1 >= total ? 'See Results' : 'Next'} <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-center mt-6 text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">
        Official USCIS civics questions · anyone can tap Next once everyone's answered
      </p>
    </div>
  );
}
