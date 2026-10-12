import { useEffect, useRef } from 'react';
import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';

// Ludo (the "Sorry!"-style race game) on the classic 15×15 cross board with
// 2–4 players. Roll the die, bring tokens out on a 6, race clockwise around the
// shared 52-space loop, capture opponents by landing on them (except on safe
// squares), then turn up your colour's home column into the centre. First to get
// all four tokens Home wins. Rolling a 6 — or capturing / finishing a token —
// earns another roll.
//
// A token's position `p` is stored relative to its colour's start square:
//   p = -1        -> in the base pen
//   0 .. 50       -> on the shared loop; board space = PATH[(start + p) % 52]
//   51 .. 55      -> in the private home column (5 cells)
//   p = FINISH(56)-> Home (finished)

type Color = 'red' | 'green' | 'yellow' | 'blue';

// The 52 shared loop cells as [row, col] on the 15×15 grid, clockwise.
const PATH: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

const START_INDEX: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };

// Home column cells (5 lanes + the finish cell) leading into the centre.
const HOME_CELLS: Record<Color, [number, number][]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

// A compact 2×2 pen (one square per piece) tucked into each corner.
const BASE_SLOTS: Record<Color, [number, number][]> = {
  red: [[2, 2], [2, 3], [3, 2], [3, 3]],
  green: [[2, 11], [2, 12], [3, 11], [3, 12]],
  yellow: [[11, 11], [11, 12], [12, 11], [12, 12]],
  blue: [[11, 2], [11, 3], [12, 2], [12, 3]],
};

const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]); // start squares + stars
const FINISH = 56;

// ---- Colour themes ----------------------------------------------------------
// A player's board *seat* (red/green/yellow/blue corner) is fixed geometry, but
// the colour their tokens & lanes render in is a freely chosen theme. Themes can
// be flat colours, multi-stop gradients, or a full rainbow. `fill` is the CSS
// background used for tokens/swatches; `solid` is a representative hex used for
// the muted lane/pen tints and borders so the board stays readable.
interface Theme { id: string; label: string; fill: string; solid: string }

const RAINBOW = 'conic-gradient(from 140deg,#EF4444,#F59E0B,#FDE047,#22C55E,#3B82F6,#A855F7,#EF4444)';

const THEMES: Theme[] = [
  { id: 'red', label: 'Crimson', fill: '#E63946', solid: '#E63946' },
  { id: 'green', label: 'Teal', fill: '#2A9D8F', solid: '#2A9D8F' },
  { id: 'yellow', label: 'Gold', fill: '#F4C430', solid: '#F4C430' },
  { id: 'blue', label: 'Ocean', fill: '#457B9D', solid: '#457B9D' },
  { id: 'purple', label: 'Amethyst', fill: '#A855F7', solid: '#A855F7' },
  { id: 'pink', label: 'Rose', fill: '#EC4899', solid: '#EC4899' },
  { id: 'orange', label: 'Ember', fill: '#F97316', solid: '#F97316' },
  { id: 'cyan', label: 'Aqua', fill: '#06B6D4', solid: '#06B6D4' },
  { id: 'lime', label: 'Lime', fill: '#84CC16', solid: '#84CC16' },
  { id: 'slate', label: 'Steel', fill: '#64748B', solid: '#64748B' },
  { id: 'rainbow', label: 'Rainbow', fill: RAINBOW, solid: '#A855F7' },
  { id: 'sunset', label: 'Sunset', fill: 'linear-gradient(135deg,#F97316,#EC4899,#A855F7)', solid: '#EC4899' },
  { id: 'lagoon', label: 'Lagoon', fill: 'linear-gradient(135deg,#06B6D4,#3B82F6,#6366F1)', solid: '#3B82F6' },
  { id: 'forest', label: 'Forest', fill: 'linear-gradient(135deg,#22C55E,#10B981,#047857)', solid: '#10B981' },
  { id: 'inferno', label: 'Inferno', fill: 'linear-gradient(135deg,#FDE047,#F97316,#DC2626)', solid: '#F97316' },
  { id: 'candy', label: 'Candy', fill: 'linear-gradient(135deg,#F472B6,#C084FC,#60A5FA)', solid: '#C084FC' },
];

