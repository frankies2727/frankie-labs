import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Lotería Millennial — a dark-mode take on the Mexican bingo of images.
//
// Born on a trip to CDMX: the deck mixes classic Lotería cartas with millennial
// chaos (WiFi, aguacate, mezcal, selfie) and a few very personal cartas — El
// Ajolote (the axolotl of Xochimilco), La Piedra del Sol at the Museo Nacional
// de Antropología, La Ciudadela's artesanías, and La Casa de Tacuba (Calle
// Tacuba 28, Centro).
//
// 2–5 players. Each player gets a 4×4 tabla drawn from the deck. One carta is
// sung at a time; the slot flashes on your tabla if you hold it, you drop a
// frijol (bean) on it, then EVERYONE taps LISTO — the next carta is only sung
// once every player is ready. Fill the WHOLE tabla, then shout "¡LOTERÍA!".
//
// FRENZY MODE sprinkles in a mystery power-up: at random moments a "🎁 ¿Lo usas?"
// offer pops up for one random player. You don't know what it is — use it and
// it's either "¡1 Free Bean!!" (for you) or "a random player just got a free
// bean… awww". The deck's un-sung tail is redacted so nobody peeks ahead.
// ---------------------------------------------------------------------------

interface Carta {
  id: string;
  name: string;   // Spanish name as the cantor calls it
  emoji: string;
  verse: string;  // the cantor's little canto
}

// 30 cartas. Tablas take 16 of them, so every carta on a board is guaranteed to
// come up in the deck. Classic + millennial + personal (the trip cartas).
const DECK: Carta[] = [
  { id: 'ajolote',   name: 'El Ajolote',        emoji: '🦎', verse: 'El que sonríe bajo el agua de Xochimilco.' },
  { id: 'piedrasol', name: 'La Piedra del Sol', emoji: '🗿', verse: 'El calendario que guarda el Museo de Antropología.' },
  { id: 'tacuba',    name: 'La Casa de Tacuba', emoji: '🏠', verse: 'Calle Tacuba 28, Centro — donde dormimos.' },
  { id: 'ciudadela', name: 'La Ciudadela',      emoji: '🧶', verse: 'Puro arte hecho a mano en la artesanía.' },
  { id: 'museo',     name: 'El Museo',          emoji: '🏛️', verse: 'Toda la historia bajo un mismo techo.' },
  { id: 'gallo',     name: 'El Gallo',          emoji: '🐓', verse: 'El que despierta a todo el vecindario.' },
  { id: 'corazon',   name: 'El Corazón',        emoji: '❤️', verse: 'No me extrañes, corazón.' },
  { id: 'sirena',    name: 'La Sirena',         emoji: '🧜‍♀️', verse: 'Con los cantos de sirena no te enamores.' },
  { id: 'catrina',   name: 'La Catrina',        emoji: '💀', verse: 'La flaca elegante que a todos empareja.' },
  { id: 'nopal',     name: 'El Nopal',          emoji: '🌵', verse: 'Al nopal lo van a ver sólo cuando tiene tunas.' },
  { id: 'sol',       name: 'El Sol',            emoji: '☀️', verse: 'La cobija de los pobres.' },
  { id: 'luna',      name: 'La Luna',           emoji: '🌙', verse: 'El farol de los enamorados.' },
  { id: 'rana',      name: 'La Rana',           emoji: '🐸', verse: 'Al ver a la verde rana.' },
  { id: 'alacran',   name: 'El Alacrán',        emoji: '🦂', verse: 'El que con la cola pica, le dan una paliza.' },
  { id: 'rosa',      name: 'La Rosa',           emoji: '🌹', verse: 'Rosita, Rosaura.' },
  { id: 'estrella',  name: 'La Estrella',       emoji: '⭐', verse: 'La guía de los marineros.' },
  { id: 'sandia',    name: 'La Sandía',         emoji: '🍉', verse: 'La barriga que Juan tenía.' },
  { id: 'mano',      name: 'La Mano',           emoji: '✋', verse: 'La mano de un criminal.' },
  { id: 'venado',    name: 'El Venado',         emoji: '🦌', verse: 'Saltando va buscando.' },
  { id: 'corona',    name: 'La Corona',         emoji: '👑', verse: 'El sombrero de los reyes.' },
  { id: 'bandera',   name: 'La Bandera',        emoji: '🇲🇽', verse: 'Verde, blanco y colorado.' },
  { id: 'campana',   name: 'La Campana',        emoji: '🔔', verse: 'Tú con la campana y yo con tu hermana.' },
  { id: 'wifi',      name: 'El WiFi',           emoji: '📶', verse: 'Sin señal no hay lotería, mija.' },
  { id: 'aguacate',  name: 'El Aguacate',       emoji: '🥑', verse: 'Vale más que el oro… y que el guac lleva extra.' },
  { id: 'tacos',     name: 'Los Tacos',         emoji: '🌮', verse: '¿De qué los va a querer? Al pastor, obvio.' },
  { id: 'mezcal',    name: 'El Mezcal',         emoji: '🍸', verse: 'Para todo mal, mezcal; para todo bien, también.' },
  { id: 'chela',     name: 'La Chela',          emoji: '🍺', verse: 'Bien fría, con limón y sal.' },
  { id: 'selfie',    name: 'El Selfie',         emoji: '🤳', verse: 'Si no hay foto, no pasó.' },
  { id: 'elote',     name: 'El Elote',          emoji: '🌽', verse: 'Con mayonesa, queso y chile del bueno.' },
  { id: 'lucha',     name: 'El Luchador',       emoji: '🤼', verse: 'Máscara contra cabellera.' },
  // July 2026 — our trip cartas (los recuerdos de nuestro viaje).
  { id: 'chapultepec', name: 'El Chapultepec',   emoji: '🏰', verse: 'El castillo sobre el bosque más grande de la ciudad.' },
  { id: 'matcha',      name: 'El Matcha',        emoji: '🍵', verse: 'Un respiro verde en Matcha Mío Café.' },
  { id: 'zocalo',      name: 'El Zócalo',        emoji: '🛍️', verse: 'La gran plaza de vendedores frente al Palacio Nacional.' },
  { id: 'tacosvalle',  name: 'Tacos Del Valle',  emoji: '🌯', verse: 'Los mejores de la cuadra — al pastor y bien servidos.' },
];

