import { useState } from 'react';
import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';
import { gameCard } from './catalog';

// Uno Frenzy! — Uno's colour-matching core plus a deck of chaotic powerups and
// lucky swings: SWAP trades whole hands, STEAL yanks cards from your rival, and
// FRENZY buries them under six. Classic Skip / Reverse / +2 / Wild / +4 are all
// here too. Empty your hand first to win. (2-player: Skip and Reverse both mean
// "go again".)

type Color = 'red' | 'yellow' | 'green' | 'blue' | 'wild' | 'back';
type Kind = 'num' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4' | 'swap' | 'steal' | 'frenzy' | 'back';
interface Card { id: string; color: Color; kind: Kind; num?: number }

const PLAY_COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];
const COLOR_HEX: Record<string, string> = { red: '#EF4444', yellow: '#F5C518', green: '#22C55E', blue: '#3B82F6' };
const RAINBOW = 'conic-gradient(from 210deg,#EF4444,#F5C518,#22C55E,#3B82F6,#EF4444)';
const HAND_SIZE = 7;

let seq = 0;
const mkId = () => `c${seq++}-${Math.random().toString(36).slice(2, 6)}`;

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of PLAY_COLORS) {
    deck.push({ id: mkId(), color, kind: 'num', num: 0 });
    for (let n = 1; n <= 9; n++) for (let c = 0; c < 2; c++) deck.push({ id: mkId(), color, kind: 'num', num: n });
    for (const kind of ['skip', 'reverse', 'draw2'] as Kind[]) for (let c = 0; c < 2; c++) deck.push({ id: mkId(), color, kind });
  }
  for (let c = 0; c < 4; c++) { deck.push({ id: mkId(), color: 'wild', kind: 'wild' }); deck.push({ id: mkId(), color: 'wild', kind: 'wild4' }); }
  // Frenzy powerups — the twist.
  for (let c = 0; c < 3; c++) { deck.push({ id: mkId(), color: 'wild', kind: 'swap' }); deck.push({ id: mkId(), color: 'wild', kind: 'steal' }); deck.push({ id: mkId(), color: 'wild', kind: 'frenzy' }); }
  return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isWildKind = (k: Kind) => k === 'wild' || k === 'wild4' || k === 'swap' || k === 'steal' || k === 'frenzy';

function canPlay(card: Card, top: Card, active: Color): boolean {
  if (card.color === 'wild') return true;
  if (card.color === active) return true;
  if (card.kind === 'num' && top.kind === 'num' && card.num === top.num) return true;
  if (card.kind !== 'num' && card.kind === top.kind) return true;
  return false;
}

export interface UnoState extends BaseState {
  deck: Card[];
  discard: Card[]; // top is the last element
  activeColor: Color;
  hands: Record<string, Card[]>;
  turnId: string | null;
  lastEvent: string | null;
}

// Draw n cards, reshuffling the discard pile (minus its top) when the deck runs dry.
function draw(deckIn: Card[], discardIn: Card[], n: number): { out: Card[]; deck: Card[]; discard: Card[] } {
  let deck = deckIn.slice();
  let discard = discardIn.slice();
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (deck.length === 0) {
      if (discard.length <= 1) break;
      const top = discard.pop()!;
      deck = shuffle(discard);
      discard = [top];
    }
    const c = deck.pop();
    if (!c) break;
    out.push(c);
  }
  return { out, deck, discard };
}

function createInitialState(roomId: string): UnoState {
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    deck: [],
    discard: [],
    activeColor: 'red',
    hands: {},
    turnId: null,
    lastEvent: null,
  };
}

function start(state: UnoState): UnoState {
  const ids = Object.keys(state.players);
  let deck = buildDeck();
  const hands: Record<string, Card[]> = {};
  for (const id of ids) { hands[id] = deck.slice(-HAND_SIZE); deck = deck.slice(0, -HAND_SIZE); }
  // First discard: flip up to the first plain number card.
  let idx = deck.length - 1;
  while (idx >= 0 && deck[idx].kind !== 'num') idx--;
  const first = idx >= 0 ? deck[idx] : deck[deck.length - 1];
  deck = deck.filter((c) => c.id !== first.id);
  return { ...state, status: 'playing', deck, discard: [first], activeColor: first.color, hands, turnId: ids[0], lastEvent: null };
}

