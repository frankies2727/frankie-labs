import { useEffect, useRef } from 'react';
import { GameAction } from '../../types';
import { cn } from '../../lib/utils';
import { CheckCircle2, XCircle, Trophy, ScrollText } from 'lucide-react';
import { Category, deal, questionsByCategory, shuffle } from './questions';
import { DIFFICULTY_ACCURACY, Difficulty, JCategory, JeopardyState, Players, SubResult } from './types';

// ---------------------------------------------------------------------------
// Citizenship Jeopardy! (a Road to Citizenship sub-game). A board of civics
// categories × dollar values. The player in control picks a clue and answers;
// a wrong answer opens the clue to rivals to "steal". Correct answers add the
// value (and hand you control), wrong answers subtract it. Play the whole board;
// the biggest bank wins. Turn-based (no real-time buzzer) so humans and bots
// compete fairly. The answer key stays masked until a clue is revealed.
// ---------------------------------------------------------------------------

const VALUES = [200, 400, 600, 800];
const COLUMNS: { title: string; cat: Category }[] = [
  { title: 'The Constitution', cat: 'legislative' },
  { title: 'Government', cat: 'legislative' },
  { title: 'Rights & Freedoms', cat: 'rights' },
  { title: 'American History', cat: 'history' },
  { title: 'Places & Symbols', cat: 'geography' },
];

function buildBoard(): JCategory[] {
  const used = new Set<string>();
  return COLUMNS.map((col) => {
    const pool = shuffle(questionsByCategory(col.cat).filter((q) => !used.has(q.id)));
    const fallback = questionsByCategory(col.cat);
    const clues = VALUES.map((value, i) => {
      const src = pool[i] ?? fallback[i % fallback.length];
      used.add(src.id);
      return { value, q: deal(src), done: false };
    });
    return { title: col.title, clues };
  });
}

const nextInOrder = (order: string[], id: string) => order[(order.indexOf(id) + 1) % order.length];
const boardDone = (board: JCategory[]) => board.every((c) => c.clues.every((cl) => cl.done));
// Keep the whole game's history (bounded generously so state stays small).
const say = (log: string[], line: string) => [...log, line].slice(-300);
const name = (players: Players, id: string | null) => (id ? players[id]?.name ?? 'Player' : 'No one');

// ---- setup ----------------------------------------------------------------

export function jeopardyStart(players: Players, difficulty: Difficulty): JeopardyState {
  const order = Object.keys(players);
  const scores: Record<string, number> = {};
  for (const id of order) scores[id] = 0;
  return {
    board: buildBoard(),
    scores,
    order,
    control: order[0],
    phase: 'pick',
    active: null,
    answerer: null,
    attempted: [],
    stealQueue: [],
    lastResult: null,
    difficulty,
    log: [`${name(players, order[0])} picks first — choose a category and value.`],
  };
}

// ---- reducer --------------------------------------------------------------

