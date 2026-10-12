import { useEffect, useRef, useState } from 'react';
import { BaseState, BoardProps, GameAction, GameDefinition } from '../types';
import { cn } from '../lib/utils';
import { gameCard } from './catalog';

export interface PaperNumbersState extends BaseState {
  masterSheet: number[]; // 1..100 shuffled
  targetNumber: number | null;
  finderId: string | null;
  playerDots: Record<string, boolean[]>; // 64 booleans per player
  foundNumbers: number[]; // numbers already claimed this game
}

const pickTarget = (sheet: number[], found: number[]): number | null => {
  const remaining = sheet.filter((n) => !found.includes(n));
  if (remaining.length === 0) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
};

function createInitialState(roomId: string): PaperNumbersState {
  const masterSheet = Array.from({ length: 100 }, (_, i) => i + 1);
  for (let i = masterSheet.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [masterSheet[i], masterSheet[j]] = [masterSheet[j], masterSheet[i]];
  }
  return {
    roomId,
    status: 'waiting',
    players: {},
    winnerId: null,
    masterSheet,
    targetNumber: null,
    finderId: null,
    playerDots: {},
    foundNumbers: [],
  };
}

function start(state: PaperNumbersState): PaperNumbersState {
  const ids = Object.keys(state.players);
  const playerDots: Record<string, boolean[]> = {};
  for (const pid of ids) playerDots[pid] = Array(64).fill(false);
  return {
    ...state,
    status: 'playing',
    finderId: ids[0],
    targetNumber: pickTarget(state.masterSheet, []),
    foundNumbers: [],
    playerDots,
  };
}

function reducer(state: PaperNumbersState, pid: string, action: GameAction): PaperNumbersState {
  if (state.status !== 'playing') return state;

  if (action.t === 'find') {
    const num = action.num as number;
    if (pid !== state.finderId || num !== state.targetNumber) return state;
    if (state.foundNumbers.includes(num)) return state;
    const foundNumbers = [...state.foundNumbers, num];
    const ids = Object.keys(state.players);
    const finderId = state.finderId === ids[0] ? ids[1] : ids[0];
    return { ...state, foundNumbers, finderId, targetNumber: pickTarget(state.masterSheet, foundNumbers) };
  }

  if (action.t === 'dot') {
    const index = action.index as number;
    if (pid === state.finderId) return state;
    const dots = state.playerDots[pid];
    if (!dots || index < 0 || index >= dots.length) return state;
    const next = dots.slice();
    next[index] = true;
    const playerDots = { ...state.playerDots, [pid]: next };
    if (next.every(Boolean)) {
      return { ...state, playerDots, status: 'gameover', winnerId: pid };
    }
    return { ...state, playerDots };
  }

  return state;
}

// Bot: when it holds the Finder role it claims the current target (swapping
// roles); when it's the Dotter it fills the next open dot on its sheet. The
// session's move delay acts as the bot's "reaction time" each step.
function botMove(state: PaperNumbersState, botId: string): GameAction | null {
  if (state.status !== 'playing') return null;
  if (state.finderId === botId) {
    if (state.targetNumber == null) return null;
    return { t: 'find', num: state.targetNumber };
  }
  const dots = state.playerDots[botId];
  if (!dots) return null;
  const next = dots.findIndex((d) => !d);
  if (next < 0) return null;
  return { t: 'dot', index: next };
}