const THEME_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
// Each seat's default theme matches its classic colour (theme ids share the names).
const DEFAULT_THEME: Record<Color, Theme> = {
  red: THEME_BY_ID.red, green: THEME_BY_ID.green, yellow: THEME_BY_ID.yellow, blue: THEME_BY_ID.blue,
};

// Wildcard tiles (absolute loop indices): landing here fires a random powerup or
// unlucky event. Chosen off the safe squares and start squares, one per arm.
const WILD = new Set([3, 16, 29, 42]);

// Which colours play, by seat order — 2 players sit diagonally for balance.
const SEATING: Record<number, Color[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

export interface LudoState extends BaseState {
  order: string[]; // player ids in seat/turn order
  colorOf: Record<string, Color>; // player id -> seat colour (board geometry)
  themeOf: Record<string, string>; // player id -> chosen colour theme id
  tokens: Record<string, number[]>; // player id -> 4 token positions
  turnId: string | null;
  die: number | null; // rolled value awaiting a move (null = must roll)
  mustRoll: boolean;
  guess: number | null; // guessed die value for a pen escape (all-in-base only)
  awaitingProceed: boolean; // turn is over; someone must click to pass play on
  lastEvent: string | null;
  log: string[]; // running history of events (oldest first)
}

const LOG_MAX = 80;

// Append a state's lastEvent to its running history (de-duped, capped).
function pushLog(next: LudoState): LudoState {
  if (!next.lastEvent) return next;
  const prev = next.log ?? [];
  if (prev[prev.length - 1] === next.lastEvent) return next;
  const log = [...prev, next.lastEvent];
  return { ...next, log: log.length > LOG_MAX ? log.slice(log.length - LOG_MAX) : log };
}

function createInitialState(roomId: string): LudoState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    order: [],
    colorOf: {},
    themeOf: {},
    tokens: {},
    turnId: null,
    die: null,
    mustRoll: true,
    guess: null,
    awaitingProceed: false,
    lastEvent: null,
    log: [],
  };
}

function start(state: LudoState): LudoState {
  const order = Object.keys(state.players);
  const colors = SEATING[order.length] ?? SEATING[4].slice(0, order.length);
  const colorOf: Record<string, Color> = {};
  const themeOf: Record<string, string> = {};
  const tokens: Record<string, number[]> = {};
  const used = new Set<string>();
  // Honour colours locked in during the lobby (skipping any duplicates)...
  order.forEach((id) => {
    const picked = state.themeOf?.[id];
    if (picked && THEME_BY_ID[picked] && !used.has(picked)) { themeOf[id] = picked; used.add(picked); }
  });
  // ...then seat everyone, giving anyone who didn't pick their seat's classic
  // colour, or the next free theme if that colour is already taken.
  order.forEach((id, i) => {
    colorOf[id] = colors[i];
    tokens[id] = [-1, -1, -1, -1];
    if (themeOf[id]) return;
    const seat: string = colors[i];
    if (!used.has(seat)) { themeOf[id] = seat; used.add(seat); }
    else { const free = THEMES.find((t) => !used.has(t.id)); themeOf[id] = free ? free.id : seat; used.add(themeOf[id]); }
  });
  return { ...state, status: 'playing', order, colorOf, themeOf, tokens, turnId: order[0], die: null, mustRoll: true, guess: null, awaitingProceed: false, lastEvent: null, log: [] };
}

const mainAbs = (color: Color, p: number) => (START_INDEX[color] + p) % 52; // valid for p in 0..50

const allPenned = (state: LudoState, pid: string) => state.tokens[pid].every((t) => t === -1);

