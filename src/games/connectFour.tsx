import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';
import { gameCard } from './catalog';

const ROWS = 6;
const COLS = 7;
const idx = (r: number, c: number) => r * COLS + c;

export interface ConnectFourState extends BaseState {
  board: (string | null)[]; // 42 cells, row-major (row 0 = top), value = player id
  turnId: string | null;
  winningCells: number[] | null;
}

function checkWin(board: (string | null)[], pid: string): number[] | null {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[idx(r, c)] !== pid) continue;
      for (const [dr, dc] of dirs) {
        const cells = [idx(r, c)];
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[idx(rr, cc)] === pid) {
          cells.push(idx(rr, cc));
          if (cells.length === 4) return cells;
          rr += dr; cc += dc;
        }
      }
    }
  }
  return null;
}

const landingRow = (board: (string | null)[], col: number): number => {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[idx(r, col)] === null) return r;
  }
  return -1; // column full
};

function createInitialState(roomId: string): ConnectFourState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    board: Array(ROWS * COLS).fill(null),
    turnId: null,
    winningCells: null,
  };
}

function start(state: ConnectFourState): ConnectFourState {
  const ids = Object.keys(state.players);
  return { ...state, status: 'playing', board: Array(ROWS * COLS).fill(null), turnId: ids[0], winningCells: null };
}

function reducer(state: ConnectFourState, pid: string, action: GameAction): ConnectFourState {
  if (state.status !== 'playing' || pid !== state.turnId) return state;
  const col = action.col as number;
  if (col < 0 || col >= COLS) return state;
  const row = landingRow(state.board, col);
  if (row < 0) return state; // column full

  const board = state.board.slice();
  board[idx(row, col)] = pid;

  const win = checkWin(board, pid);
  if (win) return { ...state, board, status: 'gameover', winnerId: pid, winningCells: win, turnId: null };
  if (board.every(Boolean)) return { ...state, board, status: 'gameover', winnerId: null, turnId: null };

  const ids = Object.keys(state.players);
  return { ...state, board, turnId: pid === ids[0] ? ids[1] : ids[0] };
}

// Bot: win if possible, block an opponent win, avoid handing the opponent an
// immediate win on top of its drop, and otherwise favour central columns.
function botMove(state: ConnectFourState, botId: string): GameAction | null {
  if (state.status !== 'playing' || state.turnId !== botId) return null;
  const ids = Object.keys(state.players);
  const opp = botId === ids[0] ? ids[1] : ids[0];
  const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => landingRow(state.board, c) >= 0);
  if (!open.length) return null;

  const winningCol = (who: string): number => {
    for (const c of open) {
      const row = landingRow(state.board, c);
      const t = state.board.slice();
      t[idx(row, c)] = who;
      if (checkWin(t, who)) return c;
    }
    return -1;
  };

  let col = winningCol(botId);
  if (col < 0) col = winningCol(opp);
  if (col < 0) {
    // Don't play a column that lets the opponent win directly on top.
    const safe = open.filter((c) => {
      const row = landingRow(state.board, c);
      const t = state.board.slice();
      t[idx(row, c)] = botId;
      const row2 = landingRow(t, c);
      if (row2 < 0) return true;
      const t2 = t.slice();
      t2[idx(row2, c)] = opp;
      return !checkWin(t2, opp);
    });
    const pool = safe.length ? safe : open;
    const preference = [3, 2, 4, 1, 5, 0, 6];
    col = preference.find((c) => pool.includes(c)) ?? pool[0];
  }
  return { col };
}

function Board({ state, myId, dispatch }: BoardProps<ConnectFourState>) {
  const ids = Object.keys(state.players);
  const colorOf = (pid: string | null) =>
    pid === ids[0] ? '#E63946' : pid === ids[1] ? '#FFC300' : 'transparent';
  const myColor = colorOf(myId);
  const myTurn = state.turnId === myId;
  const opponent = Object.values(state.players).find((p) => p.id !== myId);
  const winning = new Set(state.winningCells ?? []);

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-2xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-6 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Connect 4</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
      </div>

      <div className={cn(
        "flex items-center gap-3 px-6 py-2 border-2 border-[#39414E] font-bold text-sm sm:text-lg uppercase shadow-[4px_4px_0px_#454C5A] mb-8",
        myTurn ? "bg-[#E63946] text-white" : "bg-[#262B34] text-white"
      )}>
        <span className="inline-block w-5 h-5 rounded-full border-2 border-white" style={{ background: myColor }} />
        {myTurn ? 'Your turn' : `${opponent?.name ?? 'Opponent'}'s turn`}
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 bg-[#262B34] p-2 sm:p-3 border-2 border-[#39414E] shadow-[8px_8px_0px_#2E343F] w-full max-w-[480px]">
        {Array.from({ length: COLS }, (_, col) => {
          const full = landingRow(state.board, col) < 0;
          const canPlay = myTurn && !full;
          return (
            <button
              key={col}
              disabled={!canPlay}
              onClick={() => dispatch({ col })}
              className={cn(
                "flex flex-col gap-1.5 sm:gap-2 rounded-md p-0.5 transition-colors touch-manipulation",
                canPlay && "hover:bg-[#1A1D24]/10"
              )}
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const cell = state.board[idx(row, col)];
                const cellIdx = idx(row, col);
                return (
                  <span
                    key={row}
                    className={cn(
                      "aspect-square rounded-full bg-[#0F1117] border border-[#ffffff14]",
                      winning.has(cellIdx) && "ring-2 ring-white"
                    )}
                    style={cell ? { background: colorOf(cell) } : undefined}
                  />
                );
              })}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] sm:text-xs font-bold text-[#E2E4E8] border-l-2 border-[#E63946] pl-3 uppercase tracking-widest mt-6">
        Drop a disc into any column. Four in a row wins.
      </p>
    </div>
  );
}

export const connectFour: GameDefinition<ConnectFourState> = {
  ...gameCard('connect-four'),
  createInitialState,
  start,
  reducer,
  botMove,
  Board,
  gameOverMessage: (state, myId) =>
    !state.winnerId
      ? "It's a draw — board full!"
      : state.winnerId === myId
        ? '🎉 You connected four!'
        : `${state.players[state.winnerId]?.name ?? 'Opponent'} connected four!`,
};
