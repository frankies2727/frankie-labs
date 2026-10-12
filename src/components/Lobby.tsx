import { ReactNode, useState } from 'react';
import { BaseState } from '../types';
import { isBotId } from '../hooks/usePeerSession';

interface LobbyProps {
  gameName: string;
  state: BaseState;
  onStart: () => void;
  myId: string;
  minPlayers?: number;
  maxPlayers?: number;
  /** Host of a bot-capable game: can add/remove CPU players. */
  canManageBots?: boolean;
  onAddBot?: () => void;
  onRemoveBot?: (id: string) => void;
  /** Optional game-specific pre-game setup UI (e.g. a colour picker). */
  extra?: ReactNode;
}

export function Lobby({ gameName, state, onStart, myId, minPlayers = 2, maxPlayers = 2, canManageBots = false, onAddBot, onRemoveBot, extra }: LobbyProps) {
  const players = Object.values(state.players);
  const canStart = players.length >= minPlayers && players.length <= maxPlayers;
  const roomFull = players.length >= maxPlayers;
  // Show a slot for each still-open seat, up to the max.
  const emptySlots = Math.max(0, maxPlayers - players.length);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 selection:bg-[#262B34]">
      <div className="max-w-md w-full bg-[#1A1D24] shadow-[8px_8px_0px_#454C5A] border-2 border-[#39414E] p-8">
        <h2 className="text-2xl font-bold text-center mb-2 text-[#F5F6F7] tracking-tighter uppercase italic">{gameName}</h2>
        <h3 className="text-center mb-8 text-[#F5F6F7] tracking-tighter uppercase italic border-b-2 border-[#39414E] pb-4">
          Room: <span className="text-[#E63946] font-mono not-italic font-black">{state.roomId}</span>
          <CopyCode code={state.roomId} />
        </h3>

        <div className="space-y-4 mb-10">
          <p className="text-xs font-mono font-bold text-[#E2E4E8] uppercase tracking-widest text-center">
            Players ({players.length}/{maxPlayers})
          </p>
          <ul className="space-y-4">
            {players.map((p) => {
              const bot = isBotId(p.id);
              return (
                <li key={p.id} className="flex items-center space-x-4 p-4 bg-[#262B34] border-2 border-[#2E343F] shadow-[4px_4px_0px_#2E343F]">
                  <div className="h-12 w-12 bg-[#262B34] text-white flex items-center justify-center font-bold text-xl font-mono border-2 border-[#39414E]">
                    {bot ? '🤖' : p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 font-bold text-[#F5F6F7] text-xl uppercase tracking-wider">
                    {p.name}
                    {p.id === myId && <span className="text-[10px] text-[#E63946] ml-2 tracking-widest font-mono align-middle">(YOU)</span>}
                    {bot && <span className="text-[10px] text-[#06D6A0] ml-2 tracking-widest font-mono align-middle">(CPU)</span>}
                  </span>
                  {bot && canManageBots && (
                    <button
                      onClick={() => onRemoveBot?.(p.id)}
                      aria-label={`Remove ${p.name}`}
                      className="h-8 w-8 flex items-center justify-center text-[#E2E4E8] hover:text-[#E63946] border-2 border-[#39414E] hover:border-[#E63946] font-mono font-bold transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
            {canManageBots && !roomFull && (
              <li>
                <button
                  onClick={onAddBot}
                  className="w-full flex items-center space-x-4 p-4 bg-[#1A1D24] hover:bg-[#262B34] active:translate-y-0.5 border-2 border-dashed border-[#39414E] hover:border-[#06D6A0] transition-all group"
                >
                  <div className="h-12 w-12 border-2 border-dashed border-[#39414E] group-hover:border-[#06D6A0] bg-[#262B34] flex items-center justify-center text-2xl">🤖</div>
                  <span className="font-bold text-[#E2E4E8] group-hover:text-[#F5F6F7] text-lg uppercase tracking-widest">＋ Add a bot</span>
                </button>
              </li>
            )}
            {Array.from({ length: canManageBots ? Math.max(0, emptySlots - 1) : emptySlots }).map((_, i) => (
              <li key={`empty-${i}`} className="flex items-center space-x-4 p-4 bg-[#1A1D24] border-2 border-dashed border-[#2E343F]">
                <div className="h-12 w-12 border-2 border-dashed border-[#2E343F] bg-[#262B34]" />
                <span className="font-mono h-4 w-24 bg-[#262B34] animate-pulse" />
              </li>
            ))}
          </ul>
        </div>

        {extra && <div className="mb-8">{extra}</div>}

        <button
          onClick={onStart}
          disabled={!canStart}
          className="w-full py-4 bg-[#E63946] hover:bg-[#D90429] active:translate-y-1 active:shadow-none transition-all text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] uppercase tracking-[0.2em] mt-4 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:shadow-none disabled:border-[#2E343F] disabled:bg-[#2E343F] disabled:text-[#E2E4E8]"
        >
          {canStart
            ? maxPlayers > minPlayers
              ? `START GAME (${players.length})`
              : 'START GAME'
            : `WAITING FOR PLAYERS… (${players.length}/${minPlayers})`}
        </button>
        {maxPlayers > 2 && (
          <p className="text-[10px] text-center text-[#E2E4E8] font-mono leading-relaxed mt-4">
            Up to {maxPlayers} can join this room code. Start any time {minPlayers}+ are in.
          </p>
        )}
      </div>
    </div>
  );
}

// Friends joining from far away need the code texted to them; one tap beats
// reading it off and retyping it.
function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  if (!navigator.clipboard) return null;
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, () => { /* permission denied: the code is still on screen */ });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="ml-3 align-middle px-2 py-1 text-[10px] font-mono not-italic font-bold uppercase tracking-widest text-[#E2E4E8] border-2 border-[#39414E] hover:bg-[#262B34]"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
