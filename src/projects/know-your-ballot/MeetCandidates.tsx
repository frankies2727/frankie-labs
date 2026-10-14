import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Candidate, Race } from './types';

// "Meet the candidates": everyone on a Cook County ballot as a row of faces,
// with A–Z letters to narrow it to names starting with that letter. Shown on
// the landing page only; a face opens that candidate's details.

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** First and last initials of the person (the first name on a ticket). */
export function initials(name: string) {
  const words = fold(name.split(' & ')[0]).replace(/["“”][^"“”]*["“”]/g, ' ').replace(/\b(Jr|Sr|II|III|IV)\b\.?/g, '').split(/[\s,]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/**
 * A candidate's photo in a circle, or their initials when there's no photo
 * (or it doesn't load). Photos are saved with the site, so no third party is
 * called from the visitor's browser.
 */
export function Face({ c, className }: { c: Candidate; className: string }) {
  const [broken, setBroken] = useState(false);
  const photo = c.photo && !broken ? `${import.meta.env.BASE_URL}${c.photo.file}` : null;
  return (
    <span className={`relative shrink-0 overflow-hidden rounded-full bg-[#E9EAEE] flex items-center justify-center font-[family-name:var(--gb-font-display)] font-medium text-[#0B1119] ${className}`}>
      {photo
        ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover object-top" />
        : <span aria-hidden="true">{initials(c.name)}</span>}
    </span>
  );
}

// Long official office names, shortened for a caption under a face.
const shortOffice = (office: string) => office
  .replace(/^Member of the Chicago Board of Education, Subdistrict (\w+)$/, 'Chicago school board · $1')
  .replace(/^President of the Chicago Board of Education$/, 'Chicago school board president')
  .replace(/^Metropolitan Water Reclamation District Commissioners? (Full|Unexpired) (\d)-Year Term$/, 'Water Reclamation District · $2-year term')
  .replace(/^U\.S\. Representative, (\d+)\w* District$/, 'U.S. House · District $1')
  .replace(/^State Senator, (\d+)\w* District$/, 'State Senate · District $1')
  .replace(/^State Representative, (\d+)\w* District$/, 'State House · District $1')
  .replace(/^County Commissioner, (\d+)\w* District$/, 'County Board · District $1')
  .replace(/^Board of Review, (\d+)\w* District$/, 'Board of Review · District $1')
  .replace(/^Judge of the (Appellate|Circuit) Court \(Vacancy of (.+)\)$/, '$1 Court judge · vacancy of $2')
  .replace(/^Judge, (\d+\w*) Subcircuit \(.*\)$/, 'Judge · $1 Subcircuit');

export const MeetCandidates = memo(function MeetCandidates({ races, onOpen }: { races: Race[]; onOpen: (race: Race, c: Candidate) => void }) {
  const [letter, setLetter] = useState<string | null>(null);
  const row = useRef<HTMLUListElement>(null);
  const people = useMemo(() => races
    .flatMap((race) => race.candidates.map((c) => ({ race, c, letter: fold(c.name)[0].toUpperCase() })))
    .sort((a, b) => fold(a.c.name).localeCompare(fold(b.c.name))), [races]);
  const counts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of people) n[p.letter] = (n[p.letter] ?? 0) + 1;
    return n;
  }, [people]);
  const shown = letter ? people.filter((p) => p.letter === letter) : people;
  // Back to the start of the row once the new list is drawn (before, the browser kept the old faces in view).
  useLayoutEffect(() => { if (row.current) row.current.scrollLeft = 0; }, [letter]);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (!people.length) return null;

  const pill = 'min-w-[44px] h-11 px-3 rounded-full border-2 text-[15px] font-bold';
  return (
    <section aria-labelledby="kyb-meet" className="space-y-5 text-[var(--gb-text)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2 max-w-[42rem]">
          <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-[var(--gb-primary)]">On the Nov 3 ballot</p>
          <h2 id="kyb-meet" className="text-4xl sm:text-5xl leading-[1.05]">Meet the candidates</h2>
          <p className="text-[16px] sm:text-[17px] leading-relaxed">Everyone running on a Cook County ballot, with the race they’re in. Pick a letter to see everyone whose name starts with it, and tap a face for their details.</p>
        </div>
        <div className="hidden sm:flex gap-3">
          <button type="button" onClick={() => scroll(-1)} aria-label="Scroll the candidates left" className="w-12 h-12 rounded-full border-2 border-[var(--gb-border-strong)] flex items-center justify-center hover:border-[var(--gb-text)]">
            <ChevronLeft className="w-5 h-5" strokeWidth={2.6} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label="Scroll the candidates right" className="w-12 h-12 rounded-full border-2 border-[var(--gb-border-strong)] flex items-center justify-center hover:border-[var(--gb-text)]">
            <ChevronRight className="w-5 h-5" strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div role="group" aria-label="Show candidates whose name starts with a letter" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible [scrollbar-width:none]">
        {[null, ...LETTERS].map((l) => {
          const n = l ? counts[l] ?? 0 : people.length;
          const on = letter === l;
          return (
            <button key={l ?? 'all'} type="button" onClick={() => setLetter(l)} disabled={!n} aria-pressed={on}
              aria-label={l ? (n ? `${l}: ${n} candidate${n === 1 ? '' : 's'}` : `${l}: no candidates`) : `All ${n} candidates`}
              className={`shrink-0 ${pill} ${on ? 'border-[var(--gb-primary)] bg-[var(--gb-primary)] text-[var(--gb-on-primary)]'
                : n ? 'border-[var(--gb-border-strong)] hover:border-[var(--gb-text)]' : 'border-dashed border-[var(--gb-border-strong)] line-through cursor-not-allowed'}`}>
              {l ?? 'All'}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="text-[15px] font-bold">
        {letter ? `${shown.length} candidate${shown.length === 1 ? '' : 's'} whose name starts with ${letter}` : `${people.length} candidates, A to Z`}
      </p>

      <ul ref={row} className="kyb-faces flex gap-6 sm:gap-9 overflow-x-auto snap-x snap-mandatory pt-2 pb-4 px-1">
        {shown.map(({ race, c }) => (
          <li key={`${race.id}|${c.ballot}`} className="snap-start shrink-0 w-[132px] sm:w-[196px]">
            <button type="button" onClick={() => onOpen(race, c)} className="group w-full flex flex-col items-center gap-3 text-center focus-visible:outline-none">
              <Face c={c} className="w-[124px] h-[124px] sm:w-[176px] sm:h-[176px] text-[40px] sm:text-[56px] ring-offset-4 ring-offset-[var(--gb-bg)] group-hover:ring-[3px] group-hover:ring-[var(--gb-primary)] group-focus-visible:ring-[3px] group-focus-visible:ring-[var(--gb-link)]" />
              <span className="flex flex-col items-center gap-1.5">
                <span className="block text-[16px] sm:text-[18px] font-semibold leading-tight">{c.name}</span>
                <span className="inline-flex rounded-full bg-[var(--kyb-chip)] px-2.5 py-0.5 text-[12px] sm:text-[13px] font-bold">{c.party}</span>
                <span className="block text-[13px] sm:text-[14px] leading-snug">{shortOffice(race.office)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
});
