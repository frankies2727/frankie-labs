import { useState } from 'react';

const PRIMARY = 'py-4 px-6 bg-[#262B34] hover:bg-[#323A47] active:translate-y-1 active:shadow-none transition-all text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#E63946] hover:shadow-[2px_2px_0px_#E63946] uppercase tracking-[0.2em] disabled:opacity-50 disabled:active:translate-y-0 disabled:shadow-[4px_4px_0px_#2E343F] disabled:hover:shadow-[4px_4px_0px_#2E343F] disabled:border-[#2E343F] disabled:bg-[#2E343F] disabled:text-[#8A92A0]';

interface JoinGameProps {
  gameName: string;
  tagline?: string;
  /** Open a new room; the code is generated and shown in the lobby. */
  onHost: (name: string) => void;
  onJoin: (roomId: string, name: string) => void;
  /** When provided, shows a "Play vs Computer" shortcut (solo, offline). */
  onPlayBot?: () => void;
  minPlayers?: number;
  maxPlayers?: number;
  /** Seeds the form so a join that failed can be retried without retyping. */
  initialRoomId?: string;
  initialName?: string;
}

export function JoinGame({ gameName, tagline, onHost, onJoin, onPlayBot, minPlayers = 2, maxPlayers = 2, initialRoomId = '', initialName = '' }: JoinGameProps) {
  const multi = maxPlayers > 2;
  const [roomId, setRoomId] = useState(initialRoomId);
  const [name, setName] = useState(initialName);
  const named = name.trim() !== '';
  const canJoin = named && roomId.trim() !== '';

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 selection:bg-[#262B34]">
      <div className="max-w-md w-full bg-[#1A1D24] shadow-[8px_8px_0px_#454C5A] border-2 border-[#39414E] p-8 space-y-8">
        <div className="text-center space-y-2 border-b-2 border-[#39414E] pb-6">
          <h1 className="text-4xl font-bold tracking-tighter uppercase italic text-[#F5F6F7]">{gameName}</h1>
          <p className="text-xs font-mono uppercase tracking-widest text-[#9CA3AF]">
            {tagline ?? 'Share a room code with a friend to play'}
          </p>
          {multi && (
            <p className="text-[10px] font-mono uppercase tracking-widest text-[#F72585] font-bold pt-1">
              👥 {minPlayers}–{maxPlayers} players · online with friends
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="player-name" className="block text-[10px] uppercase font-bold text-[#8A92A0] mb-2 tracking-widest">Your Name</label>
            <input
              id="player-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Taylor"
              className="w-full px-4 py-3 border-2 border-[#2E343F] focus:border-[#39414E] focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_#454C5A] font-mono text-lg transition-all bg-[#262B34] text-[#F5F6F7] font-bold"
            />
          </div>
          <button
            onClick={() => named && onHost(name)}
            disabled={!named}
            className={`${PRIMARY} w-full mt-4`}
          >
            Host a new room
          </button>

          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-[#2E343F]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#8A92A0]">or join a friend</span>
            <span className="h-px flex-1 bg-[#2E343F]" />
          </div>

          <form
            className="flex gap-3"
            onSubmit={(e) => { e.preventDefault(); if (canJoin) onJoin(roomId, name); }}
          >
            <label htmlFor="room-code" className="sr-only">Room code</label>
            <input
              id="room-code"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 px-4 py-3 border-2 border-[#2E343F] focus:border-[#39414E] focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_#454C5A] font-mono text-lg uppercase transition-all bg-[#262B34] text-[#F5F6F7] font-bold"
            />
            <button type="submit" disabled={!canJoin} className={PRIMARY}>
              Join
            </button>
          </form>

          {onPlayBot && (
            <>
              <div className="flex items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-[#2E343F]" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#8A92A0]">or</span>
                <span className="h-px flex-1 bg-[#2E343F]" />
              </div>
              <button
                onClick={onPlayBot}
                className="w-full py-4 px-6 bg-[#1A1D24] hover:bg-[#262B34] active:translate-y-1 active:shadow-none transition-all text-[#F5F6F7] font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] uppercase tracking-[0.2em]"
              >
                🤖 Play vs Computer
              </button>
            </>
          )}

          <p className="text-[10px] text-center text-[#8A92A0] font-mono leading-relaxed">
            {multi
              ? `One person hosts and shares the room code with up to ${maxPlayers - 1} friends — the host starts once ${minPlayers}+ are in. Hosts: keep this page open while friends join.`
              : 'One person hosts and shares the room code; the other joins with it. Hosts: keep this page open while your friend joins.'}
          </p>
        </div>
      </div>
    </div>
  );
}
