import { ReactNode, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GameDefinition } from '../types';
import { usePeerSession } from '../hooks/usePeerSession';
import { useLocalSession } from '../hooks/useLocalSession';
import { JoinGame } from './JoinGame';
import { Lobby } from './Lobby';
import { GameOver } from './GameOver';

interface GameShellProps {
  key?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: GameDefinition<any>;
  onExit: () => void;
}

// Shared page chrome: sticky back bar + transient error toast.
function Chrome({ onExit, error, children }: { onExit: () => void; error?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F1117] text-[#E2E4E8] font-sans selection:bg-[#262B34]">
      <div className="sticky top-0 z-30 bg-[#0F1117]/95 backdrop-blur border-b border-[#23272F]">
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-4 py-3 text-xs font-mono font-bold uppercase tracking-widest text-[#E2E4E8] hover:text-[#F5F6F7] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Gallery
        </button>
      </div>

      {error && (
        <div className="fixed top-16 inset-x-0 flex justify-center z-50 px-4">
          <div className="bg-[#E63946] text-white px-6 py-3 border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] font-bold uppercase tracking-widest text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

// The handshake with a host on another network can take a few seconds while ICE
// works through candidates (and, if the direct path is blocked, falls back to a
// relay). Say so rather than showing a bare spinner — usePeerSession gives up
// and returns to the room-code screen with a reason if it never lands.
function Connecting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-6 min-h-[80vh] items-center justify-center px-4 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#39414E]" />
      <p className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Connecting to room…</p>
      {slow && (
        <p className="text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8] max-w-xs leading-relaxed">
          Taking a moment — finding a route to the host. Make sure they still have the game open.
        </p>
      )}
    </div>
  );
}

// Online (peer-to-peer) flow: join a room code, lobby, then play.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OnlineGame({ def, onExit, onPlayBot }: { def: GameDefinition<any>; onExit: () => void; onPlayBot: () => void }) {
  const { state, myId, conn, error, join, host, start, move, rematch, canManageBots, addBot, removeBot } = usePeerSession(def);
  const Board = def.Board;
  // Remember what was typed: a join that fails drops back to this screen, and
  // making someone re-enter the code and their name to try again is miserable.
  const [lastTry, setLastTry] = useState({ roomId: '', name: '' });
  const handleJoin = (roomId: string, name: string) => {
    setLastTry({ roomId, name });
    join(roomId, name);
  };
  const handleHost = (name: string) => {
    setLastTry((t) => ({ ...t, name }));
    host(name);
  };

  return (
    <Chrome onExit={onExit} error={error}>
      {conn === 'connecting' && !state ? (
        <Connecting />
      ) : !state ? (
        <JoinGame
          gameName={def.name}
          tagline={def.tagline}
          onHost={handleHost}
          onJoin={handleJoin}
          onPlayBot={def.botMove ? onPlayBot : undefined}
          minPlayers={def.minPlayers}
          maxPlayers={def.maxPlayers}
          initialRoomId={lastTry.roomId}
          initialName={lastTry.name}
        />
      ) : state.status === 'waiting' ? (
        <Lobby
          gameName={def.name}
          state={state}
          myId={myId}
          onStart={start}
          minPlayers={def.minPlayers}
          maxPlayers={def.maxPlayers}
          canManageBots={canManageBots}
          onAddBot={addBot}
          onRemoveBot={removeBot}
          extra={def.LobbyExtra ? <def.LobbyExtra state={state} myId={myId} dispatch={move} /> : undefined}
        />
      ) : (
        // Keep the final board rendered underneath so players can see exactly
        // how the game ended; the overlay sits on top and can be dismissed.
        <>
          <Board state={state} myId={myId} dispatch={move} />
          {state.status === 'gameover' && (
            <GameOver def={def} state={state} myId={myId} onExit={onExit} onPlayAgain={rematch} />
          )}
        </>
      )}
    </Chrome>
  );
}

// Lets a solo player pick how many total players (incl. bots) for games that
// seat more than two.
function PlayerCountPicker({ min, max, accent, onPick }: { min: number; max: number; accent: string; onPick: (n: number) => void }) {
  const counts = [];
  for (let n = min; n <= max; n++) counts.push(n);
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4">
      <div className="max-w-md w-full bg-[#1A1D24] shadow-[8px_8px_0px_#454C5A] border-2 border-[#39414E] p-8 space-y-6">
        <h2 className="text-2xl font-bold text-center text-[#F5F6F7] tracking-tighter uppercase italic border-b-2 border-[#39414E] pb-4">How many players?</h2>
        <div className="grid grid-cols-1 gap-3">
          {counts.map((n) => (
            <button
              key={n}
              onClick={() => onPick(n)}
              className="w-full py-4 text-left px-6 bg-[#262B34] hover:bg-[#323A47] active:translate-y-1 transition-all text-white font-bold border-2 border-[#39414E] uppercase tracking-[0.2em]"
              style={{ boxShadow: `4px 4px 0px ${accent}` }}
            >
              {n} players <span className="text-[#E2E4E8] text-xs normal-case tracking-normal font-mono">· you + {n - 1} bot{n - 1 > 1 ? 's' : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Offline flow: auto-seat the human + bots and start immediately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BotGame({ def, onExit }: { def: GameDefinition<any>; onExit: () => void }) {
  const min = def.minPlayers ?? 2;
  const max = def.maxPlayers ?? 2;
  // Games that seat more than two ask how many; otherwise default to 2.
  const [count, setCount] = useState<number | null>(max > 2 ? null : 2);
  const { state, myId, error, join, start, move, rematch } = useLocalSession(def, (count ?? 2) - 1);
  const Board = def.Board;
  const SetupPanel = def.LobbyExtra;

  useEffect(() => { if (count != null) join('SOLO', 'You'); }, [join, count]);
  // Games with a setup panel pause on a setup screen so the player can lock in
  // their choices (e.g. colour); others deal straight in.
  useEffect(() => { if (count != null && !SetupPanel && state?.status === 'waiting') start(); }, [count, SetupPanel, state?.status, start]);

  if (count == null) {
    return (
      <Chrome onExit={onExit} error={error}>
        <PlayerCountPicker min={min} max={max} accent={def.accent} onPick={setCount} />
      </Chrome>
    );
  }

  return (
    <Chrome onExit={onExit} error={error}>
      {state && state.status === 'waiting' && SetupPanel ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-4">
          <div className="max-w-md w-full bg-[#1A1D24] shadow-[8px_8px_0px_#454C5A] border-2 border-[#39414E] p-8 space-y-6">
            <h2 className="text-2xl font-bold text-center text-[#F5F6F7] tracking-tighter uppercase italic border-b-2 border-[#39414E] pb-4">{def.name}</h2>
            <SetupPanel state={state} myId={myId} dispatch={move} />
            <button
              onClick={start}
              className="w-full py-4 bg-[#E63946] hover:bg-[#D90429] active:translate-y-1 active:shadow-none transition-all text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] uppercase tracking-[0.2em]"
            >
              START GAME
            </button>
          </div>
        </div>
      ) : !state || state.status === 'waiting' ? (
        <div className="flex flex-col gap-6 min-h-[80vh] items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#39414E]" />
          <p className="text-xs font-mono uppercase tracking-widest text-[#E2E4E8]">Dealing you in…</p>
        </div>
      ) : (
        <>
          <Board state={state} myId={myId} dispatch={move} />
          {state.status === 'gameover' && (
            <GameOver def={def} state={state} myId={myId} onExit={onExit} onPlayAgain={rematch} />
          )}
        </>
      )}
    </Chrome>
  );
}

export function GameShell({ def, onExit }: GameShellProps) {
  const [mode, setMode] = useState<'online' | 'bot'>('online');

  return mode === 'bot'
    ? <BotGame def={def} onExit={onExit} />
    : <OnlineGame def={def} onExit={onExit} onPlayBot={() => setMode('bot')} />;
}
