import { lazy } from 'react';
import { ProjectDefinition } from './types';

// Lazy-loaded so its heavier deps (motion, file-saver, html-to-image) only
// download when a visitor actually opens the project — the home screen
// stays lean.
const VibeCheck = lazy(() =>
  import('./vibecheck/VibeCheck').then((m) => ({ default: m.VibeCheck })),
);

const PlaceTimelapse = lazy(() =>
  import('./streetview/PlaceTimelapse').then((m) => ({
    default: m.PlaceTimelapse,
  })),
);

const KnowYourBallot = lazy(() =>
  import('./know-your-ballot/KnowYourBallot').then((m) => ({ default: m.KnowYourBallot })),
);

const KnowYourBallotMichigan = lazy(() =>
  import('./know-your-ballot/michigan/KnowYourBallotMichigan').then((m) => ({ default: m.KnowYourBallotMichigan })),
);

const AIArt = lazy(() =>
  import('./aiart/AIArt').then((m) => ({ default: m.AIArt })),
);

// Frankie's personal projects — awesome things being built, one card each.
// VibeCheck is the first; add more here as they ship.
export const PROJECTS: ProjectDefinition[] = [
  {
    id: 'know-your-ballot-illinois',
    name: 'Know Your Ballot: Illinois',
    tagline: 'Every name on your Cook County ballot, explained.',
    description:
      'Enter your Chicago or suburban Cook address to see every race on your Nov 3 ballot, from U.S. Senate to judges: what each job does, who’s running, who’s funding them. Build your picks, plan your vote, take it to the booth. Official data, nonpartisan.',
    emoji: '🗳️',
    gradient: 'from-[#009CDF] via-[#973999] to-[#0a0a0a]',
    Component: KnowYourBallot,
  },
  {
    id: 'know-your-ballot-michigan',
    name: 'Know Your Ballot: Michigan',
    tagline: 'Every race on your Michigan midterm ballot, explained.',
    description:
      'Enter any Michigan address to see your Nov 3 ballot: governor, U.S. Senate, Congress, every seat in Lansing, the Supreme Court, the university boards and both statewide proposals. What each job does, who’s running, who’s funding them. Pick, plan, print, share.',
    emoji: '🧤',
    gradient: 'from-[#0369A1] via-[#0F766E] to-[#0a0a0a]',
    Component: KnowYourBallotMichigan,
  },
  {
    id: 'vibecheck',
    name: 'VibeCheck',
    tagline: 'The immersive company story generator.',
    description:
      'Type any company or tap a featured profile to generate a highly visual, scrollable story — the rundown, fast facts, a timeline and fun facts, from Wikipedia plus web-grounded profiles pre-baked offline. No API key needed.',
    emoji: '⚡',
    gradient: 'from-[#ccff00] via-[#8fae00] to-[#0a0a0a]',
    Component: VibeCheck,
  },
  {
    id: 'place-timelapse',
    name: 'Place Timelapse',
    tagline: 'Watch any place change over time.',
    description:
      'Watch any place on Earth change over time — a year of NASA satellite imagery (no key, exports a real video) or the ground-level Street View history of your memorable spots. Search, play, scrub the timeline.',
    emoji: '🌍',
    gradient: 'from-[#0ea5e9] via-[#0f766e] to-[#0a0a0a]',
    Component: PlaceTimelapse,
  },
  {
    id: 'ai-art',
    name: 'AI Art',
    tagline: 'A gallery of AI images and the prompts behind them.',
    description:
      'Browse AI-generated artwork from creators around the world and copy the exact prompt behind any image with one tap. Every piece credits its creator, links to the original, tags a theme, and names the AI model used. Search and filter by model.',
    emoji: '🎨',
    gradient: 'from-[#a855f7] via-[#6d28d9] to-[#0a0a0a]',
    Component: AIArt,
  },
  {
    id: 'govbot',
    name: 'Govbot',
    tagline: 'Open Civic Data for Everyone.',
    description:
      'Free, nonpartisan, open-source civic data from Chi Hack Night: every bill from all 50 states, Congress, D.C. and four territories in one place. Explore legislation, track hearings, clone any dataset as a Git repo in under a minute, or query every state with SQL.',
    emoji: '🏛️',
    gradient: 'from-[#2563eb] via-[#1e3a8a] to-[#0a0a0a]',
    href: 'https://chihacknight.github.io/govbot/',
  },
];

export const projectById = (id: string): ProjectDefinition | undefined =>
  PROJECTS.find((p) => p.id === id);
