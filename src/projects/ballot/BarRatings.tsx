import { Check, Minus, X } from 'lucide-react';
import { useState } from 'react';

// Chicago-area bar groups' ratings of a judge or judicial candidate, drawn
// here: a gauge for the overall picture, then each group's own word. From the
// Alliance of Bar Associations for Judicial Screening (and, for retentions,
// the Chicago Bar Association via Injustice Watch; scripts/ballot/judges.mjs).

const GROUPS: Record<string, string> = {
  AABAR: 'Arab American Bar Association of Illinois',
  AABA: 'Asian American Bar Association',
  BMLA: 'Black Men Lawyers’ Association',
  BWLA: 'Black Women Lawyers’ Association',
  CBA: 'Chicago Bar Association',
  CCL: 'Chicago Council of Lawyers',
  CCBA: 'Cook County Bar Association',
  DSL: 'Decalogue Society of Lawyers',
  HBA: 'Hellenic Bar Association',
  HLAI: 'Hispanic Lawyers Association of Illinois',
  ISBA: 'Illinois State Bar Association',
  LAGBAC: 'LGBTQ+ Bar Association (LAGBAC)',
  PRBA: 'Puerto Rican Bar Association',
  WBAI: 'Women’s Bar Association of Illinois',
};

type Verdict = 'yes' | 'no' | 'none';
const verdict = (rating: string): Verdict => (/^not evaluated$/i.test(rating) ? 'none' : /^(no|not )/i.test(rating) ? 'no' : 'yes');
// Retention ballots ask "keep this judge?": say so in those words.
const wording = (rating: string) => (rating === 'Yes' ? 'Retain' : rating === 'No' ? 'Don’t retain' : rating);

export function tally(bar: Record<string, string>) {
  const rated = Object.values(bar).filter((r) => verdict(r) !== 'none');
  return { yes: rated.filter((r) => verdict(r) === 'yes').length, of: rated.length };
}

const headline = (share: number) =>
  share === 1 ? 'All positive ratings' : share >= 0.75 ? 'Mostly positive ratings' : share >= 0.5 ? 'Mixed ratings' : 'Mostly negative ratings';

/** A half-dial of red-to-green ticks with a needle at the share of positive ratings. */
const TICKS = 25;
const at = (t: number, r: number) => [50 + r * Math.cos(Math.PI * (1 - t)), 52 - r * Math.sin(Math.PI * (1 - t))];

/**
 * The dial's ticks, drawn once for the whole page; each gauge reuses them, so
 * 60 judges' gauges cost 3 elements each instead of 27. Mount once.
 */
export function GaugeDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <symbol id="kyb-gauge-ticks" viewBox="0 0 100 56">
        {Array.from({ length: TICKS }, (_, i) => {
          const t = i / (TICKS - 1);
          const [x1, y1] = at(t, 36);
          const [x2, y2] = at(t, 46);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`hsl(${t * 120} 85% 50%)`} strokeWidth={3.4} strokeLinecap="round" />;
        })}
      </symbol>
    </svg>
  );
}

function Gauge({ share, size }: { share: number; size: number }) {
  const [nx, ny] = at(share, 30);
  const [bx1, by1] = at(share + 0.5, 3.2);
  const [bx2, by2] = at(share - 0.5, 3.2);
  return (
    <svg viewBox="0 0 100 56" width={size} height={size * 0.56} aria-hidden="true">
      <use href="#kyb-gauge-ticks" />
      <path d={`M${bx1} ${by1} L${nx} ${ny} L${bx2} ${by2} Z`} fill="var(--gb-text)" />
      <circle cx={50} cy={52} r={3.6} fill="var(--gb-text)" />
    </svg>
  );
}

/**
 * `compact` (on a retention card): small gauge and the count, with each
 * group's rating a tap away. Otherwise (a candidate's details): everything open.
 */
export function BarRatings({ bar, source, compact = false }: { bar: Record<string, string>; /** This person's ratings on the Alliance's site. */ source?: string; compact?: boolean }) {
  const { yes, of } = tally(bar);
  // On a retention card the list is built only once opened: 60 cards' worth
  // of closed lists were thousands of elements nobody sees.
  const [open, setOpen] = useState(false);
  if (!of) return null;
  const share = yes / of;
  const groups = Object.entries(bar).sort(([a], [b]) => (GROUPS[a] ?? a).localeCompare(GROUPS[b] ?? b));
  const list = (
    <ul className="divide-y divide-[var(--kyb-chip)] rounded-xl border-2 border-[var(--gb-border)]">
      {groups.map(([g, r]) => {
        const v = verdict(r);
        const Icon = v === 'yes' ? Check : v === 'no' ? X : Minus;
        return (
          <li key={g} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>{GROUPS[g] ?? g}</span>
            <span className={`inline-flex shrink-0 items-center gap-1 font-bold ${v === 'yes' ? 'text-[var(--gb-primary)]' : v === 'no' ? 'text-[var(--gb-red)]' : ''}`}>
              <Icon className="w-4 h-4" aria-hidden="true" />{wording(r)}
            </span>
          </li>
        );
      })}
    </ul>
  );
  const link = source && (
    <a href={source} target="_blank" rel="noreferrer noopener" className="block w-fit text-sm font-bold text-[var(--gb-link)] underline underline-offset-2">
      See these ratings at the source (VoteForJudges.org) ↗
    </a>
  );
  const summary = (
    <div className={`flex items-center gap-3 ${compact ? '' : 'flex-col text-center'}`} role="img" aria-label={`${headline(share)}: ${yes} of ${of} bar groups rate ${compact ? 'this judge' : 'them'} positively`}>
      <Gauge share={share} size={compact ? 84 : 200} />
      <div>
        <p className={`font-black leading-tight ${compact ? 'text-[15px]' : 'text-xl'}`}>{headline(share)}</p>
        <p className="text-sm"><b>{yes} of {of}</b> bar groups rate {compact ? 'this judge' : 'them'} positively</p>
      </div>
    </div>
  );
  return compact ? (
    <div className="space-y-2 text-[var(--gb-text)]">
      {summary}
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-bold underline underline-offset-2">Each group’s rating</summary>
        {open && <div className="mt-2 space-y-2">{list}{link}</div>}
      </details>
    </div>
  ) : (
    <div className="space-y-3 rounded-xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] p-3 text-[var(--gb-text)]">
      <h4 className="font-black">⚖️ Bar association ratings</h4>
      {summary}
      {list}
      <p className="text-sm">Chicago-area bar groups screen judicial candidates with questionnaires, background checks and interviews. Candidates who don’t take part are rated “Not recommended.”</p>
      {link}
    </div>
  );
}