function Board({ state, myId, dispatch }: BoardProps<PaperNumbersState>) {
  const isMyTurnToFind = state.finderId === myId;
  const opponent = Object.values(state.players).find((p) => p.id !== myId);

  const serverMyDots = state.playerDots[myId] || Array(64).fill(false);
  const opponentDots = opponent ? (state.playerDots[opponent.id] || Array(64).fill(false)) : Array(64).fill(false);
  const found = new Set(state.foundNumbers);

  // Optimistic overlay so a tapped dot fills instantly instead of waiting for
  // the host's broadcast round-trip. Dots only go false->true within a game,
  // so merging (host OR optimistic) can never show a wrong state.
  const [optimisticDots, setOptimisticDots] = useState<boolean[]>(() => Array(64).fill(false));
  useEffect(() => {
    if (isMyTurnToFind) {
      setOptimisticDots((prev) => (prev.some(Boolean) ? Array(64).fill(false) : prev));
    } else {
      setOptimisticDots((prev) => prev.map((o, i) => o && !serverMyDots[i]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isMyTurnToFind]);

  const myDotsInfo = serverMyDots.map((d, i) => d || optimisticDots[i]);
  const myDotsCount = myDotsInfo.filter(Boolean).length;
  const opponentDotsCount = opponentDots.filter(Boolean).length;

  const handleDot = (i: number) => {
    if (isMyTurnToFind || myDotsInfo[i]) return;
    setOptimisticDots((prev) => { const next = prev.slice(); next[i] = true; return next; });
    dispatch({ t: 'dot', index: i });
  };

  const [flash, setFlash] = useState<{ i: number; ok: boolean } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const handleFind = (num: number, i: number) => {
    if (!isMyTurnToFind || found.has(num)) return;
    const ok = num === state.targetNumber;
    setFlash({ i, ok });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 450);
    dispatch({ t: 'find', num });
  };

  return (
    <div className="flex flex-col p-4 sm:p-8 max-w-6xl mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b-2 border-[#39414E] pb-4 gap-4">
        <div className="flex flex-col">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">Paper Numbers</h1>
          <span className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Room ID: #{state.roomId}</span>
        </div>
        <div className="flex items-center gap-6 sm:gap-12 w-full md:w-auto justify-between md:justify-end">
          <div className="text-center">
            <div className="text-[10px] sm:text-xs uppercase font-bold text-[#E2E4E8] mb-1 tracking-widest">Current Role</div>
            <div className={cn(
              "px-4 sm:px-6 py-2 border-2 border-[#39414E] font-bold text-sm sm:text-lg uppercase shadow-[4px_4px_0px_#454C5A]",
              isMyTurnToFind ? "bg-[#E63946] text-white" : "bg-[#262B34] text-white"
            )}>
              {isMyTurnToFind ? 'FINDER' : 'DOTTER'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] sm:text-xs uppercase font-bold text-[#E2E4E8] mb-1 tracking-widest">Target</div>
            <div className="text-4xl sm:text-5xl font-black text-[#E63946] font-mono leading-none">
              {state.targetNumber ?? '--'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-8">
        {/* My Sheet (8x8 Dots) */}
        <div className={cn(
          "col-span-1 lg:col-span-3 bg-[#1A1D24] border border-[#2E343F] p-4 shadow-[4px_4px_0px_#454C5A] flex flex-col transition-opacity duration-300 min-h-[400px]",
          isMyTurnToFind && "grayscale pointer-events-none"
        )}>
          <div className="flex justify-between items-end mb-6">
            <h2 className="font-bold text-sm underline underline-offset-4 uppercase">YOUR SHEET</h2>
            <span className="font-mono text-xs text-[#E63946] font-bold tracking-widest">{myDotsCount}/64</span>
          </div>
          <div className="grid grid-cols-8 gap-2 flex-1 items-center max-w-[280px] mx-auto w-full">
            {myDotsInfo.map((circled, i) => (
              <button
                key={i}
                disabled={isMyTurnToFind || circled}
                onClick={() => handleDot(i)}
                className={cn(
                  "aspect-square rounded-full border-2 flex items-center justify-center transition-all duration-75 outline-none touch-manipulation",
                  circled
                    ? "border-blue-600 bg-blue-100"
                    : "border-[#2E343F] bg-[#262B34] hover:border-blue-400 active:scale-90 active:bg-blue-50"
                )}
              >
                {circled && <div className="w-1 h-1 sm:w-2 sm:h-2 bg-blue-600 rounded-full" />}
              </button>
            ))}
          </div>
          <div className="mt-6">
            <div className="h-1 bg-[#262B34] w-full">
              <div className="h-1 bg-blue-600 transition-all duration-300" style={{ width: `${(myDotsCount/64)*100}%` }}></div>
            </div>
            <p className="text-[10px] mt-2 text-[#E2E4E8] italic uppercase tracking-wider font-bold">
              Status: {isMyTurnToFind ? 'Finding Number...' : 'Circling Dots...'}
            </p>
          </div>
        </div>

        {/* Master Sheet (10x10) */}
        <div className={cn(
          "col-span-1 lg:col-span-6 flex flex-col h-full min-h-[400px] transition-opacity duration-300",
          !isMyTurnToFind && "grayscale pointer-events-none"
        )}>
          <div className="bg-[#1A1D24] border-2 border-[#39414E] p-2 flex-1 shadow-[8px_8px_0px_#2E343F] overflow-hidden">
            <div className="grid grid-cols-10 h-full border border-[#2E343F]">
              {state.masterSheet.map((num, i) => {
                const isFlash = flash?.i === i;
                const claimed = found.has(num);
                return (
                  <button
                    key={i}
                    disabled={!isMyTurnToFind || claimed}
                    onClick={() => handleFind(num, i)}
                    className={cn(
                      "aspect-square border-[0.5px] border-[#23272F] flex items-center justify-center font-mono text-sm sm:text-base lg:text-lg outline-none transition-colors duration-75 touch-manipulation",
                      claimed
                        ? "bg-[#E63946]/15 text-[#E63946] line-through font-bold"
                        : "text-[#E2E4E8] bg-[#1A1D24]",
                      isMyTurnToFind && !claimed ? "hover:bg-[#262B34] active:bg-[#2E343F]" : "",
                      isFlash && (flash!.ok ? "bg-green-900/40 text-green-200" : "bg-red-900/40 text-red-200")
                    )}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-center mt-6">
            <p className="text-[10px] sm:text-xs font-bold text-[#E2E4E8] border-l-2 border-[#E63946] pl-3 uppercase tracking-widest">
              Claimed numbers turn red. Tap the target to claim it.
            </p>
          </div>
        </div>

        {/* Opponent Sheet (reference) */}
        <div className="col-span-1 lg:col-span-3 bg-[#1A1D24] border border-[#2E343F] p-4 shadow-[4px_4px_0px_#454C5A] flex flex-col grayscale pointer-events-none min-h-[400px]">
          <div className="flex justify-between items-end mb-6">
            <h2 className="font-bold text-sm underline underline-offset-4 uppercase">{opponent?.name || 'OPPONENT'}</h2>
            <span className="font-mono text-xs text-[#E63946] font-bold tracking-widest">{opponentDotsCount}/64</span>
          </div>
          <div className="grid grid-cols-8 gap-2 flex-1 items-center max-w-[280px] mx-auto w-full">
            {opponentDots.map((circled, i) => (
              <div
                key={i}
                className={cn(
                  "aspect-square rounded-full border-2 flex items-center justify-center",
                  circled ? "border-red-600 bg-red-100" : "border-[#2E343F] bg-[#262B34]"
                )}
              >
                {circled && <div className="w-1 h-1 sm:w-2 sm:h-2 bg-red-600 rounded-full" />}
              </div>
            ))}
          </div>
          <div className="mt-6">
            <div className="h-1 bg-[#262B34] w-full">
              <div className="h-1 bg-red-600" style={{ width: `${(opponentDotsCount/64)*100}%` }}></div>
            </div>
            <p className="text-[10px] mt-2 text-[#E2E4E8] italic uppercase tracking-wider font-bold">
              Status: {!isMyTurnToFind ? 'Finding Number...' : 'Circling Dots...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const paperNumbers: GameDefinition<PaperNumbersState> = {
  ...gameCard('paper-numbers'),
  createInitialState,
  start,
  reducer,
  botMove,
  Board,
  gameOverMessage: (state, myId) =>
    state.winnerId === myId
      ? '🎉 You dot-blasted them!'
      : state.winnerId
        ? `${state.players[state.winnerId]?.name ?? 'Opponent'} filled their sheet first!`
        : 'Opponent left the game.',
};