export function jeopardyReducer(
  state: JeopardyState,
  players: Players,
  pid: string,
  action: GameAction,
): SubResult<JeopardyState> {
  switch (state.phase) {
    case 'pick': {
      if (action.type !== 'pick' || pid !== state.control) return { state };
      const cat = action.cat;
      const row = action.row;
      if (typeof cat !== 'number' || typeof row !== 'number') return { state };
      const clue = state.board[cat]?.clues[row];
      if (!clue || clue.done) return { state };
      return {
        state: {
          ...state,
          active: { cat, row },
          phase: 'answer',
          answerer: state.control,
          attempted: [],
          stealQueue: [],
          lastResult: null,
          log: say(state.log, `${name(players, state.control)} picks ${state.board[cat].title} for $${clue.value}.`),
        },
      };
    }

    case 'answer':
    case 'steal': {
      if (!state.active) return { state };
      const clue = state.board[state.active.cat].clues[state.active.row];

      // A rival being offered the steal may pass.
      if (action.type === 'pass' && state.phase === 'steal') {
        if (pid !== state.answerer) return { state };
        return { state: advanceSteal(state, players, clue.value) };
      }

      if (action.type !== 'answer' || pid !== state.answerer) return { state };
      const opt = action.option;
      if (typeof opt !== 'number') return { state };
      const correct = opt === clue.q.correctIndex;
      const scores = { ...state.scores };

      if (correct) {
        scores[pid] = (scores[pid] ?? 0) + clue.value;
        return {
          state: {
            ...state,
            scores,
            phase: 'reveal',
            control: pid, // correct answerer takes control
            lastResult: { pid, correct: true },
            log: say(state.log, `✅ ${name(players, pid)} got $${clue.value} right.`),
          },
        };
      }

      // Wrong: lose the value, then open (or continue) the steal.
      scores[pid] = (scores[pid] ?? 0) - clue.value;
      const attempted = [...state.attempted, pid];
      const wrongState: JeopardyState = {
        ...state,
        scores,
        attempted,
        log: say(state.log, `❌ ${name(players, pid)} missed it (−$${clue.value}).`),
      };
      if (state.phase === 'answer') {
        // First miss by the picker → build the steal queue from the other players.
        const queue = state.order.filter((id) => id !== pid);
        if (queue.length === 0) return { state: revealUnsolved(wrongState, players) };
        return { state: { ...wrongState, phase: 'steal', answerer: queue[0], stealQueue: queue } };
      }
      // A steal attempt missed → next rival.
      return { state: advanceSteal(wrongState, players, clue.value) };
    }

    case 'reveal': {
      if (action.type !== 'continue' || pid !== state.control) return { state };
      const { cat, row } = state.active!;
      const board = state.board.map((c, ci) =>
        ci === cat ? { ...c, clues: c.clues.map((cl, ri) => (ri === row ? { ...cl, done: true } : cl)) } : c,
      );
      if (boardDone(board)) {
        return { state: { ...state, board, active: null }, status: 'gameover', winnerId: decideWinner(state.scores) };
      }
      // Control already points at the correct answerer; if nobody solved it, pass on.
      const control = state.lastResult?.correct ? state.control : nextInOrder(state.order, state.control);
      return {
        state: {
          ...state,
          board,
          active: null,
          answerer: null,
          attempted: [],
          stealQueue: [],
          phase: 'pick',
          control,
          log: say(state.log, `${name(players, control)} picks next.`),
        },
      };
    }

    default:
      return { state };
  }
}

// Move the steal to the next rival, or reveal if the queue is spent.
function advanceSteal(state: JeopardyState, players: Players, _value: number): JeopardyState {
  const queue = state.stealQueue.slice(1);
  if (queue.length === 0) return revealUnsolved(state, players);
  return { ...state, stealQueue: queue, answerer: queue[0] };
}

function revealUnsolved(state: JeopardyState, players: Players): JeopardyState {
  return {
    ...state,
    phase: 'reveal',
    answerer: null,
    stealQueue: [],
    lastResult: { pid: null, correct: false },
    log: say(state.log, `No one solved it. ${name(players, state.control)} keeps control.`),
  };
}

function decideWinner(scores: Record<string, number>): string | null {
  const entries = Object.entries(scores);
  if (!entries.length) return null;
  const top = Math.max(...entries.map(([, s]) => s));
  const leaders = entries.filter(([, s]) => s === top).map(([id]) => id);
  return leaders.length === 1 ? leaders[0] : null;
}

// ---- bots -----------------------------------------------------------------

