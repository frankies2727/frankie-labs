import { BoardProps, GameAction, GameDefinition } from '../../types';
import { cn } from '../../lib/utils';
import { RoadState, SubGame, Difficulty } from './types';
import {
  triviaStart,
  triviaReducer,
  triviaRedact,
  triviaBot,
  triviaGameOverMessage,
  TriviaBoard,
} from './trivia';
import {
  civicStart,
  civicReducer,
  civicRedact,
  civicBot,
  civicGameOverMessage,
  CivicBoard,
} from './civic';
import {
  jeopardyStart,
  jeopardyReducer,
  jeopardyRedact,
  jeopardyBot,
  jeopardyGameOverMessage,
  JeopardyBoard,
} from './jeopardy';

// ---------------------------------------------------------------------------
// Road to Citizenship — an umbrella "hub" holding several citizenship games. One
// gallery card: join a room code, enter your name, then the host picks which
// game the room plays. It's a normal peer-to-peer GameDefinition that delegates
// its reducer / board / redact / bots to whichever sub-game was chosen:
//
//   • Citizenship Trivia — everyone races the same USCIS questions.
//   • The Civic Path     — a strategic resource/trading board game.
//
// Bots run host-side, so they see the unredacted state (redact bypasses them);
// their difficulty is set in the lobby.
// ---------------------------------------------------------------------------

const looksLikeBot = (id: string) => id.startsWith('bot-') || id.startsWith('cpu');
const hostOf = (state: RoadState) => Object.keys(state.players)[0];

const GAME_META: Record<SubGame, { name: string; emoji: string; blurb: string }> = {
  trivia: {
    name: 'Citizenship Trivia',
    emoji: '🗽',
    blurb: 'Everyone answers the same official USCIS questions at once. Most correct after 10 wins.',
  },
  civicpath: {
    name: 'The Civic Path',
    emoji: '🎲',
    blurb: 'A strategy board game: earn resource cards from civics questions, trade & build milestones, then pass the exam to win.',
  },
  jeopardy: {
    name: 'Citizenship Jeopardy!',
    emoji: '🟦',
    blurb: 'A quiz-board showdown: pick a category & dollar value, answer to bank it (miss and rivals can steal). Biggest bank wins.',
  },
};

// Sub-games that seat bots and use the difficulty setting.
const BOT_GAMES: SubGame[] = ['civicpath', 'jeopardy'];

const DIFFICULTIES: Difficulty[] = ['novice', 'citizen', 'scholar'];

function createInitialState(roomId: string): RoadState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    chosen: 'trivia',
    difficulty: 'citizen',
    trivia: null,
    civic: null,
    jeopardy: null,
  };
}

function start(state: RoadState): RoadState {
  const base = { ...state, status: 'playing' as const, winnerId: null, trivia: null, civic: null, jeopardy: null };
  if (state.chosen === 'civicpath') return { ...base, civic: civicStart(state.players, state.difficulty) };
  if (state.chosen === 'jeopardy') return { ...base, jeopardy: jeopardyStart(state.players, state.difficulty) };
  return { ...base, trivia: triviaStart(state.players) };
}

function reducer(state: RoadState, pid: string, action: GameAction): RoadState {
  // Lobby configuration (host only) while the room is still waiting.
  if (state.status === 'waiting') {
    if (pid !== hostOf(state)) return state;
    if (action.type === 'choose') {
      const game = action.game as SubGame;
      if (game === 'trivia' || game === 'civicpath' || game === 'jeopardy') return { ...state, chosen: game };
      return state;
    }
    if (action.type === 'difficulty') {
      const d = action.value as Difficulty;
      if (DIFFICULTIES.includes(d)) return { ...state, difficulty: d };
      return state;
    }
    return state;
  }

  if (state.status !== 'playing') return state;

  if (state.chosen === 'civicpath' && state.civic) {
    const r = civicReducer(state.civic, state.players, pid, action);
    return { ...state, civic: r.state, status: r.status ?? state.status, winnerId: r.status ? r.winnerId ?? null : state.winnerId };
  }
  if (state.chosen === 'jeopardy' && state.jeopardy) {
    const r = jeopardyReducer(state.jeopardy, state.players, pid, action);
    return { ...state, jeopardy: r.state, status: r.status ?? state.status, winnerId: r.status ? r.winnerId ?? null : state.winnerId };
  }
  if (state.chosen === 'trivia' && state.trivia) {
    const r = triviaReducer(state.trivia, state.players, pid, action);
    return { ...state, trivia: r.state, status: r.status ?? state.status, winnerId: r.status ? r.winnerId ?? null : state.winnerId };
  }
  return state;
}