// Destination of a token if `die` is applied, plus any opponent tokens it would
// capture — or null if the move is illegal.
interface Landing { to: number; captures: { player: string; token: number }[] }

function landing(state: LudoState, pid: string, tokenIdx: number, die: number): Landing | null {
  const color = state.colorOf[pid];
  const p = state.tokens[pid][tokenIdx];

  let to: number;
  if (p === -1) {
    // Normally a 6 releases a token. When ALL four are penned, a correct die
    // guess also frees one (see the guess mechanic) — otherwise you're stuck.
    const canLeave = die === 6 || (allPenned(state, pid) && state.guess === die);
    if (!canLeave) return null;
    to = 0;
  } else {
    if (p >= FINISH) return null; // already Home
    to = p + die;
    if (to > FINISH) return null; // must reach Home by exact count
  }

  // Capture: only on the shared loop, only on non-safe squares.
  const captures: Landing['captures'] = [];
  if (to <= 50) {
    const absTo = mainAbs(color, to);
    if (!SAFE.has(absTo)) {
      for (const other of state.order) {
        if (other === pid) continue;
        const oc = state.colorOf[other];
        state.tokens[other].forEach((tp, ti) => {
          if (tp >= 0 && tp <= 50 && mainAbs(oc, tp) === absTo) captures.push({ player: other, token: ti });
        });
      }
    }
  }
  return { to, captures };
}

const legalTokens = (state: LudoState, pid: string, die: number): number[] =>
  state.tokens[pid].map((_, i) => i).filter((i) => landing(state, pid, i, die) != null);

const nextTurn = (state: LudoState, pid: string): string => {
  const i = state.order.indexOf(pid);
  return state.order[(i + 1) % state.order.length];
};

// Opponent tokens sharing a loop cell (used for wildcard-induced re-landings).
function loopCaptures(state: LudoState, tokens: Record<string, number[]>, pid: string, color: Color, toP: number): { player: string; token: number }[] {
  if (toP < 0 || toP > 50) return [];
  const absTo = mainAbs(color, toP);
  if (SAFE.has(absTo)) return [];
  const caps: { player: string; token: number }[] = [];
  for (const other of state.order) {
    if (other === pid) continue;
    const oc = state.colorOf[other];
    tokens[other].forEach((tp, ti) => { if (tp >= 0 && tp <= 50 && mainAbs(oc, tp) === absTo) caps.push({ player: other, token: ti }); });
  }
  return caps;
}

// Fire a random wildcard effect on the token that just landed on a wild tile.
// Mutates `tokens`; returns whether it grants another roll plus a description.
function applyWildcard(state: LudoState, tokens: Record<string, number[]>, pid: string, color: Color, tokenIdx: number): { extra: boolean; event: string } {
  const p = tokens[pid][tokenIdx];
  let extra = false;
  let event: string;
  switch (Math.floor(Math.random() * 5)) {
    case 0: { const np = p + 3; if (np <= FINISH) tokens[pid][tokenIdx] = np; event = '🚀 Wildcard: Boost +3!'; break; }
    case 1: { extra = true; event = '⭐ Wildcard: Extra roll!'; break; }
    case 2: { tokens[pid][tokenIdx] = -1; event = '💀 Wildcard: SORRY — back to the pen!'; break; }
    case 3: { tokens[pid][tokenIdx] = Math.max(p - 4, 0); event = '🐌 Wildcard: Slip back 4'; break; }
    default: { const np = p + 6; if (np <= FINISH) tokens[pid][tokenIdx] = np; event = '✈️ Wildcard: Leap +6!'; break; }
  }
  const caps = loopCaptures(state, tokens, pid, color, tokens[pid][tokenIdx]);
  for (const cap of caps) tokens[cap.player][cap.token] = -1;
  if (caps.length) event += ` · captured ${caps.length}!`;
  return { extra, event };
}

