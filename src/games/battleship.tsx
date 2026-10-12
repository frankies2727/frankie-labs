import { useEffect, useState } from 'react';
import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';
import { gameCard } from './catalog';

// A bigger ocean and a six-ship fleet, for 2–5 admirals.
const SIZE = 12;
const SHIPS = [5, 4, 4, 3, 3, 2]; // cells per ship
const SHIP_NAMES = ['Carrier', 'Battleship', 'Destroyer', 'Cruiser', 'Submarine', 'Patrol Boat'];
const TOTAL_SHIP_CELLS = SHIPS.reduce((a, b) => a + b, 0); // 21
const CELLS = SIZE * SIZE;
const idx = (r: number, c: number) => r * SIZE + c;

type Shot = 'hit' | 'miss' | null;

export interface BattleshipState extends BaseState {
  phase: 'placing' | 'firing';
  fleets: Record<string, (number | null)[]>; // CELLS, shipId or null
  incoming: Record<string, Shot[]>; // shots received per player (CELLS)
  ready: Record<string, boolean>;
  order: string[]; // fixed turn order, set at start
  turnId: string | null;
  eliminated: Record<string, boolean>;
  lastShot: { by: string; target: string; cell: number; result: 'hit' | 'miss'; sunk: number | null } | null;
}

function randomFleet(): (number | null)[] {
  const cells: (number | null)[] = Array(CELLS).fill(null);
  SHIPS.forEach((size, shipId) => {
    for (;;) {
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      const coords: number[] = [];
      for (let k = 0; k < size; k++) {
        const rr = horiz ? r : r + k;
        const cc = horiz ? c + k : c;
        if (rr >= SIZE || cc >= SIZE) { coords.length = 0; break; }
        coords.push(idx(rr, cc));
      }
      if (coords.length !== size || coords.some((i) => cells[i] !== null)) continue;
      coords.forEach((i) => { cells[i] = shipId; });
      break;
    }
  });
  return cells;
}

function shipCellsAt(bow: number, size: number, horiz: boolean): number[] | null {
  const r = Math.floor(bow / SIZE);
  const c = bow % SIZE;
  const cells: number[] = [];
  for (let k = 0; k < size; k++) {
    const rr = horiz ? r : r + k;
    const cc = horiz ? c + k : c;
    if (rr >= SIZE || cc >= SIZE) return null;
    cells.push(idx(rr, cc));
  }
  return cells;
}

function fleetComplete(fleet: (number | null)[]): boolean {
  const counts = SHIPS.map(() => 0);
  for (const v of fleet) if (v != null) counts[v]++;
  return counts.every((n, shipId) => n === SHIPS[shipId]);
}

// Which of a player's ships are fully sunk, from a (possibly redacted) fleet +
// the shots it has received. A sunk ship has every one of its cells hit, and a
// hit cell always carries its shipId even in a redacted view, so this works for
// both your own fleet and an enemy's.
function sunkShips(fleet: (number | null)[], incoming: Shot[]): boolean[] {
  const cnt = SHIPS.map(() => 0);
  for (let i = 0; i < CELLS; i++) if (incoming[i] === 'hit' && fleet[i] != null) cnt[fleet[i]!]++;
  return SHIPS.map((sz, id) => cnt[id] === sz);
}

const nextAlive = (order: string[], from: string, eliminated: Record<string, boolean>): string => {
  const n = order.length;
  const start = order.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const id = order[(start + k) % n];
    if (!eliminated[id]) return id;
  }
  return from;
};

function createInitialState(roomId: string): BattleshipState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    phase: 'placing',
    fleets: {},
    incoming: {},
    ready: {},
    order: [],
    turnId: null,
    eliminated: {},
    lastShot: null,
  };
}

function start(state: BattleshipState): BattleshipState {
  const ids = Object.keys(state.players);
  const fleets: Record<string, (number | null)[]> = {};
  const incoming: Record<string, Shot[]> = {};
  const ready: Record<string, boolean> = {};
  const eliminated: Record<string, boolean> = {};
  for (const id of ids) {
    fleets[id] = randomFleet();
    incoming[id] = Array(CELLS).fill(null);
    ready[id] = false;
    eliminated[id] = false;
  }
  return { ...state, status: 'playing', phase: 'placing', fleets, incoming, ready, order: ids, eliminated, turnId: null, lastShot: null };
}

