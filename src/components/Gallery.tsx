import { ArrowLeft } from 'lucide-react';
import { ExternalGameDefinition, GameCard } from '../types';

const CARD_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue'].map((c) => `var(--color-rainbow-${c})`);

interface GalleryProps {
  games: GameCard[];
  /** Separately-hosted games; rendered as the same card but linking out. */
  externalGames?: ExternalGameDefinition[];
  onSelect: (id: string) => void;
  onBack: () => void;
}

export function Gallery({ games, externalGames = [], onSelect, onBack }: GalleryProps) {
  // One list so external games sit in the same grid as the in-app ones.
  const cards: (GameCard | ExternalGameDefinition)[] = [...games, ...externalGames];

  return (
    <div className="min-h-screen bg-[#0F1117] text-[#E2E4E8] font-sans selection:bg-[#262B34] px-4 py-12 sm:py-20">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-[#E2E4E8] hover:text-[#F5F6F7] transition-colors mb-10 motion-safe:animate-bounce"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Frankie Labs
        </button>

        <header className="text-center mb-12 sm:mb-16">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tighter uppercase italic text-[#F5F6F7]">
            Games
          </h1>
          <p className="text-xs sm:text-sm font-mono uppercase tracking-[0.3em] text-[#E2E4E8] mt-4">
            Chill · Real-time multiplayer games · Play with friends &amp; bots
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((game, i) => {
            const external = 'href' in game ? game.href : undefined;
            const cardClass =
              'group text-left bg-[#1A1D24] border-[3px] p-6 shadow-[6px_6px_0px_#454C5A] hover:shadow-[2px_2px_0px_#454C5A] hover:translate-x-1 hover:translate-y-1 active:translate-x-1.5 active:translate-y-1.5 transition-all flex flex-col gap-4 min-h-[200px]';
            // Each card takes the next of the six accent colours, all the way round.
            const border = { borderColor: CARD_COLORS[i % CARD_COLORS.length] };
            const inner = (
              <>
                <div
                  className="w-14 h-14 flex items-center justify-center text-3xl border-2 border-[#39414E]"
                  style={{ background: `${game.accent}22` }}
                >
                  {game.icon ?? game.emoji}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold uppercase tracking-tight text-[#F5F6F7]">{game.name}</h2>
                  <p className="text-sm text-[#E2E4E8] mt-2 leading-snug">{game.tagline}</p>
                </div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white">
                  {external ? 'Play ↗' : 'Play →'}
                </span>
              </>
            );

            // A separately-hosted game opens in a new tab; in-app games route
            // to their full-screen shell.
            return external ? (
              <a key={game.id} href={external} target="_blank" rel="noreferrer noopener" className={cardClass} style={border}>
                {inner}
              </a>
            ) : (
              <button key={game.id} onClick={() => onSelect(game.id)} className={cardClass} style={border}>
                {inner}
              </button>
            );
          })}
        </div>

        <footer className="text-center mt-16 text-[10px] font-mono uppercase tracking-widest text-[#E2E4E8]">
          Peer-to-peer · share a room code to play
        </footer>
      </div>
    </div>
  );
}