const CARTA = Object.fromEntries(DECK.map((c) => [c.id, c])) as Record<string, Carta>;

// A vivid, festive colour per carta so the tabla reads like a real Lotería
// board — every card keeps its own hue whether or not it's been sung.
const PALETTE = [
  '#F72585', '#FF477E', '#FF6B6B', '#FB5607', '#FF924C', '#FFA62B',
  '#FFBE0B', '#FFD166', '#E8E23A', '#C1FF72', '#8AC926', '#52B788',
  '#06D6A0', '#2EC4B6', '#00F5D4', '#4CC9F0', '#00BBF9', '#3A86FF',
  '#4361EE', '#5E60CE', '#7B2CBF', '#9D4EDD', '#C77DFF', '#B5179E',
  '#F15BB5', '#EF476F', '#E76F51', '#F4A261', '#2A9D8F', '#8338EC',
  '#00D4FF', '#FF5D8F', '#9EF01A', '#FF9F1C',
];
const CARD_COLOR: Record<string, string> = Object.fromEntries(
  DECK.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]),
);
const colorOf = (id: string | null | undefined) => (id && CARD_COLOR[id]) || '#F72585';

const TABLA_SIZE = 16;        // 4×4
const MYSTERY_CHANCE = 0.28;  // Frenzy: odds a mystery power-up appears each round

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Best empty slot to hand a free bean: an un-sung carta first (that's the real
// shortcut), else any empty slot; -1 if the tabla is already full.
function freeBeanSlot(tabla: string[], marks: boolean[], called: Set<string>): number {
  const unmarked = marks.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0);
  if (unmarked.length === 0) return -1;
  return unmarked.find((i) => !called.has(tabla[i])) ?? unmarked[0];
}