export function jeopardyBot(state: JeopardyState, botId: string): GameAction | null {
  const acc = DIFFICULTY_ACCURACY[state.difficulty];

  if (state.phase === 'pick') {
    if (state.control !== botId) return null;
    // Pick a random available clue (prefer higher value when confident).
    const options: { cat: number; row: number; value: number }[] = [];
    state.board.forEach((c, ci) => c.clues.forEach((cl, ri) => { if (!cl.done) options.push({ cat: ci, row: ri, value: cl.value }); }));
    if (!options.length) return null;
    const choice = options[Math.floor(Math.random() * options.length)];
    return { type: 'pick', cat: choice.cat, row: choice.row };
  }

  if (state.phase === 'answer' || state.phase === 'steal') {
    if (state.answerer !== botId || !state.active) return null;
    const clue = state.board[state.active.cat].clues[state.active.row];
    if (!clue || clue.q.correctIndex < 0) return null; // masked (shouldn't happen for a bot)
    const knows = Math.random() < acc;
    if (state.phase === 'steal' && !knows) return { type: 'pass' }; // don't risk a steal you don't know
    if (knows) return { type: 'answer', option: clue.q.correctIndex };
    const wrong = clue.q.options.map((_, i) => i).filter((i) => i !== clue.q.correctIndex);
    return { type: 'answer', option: wrong[Math.floor(Math.random() * wrong.length)] };
  }

  if (state.phase === 'reveal') {
    if (state.control !== botId) return null;
    return { type: 'continue' };
  }
  return null;
}

// ---- redact ---------------------------------------------------------------

export function jeopardyRedact(state: JeopardyState, _viewerId: string): JeopardyState {
  const revealing = state.phase === 'reveal';
  const board = state.board.map((c, ci) => ({
    ...c,
    clues: c.clues.map((cl, ri) => {
      const isActive = state.active && state.active.cat === ci && state.active.row === ri;
      if (isActive) {
        // Active clue: show the prompt, but hide the answer until the reveal.
        return revealing ? cl : { ...cl, q: { ...cl.q, correctIndex: -1, explanation: '' } };
      }
      // Other clues: don't leak the prompt or answer at all — just the tile.
      return { ...cl, q: { ...cl.q, question: '', options: [], correctIndex: -1, explanation: '' } };
    }),
  }));
  return { ...state, board };
}

export function jeopardyGameOverMessage(state: JeopardyState, players: Players, winnerId: string | null, myId: string): string {
  const mine = state.scores[myId] ?? 0;
  if (Object.keys(players).length <= 1) return `Final score: $${mine}.`;
  if (!winnerId) return `It's a tie at $${mine}!`;
  if (winnerId === myId) return `🏆 You win with $${mine}!`;
  return `${name(players, winnerId)} wins with $${state.scores[winnerId] ?? 0} — you had $${mine}.`;
}

// ---- board ----------------------------------------------------------------

interface JBoardProps {
  state: JeopardyState;
  players: Players;
  myId: string;
  dispatch: (a: GameAction) => void;
}

const money = (n: number) => (n < 0 ? `−$${Math.abs(n)}` : `$${n}`);

