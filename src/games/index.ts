import { ExternalGameDefinition, GameDefinition } from '../types';
import { GAME_CARDS } from './catalog';

// The gallery of available games (most are 2-player; Ludo, Lotería, Crossword &
// Road to Citizenship seat more). The gallery only needs the cards; each game's
// code is a separate chunk loaded when it's opened.
export const GAMES = GAME_CARDS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LOADERS: Record<string, () => Promise<GameDefinition<any>>> = {
  'paper-numbers': () => import('./paperNumbers').then((m) => m.paperNumbers),
  'tic-tac-toe': () => import('./ticTacToe').then((m) => m.ticTacToe),
  'connect-four': () => import('./connectFour').then((m) => m.connectFour),
  'high-low': () => import('./highLow').then((m) => m.highLow),
  'battleship': () => import('./battleship').then((m) => m.battleship),
  'dots-and-boxes': () => import('./dotsAndBoxes').then((m) => m.dotsAndBoxes),
  'ludo': () => import('./ludo').then((m) => m.ludo),
  'uno-frenzy': () => import('./uno').then((m) => m.uno),
  'blackjack': () => import('./blackjack').then((m) => m.blackjack),
  'loteria': () => import('./loteria').then((m) => m.loteria),
  'crossword': () => import('./crossword').then((m) => m.crossword),
  'road-to-citizenship': () => import('./road/index').then((m) => m.roadToCitizenship),
};

export const hasGame = (id: string) => id in LOADERS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const loadGame = (id: string): Promise<GameDefinition<any>> => LOADERS[id]();

// Games hosted on their own site. They have no in-app state/reducer/board, so
// they live here rather than in GAMES — the gallery renders the same card but
// links out, and /play/<id> redirects to the real site so shared links work.
export const EXTERNAL_GAMES: ExternalGameDefinition[] = [
  {
    id: 'balloon-rumble',
    name: 'Balloon Rumble',
    tagline: 'Night arena. Drop balloons, grab power-ups, last fighter standing.',
    accent: '#C45E12',
    emoji: '🎈',
    href: 'https://pepper-apex-brave-coral.grok.me/',
  },
];

export const externalGameById = (id: string): ExternalGameDefinition | undefined =>
  EXTERNAL_GAMES.find((g) => g.id === id);