// A resolved mystery: who got the bean, which carta it landed on, and whether
// it was the good roll.
interface MysteryEvent { kind: 'good' | 'bad'; beneficiaryId: string; forId: string; cartaId: string | null }

export interface LoteriaState extends BaseState {
  phase: 'choosing' | 'playing';         // pick Clásico / Frenzy, then play
  frenzy: boolean;
  deck: string[];                        // full call order (tail redacted from players)
  drawn: number;                         // how many cartas have been sung
  total: number;                         // deck.length (survives redaction)
  tablas: Record<string, string[]>;      // 16 carta ids per player
  marks: Record<string, boolean[]>;      // 16 beans per player
  ready: Record<string, boolean>;        // per-round: who's ready for the next carta
  mystery: { forId: string } | null;     // Frenzy: pending offer (use-it-or-lose-it)
  lastEvent: MysteryEvent | null;        // Frenzy: last resolved mystery (shown to all)
  lastClaim: { pid: string; ok: boolean } | null;
}

function createInitialState(roomId: string): LoteriaState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    phase: 'choosing',
    frenzy: false,
    deck: [],
    drawn: 0,
    total: DECK.length,
    tablas: {},
    marks: {},
    ready: {},
    mystery: null,
    lastEvent: null,
    lastClaim: null,
  };
}

// Waiting -> playing drops into the mode chooser; tablas are dealt once a mode
// is picked (so a rematch re-picks the mode too).
function start(state: LoteriaState): LoteriaState {
  return {
    ...state,
    status: 'playing',
    phase: 'choosing',
    frenzy: false,
    deck: [],
    drawn: 0,
    total: DECK.length,
    tablas: {},
    marks: {},
    ready: {},
    mystery: null,
    lastEvent: null,
    lastClaim: null,
  };
}

function reducer(state: LoteriaState, pid: string, action: GameAction): LoteriaState {
  if (state.status !== 'playing') return state;
  const ids = Object.keys(state.players);

  // ---- Mode selection: only the first player picks, then tablas are dealt. ----
  if (state.phase === 'choosing') {
    if (action.type !== 'mode' || pid !== ids[0]) return state;
    const frenzy = !!action.frenzy;
    const deck = shuffled(DECK.map((c) => c.id));
    const tablas: Record<string, string[]> = {};
    const marks: Record<string, boolean[]> = {};
    const ready: Record<string, boolean> = {};
    for (const id of ids) {
      tablas[id] = shuffled(DECK.map((c) => c.id)).slice(0, TABLA_SIZE);
      marks[id] = Array(TABLA_SIZE).fill(false);
      ready[id] = false;
    }
    // Sing the first carta right away so the tabla has something to flash.
    return {
      ...state, phase: 'playing', frenzy, deck, total: deck.length, drawn: 1,
      tablas, marks, ready, mystery: null, lastEvent: null, lastClaim: null,
    };
  }

  const called = new Set(state.deck.slice(0, state.drawn));

  // ---- Drop / lift a frijol. Only sung cartas can be beaned by hand. ----
  if (action.type === 'mark') {
    const tabla = state.tablas[pid];
    const marks = state.marks[pid];
    if (!tabla || !marks) return state;
    const index = action.index as number;
    if (index < 0 || index >= TABLA_SIZE) return state;
    if (!marks[index] && !called.has(tabla[index])) return state; // can't place on an un-sung carta
    const next = marks.slice();
    next[index] = !next[index];
    return { ...state, marks: { ...state.marks, [pid]: next }, lastClaim: null };
  }

  // ---- Frenzy: resolve a mystery offer. Only the offered player decides. ----
  if (action.type === 'mystery') {
    if (!state.frenzy || !state.mystery || state.mystery.forId !== pid) return state;
    if (!action.use) return { ...state, mystery: null }; // shrugged it off
    // Good roll -> the bean is yours. Bad roll -> a random player gets it (maybe you!).
    const good = Math.random() < 0.5;
    const beneficiaryId = good ? pid : pick(ids);
    const tabla = state.tablas[beneficiaryId];
    const marks = state.marks[beneficiaryId];
    let marksOut = state.marks;
    let cartaId: string | null = null;
    if (tabla && marks) {
      const slot = freeBeanSlot(tabla, marks, called);
      if (slot >= 0) {
        const next = marks.slice();
        next[slot] = true;
        marksOut = { ...state.marks, [beneficiaryId]: next };
        cartaId = tabla[slot];
      }
    }
    return { ...state, marks: marksOut, mystery: null, lastEvent: { kind: good ? 'good' : 'bad', beneficiaryId, forId: pid, cartaId } };
  }

  // ---- Ready up. When everyone's ready, the next carta is sung automatically. ----
  if (action.type === 'ready') {
    if (state.ready[pid]) return state;
    const ready = { ...state.ready, [pid]: true };
    const allReady = ids.every((id) => ready[id]);
    if (allReady && state.drawn < state.total) {
      const cleared: Record<string, boolean> = {};
      for (const id of ids) cleared[id] = false;
      // Old offer expires; maybe a fresh mystery appears for a random player.
      const mystery = state.frenzy && Math.random() < MYSTERY_CHANCE ? { forId: pick(ids) } : null;
      return { ...state, drawn: state.drawn + 1, ready: cleared, mystery, lastClaim: null };
    }
    return { ...state, ready };
  }

  // ---- Shout ¡Lotería! — valid only with a completely full tabla. ----
  if (action.type === 'loteria') {
    const marks = state.marks[pid];
    if (!marks) return state;
    if (marks.every(Boolean)) {
      return { ...state, status: 'gameover', winnerId: pid, lastClaim: { pid, ok: true } };
    }
    return { ...state, lastClaim: { pid, ok: false } };
  }

  return state;
}

