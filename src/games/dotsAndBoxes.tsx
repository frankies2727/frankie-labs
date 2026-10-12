import type { ReactNode } from 'react';
import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';

// Classic pencil-and-paper Dots & Boxes on a dots×dots lattice. Players take
// turns drawing one edge between adjacent dots; closing the 4th side of a box
// claims it AND earns another turn. Most boxes when the grid fills wins.
//
// The grid size is chosen at the start of each game: a small board for a quick
// game or the full board for a long one. All geometry is derived from the
// chosen `dots` value carried in the state.
const QUICK_DOTS = 5; // (5-1)^2 = 16 boxes
const LONG_DOTS = 8; //  (8-1)^2 = 49 boxes
const DEFAULT_DOTS = LONG_DOTS;

const cols = (dots: number) => dots - 1; // boxes / edges per row
const hCount = (dots: number) => dots * cols(dots); // horizontal edges
const vCount = (dots: number) => cols(dots) * dots; // vertical edges
const boxCount = (dots: number) => cols(dots) * cols(dots);

const hIdx = (dots: number, r: number, c: number) => r * cols(dots) + c;
const vIdx = (dots: number, r: number, c: number) => r * dots + c;
const bIdx = (dots: number, r: number, c: number) => r * cols(dots) + c;

type Edge = 'h' | 'v';

export interface DotsAndBoxesState extends BaseState {
  phase: 'choosing' | 'playing'; // pick a grid size, then play
  dots: number; // dots per side
  hEdges: (string | null)[]; // player id who drew it, or null
  vEdges: (string | null)[];
  boxes: (string | null)[]; // owner per box
  scores: Record<string, number>;
  turnId: string | null;
  lastEdge: { edge: Edge; i: number } | null;
}

// Count of drawn sides of box (br,bc) given edge arrays.
function sidesOf(dots: number, h: (string | null)[], v: (string | null)[], br: number, bc: number): number {
  let n = 0;
  if (h[hIdx(dots, br, bc)] != null) n++;
  if (h[hIdx(dots, br + 1, bc)] != null) n++;
  if (v[vIdx(dots, br, bc)] != null) n++;
  if (v[vIdx(dots, br, bc + 1)] != null) n++;
  return n;
}

// Boxes that border a given edge (one or two of them).
function boxesTouching(dots: number, edge: Edge, i: number): [number, number][] {
  const out: [number, number][] = [];
  const C = cols(dots);
  if (edge === 'h') {
    const r = Math.floor(i / C);
    const c = i % C;
    if (r < C) out.push([r, c]); // box below
    if (r > 0) out.push([r - 1, c]); // box above
  } else {
    const r = Math.floor(i / dots);
    const c = i % dots;
    if (c < C) out.push([r, c]); // box right
    if (c > 0) out.push([r, c - 1]); // box left
  }
  return out;
}

function createInitialState(roomId: string): DotsAndBoxesState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    phase: 'choosing',
    dots: DEFAULT_DOTS,
    hEdges: [],
    vEdges: [],
    boxes: [],
    scores: {},
    turnId: null,
    lastEdge: null,
  };
}

function start(state: DotsAndBoxesState): DotsAndBoxesState {
  const ids = Object.keys(state.players);
  const scores: Record<string, number> = {};
  for (const id of ids) scores[id] = 0;
  // Enter the grid-size chooser; the first player picks before any lines exist.
  return {
    ...state,
    status: 'playing',
    phase: 'choosing',
    dots: DEFAULT_DOTS,
    hEdges: [],
    vEdges: [],
    boxes: [],
    scores,
    turnId: ids[0],
    lastEdge: null,
  };
}

function reducer(state: DotsAndBoxesState, pid: string, action: GameAction): DotsAndBoxesState {
  if (state.status !== 'playing') return state;

  // Grid-size selection: only the first player chooses, then the board is built.
  if (state.phase === 'choosing') {
    if (pid !== state.turnId || action.a !== 'size') return state;
    const dots = action.dots as number;
    if (dots !== QUICK_DOTS && dots !== LONG_DOTS) return state;
    return {
      ...state,
      phase: 'playing',
      dots,
      hEdges: Array(hCount(dots)).fill(null),
      vEdges: Array(vCount(dots)).fill(null),
      boxes: Array(boxCount(dots)).fill(null),
    };
  }

  if (pid !== state.turnId) return state;
  const dots = state.dots;
  const edge = action.edge as Edge;
  const i = action.i as number;
  if (edge !== 'h' && edge !== 'v') return state;

  const hEdges = state.hEdges.slice();
  const vEdges = state.vEdges.slice();
  if (edge === 'h') {
    if (i < 0 || i >= hCount(dots) || hEdges[i] != null) return state;
    hEdges[i] = pid;
  } else {
    if (i < 0 || i >= vCount(dots) || vEdges[i] != null) return state;
    vEdges[i] = pid;
  }

  // Claim any box this edge just closed.
  const boxes = state.boxes.slice();
  const scores = { ...state.scores };
  let claimed = 0;
  for (const [br, bc] of boxesTouching(dots, edge, i)) {
    if (boxes[bIdx(dots, br, bc)] == null && sidesOf(dots, hEdges, vEdges, br, bc) === 4) {
      boxes[bIdx(dots, br, bc)] = pid;
      scores[pid] = (scores[pid] ?? 0) + 1;
      claimed++;
    }
  }

  const lastEdge = { edge, i };
  // Grid full -> game over; otherwise closing a box earns another turn.
  if (boxes.every(Boolean)) {
    const ids = Object.keys(state.players);
    const [a, b] = ids;
    const winnerId = scores[a] === scores[b] ? null : scores[a] > scores[b] ? a : b;
    return { ...state, hEdges, vEdges, boxes, scores, lastEdge, status: 'gameover', winnerId, turnId: null };
  }
  const ids = Object.keys(state.players);
  const turnId = claimed > 0 ? pid : pid === ids[0] ? ids[1] : ids[0];
  return { ...state, hEdges, vEdges, boxes, scores, lastEdge, turnId };
}