function reducer(state: LudoState, pid: string, action: GameAction): LudoState {
  if (state.status === 'gameover') return state;

  // Colours are chosen in the lobby (status 'waiting') and locked once play
  // begins — a player can only set their own, and only to a theme no other
  // player has already claimed, so no two seats ever look identical.
  if (action.a === 'setTheme') {
    if (state.status !== 'waiting' || !state.players[pid]) return state;
    const themeId = action.theme as string;
    if (!THEME_BY_ID[themeId]) return state;
    if (state.themeOf[pid] === themeId) return state;
    if (Object.entries(state.themeOf).some(([id, tid]) => id !== pid && tid === themeId)) return state;
    return { ...state, themeOf: { ...state.themeOf, [pid]: themeId } };
  }

  if (state.status !== 'playing') return state;

  // Anyone may click to pass play on — so a solo player also advances bot turns.
  if (action.a === 'proceed') {
    if (!state.awaitingProceed || !state.turnId) return state;
    const next = nextTurn(state, state.turnId);
    return pushLog({ ...state, turnId: next, mustRoll: true, die: null, guess: null, awaitingProceed: false, lastEvent: `${state.players[next]?.name ?? '—'}'s turn` });
  }

  if (pid !== state.turnId || state.awaitingProceed) return state;
  const name = state.players[pid]?.name ?? '—';
  const color = state.colorOf[pid];

  // Guess the upcoming roll — only meaningful while every token is still penned.
  if (action.a === 'guess') {
    if (!state.mustRoll || !allPenned(state, pid)) return state;
    const value = action.value as number;
    if (!(Number.isInteger(value) && value >= 1 && value <= 6)) return state;
    return { ...state, guess: value };
  }

  // Roll the die. If nothing can move, the turn ends (click Proceed to pass on).
  if (action.a === 'roll') {
    if (!state.mustRoll) return state;
    const die = 1 + Math.floor(Math.random() * 6);
    const penned = allPenned(state, pid);
    if (legalTokens(state, pid, die).length === 0) {
      const ev = penned
        ? state.guess != null
          ? `${name} guessed ${state.guess}, rolled ${die} — still penned`
          : `${name} rolled ${die} — no escape`
        : `${name} rolled ${die} — no move`;
      return pushLog({ ...state, die, mustRoll: false, guess: null, awaitingProceed: true, lastEvent: ev });
    }
    let ev = `${name} rolled ${die}`;
    if (penned) {
      ev = die === 6
        ? `${name} rolled a 6 — a piece breaks free!`
        : `${name} nailed the guess (${die}) — a piece escapes!`;
    }
    // Keep `guess` set: the move below re-checks landing() and needs it to
    // authorise the pen escape when the guess (not a 6) matched.
    return pushLog({ ...state, die, mustRoll: false, lastEvent: ev });
  }

  // Apply the rolled die to a chosen token.
  if (action.a === 'move') {
    if (state.mustRoll || state.die == null) return state;
    const tokenIdx = action.token as number;
    const res = landing(state, pid, tokenIdx, state.die);
    if (!res) return state;

    const tokens: Record<string, number[]> = {};
    for (const id of state.order) tokens[id] = state.tokens[id].slice();
    for (const cap of res.captures) tokens[cap.player][cap.token] = -1;
    tokens[pid][tokenIdx] = res.to;

    let event = `${name} moved`;
    if (res.captures.length) event += ` · captured ${res.captures.length}!`;

    // Landing on a wildcard tile fires a random powerup / unlucky effect.
    let wildExtra = false;
    if (res.to <= 50 && WILD.has(mainAbs(color, res.to))) {
      const w = applyWildcard(state, tokens, pid, color, tokenIdx);
      wildExtra = w.extra;
      event += ` · ${w.event}`;
    } else if (res.to === FINISH) {
      event += ' · a token Home!';
    }

    if (tokens[pid].every((t) => t === FINISH)) {
      return pushLog({ ...state, tokens, status: 'gameover', winnerId: pid, turnId: null, die: null, mustRoll: true, guess: null, awaitingProceed: false, lastEvent: `${name} got all tokens Home!` });
    }

    // A 6, a capture, sending a token Home, or a wildcard bonus earns another roll.
    const again = state.die === 6 || res.captures.length > 0 || tokens[pid][tokenIdx] === FINISH || wildExtra;
    if (again) return pushLog({ ...state, tokens, die: null, mustRoll: true, guess: null, awaitingProceed: false, turnId: pid, lastEvent: event });
    // Otherwise the turn is over — hold until someone clicks Proceed.
    return pushLog({ ...state, tokens, mustRoll: false, guess: null, awaitingProceed: true, lastEvent: event });
  }

  return state;
}