// Bot cantor + player: pick a mode if seated first, always cash a mystery offer
// (it's a free-ish bean), mark cartas it holds, claim on a full tabla, and ready
// up each round so the game keeps moving.
function botMove(state: LoteriaState, botId: string): GameAction | null {
  if (state.status !== 'playing') return null;
  const ids = Object.keys(state.players);

  if (state.phase === 'choosing') {
    return ids[0] === botId ? { type: 'mode', frenzy: true } : null;
  }

  const tabla = state.tablas[botId];
  const marks = state.marks[botId];
  if (!tabla || !marks) return null;
  const called = new Set(state.deck.slice(0, state.drawn));

  if (state.frenzy && state.mystery && state.mystery.forId === botId) return { type: 'mystery', use: true };

  for (let i = 0; i < TABLA_SIZE; i++) {
    if (!marks[i] && called.has(tabla[i])) return { type: 'mark', index: i };
  }
  if (marks.every(Boolean)) return { type: 'loteria' };
  if (!state.ready[botId]) return { type: 'ready' };
  return null;
}

// Hide the un-sung tail of the deck so no player can read the upcoming cartas
// off the wire. `total` keeps the counter honest.
function redact(state: LoteriaState, _viewerId: string): LoteriaState {
  return { ...state, deck: state.deck.slice(0, state.drawn) };
}

// ---------------------------------------------------------------------------

const ACCENT = '#F72585';   // rosa mexicano
const GOLD = '#FFD60A';
const JADE = '#06D6A0';