// Bot: take a box if one is available (and keep going, since that earns another
// turn), otherwise prefer an edge that doesn't open a 3-sided box for the rival.
function botMove(state: DotsAndBoxesState, botId: string): GameAction | null {
  if (state.status !== 'playing' || state.turnId !== botId) return null;
  // The first player owns the size choice; if a bot ever sits first, default it.
  if (state.phase === 'choosing') return { a: 'size', dots: DEFAULT_DOTS };
  const dots = state.dots;

  const moves: { edge: Edge; i: number }[] = [];
  for (let i = 0; i < hCount(dots); i++) if (state.hEdges[i] == null) moves.push({ edge: 'h', i });
  for (let i = 0; i < vCount(dots); i++) if (state.vEdges[i] == null) moves.push({ edge: 'v', i });
  if (!moves.length) return null;

  // Sides each bordering box would have *after* playing this move.
  const sidesAfter = (m: { edge: Edge; i: number }): number[] => {
    const h = state.hEdges.slice();
    const v = state.vEdges.slice();
    if (m.edge === 'h') h[m.i] = botId; else v[m.i] = botId;
    return boxesTouching(dots, m.edge, m.i).map(([br, bc]) => sidesOf(dots, h, v, br, bc));
  };

  const completing = moves.filter((m) => sidesAfter(m).some((s) => s === 4));
  if (completing.length) return completing[Math.floor(Math.random() * completing.length)];

  const safe = moves.filter((m) => !sidesAfter(m).some((s) => s === 3));
  const pool = safe.length ? safe : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- Grid-size chooser (shown before the first line) ----
function SizeChooser({ myTurn, chooserName, dispatch }: { myTurn: boolean; chooserName: string; dispatch: (a: GameAction) => void }) {
  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-md mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-8 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Dots &amp; Boxes</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Choose a board size</span>
      </div>

      {myTurn ? (
        <div className="flex flex-col gap-4 w-full">
          <button
            onClick={() => dispatch({ a: 'size', dots: QUICK_DOTS })}
            className="w-full p-6 text-left bg-[#1A1D24] hover:bg-[#262B34] active:translate-y-1 transition-all border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A]"
          >
            <div className="text-xl font-bold uppercase tracking-wider text-[#F5F6F7]">⚡ Quick Game</div>
            <div className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8] mt-2">
              {QUICK_DOTS}×{QUICK_DOTS} dots · {cols(QUICK_DOTS) * cols(QUICK_DOTS)} boxes
            </div>
          </button>
          <button
            onClick={() => dispatch({ a: 'size', dots: LONG_DOTS })}
            className="w-full p-6 text-left bg-[#1A1D24] hover:bg-[#262B34] active:translate-y-1 transition-all border-2 border-[#39414E] shadow-[4px_4px_0px_#E76F51] hover:shadow-[2px_2px_0px_#E76F51]"
          >
            <div className="text-xl font-bold uppercase tracking-wider text-[#F5F6F7]">🏔 Long Game</div>
            <div className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8] mt-2">
              {LONG_DOTS}×{LONG_DOTS} dots · {cols(LONG_DOTS) * cols(LONG_DOTS)} boxes
            </div>
          </button>
        </div>
      ) : (
        <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">
          Waiting for {chooserName} to pick a board size…
        </p>
      )}
    </div>
  );
}