function reducer(state: BattleshipState, pid: string, action: GameAction): BattleshipState {
  if (state.status !== 'playing') return state;

  if (state.phase === 'placing') {
    if (state.ready[pid]) return state;

    if (action.a === 'shuffle') {
      return { ...state, fleets: { ...state.fleets, [pid]: randomFleet() } };
    }
    if (action.a === 'clear') {
      return { ...state, fleets: { ...state.fleets, [pid]: Array(CELLS).fill(null) } };
    }
    if (action.a === 'place') {
      const shipId = action.shipId as number;
      const cells = action.cells as number[];
      if (shipId < 0 || shipId >= SHIPS.length) return state;
      if (!Array.isArray(cells) || cells.length !== SHIPS[shipId]) return state;
      if (cells.some((i) => i < 0 || i >= CELLS)) return state;
      const current = state.fleets[pid] || Array(CELLS).fill(null);
      const occupied = current.some((v, i) => v != null && v !== shipId && cells.includes(i));
      if (occupied) return state;
      const next = current.map((v) => (v === shipId ? null : v));
      cells.forEach((i) => { next[i] = shipId; });
      return { ...state, fleets: { ...state.fleets, [pid]: next } };
    }
    if (action.a === 'ready') {
      if (!fleetComplete(state.fleets[pid] || [])) return state;
      const ready = { ...state.ready, [pid]: true };
      const ids = state.order.length ? state.order : Object.keys(state.players);
      const allReady = ids.length >= 2 && ids.every((id) => ready[id]);
      return allReady
        ? { ...state, ready, phase: 'firing', turnId: ids[0] }
        : { ...state, ready };
    }
    return state;
  }

  // firing — fire at a chosen opponent
  if (action.a === 'fire' && pid === state.turnId) {
    const target = action.target as string;
    const cell = action.cell as number;
    if (!target || target === pid || !state.players[target] || state.eliminated[target]) return state;
    if (cell < 0 || cell >= CELLS) return state;
    const inc = state.incoming[target];
    if (inc[cell] != null) return state; // already fired there

    const hit = state.fleets[target][cell] != null;
    const newInc = inc.slice();
    newInc[cell] = hit ? 'hit' : 'miss';
    const incoming = { ...state.incoming, [target]: newInc };

    let sunk: number | null = null;
    if (hit) {
      const shipId = state.fleets[target][cell]!;
      const shipCells: number[] = [];
      for (let i = 0; i < CELLS; i++) if (state.fleets[target][i] === shipId) shipCells.push(i);
      if (shipCells.every((i) => newInc[i] === 'hit')) sunk = shipId;
    }

    const targetDown = newInc.filter((v) => v === 'hit').length >= TOTAL_SHIP_CELLS;
    const eliminated = targetDown ? { ...state.eliminated, [target]: true } : state.eliminated;
    const alive = state.order.filter((id) => !eliminated[id]);
    const lastShot = { by: pid, target, cell, result: hit ? ('hit' as const) : ('miss' as const), sunk };

    if (alive.length <= 1) {
      return { ...state, incoming, eliminated, lastShot, status: 'gameover', winnerId: alive[0] ?? pid, turnId: null };
    }
    return { ...state, incoming, eliminated, lastShot, turnId: nextAlive(state.order, pid, eliminated) };
  }

  return state;
}

// Bot: confirm its randomized fleet, then hunt. It finishes off any ship it has
// started (adjacent to an existing hit on any opponent), otherwise fires at a
// random living opponent on a checkerboard pattern.
function botMove(state: BattleshipState, botId: string): GameAction | null {
  if (state.status !== 'playing') return null;
  if (state.phase === 'placing') return state.ready[botId] ? null : { a: 'ready' };
  if (state.turnId !== botId) return null;

  const opponents = state.order.filter((id) => id !== botId && !state.eliminated[id]);
  if (!opponents.length) return null;

  const open = (inc: Shot[], i: number) => i >= 0 && i < CELLS && inc[i] == null;

  // Adjacency targets across all opponents.
  const adj: { target: string; cell: number }[] = [];
  for (const t of opponents) {
    const inc = state.incoming[t];
    for (let i = 0; i < CELLS; i++) {
      if (inc[i] !== 'hit') continue;
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && open(inc, rr * SIZE + cc)) adj.push({ target: t, cell: rr * SIZE + cc });
      }
    }
  }
  if (adj.length) {
    const a = adj[Math.floor(Math.random() * adj.length)];
    return { a: 'fire', target: a.target, cell: a.cell };
  }

  const target = opponents[Math.floor(Math.random() * opponents.length)];
  const inc = state.incoming[target];
  const pool: number[] = [];
  for (let i = 0; i < CELLS; i++) if (open(inc, i) && (Math.floor(i / SIZE) + (i % SIZE)) % 2 === 0) pool.push(i);
  if (!pool.length) for (let i = 0; i < CELLS; i++) if (open(inc, i)) pool.push(i);
  if (!pool.length) return null;
  return { a: 'fire', target, cell: pool[Math.floor(Math.random() * pool.length)] };
}

