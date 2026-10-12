import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';
import { gameCard } from './catalog';

export interface TicTacToeState extends BaseState {
  board: (string | null)[]; // 9 cells, value = player id
  turnId: string | null;
  winningLine: number[] | null;
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

const winnerLine = (board: (string | null)[], pid: string): number[] | null =>
  LINES.find((line) => line.every((i) => board[i] === pid)) ?? null;

function createInitialState(roomId: string): TicTacToeState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    board: Array(9).fill(null),
    turnId: null,
    winningLine: null,
  };
}

function start(state: TicTacToeState): TicTacToeState {
  const ids = Object.keys(state.players);
  return { ...state, status: 'playing', board: Array(9).fill(null), turnId: ids[0], winningLine: null };
}

function reducer(state: TicTacToeState, pid: string, action: GameAction): TicTacToeState {
  if (state.status !== 'playing' || pid !== state.turnId) return state;
  const index = action.index as number;
  if (index < 0 || index >= 9 || state.board[index] !== null) return state;

  const board = state.board.slice();
  board[index] = pid;

  const line = winnerLine(board, pid);
  if (line) return { ...state, board, status: 'gameover', winnerId: pid, winningLine: line, turnId: null };
  if (board.every(Boolean)) return { ...state, board, status: 'gameover', winnerId: null, turnId: null };

  const ids = Object.keys(state.players);
  return { ...state, board, turnId: pid === ids[0] ? ids[1] : ids[0] };
}

// Bot: win if it can, else block, else prefer center > corners > edges.
function botMove(state: TicTacToeState, botId: string): GameAction | null {
  if (state.status !== 'playing' || state.turnId !== botId) return null;
  const b = state.board;
  const ids = Object.keys(state.players);
  const opp = botId === ids[0] ? ids[1] : ids[0];
  const empties = b.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);

  const finisher = (who: string): number => {
    for (const i of empties) {
      const t = b.slice();
      t[i] = who;
      if (winnerLine(t, who)) return i;
    }
    return -1;
  };

  let i = finisher(botId);
  if (i < 0) i = finisher(opp);
  if (i < 0 && b[4] === null) i = 4;
  if (i < 0) {
    const corners = [0, 2, 6, 8].filter((c) => b[c] === null);
    const pool = corners.length ? corners : empties;
    i = pool[Math.floor(Math.random() * pool.length)];
  }
  return i >= 0 ? { index: i } : null;
}

function Board({ state, myId, dispatch }: BoardProps<TicTacToeState>) {
  const ids = Object.keys(state.players);
  const symbolOf = (pid: string | null) => (pid === ids[0] ? 'X' : pid === ids[1] ? 'O' : '');
  const mySymbol = symbolOf(myId);
  const myTurn = state.turnId === myId;
  const opponent = Object.values(state.players).find((p) => p.id !== myId);
  const winning = new Set(state.winningLine ?? []);

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-6 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Tic-Tac-Toe</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
      </div>

      <div className={cn(
        "px-6 py-2 border-2 border-[#39414E] font-bold text-sm sm:text-lg uppercase shadow-[4px_4px_0px_#454C5A] mb-8",
        myTurn ? "bg-[#E63946] text-white" : "bg-[#262B34] text-white"
      )}>
        You are {mySymbol} · {myTurn ? 'Your turn' : `${opponent?.name ?? 'Opponent'}'s turn`}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-[360px] aspect-square">
        {state.board.map((cell, i) => {
          const sym = symbolOf(cell);
          const canPlay = myTurn && cell === null;
          return (
            <button
              key={i}
              disabled={!canPlay}
              onClick={() => dispatch({ index: i })}
              className={cn(
                "aspect-square bg-[#1A1D24] border-2 border-[#39414E] shadow-[4px_4px_0px_#2E343F] flex items-center justify-center text-5xl sm:text-6xl font-black transition-colors touch-manipulation",
                winning.has(i) && "bg-green-900/50",
                sym === 'X' ? "text-[#E63946]" : "text-[#F5F6F7]",
                canPlay && "hover:bg-[#262B34] active:translate-y-0.5"
              )}
            >
              {sym}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const ticTacToe: GameDefinition<TicTacToeState> = {
  ...gameCard('tic-tac-toe'),
  createInitialState,
  start,
  reducer,
  botMove,
  Board,
  gameOverMessage: (state, myId) =>
    !state.winnerId
      ? "It's a draw!"
      : state.winnerId === myId
        ? '🎉 You win!'
        : `${state.players[state.winnerId]?.name ?? 'Opponent'} wins!`,
};