function Board({ state, myId, dispatch }: BoardProps<DotsAndBoxesState>) {
  const ids = Object.keys(state.players);
  const colorOf = (pid: string | null) => (pid === ids[0] ? '#E76F51' : pid === ids[1] ? '#2A9D8F' : '#D1D1D1');
  const me = Object.values(state.players).find((p) => p.id === myId);
  const opponent = Object.values(state.players).find((p) => p.id !== myId);
  const myTurn = state.turnId === myId;
  const dots = state.dots;

  if (state.phase === 'choosing') {
    const chooser = state.turnId ? state.players[state.turnId] : null;
    return <SizeChooser myTurn={myTurn} chooserName={chooser?.name ?? 'opponent'} dispatch={dispatch} />;
  }

  const place = (edge: Edge, i: number, drawn: boolean) => {
    if (!myTurn || drawn) return;
    dispatch({ edge, i });
  };

  // Build the interleaved grid: 2·dots−1 tracks each way (dot / cell / dot / …).
  const tracks = 2 * dots - 1;
  const cells: ReactNode[] = [];
  for (let R = 0; R < tracks; R++) {
    for (let C = 0; C < tracks; C++) {
      const evenR = R % 2 === 0;
      const evenC = C % 2 === 0;
      if (evenR && evenC) {
        cells.push(<span key={`${R}-${C}`} className="w-2.5 h-2.5 rounded-full bg-[#C9CED6] place-self-center" />);
      } else if (evenR && !evenC) {
        // Horizontal edge between dots
        const i = hIdx(dots, R / 2, (C - 1) / 2);
        const owner = state.hEdges[i];
        const drawn = owner != null;
        const isLast = drawn && state.lastEdge?.edge === 'h' && state.lastEdge.i === i;
        cells.push(
          <button
            key={`${R}-${C}`}
            disabled={!myTurn || drawn}
            onClick={() => place('h', i, drawn)}
            className="group flex items-center justify-center h-2.5 touch-manipulation"
          >
            <span
              className={cn(
                'h-1.5 w-full rounded-full transition-colors',
                drawn ? '' : 'bg-[#2E343F] group-hover:bg-[#C9CED6]/40',
                isLast && 'animate-flash-line',
              )}
              style={drawn ? { background: colorOf(owner) } : undefined}
            />
          </button>,
        );
      } else if (!evenR && evenC) {
        // Vertical edge between dots
        const i = vIdx(dots, (R - 1) / 2, C / 2);
        const owner = state.vEdges[i];
        const drawn = owner != null;
        const isLast = drawn && state.lastEdge?.edge === 'v' && state.lastEdge.i === i;
        cells.push(
          <button
            key={`${R}-${C}`}
            disabled={!myTurn || drawn}
            onClick={() => place('v', i, drawn)}
            className="group flex items-center justify-center w-2.5 touch-manipulation"
          >
            <span
              className={cn(
                'w-1.5 h-full rounded-full transition-colors',
                drawn ? '' : 'bg-[#2E343F] group-hover:bg-[#C9CED6]/40',
                isLast && 'animate-flash-line',
              )}
              style={drawn ? { background: colorOf(owner) } : undefined}
            />
          </button>,
        );
      } else {
        // Box interior
        const owner = state.boxes[bIdx(dots, (R - 1) / 2, (C - 1) / 2)];
        cells.push(
          <span
            key={`${R}-${C}`}
            className="flex items-center justify-center text-[11px] font-black uppercase"
            style={owner ? { background: `${colorOf(owner)}33`, color: colorOf(owner) } : undefined}
          >
            {owner ? state.players[owner]?.name?.charAt(0).toUpperCase() : ''}
          </span>,
        );
      }
    }
  }

  // Dots fixed-size, edges/boxes flexible so boxes render roughly square.
  const colTemplate = Array.from({ length: tracks }, (_, k) => (k % 2 === 0 ? '10px' : '1fr')).join(' ');

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-6 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Dots &amp; Boxes</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
      </div>

      {/* Scoreboard */}
      <div className="flex items-stretch gap-4 w-full max-w-md mb-6">
        {[me, opponent].map((p, idx) => p && (
          <div
            key={p.id}
            className={cn(
              'flex-1 border-2 border-[#39414E] p-3 text-center',
              state.turnId === p.id ? 'text-white' : 'bg-[#1A1D24] text-[#F5F6F7]',
            )}
            style={state.turnId === p.id ? { background: colorOf(p.id) } : undefined}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest truncate">{idx === 0 ? 'You' : p.name}</div>
            <div className="text-3xl font-black font-mono">{state.scores[p.id] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className={cn(
        'px-6 py-2 border-2 border-[#39414E] font-bold text-sm uppercase shadow-[4px_4px_0px_#454C5A] mb-6',
        myTurn ? 'bg-[#E76F51] text-white' : 'bg-[#262B34] text-white',
      )}>
        {myTurn ? 'Your turn — draw a line' : `${opponent?.name ?? 'Opponent'}'s turn`}
      </div>

      <div
        className="grid w-full max-w-[440px] aspect-square select-none"
        style={{ gridTemplateColumns: colTemplate, gridTemplateRows: colTemplate }}
      >
        {cells}
      </div>

      <p className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] mt-6 text-center">
        Close the 4th side of a box to claim it &amp; go again · most boxes wins
      </p>
    </div>
  );
}

export const dotsAndBoxes: GameDefinition<DotsAndBoxesState> = {
  id: 'dots-and-boxes',
  name: 'Dots & Boxes',
  tagline: 'Draw lines, close boxes, claim the most. Pick a quick or long game.',
  accent: '#E76F51',
  emoji: '🔳',
  createInitialState,
  start,
  reducer,
  botMove,
  Board,
  gameOverMessage: (state, myId) =>
    !state.winnerId
      ? "It's a tie — boxes split evenly!"
      : state.winnerId === myId
        ? '🎉 You boxed them in!'
        : `${state.players[state.winnerId]?.name ?? 'Opponent'} claimed the most boxes!`,
};