const mostColor = (hand: Card[]): Color => {
  const tally: Record<string, number> = {};
  for (const c of hand) if (c.color !== 'wild') tally[c.color] = (tally[c.color] ?? 0) + 1;
  const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return (best?.[0] as Color) ?? PLAY_COLORS[Math.floor(Math.random() * 4)];
};

function reducer(state: UnoState, pid: string, action: GameAction): UnoState {
  if (state.status !== 'playing' || pid !== state.turnId) return state;
  const ids = Object.keys(state.players);
  const opp = ids[0] === pid ? ids[1] : ids[0];
  const name = state.players[pid]?.name ?? '—';
  const top = state.discard[state.discard.length - 1];

  if (action.a === 'draw') {
    const d = draw(state.deck, state.discard, 1);
    if (!d.out.length) return { ...state, turnId: opp, lastEvent: `${name} had nothing to draw` };
    return { ...state, deck: d.deck, discard: d.discard, hands: { ...state.hands, [pid]: [...state.hands[pid], ...d.out] }, turnId: opp, lastEvent: `${name} drew a card` };
  }

  if (action.a === 'play') {
    const cardId = action.cardId as string;
    const hand = state.hands[pid];
    const card = hand.find((c) => c.id === cardId);
    if (!card || !canPlay(card, top, state.activeColor)) return state;

    const newHand = hand.filter((c) => c.id !== cardId);
    let hands = { ...state.hands, [pid]: newHand };
    const discard = [...state.discard, card];
    const active: Color = card.color === 'wild'
      ? (PLAY_COLORS.includes(action.color as Color) ? (action.color as Color) : mostColor(newHand))
      : card.color;

    // Playing your last card wins immediately (before any hand-swapping effect).
    if (newHand.length === 0) {
      return { ...state, hands, discard, activeColor: active, status: 'gameover', winnerId: pid, turnId: null, lastEvent: `${name} went out!` };
    }

    let deck = state.deck;
    let discardPile = discard;
    let stay = false; // skip the opponent -> play again
    let event = `${name} played ${describe(card)}`;

    const giveOpp = (n: number) => {
      const d = draw(deck, discardPile, n);
      deck = d.deck; discardPile = d.discard;
      hands = { ...hands, [opp]: [...hands[opp], ...d.out] };
    };

    switch (card.kind) {
      case 'skip':
      case 'reverse': stay = true; break;
      case 'draw2': giveOpp(2); stay = true; event += ` · ${state.players[opp]?.name ?? 'opp'} +2`; break;
      case 'wild4': giveOpp(4); stay = true; event += ` · +4, colour ${active}`; break;
      case 'frenzy': giveOpp(6); stay = true; event = `⚡ FRENZY! ${state.players[opp]?.name ?? 'opp'} draws 6`; break;
      case 'swap': hands = { ...hands, [pid]: hands[opp], [opp]: newHand }; event = `🔀 ${name} SWAPPED hands!`; break;
      case 'steal': {
        const stash = shuffle(hands[opp]);
        const taken = stash.slice(0, Math.min(2, stash.length));
        hands = { ...hands, [opp]: stash.slice(taken.length), [pid]: [...newHand, ...taken] };
        event = `🤏 ${name} STOLE ${taken.length} card${taken.length === 1 ? '' : 's'}!`;
        break;
      }
      case 'wild': event += ` · colour ${active}`; break;
      default: break; // num
    }

    return { ...state, deck, discard: discardPile, activeColor: active, hands, turnId: stay ? pid : opp, lastEvent: event };
  }

  return state;
}

function describe(card: Card): string {
  switch (card.kind) {
    case 'num': return `${card.color} ${card.num}`;
    case 'skip': return `${card.color} skip`;
    case 'reverse': return `${card.color} reverse`;
    case 'draw2': return `${card.color} +2`;
    case 'wild': return 'a wild';
    case 'wild4': return 'a wild +4';
    case 'swap': return 'SWAP';
    case 'steal': return 'STEAL';
    case 'frenzy': return 'FRENZY';
    default: return 'a card';
  }
}

