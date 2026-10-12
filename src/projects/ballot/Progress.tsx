import { Info } from 'lucide-react';
import { useState } from 'react';

// The ballot as a game: a streak of visits and trophies for the habits that
// make a good voter (reading up, planning, finishing). All counted on this
// device only.

export const DAILY_GOAL = 5;

/** Days in a row, ending today or yesterday, that this device opened the guide. */
export function streak(days: string[] | undefined, todayIso: string): number {
  const set = new Set(days);
  const day = new Date(`${todayIso}T12:00:00Z`);
  if (!set.has(todayIso)) day.setUTCDate(day.getUTCDate() - 1);
  let n = 0;
  while (set.has(day.toISOString().slice(0, 10))) { n++; day.setUTCDate(day.getUTCDate() - 1); }
  return n;
}

interface Level { id: string; title: string; emoji: string; color: string; ink: string; done: number; ids: string[] }

interface Ctx {
  done: number; total: number; allDone: boolean;
  /** Candidate profiles and comparisons opened. */
  looked: number;
  plan: Record<string, boolean | string>;
  /** Different days visited, and the current run of days in a row. */
  visits: number; streak: number;
  /** Most races decided in one day. */
  best: number;
  hasPlace: boolean;
  levels: Level[];
}

export interface Trophy { id: string; emoji: string; name: string; how: string; progress: (c: Ctx) => [number, number] }

const upTo = (have: number, need: number): [number, number] => [Math.min(have, need), need];

/** Each trophy's progress as [have, need]; earned when have reaches need. */
const TROPHIES: Trophy[] = [
  { id: 'located', emoji: '📍', name: 'On the map', how: 'Look up your address', progress: (c) => upTo(Number(c.hasPlace), 1) },
  { id: 'first', emoji: '🗳️', name: 'First pick', how: 'Decide one race', progress: (c) => upTo(c.done, 1) },
  { id: 'five', emoji: '🖐️', name: 'High five', how: 'Decide 5 races', progress: (c) => upTo(c.done, 5) },
  { id: 'half', emoji: '🌗', name: 'Halfway there', how: 'Decide half your ballot', progress: (c) => upTo(c.done, Math.max(1, Math.ceil(c.total / 2))) },
  { id: 'ready', emoji: '🎉', name: 'Ballot ready', how: 'Decide every race', progress: (c) => upTo(c.done, Math.max(c.total, 1)) },
  { id: 'research', emoji: '🔎', name: 'Researcher', how: 'Open 3 candidate profiles or comparisons', progress: (c) => upTo(c.looked, 3) },
  { id: 'bookworm', emoji: '📚', name: 'Bookworm', how: 'Open 10 candidate profiles or comparisons', progress: (c) => upTo(c.looked, 10) },
  { id: 'goal', emoji: '🎯', name: 'Goal getter', how: `Decide ${DAILY_GOAL} races in one day`, progress: (c) => upTo(c.best, DAILY_GOAL) },
  { id: 'marathon', emoji: '🏃', name: 'Marathoner', how: 'Decide 20 races in one day', progress: (c) => upTo(c.best, 20) },
  { id: 'plan', emoji: '📅', name: 'Planner', how: 'Pick how you’ll vote and set a reminder', progress: (c) => upTo(Number(!!c.plan.method) + Number(!!c.plan.reminder), 2) },
  { id: 'share', emoji: '📣', name: 'Spread the word', how: 'Share your progress or save your link', progress: (c) => upTo(Number(!!c.plan.shared), 1) },
  { id: 'regular', emoji: '🔥', name: 'Regular', how: 'Come back on 3 different days', progress: (c) => upTo(c.visits, 3) },
  { id: 'roll', emoji: '⚡', name: 'On a roll', how: 'Visit 3 days in a row', progress: (c) => upTo(c.streak, 3) },
  { id: 'devoted', emoji: '🏆', name: 'Devoted', how: 'Come back on 7 different days', progress: (c) => upTo(c.visits, 7) },
];

/** Every trophy for this ballot: the fixed set plus one per level (section). */
export function trophies(levels: Level[]): Trophy[] {
  return [
    ...TROPHIES,
    ...levels.map((l): Trophy => ({
      id: `level-${l.id}`, emoji: l.emoji, name: `Level clear: ${l.title}`, how: `Decide every race in ${l.title}`,
      progress: (c) => { const lv = c.levels.find((x) => x.id === l.id); return upTo(lv?.done ?? 0, Math.max(1, lv?.ids.length ?? 1)); },
    })),
  ];
}

const isEarned = (t: Trophy, c: Ctx) => { const [have, need] = t.progress(c); return have >= need; };
export const earnedTrophies = (c: Ctx) => trophies(c.levels).filter((t) => isEarned(t, c));


const SHOW_FIRST = 6;

/** Trophies: earned ones first (tap ⓘ for what each was for), then the closest to earning. */
export function Trophies({ ctx }: { ctx: Ctx }) {
  const [showAll, setShowAll] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const list = trophies(ctx.levels)
    .map((t) => { const [have, need] = t.progress(ctx); return { t, have, need, got: have >= need }; })
    .sort((a, b) => Number(b.got) - Number(a.got) || b.have / b.need - a.have / a.need);
  const earnedCount = list.filter((x) => x.got).length;
  return (
    <section aria-labelledby="kyb-trophies" className="rounded-2xl border border-[var(--gb-border)] bg-[var(--gb-surface)] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="kyb-trophies" className="text-xl">🏆 Trophies <span className="font-[family-name:var(--gb-font-sans)] text-sm font-bold">· {earnedCount} of {list.length} earned</span></h2>
        {ctx.streak >= 2 && <span className="rounded-full bg-[var(--kyb-chip)] px-3 py-1 text-sm font-bold">🔥 {ctx.streak}-day streak</span>}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="Trophies">
        {(showAll ? list : list.slice(0, SHOW_FIRST)).map(({ t, have, need, got }) => (
          <li key={t.id} className={`rounded-xl border-2 px-3 py-2 ${got ? 'border-[var(--gb-primary)] bg-[color-mix(in_srgb,var(--gb-primary)_16%,transparent)]' : 'border-[var(--gb-border-strong)]'}`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black leading-tight">{t.name}</span>
                {got
                  ? <span className="block text-xs font-bold text-[var(--gb-primary)]">✓ Earned</span>
                  : <span className="block text-xs leading-snug">{t.how} · {have}/{need}</span>}
              </span>
              {got && (
                <button type="button" onClick={() => setOpened(opened === t.id ? null : t.id)} aria-expanded={opened === t.id} aria-label={`What ${t.name} was for`}
                  className="shrink-0 w-9 h-9 -mr-1 rounded-full flex items-center justify-center hover:bg-[var(--kyb-chip)]">
                  <Info className="w-[18px] h-[18px]" aria-hidden="true" />
                </button>
              )}
            </div>
            {got && opened === t.id && <p className="mt-1.5 text-xs leading-snug">{t.how}: done{need > 1 ? ` (${have}/${need})` : ''}.</p>}
          </li>
        ))}
      </ul>
      {list.length > SHOW_FIRST && (
        <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold">
          {showAll ? 'Show fewer' : `Show all ${list.length} trophies`}
        </button>
      )}
    </section>
  );
}
