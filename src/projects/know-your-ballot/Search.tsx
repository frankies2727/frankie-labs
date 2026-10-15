import { Search as SearchIcon } from 'lucide-react';
import { ClearButton } from '../../components/ClearButton';
import { useMemo, useState } from 'react';
import { useStateConfig, type StateConfig } from './state';
import type { Measure, Race, Retention } from './types';

// One box for "where's my alderperson / that judge / the gunshot question?".
// Searches the ballot on screen; if the voter's ballot has no match but some
// other Cook County ballot does, says what and where it is instead of a dead
// end (searching a neighborhood or suburb finds the contests covering it).

export interface Hit {
  /** Contest id: the card to jump to. */
  id: string;
  section: string;
  title: string;
  detail: string;
  /** What and where it is, for contests on other ballots: "Federal · Congressional District 6 · 3 candidates". */
  about: string;
  /** Its district, as a key into the places list ("cd:6"). */
  area?: string;
}

interface Ballot { races: Race[]; retentions: Retention[]; measures: Measure[] }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** With `places`, a contest also matches the neighborhoods and suburbs it covers. */
type Entry = Hit & { text: string; places?: string[] };

function index(b: Ballot, sections: Record<string, string>, { areaLabel, scopeLabel, region }: StateConfig, places?: Record<string, string[]>): Entry[] {
  const entries: Entry[] = [
    ...b.races.map((r) => ({
      id: r.id, section: r.section, title: r.office,
      detail: r.candidates.map((c) => c.name).join(' · '),
      about: [sections[r.section], areaLabel(r), r.candidates.length ? count(r.candidates.length, 'candidate') : 'write-in only'].join(' · '),
      area: r.area ? `${r.area.type}:${r.area.id}` : undefined,
      text: fold(`${r.office} ${r.candidates.map((c) => `${c.name} ${c.party}`).join(' ')}`),
    })),
    ...b.retentions.map((r) => ({
      id: r.id, section: 'retention', title: `Retain ${r.judge}?`, detail: `${r.court} · ${r.withdrawn ? 'withdrew, votes won’t count' : 'judicial retention'}`,
      about: `${sections.retention} · All of ${region} · yes or no`,
      text: fold(`${r.judge} ${r.court} retention judge`),
    })),
    ...b.measures.map((m) => ({
      id: m.id, section: 'measures', title: m.title, detail: 'Ballot question',
      about: `${sections.measures} · ${scopeLabel(m)} · yes or no`,
      area: m.scope.type === 'ward' ? `ward:${m.scope.id}` : m.scope.type === 'precinct' ? `precinct:${m.scope.ward}-${m.scope.precinct}` : undefined,
      text: fold(`${m.title} ${m.question} referendum question`),
    })),
  ];
  if (places) for (const e of entries) if (e.area && places[e.area]) e.places = places[e.area].map(fold);
  return entries;
}

// Every word must appear somewhere ("ford 7th" finds IL-7's La Shawn Ford),
// or the whole search must start a place's name ("oak park", not "Oak Forest").
const find = (idx: Entry[], q: string) => {
  const phrase = fold(q).trim().replace(/\s+/g, ' ');
  const words = phrase.split(' ').filter(Boolean);
  return words.length ? idx.filter((h) => words.every((w) => h.text.includes(w)) || h.places?.some((p) => p.startsWith(phrase))) : [];
};

interface Props {
  ballot: Ballot;
  /** Every contest in Cook County, to tell "not on yours" from "not anywhere". Omit when browsing them all. */
  everywhere?: Ballot;
  /** Section titles by id, for describing contests on other ballots. */
  sections: Record<string, string>;
  /** The neighborhoods and suburbs each district covers, by "type:id". */
  places?: Record<string, string[]>;
  onJump: (hit: Hit) => void;
}

const SHOWN_ELSEWHERE = 5;
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function BallotSearch({ ballot, everywhere, sections, places, onJump }: Props) {
  const [q, setQ] = useState('');
  const config = useStateConfig();
  const mine = useMemo(() => index(ballot, sections, config), [ballot, sections, config]);
  const hits = useMemo(() => find(mine, q), [mine, q]);
  // Only built the first time a search comes up empty.
  const all = useMemo(() => (everywhere && q && !hits.length ? index(everywhere, sections, config, places) : null), [everywhere, sections, config, places, q, hits.length]);
  const elsewhere = useMemo(() => (all ? find(all, q) : []), [all, q]);
  const go = (h: Hit) => { setQ(''); onJump(h); };

  return (
    // The results float over the page rather than push it down: the search sits
    // in the pinned bar, and a bar changing height on every keystroke makes
    // the browser restyle the whole page.
    <div className="relative">
      <label htmlFor="kyb-search" className="sr-only">Search races, candidates, judges or questions</label>
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--gb-text)] pointer-events-none" aria-hidden="true" />
        <input
          id="kyb-search" type="text" inputMode="search" enterKeyHint="search" value={q} autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0]); if (e.key === 'Escape') setQ(''); }}
          placeholder="Search races, candidates, judges or questions"
          className="w-full min-h-[52px] rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] pl-12 pr-12 font-bold text-[var(--gb-text)] focus:border-[var(--gb-blue-hi)] focus:outline-none"
        />
        {q && <ClearButton onClear={() => setQ('')} className="right-2 text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]" />}
      </div>

      {q && (
        <div role="region" aria-live="polite" aria-label="Search results" className="absolute inset-x-0 top-full z-40 mt-2 rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] shadow-[0_12px_32px_rgba(0,0,0,0.35)] max-h-[50vh] overflow-y-auto">
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
              <p>Nothing on {everywhere ? 'your ballot' : `any ${config.region} ballot`} matches “{q}”.</p>
              {elsewhere.length > 0 && (
                <>
                  <p>{elsewhere.length === 1 ? 'One contest matches' : `${elsewhere.length} contests match`} on other ballots in {config.region}, just not at your address:</p>
                  <ul className="space-y-2">
                    {elsewhere.slice(0, SHOWN_ELSEWHERE).map((h) => {
                      const where = h.area ? places?.[h.area] : undefined;
                      return (
                        <li key={h.id} className="rounded-xl border-2 border-[var(--gb-border)] px-3 py-2">
                          <span className="block font-bold">{h.title}</span>
                          <span className="block text-sm">{h.about}</span>
                          {where?.length ? <span className="block text-sm">📍 Covers {h.area?.startsWith('precinct:') ? '' : 'parts of '}{list(where)}</span> : null}
                          {h.detail && h.section !== 'measures' && <span className="block text-sm">{h.detail}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {elsewhere.length > SHOWN_ELSEWHERE && <p className="text-sm">{elsewhere.length - SHOWN_ELSEWHERE} more: keep typing to narrow it down.</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