// Hide every other player's un-hit ships from the viewer.
function redact(state: BattleshipState, viewerId: string): BattleshipState {
  if (!state.fleets || Object.keys(state.fleets).length === 0) return state;
  const fleets: Record<string, (number | null)[]> = { ...state.fleets };
  for (const pid of Object.keys(fleets)) {
    if (pid === viewerId) continue;
    const inc = state.incoming[pid] || [];
    fleets[pid] = fleets[pid].map((v, i) => (inc[i] === 'hit' ? v : null));
  }
  return { ...state, fleets };
}

function GridCell({ kind, onClick, clickable, small }: { key?: number; kind: 'water' | 'ship' | 'hit' | 'miss'; onClick?: () => void; clickable?: boolean; small?: boolean }) {
  return (
    <button
      disabled={!clickable}
      onClick={onClick}
      className={cn(
        'aspect-square border border-[#27313a] flex items-center justify-center touch-manipulation',
        small ? 'text-[8px]' : 'text-[10px] sm:text-xs',
        kind === 'water' && 'bg-[#172029]',
        kind === 'ship' && 'bg-[#5b6770]',
        kind === 'hit' && 'bg-[#E63946]',
        kind === 'miss' && 'bg-[#172029]',
        clickable && 'hover:bg-[#1f2d38] cursor-pointer',
      )}
    >
      {kind === 'hit' && <span className="text-white font-bold">✕</span>}
      {kind === 'miss' && <span className="w-1 h-1 rounded-full bg-[#6b7882]" />}
    </button>
  );
}