// Bot: roll when it must; otherwise pick the strongest move — capture, then
// finish a token, then leave the pen, then advance the furthest. When all four
// are penned it takes a guess first, giving it the same escape chance a human has.
function botMove(state: LudoState, botId: string): GameAction | null {
  if (state.status !== 'playing' || state.turnId !== botId) return null;
  if (state.awaitingProceed) return null; // a human clicks Proceed to pass play on
  if (state.mustRoll) {
    if (allPenned(state, botId) && state.guess == null) return { a: 'guess', value: 1 + Math.floor(Math.random() * 6) };
    return { a: 'roll' };
  }
  if (state.die == null) return null;
  const opts = state.tokens[botId]
    .map((p, i) => ({ i, p, res: landing(state, botId, i, state.die!) }))
    .filter((o) => o.res) as { i: number; p: number; res: Landing }[];
  if (!opts.length) return null;
  const score = (o: { p: number; res: Landing }) => {
    let s = o.res.to;
    if (o.res.captures.length) s += 200;
    if (o.res.to === FINISH) s += 120;
    if (o.p === -1) s += 60; // develop a penned token
    return s;
  };
  const best = opts.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { a: 'move', token: best.i };
}

// ---- Rendering ----
const key = (r: number, c: number) => r * 15 + c;

// Precompute per-cell static roles.
const PATH_AT = new Map<number, number>(); // cell -> loop index
PATH.forEach(([r, c], i) => PATH_AT.set(key(r, c), i));
const HOME_AT = new Map<number, Color>();
(Object.keys(HOME_CELLS) as Color[]).forEach((col) => HOME_CELLS[col].forEach(([r, c]) => HOME_AT.set(key(r, c), col)));
const START_CELL = new Map<number, Color>();
(Object.keys(START_INDEX) as Color[]).forEach((col) => {
  const [r, c] = PATH[START_INDEX[col]];
  START_CELL.set(key(r, c), col);
});
const SLOT_AT = new Map<number, Color>(); // pen square -> colour
(Object.keys(BASE_SLOTS) as Color[]).forEach((col) => BASE_SLOTS[col].forEach(([r, c]) => SLOT_AT.set(key(r, c), col)));

function Token({ fill, active, count, onClick }: { fill: string; active?: boolean; count?: number; onClick?: () => void }) {
  return (
    <button
      disabled={!active}
      onClick={onClick}
      className={cn(
        // A white border keeps a token visible even on its own colour's cells.
        'w-[85%] h-[85%] rounded-full border-2 border-white shadow-[0_1px_2px_rgba(0,0,0,0.6)] flex items-center justify-center text-[8px] font-black text-white',
        active ? 'ring-2 ring-white cursor-pointer animate-pulse' : '',
      )}
      style={{ background: fill }}
    >
      {count && count > 1 ? count : ''}
    </button>
  );
}

