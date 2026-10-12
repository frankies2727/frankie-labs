import type { GameCard } from '../types';

// What the games gallery shows for each in-app game, in gallery order. Kept
// apart from the games themselves so the gallery (and the home page) don't
// download every game's code: each game file reads its own card from here
// with `...gameCard(id)`, and the full game loads only when it's opened
// (see ./index.ts).

// Gallery icon: "Uno" is Spanish for "one", so a bold 1 with a star orbiting
// it (a slow-spinning layer carries the star around a faint ring).
function UnoIcon() {
  return (
    <span className="relative inline-flex h-full w-full items-center justify-center">
      {/* faint orbit ring */}
      <span className="absolute inset-1 rounded-full border border-[#F5C518]/30" />
      {/* spinning layer carries the star around the ring */}
      <span className="absolute inset-0 animate-[spin_5s_linear_infinite]">
        <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none">
          ✨
        </span>
      </span>
      {/* the "1" */}
      <span className="relative bg-gradient-to-br from-[#F5C518] via-[#ffd66b] to-[#ff5ea8] bg-clip-text text-2xl font-black italic leading-none text-transparent">
        1
      </span>
    </span>
  );
}

export const GAME_CARDS: GameCard[] = [
  {
    id: 'paper-numbers',
    name: 'Paper Numbers',
    tagline: 'Race to find numbers while your rival fills their dot sheet.',
    accent: '#E63946',
    emoji: '🔢',
  },
  {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    tagline: 'The timeless 3-in-a-row duel.',
    accent: '#2A9D8F',
    emoji: '⭕',
  },
  {
    id: 'connect-four',
    name: 'Connect 4',
    tagline: 'Stack discs and line up four before your rival.',
    accent: '#1D3557',
    emoji: '🔴',
  },
  {
    id: 'high-low',
    name: 'High-Low',
    tagline: 'Secretly call higher or lower — your rival deals the card blind. First to 6.',
    accent: '#9D4EDD',
    emoji: '🃏',
  },
  {
    id: 'battleship',
    name: 'Battleship',
    tagline: 'Hide your fleet, then hunt down the enemy ships — now 2–5 admirals on a bigger ocean.',
    accent: '#264653',
    emoji: '🚢',
  },
  {
    id: 'dots-and-boxes',
    name: 'Dots & Boxes',
    tagline: 'Draw lines, close boxes, claim the most. Pick a quick or long game.',
    accent: '#E76F51',
    emoji: '🔳',
  },
  {
    id: 'ludo',
    name: 'Sorry',
    tagline: 'A 2–4 player race with wildcard tiles. Roll, chase, capture, get all four home.',
    accent: '#2A9D8F',
    emoji: '🤷',
  },
  {
    id: 'uno-frenzy',
    name: 'Uno Frenzy!',
    tagline: 'Uno with chaos: swap hands, steal cards, and bury rivals in a Frenzy.',
    accent: '#F5C518',
    emoji: '🔥',
    icon: <UnoIcon />,
  },
  {
    id: 'blackjack',
    name: 'Blackjack 21',
    tagline: 'Neon, suit-free 21 for 2–5 — casino chips or a 15-round match, with friends & bots.',
    accent: '#F72585',
    emoji: '🃏',
  },
  {
    id: 'loteria',
    name: 'Lotería Millennial',
    tagline: 'Mexican bingo of images with a millennial twist — 2–5 players spot cartas & fill the tabla. Frenzy mode drops surprise mystery power-ups.',
    accent: '#F72585',
    emoji: '🎴',
  },
  {
    id: 'crossword',
    name: 'Crossword Clash',
    tagline: 'A 2–5 player brain-teaser race — claim words in a shared crossword for points. Normal & Hard modes, plus 3× 🔍 hints each.',
    accent: '#4CC9F0',
    emoji: '🧩',
  },
  {
    id: 'road-to-citizenship',
    name: 'Road to Citizenship',
    tagline: 'Study for the U.S. citizenship test together — pick a game after you join: fast-paced Trivia or the strategic Civic Path. Solo or 1–6 friends, with bots.',
    accent: '#B22234',
    emoji: '🗽',
  },
];

export function gameCard(id: string): GameCard {
  const card = GAME_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`No gallery card for game "${id}"`);
  return card;
}