export function JeopardyBoard({ state, players, myId, dispatch }: JBoardProps) {
  const active = state.active ? state.board[state.active.cat].clues[state.active.row] : null;
  const iControl = state.control === myId;
  const iAnswer = state.answerer === myId;
  const controlName = name(players, state.control);

  // Keep the activity log scrolled to the newest entry as history grows.
  const logRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log.length]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8 space-y-5">
      {/* Scores */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-bold uppercase tracking-widest text-[#F5F6F7]">
          {state.phase === 'pick' ? (iControl ? 'Pick a clue' : `${controlName} is picking…`) : 'Citizenship Jeopardy!'}
        </div>
        <div className="flex gap-2 overflow-x-auto max-w-full">
          {state.order.map((id) => (
            <div key={id} className={cn('flex items-center gap-2 px-3 py-1.5 border-2 shrink-0 bg-[#1A1D24]', id === state.control ? 'border-[#E9C46A]' : 'border-[#39414E]')}>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#E2E4E8] max-w-[80px] truncate">
                {name(players, id)}{id === myId && <span className="text-[#E63946]"> ·you</span>}
              </span>
              <span className={cn('text-sm font-black', (state.scores[id] ?? 0) < 0 ? 'text-[#E63946]' : 'text-[#F5F6F7]')}>{money(state.scores[id] ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* The board grid */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${state.board.length}, minmax(0, 1fr))` }}>
        {state.board.map((c) => (
          <div key={c.title} className="bg-[#1D3557] text-white text-center text-[10px] sm:text-xs font-black uppercase tracking-tight p-2 min-h-[52px] flex items-center justify-center border-2 border-[#0F1117] leading-tight">
            {c.title}
          </div>
        ))}
        {VALUES.map((_, row) =>
          state.board.map((c, cat) => {
            const clue = c.clues[row];
            const canPick = iControl && state.phase === 'pick' && !clue.done;
            return (
              <button
                key={c.title + row}
                disabled={!canPick}
                onClick={() => dispatch({ type: 'pick', cat, row })}
                className={cn(
                  'min-h-[52px] border-2 border-[#0F1117] flex items-center justify-center text-lg sm:text-2xl font-black transition-all',
                  clue.done ? 'bg-[#141821] text-transparent' : 'bg-[#0B1B3A] text-[#E9C46A]',
                  canPick && 'hover:bg-[#12274f] hover:text-white cursor-pointer',
                )}
              >
                {clue.done ? '' : `$${clue.value}`}
              </button>
            );
          }),
        )}
      </div>

      {/* Active clue */}
      {active && state.active && (
        <div className="bg-[#1A1D24] border-2 border-[#39414E] shadow-[6px_6px_0px_#454C5A]">
          <div className="bg-[#1D3557] text-white px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest">{state.board[state.active.cat].title} · ${active.value}</span>
            {state.phase === 'steal' && <span className="text-[10px] font-mono uppercase tracking-widest text-[#E9C46A]">Steal!</span>}
          </div>
          <div className="p-6 md:p-8">
            <h3 className="text-xl md:text-2xl font-bold text-[#F5F6F7] mb-6 leading-tight">{active.q.question}</h3>

            {state.phase === 'reveal' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {active.q.options.map((opt, i) => (
                    <div key={i} className={cn('flex items-center justify-between p-4 border-2 font-semibold', i === active.q.correctIndex ? 'bg-[#06D6A0]/15 border-[#06D6A0] text-[#F5F6F7]' : 'bg-[#262B34] border-[#2E343F] text-[#E2E4E8]')}>
                      <span>{opt}</span>
                      {i === active.q.correctIndex && <CheckCircle2 className="text-[#06D6A0]" size={20} />}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-[#E2E4E8]">{active.q.explanation}</p>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">
                    {state.lastResult?.correct ? `${name(players, state.lastResult.pid)} scored $${active.value}` : 'No one solved it'}
                  </span>
                  {iControl ? (
                    <button onClick={() => dispatch({ type: 'continue' })} className="px-6 py-3 bg-[#E63946] text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] uppercase tracking-widest text-xs">Continue</button>
                  ) : (
                    <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Waiting for {controlName}…</span>
                  )}
                </div>
              </div>
            ) : iAnswer ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {active.q.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => dispatch({ type: 'answer', option: i })}
                      className="text-left p-4 border-2 border-[#39414E] bg-[#262B34] text-[#E2E4E8] font-semibold hover:bg-[#323A47] hover:-translate-y-0.5 transition-all"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {state.phase === 'steal' && (
                  <button onClick={() => dispatch({ type: 'pass' })} className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8] hover:text-[#F5F6F7] underline">
                    Pass — don't risk it
                  </button>
                )}
              </div>
            ) : (
              <p className="text-center text-sm font-mono uppercase tracking-widest text-[#E2E4E8] py-6 flex items-center justify-center gap-2">
                {state.phase === 'steal' ? <XCircle className="w-4 h-4 text-[#E63946]" /> : null}
                {name(players, state.answerer)} is answering…
              </p>
            )}
          </div>
        </div>
      )}

      {/* Activity — full history, scrollable */}
      <div className="border-2 border-[#2E343F] bg-[#0F1117] p-3">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-1"><ScrollText className="w-3 h-3" /> Activity</div>
        <ul ref={logRef} className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
          {state.log.map((l, i) => <li key={i} className="text-xs text-[#E2E4E8] leading-snug">{l}</li>)}
        </ul>
      </div>

      <p className="text-center text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] flex items-center justify-center gap-2">
        <Trophy className="w-3 h-3" /> Answer right to bank the value & keep control · miss it and rivals can steal
      </p>
    </div>
  );
}