function ModeChooser({ myTurn, chooserName, dispatch }: { myTurn: boolean; chooserName: string; dispatch: (a: GameAction) => void }) {
  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-md mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-8 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Lotería</h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Choose your mode</span>
      </div>

      {myTurn ? (
        <div className="flex flex-col gap-4 w-full">
          <button
            onClick={() => dispatch({ type: 'mode', frenzy: false })}
            className="w-full p-6 text-left bg-[#1A1D24] hover:bg-[#262B34] active:translate-y-1 transition-all border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A]"
          >
            <div className="text-xl font-bold uppercase tracking-wider text-[#F5F6F7]">🎴 Clásico</div>
            <div className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8] mt-2">
              Sing the cartas · fill the whole tabla · shout ¡Lotería!
            </div>
          </button>
          <button
            onClick={() => dispatch({ type: 'mode', frenzy: true })}
            className="w-full p-6 text-left bg-[#1A1D24] hover:bg-[#262B34] active:translate-y-1 transition-all border-2 border-[#39414E]"
            style={{ boxShadow: `4px 4px 0px ${ACCENT}` }}
          >
            <div className="text-xl font-bold uppercase tracking-wider text-[#F5F6F7]">⚡ Frenzy</div>
            <div className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8] mt-2">
              Classic + surprise 🎁 mystery power-ups: maybe a free bean… maybe not
            </div>
          </button>
        </div>
      ) : (
        <p className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8] text-center">
          Waiting for {chooserName} to pick a mode…
        </p>
      )}
    </div>
  );
}

function CalledCard({ carta, count, total }: { carta: Carta | null; count: number; total: number }) {
  const color = carta ? colorOf(carta.id) : ACCENT;
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#E2E4E8]">
        La carta cantada · {count}/{total}
      </span>
      <div
        className="relative w-44 sm:w-52 border-2 px-4 py-5 flex flex-col items-center gap-2 text-center"
        style={{ boxShadow: `6px 6px 0px ${color}`, borderColor: color, background: `${color}1A` }}
      >
        {carta ? (
          <>
            <div className="text-6xl sm:text-7xl leading-none">{carta.emoji}</div>
            <div className="text-lg font-black uppercase tracking-tight text-[#F5F6F7]">{carta.name}</div>
            <div className="text-[11px] italic leading-snug text-[#E2E4E8]">“{carta.verse}”</div>
          </>
        ) : (
          <>
            <div className="text-6xl sm:text-7xl leading-none opacity-40">🎴</div>
            <div className="text-sm font-mono uppercase tracking-widest text-[#E2E4E8]">La primera carta</div>
          </>
        )}
      </div>
    </div>
  );
}

interface TablaCellProps {
  key?: number;
  carta: Carta;
  color: string;
  called: boolean;
  marked: boolean;
  flash: boolean;   // current sung carta sitting on this slot, still unbeaned
  onClick: () => void;
}

function TablaCell({ carta, color, called, marked, flash, onClick }: TablaCellProps) {
  const canPlay = marked || called;
  // Every carta keeps its colour; un-sung cards just sit a little quieter.
  const background = marked ? `${color}59` : called ? `${color}2E` : `${color}1A`;
  return (
    <button
      disabled={!canPlay}
      onClick={onClick}
      style={{ background, borderColor: color }}
      className={cn(
        'relative aspect-[3/4] border-2 flex flex-col items-center justify-center gap-0.5 p-1 transition-all touch-manipulation overflow-hidden',
        !called && !marked && 'grayscale',
        called && !marked && 'hover:brightness-125 active:translate-y-0.5',
        marked && 'ring-2 ring-[#F72585] ring-offset-1 ring-offset-[#0F1117]',
        flash && 'ring-4 ring-[#FFD60A] ring-offset-1 ring-offset-[#0F1117] animate-pulse z-10',
      )}
      title={carta.name}
    >
      <span className="text-2xl sm:text-4xl leading-none">{carta.emoji}</span>
      <span className="text-[7px] sm:text-[9px] font-bold uppercase tracking-tight text-[#F5F6F7] leading-none text-center line-clamp-1 w-full px-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
        {carta.name}
      </span>
      {marked && (
        <span className="absolute inset-0 flex items-center justify-center text-3xl sm:text-5xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)] pointer-events-none">
          🫘
        </span>
      )}
    </button>
  );
}