// Bot: play if it can (saving wilds for when nothing colour-matches, but firing a
// disruptor when the rival is nearly out); otherwise draw. Picks its richest
// colour for wilds.
function botMove(state: UnoState, botId: string): GameAction | null {
  if (state.status !== 'playing' || state.turnId !== botId) return null;
  const ids = Object.keys(state.players);
  const opp = ids[0] === botId ? ids[1] : ids[0];
  const hand = state.hands[botId] ?? [];
  const top = state.discard[state.discard.length - 1];
  const playable = hand.filter((c) => canPlay(c, top, state.activeColor));
  if (!playable.length) return { a: 'draw' };

  const disruptors = playable.filter((c) => ['draw2', 'wild4', 'frenzy', 'steal', 'skip', 'reverse'].includes(c.kind));
  const plain = playable.filter((c) => c.color !== 'wild');
  let pick: Card;
  if ((state.hands[opp]?.length ?? 9) <= 2 && disruptors.length) pick = disruptors[0];
  else pick = plain[0] ?? playable[0];
  const color = pick.color === 'wild' ? mostColor(hand) : undefined;
  return { a: 'play', cardId: pick.id, color };
}

// Hide the deck and the opponent's actual cards; keep only the discard top.
function redact(state: UnoState, viewerId: string): UnoState {
  const hands: Record<string, Card[]> = {};
  for (const [pid, cards] of Object.entries(state.hands)) {
    hands[pid] = pid === viewerId ? cards : cards.map((_, i) => ({ id: `back-${pid}-${i}`, color: 'back', kind: 'back' }));
  }
  return { ...state, deck: [], discard: state.discard.slice(-1), hands };
}

// ---- Rendering ----
const glyph = (card: Card): string => {
  switch (card.kind) {
    case 'num': return String(card.num);
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return '🌈';
    case 'wild4': return '+4';
    case 'swap': return '🔀';
    case 'steal': return '🤏';
    case 'frenzy': return '⚡';
    default: return '';
  }
};

function UnoCard({ card, playable, small, onClick }: { key?: number | string; card: Card; playable?: boolean; small?: boolean; onClick?: () => void }) {
  const wild = isWildKind(card.kind);
  const back = card.color === 'back';
  return (
    <button
      disabled={!playable}
      onClick={onClick}
      className={cn(
        'rounded-xl border-[3px] border-white flex items-center justify-center font-black text-white shrink-0 shadow-[0_4px_10px_rgba(0,0,0,0.45)] transition-all',
        small ? 'w-10 h-14 text-lg' : 'w-14 h-20 sm:w-16 sm:h-24 text-2xl sm:text-3xl',
        playable ? 'cursor-pointer -translate-y-1 ring-2 ring-white hover:-translate-y-2' : '',
      )}
      style={{ background: back ? 'linear-gradient(145deg,#20242C,#111318)' : wild ? RAINBOW : COLOR_HEX[card.color] }}
    >
      <span className={cn('drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]', card.kind === 'draw2' || card.kind === 'wild4' ? 'text-xl sm:text-2xl' : '')}>
        {back ? '🔥' : glyph(card)}
      </span>
    </button>
  );
}