// The side panel listing every ship kind, its size, and whether it's sunk.
function FleetStatus({ title, sunk, tone }: { title: string; sunk: boolean[]; tone: 'enemy' | 'own' }) {
  const remaining = sunk.filter((s) => !s).length;
  return (
    <div className="border-2 border-[#39414E] bg-[#1A1D24] p-3 w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#E2E4E8]">{title}</span>
        <span className={cn('text-[10px] font-mono font-bold uppercase tracking-widest', remaining ? 'text-[#E63946]' : 'text-[#2A9D8F]')}>
          {remaining} left
        </span>
      </div>
      <ul className="space-y-1">
        {SHIPS.map((size, id) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className={cn('text-xs font-bold', sunk[id] ? 'line-through text-[#E2E4E8]' : 'text-[#E2E4E8]')}>
              {SHIP_NAMES[id]}
            </span>
            <span className="flex items-center gap-1">
              <span className="flex gap-0.5">
                {Array.from({ length: size }).map((_, k) => (
                  <span key={k} className={cn('w-2 h-2 border', sunk[id] ? 'bg-[#E63946] border-[#E63946]' : tone === 'enemy' ? 'bg-transparent border-[#5b6770]' : 'bg-[#5b6770] border-[#5b6770]')} />
                ))}
              </span>
              <span className="text-[9px] font-mono text-[#E2E4E8] w-8 text-right">{sunk[id] ? 'SUNK' : `(${size})`}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlacementBoard({
  myFleet, roomId, iAmReady, readyCount, totalPlayers, dispatch,
}: {
  myFleet: (number | null)[];
  roomId: string;
  iAmReady: boolean;
  readyCount: number;
  totalPlayers: number;
  dispatch: (action: GameAction) => void;
}) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [horiz, setHoriz] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  const placed = SHIPS.map(() => 0);
  for (const v of myFleet) if (v != null) placed[v]++;
  const isPlaced = (shipId: number) => placed[shipId] === SHIPS[shipId];
  const [selected, setSelected] = useState(0);
  const activeShip = isPlaced(selected) ? SHIPS.findIndex((_, s) => !isPlaced(s)) : selected;
  const complete = fleetComplete(myFleet);

  const previewFor = (bow: number): number[] | null =>
    activeShip < 0 ? null : shipCellsAt(bow, SHIPS[activeShip], horiz);
  const overlaps = (cells: number[]) =>
    cells.some((i) => myFleet[i] != null && myFleet[i] !== activeShip);

  const previewCells = mode === 'manual' && hover != null ? previewFor(hover) : null;
  const previewOk = previewCells != null && !overlaps(previewCells);

  const placeAt = (bow: number) => {
    if (activeShip < 0) return;
    const cells = previewFor(bow);
    if (!cells || overlaps(cells)) return;
    dispatch({ a: 'place', shipId: activeShip, cells });
    const nextPlaced = placed.slice();
    nextPlaced[activeShip] = SHIPS[activeShip];
    const next = SHIPS.findIndex((sz, s) => nextPlaced[s] !== sz);
    setSelected(next < 0 ? activeShip : next);
  };

  const switchMode = (m: 'auto' | 'manual') => {
    if (m === mode) return;
    setMode(m);
    dispatch({ a: m === 'auto' ? 'shuffle' : 'clear' });
    setSelected(0);
  };

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-md mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-4 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Battleship</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Place your fleet · Room #{roomId}</span>
      </div>

      {iAmReady ? (
        <>
          <div className="grid grid-cols-12 gap-0.5 w-full max-w-[420px] bg-[#262B34] p-1 border-2 border-[#39414E] shadow-[6px_6px_0px_#2E343F] mb-6">
            {myFleet.map((cell, i) => (
              <GridCell key={i} kind={cell != null ? 'ship' : 'water'} small />
            ))}
          </div>
          <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">
            Waiting for admirals to ready up… ({readyCount}/{totalPlayers})
          </p>
        </>
      ) : (
        <>
          <div className="flex gap-2 w-full max-w-[420px] mb-4">
            {(['auto', 'manual'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  'flex-1 py-2 text-xs font-bold uppercase tracking-widest border-2 border-[#39414E] transition-all',
                  mode === m ? 'bg-[#E63946] text-white' : 'bg-[#1A1D24] text-[#E2E4E8] hover:text-white',
                )}
              >
                {m === 'auto' ? '🎲 Random' : '✋ Place by hand'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-12 gap-0.5 w-full max-w-[420px] bg-[#262B34] p-1 border-2 border-[#39414E] shadow-[6px_6px_0px_#2E343F] mb-4">
            {myFleet.map((cell, i) => {
              const inPreview = previewCells?.includes(i);
              return (
                <button
                  key={i}
                  disabled={mode !== 'manual'}
                  onClick={() => mode === 'manual' && placeAt(i)}
                  onMouseEnter={() => mode === 'manual' && setHover(i)}
                  onMouseLeave={() => mode === 'manual' && setHover(null)}
                  className={cn(
                    'aspect-square border border-[#27313a] flex items-center justify-center touch-manipulation',
                    cell != null ? 'bg-[#5b6770]' : 'bg-[#172029]',
                    inPreview && (previewOk ? 'bg-[#2A9D8F]' : 'bg-[#E63946]'),
                    mode === 'manual' && 'cursor-pointer hover:brightness-125',
                  )}
                />
              );
            })}
          </div>

          {mode === 'manual' && (
            <div className="w-full max-w-[420px] mb-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">Orientation</span>
                <button
                  onClick={() => setHoriz((h) => !h)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-[#1A1D24] text-[#F5F6F7] border-2 border-[#39414E] shadow-[3px_3px_0px_#454C5A] active:translate-y-0.5 active:shadow-none"
                >
                  {horiz ? '↔ Horizontal' : '↕ Vertical'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {SHIPS.map((size, shipId) => (
                  <button
                    key={shipId}
                    onClick={() => setSelected(shipId)}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-2 transition-all',
                      isPlaced(shipId)
                        ? 'border-[#2A9D8F] text-[#2A9D8F] bg-[#2A9D8F]/10'
                        : activeShip === shipId
                          ? 'border-[#E63946] text-white bg-[#E63946]/20'
                          : 'border-[#39414E] text-[#E2E4E8]',
                    )}
                  >
                    {SHIP_NAMES[shipId]} ({size}){isPlaced(shipId) ? ' ✓' : ''}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#E2E4E8] text-center">
                Pick a ship, set orientation, tap a cell to drop it.
              </p>
            </div>
          )}

          <div className="flex gap-4 w-full max-w-[420px]">
            {mode === 'auto' ? (
              <button
                onClick={() => dispatch({ a: 'shuffle' })}
                className="flex-1 py-4 bg-[#1A1D24] text-[#F5F6F7] font-bold uppercase tracking-widest border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] active:translate-y-1 active:shadow-none transition-all"
              >
                ⤭ Shuffle
              </button>
            ) : (
              <button
                onClick={() => dispatch({ a: 'clear' })}
                className="flex-1 py-4 bg-[#1A1D24] text-[#F5F6F7] font-bold uppercase tracking-widest border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] active:translate-y-1 active:shadow-none transition-all"
              >
                ⌫ Clear
              </button>
            )}
            <button
              onClick={() => complete && dispatch({ a: 'ready' })}
              disabled={!complete}
              className="flex-1 py-4 bg-[#E63946] text-white font-bold uppercase tracking-widest border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] active:translate-y-1 active:shadow-none transition-all disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:shadow-[4px_4px_0px_#2E343F]"
            >
              ✓ Ready
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Board({ state, myId, dispatch }: BoardProps<BattleshipState>) {
  const myFleet = state.fleets[myId] || Array(CELLS).fill(null);
  const myIncoming = state.incoming[myId] || Array(CELLS).fill(null);

  // Opponents in turn order.
  const opponents = state.order.filter((id) => id !== myId);
  const livingOpponents = opponents.filter((id) => !state.eliminated[id]);

  const [target, setTarget] = useState<string>(livingOpponents[0] ?? opponents[0] ?? '');
  // Keep the selected target valid: if it dies (or was never set), jump to a living one.
  useEffect(() => {
    if (!target || state.eliminated[target] || !opponents.includes(target)) {
      const nextT = livingOpponents[0] ?? opponents[0] ?? '';
      if (nextT !== target) setTarget(nextT);
    }
  }, [target, opponents, livingOpponents, state.eliminated]);

  if (state.phase === 'placing') {
    const ids = state.order.length ? state.order : Object.keys(state.players);
    return (
      <PlacementBoard
        myFleet={myFleet}
        roomId={state.roomId}
        iAmReady={state.ready[myId]}
        readyCount={ids.filter((id) => state.ready[id]).length}
        totalPlayers={ids.length}
        dispatch={dispatch}
      />
    );
  }

  const myTurn = state.turnId === myId;
  const iAmOut = state.eliminated[myId];
  const targetIncoming = state.incoming[target] || Array(CELLS).fill(null); // my shots at `target`
  const targetFleet = state.fleets[target] || Array(CELLS).fill(null); // redacted (hit cells only)
  const targetSunk = sunkShips(targetFleet, targetIncoming);
  const mySunk = sunkShips(myFleet, myIncoming);
  const theirHitsOnMe = myIncoming.filter((v) => v === 'hit').length;

  const ls = state.lastShot;
  const lastText = ls
    ? `${state.players[ls.by]?.name ?? '—'} → ${state.players[ls.target]?.name ?? '—'}: ${ls.result.toUpperCase()}${ls.sunk != null ? ` · sank a ${SHIP_NAMES[ls.sunk]}!` : ''}`
    : 'Battle stations!';

  const canFireTarget = myTurn && !iAmOut && !!target && !state.eliminated[target];
  const fireCell = (i: number) => {
    if (!canFireTarget || targetIncoming[i] != null) return;
    dispatch({ a: 'fire', target, cell: i });
  };

  const shipsLeft = (id: string) => {
    const inc = state.incoming[id] || [];
    const fleet = state.fleets[id] || [];
    return SHIPS.length - sunkShips(fleet, inc).filter(Boolean).length;
  };

  return (
    <div className="flex flex-col items-center p-4 sm:p-6 max-w-5xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-4 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Battleship</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">{state.order.length} admirals · Room #{state.roomId}</span>
      </div>

      <div className={cn(
        'px-6 py-2 border-2 border-[#39414E] font-bold text-sm uppercase shadow-[4px_4px_0px_#454C5A] mb-2',
        iAmOut ? 'bg-[#262B34] text-[#E2E4E8]' : myTurn ? 'bg-[#E63946] text-white' : 'bg-[#262B34] text-white',
      )}>
        {iAmOut ? 'You were sunk — spectating' : myTurn ? 'Your turn — pick a target & fire!' : `${state.players[state.turnId ?? '']?.name ?? 'Someone'}'s turn`}
      </div>
      <p className="text-[11px] font-mono uppercase tracking-wider text-[#E2E4E8] mb-6 text-center">{lastText}</p>

      {/* Opponent tabs */}
      {opponents.length > 1 && (
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {opponents.map((id) => {
            const out = state.eliminated[id];
            return (
              <button
                key={id}
                onClick={() => setTarget(id)}
                disabled={out}
                className={cn(
                  'px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border-2 transition-all flex items-center gap-2',
                  target === id ? 'border-[#E63946] bg-[#E63946]/15 text-white' : 'border-[#39414E] bg-[#1A1D24] text-[#E2E4E8] hover:text-white',
                  out && 'line-through grayscale',
                )}
              >
                {out ? '💀' : '🎯'} {state.players[id]?.name ?? '—'}
                <span className="font-mono text-[9px] text-[#E2E4E8]">{out ? 'out' : `${shipsLeft(id)} left`}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 w-full items-start">
        {/* Boards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target waters */}
          <div className="flex flex-col items-center">
            <div className="flex justify-between w-full max-w-[360px] mb-2">
              <h2 className="font-bold text-xs uppercase tracking-widest text-[#F5F6F7]">
                {state.players[target]?.name ? `${state.players[target]?.name}'s waters` : 'Enemy waters'}
              </h2>
              <span className="font-mono text-xs text-[#E63946] font-bold">{targetSunk.filter(Boolean).length}/{SHIPS.length} sunk</span>
            </div>
            <div className={cn(
              'grid grid-cols-12 gap-0.5 w-full max-w-[360px] bg-[#262B34] p-1 border-2 border-[#39414E] shadow-[6px_6px_0px_#2E343F]',
              !canFireTarget && 'grayscale',
            )}>
              {Array.from({ length: CELLS }).map((_, i) => {
                const shot = targetIncoming[i];
                return (
                  <GridCell
                    key={i}
                    small
                    kind={shot === 'hit' ? 'hit' : shot === 'miss' ? 'miss' : 'water'}
                    clickable={canFireTarget && shot == null}
                    onClick={() => fireCell(i)}
                  />
                );
              })}
            </div>
          </div>

          {/* My fleet */}
          <div className="flex flex-col items-center">
            <div className="flex justify-between w-full max-w-[360px] mb-2">
              <h2 className="font-bold text-xs uppercase tracking-widest text-[#F5F6F7]">Your fleet</h2>
              <span className="font-mono text-xs text-[#E2E4E8] font-bold">{theirHitsOnMe}/{TOTAL_SHIP_CELLS} hit</span>
            </div>
            <div className="grid grid-cols-12 gap-0.5 w-full max-w-[360px] bg-[#262B34] p-1 border-2 border-[#39414E] shadow-[6px_6px_0px_#2E343F]">
              {myFleet.map((cell, i) => {
                const shot = myIncoming[i];
                const kind = shot === 'hit' ? 'hit' : cell != null ? 'ship' : shot === 'miss' ? 'miss' : 'water';
                return <GridCell key={i} small kind={kind} />;
              })}
            </div>
          </div>
        </div>

        {/* Fleet-status panels */}
        <div className="flex flex-col gap-4 w-full lg:w-56">
          <FleetStatus title={`${state.players[target]?.name ?? 'Enemy'} — to sink`} sunk={targetSunk} tone="enemy" />
          <FleetStatus title="Your fleet" sunk={mySunk} tone="own" />
        </div>
      </div>
    </div>
  );
}

export const battleship: GameDefinition<BattleshipState> = {
  ...gameCard('battleship'),
  minPlayers: 2,
  maxPlayers: 5,
  createInitialState,
  start,
  reducer,
  redact,
  botMove,
  Board,
  gameOverMessage: (state, myId) =>
    state.winnerId === myId ? '🎉 Last fleet afloat — you win!' : `${state.players[state.winnerId ?? '']?.name ?? 'Someone'} was the last fleet standing!`,
};