function Board({ state, myId, dispatch }: BoardProps<LudoState>) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the history to the newest entry as events arrive.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log?.length]);

  const myTurn = state.turnId === myId;
  const movable = myTurn && !state.mustRoll && state.die != null ? legalTokens(state, myId, state.die) : [];
  const activeColors = new Set(state.order.map((id) => state.colorOf[id]));

  // Resolve a player's chosen theme (falling back to their seat's default).
  const themeOf = (id: string): Theme => THEME_BY_ID[state.themeOf?.[id]] ?? DEFAULT_THEME[state.colorOf[id]];
  // Map each seat colour to the theme of whoever holds that seat, so lanes/pens
  // tint with the player's chosen colour rather than the classic seat colour.
  const seatOwner: Partial<Record<Color, string>> = {};
  state.order.forEach((id) => { seatOwner[state.colorOf[id]] = id; });
  const themeForSeat = (c: Color): Theme => { const o = seatOwner[c]; return o ? themeOf(o) : DEFAULT_THEME[c]; };

  // Cell -> tokens located there.
  const tokensAt = new Map<number, { pid: string; idx: number }[]>();
  for (const pid of state.order) {
    const color = state.colorOf[pid];
    state.tokens[pid].forEach((p, idx) => {
      const [r, c] = p === -1 ? BASE_SLOTS[color][idx] : p <= 50 ? PATH[mainAbs(color, p)] : HOME_CELLS[color][p - 51];
      const k = key(r, c);
      if (!tokensAt.has(k)) tokensAt.set(k, []);
      tokensAt.get(k)!.push({ pid, idx });
    });
  }

  const cells = [];
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const k = key(r, c);
      const pathIdx = PATH_AT.get(k);
      const homeCol = HOME_AT.get(k);
      const startCol = START_CELL.get(k);
      const slotCol = SLOT_AT.get(k);
      const isCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;
      const safe = pathIdx != null && SAFE.has(pathIdx);
      const wild = pathIdx != null && WILD.has(pathIdx);
      const here = tokensAt.get(k) ?? [];

      // Dark-mode palette: the board is dark, colours appear as muted tints on
      // the track's start squares, each colour's home lane, and its little pen.
      let bg = '#0F1117'; // empty corner space / void
      let border = 'transparent';
      if (startCol) { const t = themeForSeat(startCol); bg = t.solid + '77'; border = t.solid; }
      else if (wild) { bg = '#2E2440'; border = '#A855F7'; }
      else if (pathIdx != null) { bg = safe ? '#2A313B' : '#1B1F27'; border = '#2E343F'; }
      else if (homeCol) { const t = themeForSeat(homeCol); bg = t.solid + '3A'; border = t.solid + '77'; }
      else if (isCenter) { bg = '#181B22'; border = '#2E343F'; }

      const slotActive = slotCol != null && activeColors.has(slotCol);
      if (slotActive) { const t = themeForSeat(slotCol!); bg = t.solid + '4D'; border = t.solid; }

      // Dim a colour's lane/start when that colour isn't in this game.
      const laneCol = startCol ?? homeCol;
      const dim = laneCol != null && !activeColors.has(laneCol);

      // Prefer showing (and making tappable) my own movable token when tokens of
      // different colours share a cell — otherwise a piece stacked on a safe
      // square behind an opponent's could never be tapped.
      const movableHere = here.find((t) => t.pid === myId && movable.includes(t.idx));
      const primary = movableHere ?? here[0];
      const active = movableHere != null;

      cells.push(
        <div
          key={k}
          className="flex items-center justify-center"
          style={{
            gridColumn: c + 1,
            gridRow: r + 1,
            background: bg,
            opacity: dim ? 0.3 : 1,
            outline: border === 'transparent' ? undefined : `1px solid ${border}`,
          }}
        >
          {wild && !primary && <span className="text-[10px] font-black text-[#C084FC] leading-none">?</span>}
          {safe && !startCol && !wild && !primary && <span className="text-[8px] text-[#E2E4E8] leading-none">✦</span>}
          {slotActive && !primary && <span className="w-[62%] h-[62%] rounded-full border-2" style={{ borderColor: themeForSeat(slotCol!).solid + 'AA' }} />}
          {primary && <Token fill={themeOf(primary.pid).fill} active={active} count={here.length} onClick={() => active && dispatch({ a: 'move', token: primary.idx })} />}
        </div>,
      );
    }
  }

  const turnPlayer = state.turnId ? state.players[state.turnId] : null;
  const turnTheme = state.turnId ? themeOf(state.turnId) : null;
  const canGuess = myTurn && state.mustRoll && !state.awaitingProceed && allPenned(state, myId);
  const history = state.log ?? [];

  return (
    <div className="flex flex-col items-center p-4 sm:p-6 max-w-2xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-4 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Sorry</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
      </div>

      {/* Turn + die + controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap justify-center">
        <div
          className="px-5 py-2 border-2 border-[#39414E] font-bold text-sm uppercase shadow-[4px_4px_0px_#454C5A] text-white"
          style={{ background: turnTheme ? turnTheme.fill : '#262B34' }}
        >
          {state.awaitingProceed ? `${myTurn ? 'Your' : `${turnPlayer?.name ?? 'Opponent'}'s`} turn — done` : myTurn ? 'Your turn' : `${turnPlayer?.name ?? 'Opponent'}'s turn`}
        </div>
        <div className="w-12 h-12 bg-[#1A1D24] border-2 border-[#39414E] shadow-[3px_3px_0px_#454C5A] flex items-center justify-center text-2xl font-black font-mono text-[#F5F6F7]">
          {state.die ?? '·'}
        </div>
        {state.awaitingProceed ? (
          <button
            onClick={() => dispatch({ a: 'proceed' })}
            className="px-6 py-3 bg-[#8338EC] text-white font-bold uppercase tracking-widest text-sm border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] active:translate-y-1 active:shadow-none transition-all"
          >
            ▶ Proceed{state.turnId ? ` → ${state.players[nextTurn(state, state.turnId)]?.name ?? 'next'}` : ''}
          </button>
        ) : myTurn && state.mustRoll ? (
          <button
            onClick={() => dispatch({ a: 'roll' })}
            className="px-6 py-3 bg-[#E63946] text-white font-bold uppercase tracking-widest text-sm border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] active:translate-y-1 active:shadow-none transition-all"
          >
            🎲 Roll
          </button>
        ) : myTurn && !state.mustRoll ? (
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#E2E4E8]">Tap a glowing token</span>
        ) : null}
      </div>

      {/* Guess-the-roll escape (shown only when all your pieces are penned) */}
      {canGuess && (
        <div className="w-full max-w-[440px] mb-4 bg-[#12151C] border-2 border-[#8338EC] p-3 text-center">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[#C084FC] mb-2">
            All pieces home — guess the roll to free one (a 6 always works)
          </p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => dispatch({ a: 'guess', value: n })}
                className={cn(
                  'w-9 h-9 border-2 font-black font-mono text-sm transition-colors',
                  state.guess === n ? 'border-white bg-[#8338EC] text-white' : 'border-[#39414E] text-[#E2E4E8] bg-[#1A1D24] hover:border-[#8338EC]',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-[9px] font-mono uppercase tracking-wider text-[#E2E4E8] mt-2">
            {state.guess ? `Guessing ${state.guess} — now roll` : 'Optional — pick a number, then roll'}
          </p>
        </div>
      )}

      {/* The board */}
      <div className="w-full max-w-[440px] aspect-square border-2 border-[#39414E] shadow-[6px_6px_0px_#2E343F]">
        <div className="grid w-full h-full" style={{ gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)' }}>
          {cells}
        </div>
      </div>

      {/* Player legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
        {state.order.map((pid) => {
          const home = state.tokens[pid].filter((t) => t === FINISH).length;
          return (
            <div
              key={pid}
              className={cn('flex items-center gap-2 px-3 py-1.5 border-2 text-[11px] font-mono uppercase tracking-wider', state.turnId === pid ? 'border-white text-white' : 'border-[#39414E] text-[#E2E4E8]')}
            >
              <span className="w-3 h-3 rounded-full border border-black/40" style={{ background: themeOf(pid).fill }} />
              {pid === myId ? 'You' : state.players[pid]?.name} · {home}/4
            </div>
          );
        })}
      </div>

      {/* Scrollable event history */}
      <div className="w-full max-w-[440px] mt-4">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-1">History</p>
        <div
          ref={logRef}
          className="h-28 overflow-y-auto bg-[#12151C] border-2 border-[#2E343F] p-2 space-y-1"
        >
          {history.length === 0 ? (
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#E2E4E8] leading-relaxed">
              No moves yet. Roll a 6 to release a piece, capture rivals, and race home. Land on a "?" wildcard for a lucky boost or an unlucky spill!
            </p>
          ) : (
            history.map((e, i) => (
              <p key={i} className="text-[10px] font-mono uppercase tracking-wider text-[#E2E4E8] border-l-2 border-[#E63946] pl-2 leading-relaxed">
                {e}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Pre-game colour lock-in, shown in the lobby (online) and the solo setup
// screen. Each player claims a theme before Start; colours are fixed thereafter.
function LobbyColorPicker({ state, myId, dispatch }: BoardProps<LudoState>) {
  const mine = state.themeOf?.[myId];
  const players = Object.values(state.players);
  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-widest text-[#E2E4E8] mb-3 text-center">Pick your colour</p>
      <div className="grid grid-cols-8 gap-2 mb-4">
        {THEMES.map((t) => {
          const takenByOther = Object.entries(state.themeOf ?? {}).some(([id, tid]) => id !== myId && tid === t.id);
          const isMine = mine === t.id;
          return (
            <button
              key={t.id}
              disabled={takenByOther}
              onClick={() => dispatch({ a: 'setTheme', theme: t.id })}
              title={takenByOther ? `${t.label} (taken)` : t.label}
              className={cn(
                'relative aspect-square rounded-full border-2 transition-transform',
                isMine ? 'border-white ring-2 ring-white scale-110' : 'border-[#39414E]',
                takenByOther ? 'opacity-20 cursor-not-allowed' : 'hover:scale-110',
              )}
              style={{ background: t.fill }}
            >
              {isMine && <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-black drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">✓</span>}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        {players.map((p) => {
          const tid = state.themeOf?.[p.id];
          const theme = tid ? THEME_BY_ID[tid] : null;
          return (
            <div key={p.id} className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#E2E4E8]">
              <span className="w-3 h-3 rounded-full border border-black/40" style={{ background: theme ? theme.fill : '#2E343F' }} />
              {p.id === myId ? 'You' : p.name}
              <span className="ml-auto text-[10px] text-[#E2E4E8]">{theme ? theme.label : 'auto'}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] font-mono uppercase tracking-wider text-[#E2E4E8] mt-3 text-center leading-relaxed">
        Optional — a free colour is assigned if you skip. Locked once the game starts.
      </p>
    </div>
  );
}

export const ludo: GameDefinition<LudoState> = {
  id: 'ludo',
  name: 'Sorry',
  tagline: 'A 2–4 player race with wildcard tiles. Roll, chase, capture, get all four home.',
  accent: '#2A9D8F',
  emoji: '🤷',
  minPlayers: 2,
  maxPlayers: 4,
  createInitialState,
  start,
  reducer,
  botMove,
  Board,
  LobbyExtra: LobbyColorPicker,
  gameOverMessage: (state, myId) =>
    state.winnerId === myId
      ? '🎉 All four home — you win!'
      : `${state.players[state.winnerId ?? '']?.name ?? 'Opponent'} got all four home first!`,
};