function Board({ state, myId, dispatch }: BoardProps<LoteriaState>) {
  const ids = Object.keys(state.players);

  if (state.phase === 'choosing') {
    const chooser = state.players[ids[0]];
    return <ModeChooser myTurn={myId === ids[0]} chooserName={chooser?.name ?? 'opponent'} dispatch={dispatch} />;
  }

  const tabla: string[] = state.tablas[myId] ?? [];
  const marks: boolean[] = state.marks[myId] ?? Array<boolean>(TABLA_SIZE).fill(false);
  const called = new Set(state.deck.slice(0, state.drawn));
  const currentId = state.drawn > 0 ? state.deck[state.drawn - 1] : null;
  const currentCarta = currentId ? CARTA[currentId] ?? null : null;
  const currentIdx = currentId ? tabla.indexOf(currentId) : -1;

  const beans = marks.filter(Boolean).length;
  const full = beans === TABLA_SIZE;
  const iReady = !!state.ready[myId];
  const readyCount = ids.filter((id) => state.ready[id]).length;
  const deckDone = state.drawn >= state.total;

  const nameOf = (id: string) => (id === myId ? 'You' : state.players[id]?.name ?? '—');

  const myMystery = state.frenzy && state.mystery?.forId === myId;
  const ev = state.frenzy ? state.lastEvent : null;

  const claim = state.lastClaim;
  const badClaimByMe = claim && !claim.ok && claim.pid === myId;

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 max-w-2xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-4 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">
          Lotería <span className="not-italic" style={{ color: ACCENT }}>{state.frenzy ? 'Frenzy ⚡' : 'Clásico'}</span>
        </h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
      </div>

      {/* Bean-count scoreboard — all players (2–5). */}
      <div className="flex flex-wrap justify-center gap-2 w-full max-w-md mb-4">
        {ids.map((id) => {
          const b = (state.marks[id] ?? []).filter(Boolean).length;
          const me = id === myId;
          return (
            <div
              key={id}
              className={cn(
                'min-w-[64px] flex-1 border-2 border-[#39414E] p-2 text-center',
                me ? 'bg-[#F72585]/10' : 'bg-[#1A1D24]',
              )}
            >
              <div className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] truncate">{nameOf(id)} 🫘</div>
              <div className="text-xl font-black font-mono text-[#F5F6F7]">{b}<span className="text-xs text-[#E2E4E8]">/{TABLA_SIZE}</span></div>
            </div>
          );
        })}
      </div>

      <div className="mb-4">
        <CalledCard carta={currentCarta} count={state.drawn} total={state.total} />
      </div>

      {/* Frenzy: mystery offer + last outcome banner. */}
      {state.frenzy && myMystery && (
        <div className="w-full max-w-md mb-4 border-2 border-[#FFD60A] bg-[#FFD60A]/10 p-3 flex flex-col items-center gap-2">
          <div className="text-sm font-black uppercase tracking-widest text-[#F5F6F7]">🎁 ¡Power-up misterioso!</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">¿Lo usas? Podría ser bueno… o no 😅</div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => dispatch({ type: 'mystery', use: true })}
              className="flex-1 py-2 font-black uppercase tracking-widest text-[#0F1117] border-2 border-[#FFD60A]"
              style={{ background: GOLD }}
            >
              Usar 🎲
            </button>
            <button
              onClick={() => dispatch({ type: 'mystery', use: false })}
              className="flex-1 py-2 font-bold uppercase tracking-widest text-white bg-[#262B34] border-2 border-[#39414E] active:translate-y-0.5"
            >
              Paso
            </button>
          </div>
        </div>
      )}
      {state.frenzy && ev && !myMystery && (() => {
        // "Awww" only when the free bean landed on someone else — if it landed
        // on you (even on the random roll), it's good news, no awww.
        const iBenefited = ev.beneficiaryId === myId;
        const c = ev.cartaId ? CARTA[ev.cartaId] : null;
        const on = c ? ` en ${c.emoji} ${c.name}` : ''; // which carta got beaned
        const text = iBenefited
          ? `🎉 ¡1 Free Bean${on}!`
          : ev.kind === 'good'
            ? `🎉 ${nameOf(ev.beneficiaryId)}: ¡1 Free Bean${on}!`
            : `🎲 ${nameOf(ev.beneficiaryId)} got a free bean${on} — awww`;
        return (
          <div className={cn(
            'w-full max-w-md mb-4 border-2 px-4 py-2 text-center text-xs font-mono font-bold uppercase tracking-widest',
            iBenefited ? 'border-[#06D6A0] bg-[#06D6A0]/10 text-[#9BE7D3]' : 'border-[#39414E] bg-[#1A1D24] text-[#E2E4E8]',
          )}>
            {text}
          </div>
        );
      })()}

      {/* Round gate: flash your slot, bean it, then tap Listo. */}
      <div className="w-full max-w-md flex flex-col items-center gap-2 mb-5">
        {deckDone ? (
          <p className="text-[11px] font-mono uppercase tracking-widest text-[#E2E4E8] text-center">
            Todas las cartas cantadas — termina tu tabla
          </p>
        ) : (
          <>
            <button
              onClick={() => dispatch({ type: 'ready' })}
              disabled={iReady}
              className={cn(
                'w-full py-3 font-black uppercase tracking-[0.2em] border-2 border-[#39414E] transition-all',
                iReady
                  ? 'bg-[#1A1D24] text-[#E2E4E8] cursor-default'
                  : 'bg-[#262B34] text-white shadow-[4px_4px_0px_#06D6A0] hover:shadow-[2px_2px_0px_#06D6A0] active:translate-y-1 active:shadow-none',
              )}
            >
              {iReady ? 'Esperando…' : '✓ Listo · siguiente carta'}
            </button>
            {currentIdx >= 0 && !marks[currentIdx] && (
              <p className="text-[11px] font-mono uppercase tracking-widest font-bold" style={{ color: GOLD }}>
                ¡La tienes! Toca la carta que parpadea 🫘
              </p>
            )}
            <p className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">
              Listos: {readyCount}/{ids.length}
            </p>
          </>
        )}
      </div>

      {/* My tabla */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full max-w-md">
        {tabla.map((id, i) => {
          const carta = CARTA[id];
          const isCalled = called.has(id);
          const marked = marks[i];
          return (
            <TablaCell
              key={i}
              carta={carta}
              color={colorOf(id)}
              called={isCalled}
              marked={marked}
              flash={i === currentIdx && !marked}
              onClick={() => dispatch({ type: 'mark', index: i })}
            />
          );
        })}
      </div>

      {/* Lotería claim — only once the tabla is completely full. */}
      {full && (
        <button
          onClick={() => dispatch({ type: 'loteria' })}
          className="mt-6 w-full max-w-md py-5 font-black uppercase tracking-[0.3em] text-lg border-2 border-[#FFD60A] text-[#0F1117] animate-pulse"
          style={{ background: GOLD, boxShadow: `4px 4px 0px ${JADE}` }}
        >
          ¡Lotería!
        </button>
      )}

      <div className="h-6 mt-3 text-center">
        {badClaimByMe ? (
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#E63946]">
            ¡Falsa alarma! Aún no llenas la tabla.
          </span>
        ) : full ? (
          <span className="text-xs font-mono font-bold uppercase tracking-widest" style={{ color: GOLD }}>
            ¡Tabla llena — grítalo!
          </span>
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">
            {state.frenzy ? 'Llena toda la tabla · vigila los 🎁 misteriosos' : 'Llena toda la tabla para ganar'}
          </span>
        )}
      </div>
    </div>
  );
}

export const loteria: GameDefinition<LoteriaState> = {
  id: 'loteria',
  name: 'Lotería Millennial',
  tagline: 'Mexican bingo of images with a millennial twist — 2–5 players spot cartas & fill the tabla. Frenzy mode drops surprise mystery power-ups.',
  accent: ACCENT,
  emoji: '🎴',
  minPlayers: 2,
  maxPlayers: 5,
  createInitialState,
  start,
  reducer,
  botMove,
  redact,
  Board,
  gameOverMessage: (state, myId) =>
    state.winnerId === myId
      ? '🎉 ¡Lotería! You filled your tabla first!'
      : `${state.players[state.winnerId ?? '']?.name ?? 'Opponent'} shouted ¡Lotería! first!`,
};
