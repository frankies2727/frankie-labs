import { Search as SearchIcon } from 'lucide-react';
import { ClearButton } from '../../components/ClearButton';
import { useMemo, useState } from 'react';
import type { Measure, Race, Retention } from './types';

// One box for "where's my alderperson / that judge / the gunshot question?".
// Searches the ballot on screen; if the voter's ballot has no match but some
// other Cook County ballot does, says so instead of a dead end.

export interface Hit {
  /** Contest id: the card to jump to. */
  id: string;
  section: string;
  title: string;
  detail: string;
}

interface Ballot { races: Race[]; retentions: Retention[]; measures: Measure[] }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

function index(b: Ballot): (Hit & { text: string })[] {
  return [
    ...b.races.map((r) => ({
      id: r.id, section: r.section, title: r.office,
      detail: r.candidates.map((c) => c.name).join(' · '),
      text: fold(`${r.office} ${r.candidates.map((c) => `${c.name} ${c.party}`).join(' ')}`),
    })),
    ...b.retentions.map((r) => ({
      id: r.id, section: 'retention', title: `Retain ${r.judge}?`, detail: `${r.court} · judicial retention`,
      text: fold(`${r.judge} ${r.court} retention judge`),
    })),
    ...b.measures.map((m) => ({
      id: m.id, section: 'measures', title: m.title, detail: 'Ballot question',
      text: fold(`${m.title} ${m.question} referendum question`),
    })),
  ];
}

// Every word must appear somewhere ("ford 7th" finds IL-7's La Shawn Ford).
const find = (idx: (Hit & { text: string })[], q: string) => {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return words.length ? idx.filter((h) => words.every((w) => h.text.includes(w))) : [];
};

interface Props {
  ballot: Ballot;
  /** Every contest in Cook County, to tell "not on yours" from "not anywhere". Omit when browsing them all. */
  everywhere?: Ballot;
  onJump: (hit: Hit) => void;
  /** Shown above the box; otherwise the label is for screen readers only. */
  label?: string;
}

export function BallotSearch({ ballot, everywhere, onJump, label }: Props) {
  const [q, setQ] = useState('');
  const mine = useMemo(() => index(ballot), [ballot]);
  const hits = useMemo(() => find(mine, q), [mine, q]);
  // Only built the first time a search comes up empty.
  const elsewhere = useMemo(() => (everywhere && q && !hits.length ? find(index(everywhere), q).length : 0), [everywhere, q, hits.length]);
  const go = (h: Hit) => { setQ(''); onJump(h); };

  return (
    <div className="space-y-2">
      <label htmlFor="kyb-search" className={label ? 'block font-black text-lg' : 'sr-only'}>{label ?? 'Search your ballot'}</label>
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--gb-text)] pointer-events-none" aria-hidden="true" />
        <input
          id="kyb-search" type="search" value={q} autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0]); if (e.key === 'Escape') setQ(''); }}
          placeholder="Search races and names"
          className="w-full min-h-[52px] rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] pl-12 pr-12 font-bold text-[var(--gb-text)] focus:border-[var(--gb-blue-hi)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {q && <ClearButton onClear={() => setQ('')} className="right-2 text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]" />}
      </div>

      {q && (
        <div role="region" aria-live="polite" aria-label="Search results" className="rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] overflow-hidden">
          {hits.length > 0 ? (
            <ul>
              {hits.slice(0, 8).map((h) => (
                <li key={h.id} className="border-b border-[var(--kyb-chip)] last:border-0">
                  <button type="button" onClick={() => go(h)} className="w-full text-left px-4 py-3 hover:bg-[var(--kyb-chip)]">
                    <span className="block font-bold text-[var(--gb-text)]">{h.title}</span>
                    {h.detail && <span className="block text-sm text-[var(--gb-text)] truncate">{h.detail}</span>}
                  </button>
                </li>
              ))}
              {hits.length > 8 && <li className="px-4 py-2 text-sm text-[var(--gb-text)]">{hits.length - 8} more: keep typing to narrow it down.</li>}
            </ul>
          ) : (
            <div className="px-4 py-3 text-[15px] text-[var(--gb-text)] space-y-2">
              <p>Nothing on {everywhere ? 'your ballot' : 'any Cook County ballot'} matches “{q}”.</p>
              {elsewhere > 0 && <p>{elsewhere === 1 ? 'One contest matches' : `${elsewhere} contests match`} on other ballots in Cook County, just not at your address.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