function redact(state: RoadState, viewerId: string): RoadState {
  // Bots run on the host and never render UI; they get the full state so they
  // can read the correct answers (difficulty then decides how they play).
  if (looksLikeBot(viewerId)) return state;
  if (state.chosen === 'civicpath' && state.civic) return { ...state, civic: civicRedact(state.civic, viewerId) };
  if (state.chosen === 'jeopardy' && state.jeopardy) return { ...state, jeopardy: jeopardyRedact(state.jeopardy, viewerId) };
  if (state.chosen === 'trivia' && state.trivia) return { ...state, trivia: triviaRedact(state.trivia, viewerId) };
  return state;
}

function botMove(state: RoadState, botId: string): GameAction | null {
  if (state.status !== 'playing') return null;
  if (state.chosen === 'civicpath' && state.civic) return civicBot(state.civic, botId);
  if (state.chosen === 'jeopardy' && state.jeopardy) return jeopardyBot(state.jeopardy, botId);
  if (state.chosen === 'trivia' && state.trivia) return triviaBot(state.trivia, botId, state.difficulty);
  return null;
}

// ---- lobby picker (host chooses the game + bot difficulty) -----------------

function GamePicker({ state, myId, dispatch }: BoardProps<RoadState>) {
  const isHost = myId === hostOf(state);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-3 text-center">Choose a game</p>
        <div className="grid grid-cols-1 gap-3">
          {(Object.keys(GAME_META) as SubGame[]).map((g) => {
            const selected = state.chosen === g;
            const meta = GAME_META[g];
            return (
              <button
                key={g}
                disabled={!isHost}
                onClick={() => dispatch({ type: 'choose', game: g })}
                className={cn(
                  'text-left p-4 border-2 transition-all',
                  selected ? 'border-white bg-white/5' : 'border-[#39414E] bg-[#1A1D24] hover:border-[#8A92A0]',
                  !isHost && 'cursor-not-allowed',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-black uppercase tracking-wider text-[#F5F6F7]">{meta.emoji} {meta.name}</span>
                  {selected && <span className="text-[10px] font-mono uppercase tracking-widest text-[#06D6A0]">selected ✓</span>}
                </div>
                <p className="text-xs text-[#E2E4E8] mt-1 leading-snug normal-case tracking-normal">{meta.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      {BOT_GAMES.includes(state.chosen) && (
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-2 text-center">Bot difficulty</p>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                disabled={!isHost}
                onClick={() => dispatch({ type: 'difficulty', value: d })}
                className={cn(
                  'py-2 border-2 uppercase tracking-widest text-[11px] font-bold transition-all',
                  state.difficulty === d ? 'border-[#E63946] bg-[#E63946]/15 text-[#F5F6F7]' : 'border-[#39414E] bg-[#1A1D24] text-[#E2E4E8] hover:text-[#F5F6F7]',
                  !isHost && 'cursor-not-allowed',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] font-mono uppercase tracking-wider text-[#E2E4E8] text-center leading-relaxed">
        {isHost ? 'Your pick applies to the whole room. Add bots to fill empty seats.' : 'Only the host picks the game.'}
      </p>
    </div>
  );
}

// ---- board (delegates to the chosen sub-game) ------------------------------

function Board({ state, myId, dispatch }: BoardProps<RoadState>) {
  if (state.chosen === 'civicpath' && state.civic) {
    return <CivicBoard state={state.civic} players={state.players} myId={myId} dispatch={dispatch} />;
  }
  if (state.chosen === 'jeopardy' && state.jeopardy) {
    return <JeopardyBoard state={state.jeopardy} players={state.players} myId={myId} dispatch={dispatch} />;
  }
  if (state.chosen === 'trivia' && state.trivia) {
    return <TriviaBoard state={state.trivia} players={state.players} myId={myId} dispatch={dispatch} />;
  }
  return null;
}

export const roadToCitizenship: GameDefinition<RoadState> = {
  id: 'road-to-citizenship',
  name: 'Road to Citizenship',
  tagline: 'Study for the U.S. citizenship test together — pick a game after you join: fast-paced Trivia or the strategic Civic Path. Solo or 1–6 friends, with bots.',
  accent: '#B22234',
  emoji: '🗽',
  minPlayers: 1,
  maxPlayers: 6,
  createInitialState,
  start,
  reducer,
  redact,
  botMove,
  Board,
  LobbyExtra: GamePicker,
  gameOverMessage: (state, myId) => {
    if (state.chosen === 'civicpath' && state.civic) return civicGameOverMessage(state.civic, state.players, state.winnerId, myId);
    if (state.chosen === 'jeopardy' && state.jeopardy) return jeopardyGameOverMessage(state.jeopardy, state.players, state.winnerId, myId);
    if (state.trivia) return triviaGameOverMessage(state.trivia, state.players, state.winnerId, myId);
    return state.winnerId === myId ? 'You win!' : 'Game over.';
  },
};
