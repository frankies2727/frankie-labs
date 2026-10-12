import { Check } from 'lucide-react';

// The ballot as a game: sections are levels, a small daily goal, a streak of
// visits and badges for the habits that make a good voter (reading up,
// planning, finishing). All counted on this device only.

export const DAILY_GOAL = 5;
// Rough time per decision, reading included, for "about N minutes left".
const SECONDS_PER_DECISION = 25;

/** Days in a row, ending today or yesterday, that this device opened the guide. */
export function streak(days: string[] | undefined, todayIso: string): number {
  const set = new Set(days);
  const day = new Date(`${todayIso}T12:00:00Z`);
  if (!set.has(todayIso)) day.setUTCDate(day.getUTCDate() - 1);
  let n = 0;
  while (set.has(day.toISOString().slice(0, 10))) { n++; day.setUTCDate(day.getUTCDate() - 1); }
  return n;
}

interface Ctx { done: number; total: number; allDone: boolean; looked: number; plan: Record<string, boolean | string>; visits: number }

/** Each badge's progress as [have, need]; earned when have reaches need. */
export const BADGES: { id: string; emoji: string; name: string; how: string; progress: (c: Ctx) => [number, number] }[] = [
  { id: 'first', emoji: '🗳️', name: 'First pick', how: 'Decide one race', progress: (c) => [Math.min(c.done, 1), 1] },
  { id: 'research', emoji: '🔎', name: 'Researcher', how: 'Open 3 candidate profiles or comparisons', progress: (c) => [Math.min(c.looked, 3), 3] },
  { id: 'plan', emoji: '📅', name: 'Planner', how: 'Pick how you’ll vote and set a reminder', progress: (c) => [Number(!!c.plan.method) + Number(!!c.plan.reminder), 2] },
  { id: 'share', emoji: '📣', name: 'Spread the word', how: 'Share your progress or save your link', progress: (c) => [Number(!!c.plan.shared), 1] },
  { id: 'regular', emoji: '🔥', name: 'Regular', how: 'Come back on 3 different days', progress: (c) => [Math.min(c.visits, 3), 3] },
  { id: 'ready', emoji: '🎉', name: 'Ballot ready', how: 'Decide every race', progress: (c) => [c.done, Math.max(c.total, 1)] },
];

const isEarned = (b: (typeof BADGES)[number], c: Ctx) => { const [have, need] = b.progress(c); return have >= need; };
export const earnedBadges = (c: Ctx) => BADGES.filter((b) => isEarned(b, c)).map((b) => b.id);

interface Level { id: string; title: string; emoji: string; color: string; ink: string; done: number; ids: string[] }

interface Props {
  levels: Level[];
  done: number;
  total: number;
  ctx: Ctx;
  todayCount: number;
  streakDays: number;
  onLevel: (id: string) => void;
}

export function ProgressCard({ levels, done, total, ctx, todayCount, streakDays, onLevel }: Props) {
  const left = total - done;
  const minutes = Math.max(1, Math.ceil((left * SECONDS_PER_DECISION) / 60));
  const goalHit = todayCount >= DAILY_GOAL;
  const earned = new Set(earnedBadges(ctx));
  return (
    <section aria-labelledby="kyb-progress" className="rounded-2xl border border-[var(--gb-border)] bg-[var(--gb-surface)] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="kyb-progress" className="text-xl">Your ballot, level by level</h2>
        <p className="text-sm font-bold">{left ? `About ${minutes} min to finish` : 'All done!'}</p>
      </div>

      {/* Levels: one per section, tap to jump there. */}
      <ol className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {levels.map((l, i) => {
          const complete = l.done === l.ids.length;
          return (
            <li key={l.id} className="snap-start shrink-0">
              <button type="button" onClick={() => onLevel(l.id)} aria-label={`Level ${i + 1}, ${l.title}: ${l.done} of ${l.ids.length} decided`}
                className="min-w-[104px] min-h-[64px] rounded-xl border-2 px-3 py-2 text-left"
                style={complete ? { background: l.color, borderColor: l.color, color: l.ink } : { borderColor: l.color }}>
                <span className="flex items-center gap-1.5 text-sm font-black">
                  <span aria-hidden="true">{l.emoji}</span>{complete ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" /> : `${l.done}/${l.ids.length}`}
                </span>
                <span className="block text-xs font-bold leading-tight mt-0.5">{l.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Today's goal and the streak: small, finishable, worth coming back for. */}
      {left > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2" aria-label={`Today's goal: ${Math.min(todayCount, DAILY_GOAL)} of ${DAILY_GOAL} races`}>
            <span className="text-sm font-bold">{goalHit ? '🎯 Today’s goal done!' : 'Today’s goal'}</span>
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: DAILY_GOAL }, (_, i) => (
                <span key={i} className="w-5 h-2.5 rounded-full" style={{ background: i < todayCount ? 'var(--gb-primary)' : 'var(--kyb-chip-hi)' }} />
              ))}
            </span>
            {!goalHit && <span className="text-sm font-bold">{todayCount}/{DAILY_GOAL} races</span>}
          </div>
          {streakDays >= 2 && <span className="rounded-full bg-[var(--kyb-chip)] px-3 py-1 text-sm font-bold">🔥 {streakDays}-day streak</span>}
        </div>
      )}

      {/* Badges: every one on show; earned ones marked, the rest say how far along you are. */}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="Badges">
        {BADGES.map((b) => {
          const got = earned.has(b.id);
          const [have, need] = b.progress(ctx);
          return (
            <li key={b.id} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${got ? 'border-[var(--gb-primary)] bg-[color-mix(in_srgb,var(--gb-primary)_16%,transparent)]' : 'border-[var(--gb-border-strong)]'}`}>
              <span className="text-2xl" aria-hidden="true">{b.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-black leading-tight">{b.name}</span>
                {got
                  ? <span className="block text-xs font-bold text-[var(--gb-primary)]">✓ Earned</span>
                  : <span className="block text-xs leading-snug">{b.how} · {have}/{need}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
