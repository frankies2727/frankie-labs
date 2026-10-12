import { useState } from 'react';
import { Trophy, Eye } from 'lucide-react';
import { BaseState, GameDefinition } from '../types';

interface GameOverProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: GameDefinition<any>;
  state: BaseState;
  myId: string;
  onExit: () => void;
  /** When provided (e.g. vs computer), offers an immediate rematch. */
  onPlayAgain?: () => void;
}

// Shown as an overlay *on top of* the final board so players can see exactly how
// the game ended. The result panel can be dismissed to inspect the board, then
// brought back with a floating button.
export function GameOver({ def, state, myId, onExit, onPlayAgain }: GameOverProps) {
  const [peeking, setPeeking] = useState(false);

  const message = def.gameOverMessage
    ? def.gameOverMessage(state, myId)
    : !state.winnerId
      ? "It's a draw!"
      : state.winnerId === myId
        ? '🎉 You win!'
        : `${state.players[state.winnerId]?.name ?? 'Opponent'} wins!`;

  // Peeking: hide the panel, leave a floating button to bring the result back.
  if (peeking) {
    return (
      <button
        onClick={() => setPeeking(false)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-[#E63946] hover:bg-[#D90429] active:translate-y-0.5 transition-all text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] uppercase tracking-[0.2em] text-sm"
      >
        🏁 Show Result
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0F1117]/80 backdrop-blur-sm">
      <div className="max-w-md w-full bg-[#1A1D24] shadow-[8px_8px_0px_#454C5A] border-2 border-[#39414E] p-8 sm:p-10 text-center space-y-6 text-[#E2E4E8]">
        <div className="flex justify-center">
          <div className="bg-[#262B34] p-6 border-2 border-[#39414E] inline-flex items-center justify-center shadow-[4px_4px_0px_#2E343F]">
            <Trophy className="w-16 h-16 sm:w-20 sm:h-20 text-[#F5F6F7]" strokeWidth={2} />
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold text-[#F5F6F7] tracking-tighter uppercase italic">GAME OVER</h1>
          <p className="text-base mt-4 text-[#E2E4E8] font-mono tracking-widest uppercase">{message}</p>
        </div>

        <button
          onClick={() => setPeeking(true)}
          className="w-full py-3 flex items-center justify-center gap-2 bg-[#1A1D24] hover:bg-[#262B34] active:translate-y-1 active:shadow-none transition-all text-[#F5F6F7] font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] uppercase tracking-[0.2em] text-sm"
        >
          <Eye className="w-4 h-4" /> View Final Board
        </button>

        {onPlayAgain && (
          <button
            onClick={onPlayAgain}
            className="w-full py-4 bg-[#E63946] hover:bg-[#D90429] active:translate-y-1 active:shadow-none transition-all text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] uppercase tracking-[0.2em]"
          >
            ↻ Play Again
          </button>
        )}
        <button
          onClick={onExit}
          className="w-full py-4 bg-[#262B34] hover:bg-[#323A47] active:translate-y-1 active:shadow-none transition-all text-white font-bold border-2 border-[#39414E] shadow-[4px_4px_0px_#E63946] hover:shadow-[2px_2px_0px_#E63946] uppercase tracking-[0.2em]"
        >
          Back to Gallery
        </button>
      </div>
    </div>
  );
}