function Board({ state, myId, dispatch }: BoardProps<UnoState>) {
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const me = state.players[myId];
  const opponent = Object.values(state.players).find((p) => p.id !== myId);
  const oppId = opponent?.id ?? '';
  const myHand = state.hands[myId] ?? [];
  const oppHand = state.hands[oppId] ?? [];
  const top = state.discard[state.discard.length - 1];
  const myTurn = state.turnId === myId;

  const clickCard = (card: Card) => {
    if (!myTurn || !top || !canPlay(card, top, state.activeColor)) return;
    if (card.color === 'wild') { setPendingWild(card.id); return; }
    dispatch({ a: 'play', cardId: card.id });
  };
  const chooseColor = (color: Color) => {
    if (!pendingWild) return;
    dispatch({ a: 'play', cardId: pendingWild, color });
    setPendingWild(null);
  };

  return (
    <div className="flex flex-col items-center p-4 sm:p-6 max-w-2xl mx-auto w-full">
      <div className="w-full flex flex-col items-center mb-4 border-b-2 border-[#39414E] pb-4">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg,#EF4444,#F5C518,#22C55E,#3B82F6)' }}>
          Uno Frenzy!
        </h1>
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
      </div>

      {/* Opponent */}
      <div className="w-full flex items-center justify-between mb-4">
        <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">{opponent?.name ?? 'Opponent'} · {oppHand.length} cards</span>
        {state.turnId === oppId && <span className="text-[10px] font-mono uppercase tracking-widest text-white bg-[#E63946] px-2 py-1 rounded">their turn</span>}
      </div>
      <div className="flex gap-1 mb-6 flex-wrap justify-center min-h-[3.5rem]">
        {oppHand.slice(0, 12).map((c, i) => <UnoCard key={i} card={{ id: `b${i}`, color: 'back', kind: 'back' }} small />)}
        {oppHand.length > 12 && <span className="self-center text-xs font-mono text-[#E2E4E8] ml-1">+{oppHand.length - 12}</span>}
      </div>

      {/* Table: draw pile + discard + active colour */}
      <div className="flex items-center justify-center gap-6 mb-6">
        <button
          onClick={() => myTurn && dispatch({ a: 'draw' })}
          disabled={!myTurn}
          className="flex flex-col items-center gap-1"
        >
          <UnoCard card={{ id: 'draw', color: 'back', kind: 'back' }} playable={myTurn} />
          <span className="text-[9px] font-mono uppercase tracking-widest text-[#E2E4E8]">Draw</span>
        </button>
        <div className="flex flex-col items-center gap-1">
          {top && <UnoCard card={top} />}
          <span className="text-[9px] font-mono uppercase tracking-widest text-[#E2E4E8]">Discard</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="w-10 h-10 rounded-full border-2 border-white" style={{ background: state.activeColor === 'wild' ? RAINBOW : COLOR_HEX[state.activeColor] }} />
          <span className="text-[9px] font-mono uppercase tracking-widest text-[#E2E4E8]">Colour</span>
        </div>
      </div>

      {/* Turn banner */}
      <div className={cn('px-6 py-2 border-2 border-[#39414E] font-bold text-sm uppercase shadow-[4px_4px_0px_#454C5A] mb-4 text-white', myTurn ? 'bg-[#E63946]' : 'bg-[#262B34]')}>
        {myTurn ? 'Your turn — play or draw' : `${opponent?.name ?? 'Opponent'}'s turn`}
      </div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-[#E2E4E8] mb-4 text-center min-h-[1rem]">{state.lastEvent ?? 'Match the colour or number · powerups play any time'}</p>

      {/* My hand */}
      <div className="flex gap-1.5 flex-wrap justify-center w-full">
        {myHand.map((card) => (
          <UnoCard key={card.id} card={card} playable={myTurn && !!top && canPlay(card, top, state.activeColor)} onClick={() => clickCard(card)} />
        ))}
      </div>
      <span className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] mt-3">Your hand · {myHand.length} cards</span>

      {/* Wild colour picker */}
      {pendingWild && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0F1117]/80 backdrop-blur-sm" onClick={() => setPendingWild(null)}>
          <div className="bg-[#1A1D24] border-2 border-[#39414E] rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Pick a colour</p>
            <div className="grid grid-cols-2 gap-3">
              {PLAY_COLORS.map((c) => (
                <button key={c} onClick={() => chooseColor(c)} className="w-24 h-16 rounded-xl border-[3px] border-white active:translate-y-0.5 transition-all" style={{ background: COLOR_HEX[c] }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export const uno: GameDefinition<UnoState> = {
  ...gameCard('uno-frenzy'),
  createInitialState,
  start,
  reducer,
  redact,
  botMove,
  Board,
  gameOverMessage: (state, myId) =>
    state.winnerId === myId ? '🎉 Hand empty — you win!' : `${state.players[state.winnerId ?? '']?.name ?? 'Opponent'} emptied their hand first!`,
};
