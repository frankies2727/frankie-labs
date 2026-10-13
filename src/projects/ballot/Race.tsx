import { AtSign, Check, ExternalLink, Facebook, Info, Instagram, Linkedin, Music2, Scale, Twitter, X, Youtube, type LucideIcon } from 'lucide-react';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { explainOffice } from './offices';
import { researchLinks } from './research';
import { money, type Choice } from './store';
import type { Candidate, Measure, Race, Retention, SocialPlatform } from './types';

const AREA_LABEL: Record<string, string> = {
  cd: 'Congressional District', sldu: 'State Senate District', sldl: 'State House District',
  commissioner: 'County Board District', bor: 'Board of Review District', subcircuit: 'Judicial Subcircuit', school: 'School Subdistrict',
};
const areaLabel = (r: Race) => {
  if (r.area?.type === 'city') return 'Everyone in Chicago';
  if (r.area?.type === 'mwrd') return 'Water Reclamation District';
  if (r.area) return `${AREA_LABEL[r.area.type]} ${r.area.id}`;
  return r.section === 'federal' || r.section === 'state' ? 'Statewide' : 'All of Cook County';
};

// ---- shared bits ---------------------------------------------------------

function Badge({ children, tone = 'var(--kyb-chip)', ink = 'var(--gb-text)' }: { children: ReactNode; tone?: string; ink?: string }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap" style={{ background: tone, color: ink }}>{children}</span>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface-2)] p-6 outline-none"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="text-2xl font-black leading-tight text-[var(--gb-text)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-11 h-11 rounded-full bg-[var(--kyb-chip)] flex items-center justify-center text-[var(--gb-text)] hover:bg-[var(--kyb-chip-hi)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Yes / No / Skip for retentions and referenda. */
function YesNo({ value, onChange, label }: { value: Choice | undefined; onChange: (c: Choice) => void; label: string }) {
  const opts: { v: Choice; text: string; on: string }[] = [
    { v: 'yes', text: 'Yes', on: 'bg-[var(--gb-primary)] border-[var(--gb-primary)] text-[var(--gb-bg)]' },
    { v: 'no', text: 'No', on: 'bg-[var(--gb-red)] border-[var(--gb-red)] text-white' },
    { v: 'skip', text: 'Skip', on: 'bg-[var(--gb-text)] border-[var(--gb-text)] text-[var(--gb-bg)]' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button
          key={o.text}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`min-h-[44px] rounded-xl border-2 font-bold transition-colors ${value === o.v ? o.on : 'border-[var(--gb-border)] bg-[var(--kyb-chip)] text-[var(--gb-text)] hover:border-[var(--gb-text)]'}`}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function MoneyBars({ c, max }: { c: Candidate; max: number }) {
  if (!c.money) return null;
  const rows: [string, number, string][] = [
    ['Raised', c.money.raised, 'var(--gb-primary)'],
    ['Spent', c.money.spent, 'var(--kyb-orange)'],
    ['Cash', c.money.cash, 'var(--gb-blue-hi)'],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([label, n, color]) => (
        <div key={label}>
          <div className="flex justify-between gap-2 text-sm font-bold text-[var(--gb-text)]"><span>{label}</span><span>{money(n)}</span></div>
          <div className="h-2.5 rounded-full bg-[var(--kyb-chip)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${max ? Math.max(2, (Math.max(n, 0) / max) * 100) : 0}%`, background: color }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--gb-text)]">{c.money.source === 'FEC' ? 'Federal Election Commission' : 'Illinois State Board of Elections'} reports, Jan 2025 through {c.money.through}. Cash is what’s left on hand.</p>
    </div>
  );
}

// ---- race card -------------------------------------------------------------

interface RaceProps {
  key?: string;
  race: Race;
  color: string;
  /** Text colour that reads on `color`. */
  ink: string;
  /** Show official ballot numbers (only true for Chicago ballots). */
  numbered: boolean;
  choice: Choice | undefined;
  // Stable callbacks keyed by race (not per-card closures), so a tap only
  // re-renders the card it changed: with ~170 races open that matters.
  onChoose: (id: string, c: Choice) => void;
  onInfo: (race: Race, c: Candidate) => void;
  onCompare: (race: Race) => void;
}

export const RaceCard = memo(function RaceCard({ race, color, ink, numbered, choice, onChoose: chooseFor, onInfo, onCompare }: RaceProps) {
  const onChoose = (c: Choice) => chooseFor(race.id, c);
  const picked = Array.isArray(choice) ? choice : [];
  const toggle = (ballot: number) => {
    if (race.voteFor === 1) return onChoose(picked[0] === ballot ? [] : [ballot]);
    if (picked.includes(ballot)) return onChoose(picked.filter((b) => b !== ballot));
    if (picked.length < race.voteFor) onChoose([...picked, ballot]);
  };
  const full = picked.length >= race.voteFor;
  const decided = choice === 'skip' || picked.length > 0;

  return (
    <article id={`race-${race.id}`} className="scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,260px)+16px)] rounded-2xl border-[3px] bg-[var(--gb-surface)] overflow-hidden" style={{ borderColor: color }}>
      <div className="p-5 space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{areaLabel(race)}</Badge>
            {race.voteFor > 1 && <Badge tone={color} ink={ink}>Pick up to {race.voteFor}</Badge>}
            {decided && <Badge tone="var(--gb-primary)" ink="var(--gb-bg)">✓ Done</Badge>}
          </div>
          <h3 className="text-xl font-black leading-tight text-[var(--gb-text)]">{race.office}</h3>
          <p className="text-[15px] leading-relaxed text-[var(--gb-text)]">{explainOffice(race.office)}</p>
        </header>

        <ul className="space-y-2">
          {race.candidates.map((c) => {
            const on = picked.includes(c.ballot);
            return (
              <li key={c.ballot} className="flex items-stretch gap-2">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full && race.voteFor > 1}
                  onClick={() => toggle(c.ballot)}
                  className="flex-1 min-w-0 flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed"
                  style={on ? { borderColor: color, background: `color-mix(in srgb, ${color} 15%, transparent)` } : { borderColor: 'var(--gb-border)', background: 'var(--kyb-chip)' }}
                >
                  <span className="shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-black" style={on ? { background: color, borderColor: color, color: ink } : { borderColor: 'var(--gb-text)', color: 'var(--gb-text)' }}>
                    {on ? <Check className="w-5 h-5" strokeWidth={3} /> : numbered ? c.ballot : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug text-[var(--gb-text)]">{c.name}</span>
                    <span className="flex flex-wrap gap-1.5 mt-1">
                      <Badge tone="var(--gb-bg)">{c.party}</Badge>
                      {c.incumbent && <Badge tone="var(--gb-text)" ink="var(--gb-bg)">Incumbent</Badge>}
                      {c.money && <Badge tone="var(--gb-bg)">{money(c.money.raised)} raised</Badge>}
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => onInfo(race, c)} aria-label={`About ${c.name}`} className="shrink-0 w-12 rounded-xl border-2 border-[var(--gb-border)] bg-[var(--kyb-chip)] flex items-center justify-center text-[var(--gb-text)] hover:border-[var(--gb-text)]">
                  <Info className="w-5 h-5" />
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-wrap items-center gap-2">
          {race.candidates.length > 1 && (
            <button type="button" onClick={() => onCompare(race)} className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
              <Scale className="w-4 h-4" aria-hidden="true" /> Compare
            </button>
          )}
          <button
            type="button"
            aria-pressed={choice === 'skip'}
            onClick={() => onChoose(choice === 'skip' ? [] : 'skip')}
            className={`min-h-[44px] rounded-xl border-2 px-4 font-bold ${choice === 'skip' ? 'border-[var(--gb-text)] bg-[var(--gb-text)] text-[var(--gb-bg)]' : 'border-[var(--gb-border)] text-[var(--gb-text)] hover:border-[var(--gb-text)]'}`}
          >
            {choice === 'skip' ? 'Skipped' : 'Skip this one'}
          </button>
          {race.candidates.length === 1 && <span className="text-sm text-[var(--gb-text)]">Only one candidate is running.</span>}
          {race.writeIn && <span className="text-sm text-[var(--gb-text)]">Write-ins allowed.</span>}
        </footer>
      </div>
    </article>
  );
});

// ---- candidate sheet ---------------------------------------------------------

// Their accounts, in the order most people look for them.
const SOCIAL: [SocialPlatform, string, LucideIcon][] = [
  ['x', 'X (Twitter)', Twitter], ['facebook', 'Facebook', Facebook], ['instagram', 'Instagram', Instagram],
  ['youtube', 'YouTube', Youtube], ['tiktok', 'TikTok', Music2], ['bluesky', 'Bluesky', AtSign],
  ['threads', 'Threads', AtSign], ['linkedin', 'LinkedIn', Linkedin],
];

function Follow({ c }: { c: Candidate }) {
  const links = SOCIAL.filter(([k]) => /^https:\/\//.test(c.social?.[k] ?? ''));
  if (!links.length) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">📣 Follow them</h3>
      <ul className="flex flex-wrap gap-2">
        {links.map(([k, label, Icon]) => (
          <li key={k}>
            <a href={c.social![k]} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 min-h-[44px] rounded-full border-2 border-[var(--gb-text)] px-4 font-bold text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
              <Icon className="w-4 h-4" aria-hidden="true" /> {label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CandidateSheet({ race, c, color, ink, numbered, picked, onPick, onClose }: { race: Race; c: Candidate; color: string; ink: string; numbered: boolean; picked: boolean; onPick: () => void; onClose: () => void }) {
  return (
    <Dialog title={c.name} onClose={onClose}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge tone={color} ink={ink}>{race.office}</Badge>
          <Badge>{c.party}</Badge>
          {numbered && <Badge>Ballot #{c.ballot}</Badge>}
          {c.incumbent && <Badge tone="var(--gb-text)" ink="var(--gb-bg)">Incumbent</Badge>}
        </div>

        <Follow c={c} />

        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">💰 Campaign money</h3>
          {c.money ? (
            <MoneyBars c={c} max={Math.max(c.money.raised, c.money.spent, c.money.cash)} />
          ) : (
            <p className="text-[15px] text-[var(--gb-text)]">{race.section === 'federal'
              ? 'No FEC filings found. Federal candidates who raise or spend under $5,000 don’t have to file.'
              : 'No campaign reports found for this cycle. Illinois candidates who raise or spend under $5,000 in a year don’t need a campaign committee.'}</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">🔎 Dig deeper</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {researchLinks(c, race).map((l) => (
              <li key={l.label}>
                <a href={l.href} target="_blank" rel="noreferrer noopener" className="flex h-full items-start justify-between gap-3 rounded-xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] p-3 hover:border-[var(--gb-text)]">
                  <span>
                    <span className="block font-bold text-[var(--gb-text)]">{l.label}</span>
                    <span className="block text-sm text-[var(--gb-text)]">{l.note}</span>
                  </span>
                  <ExternalLink className="w-4 h-4 shrink-0 mt-1 text-[var(--gb-text)]" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          onClick={() => { onPick(); onClose(); }}
          className="w-full min-h-[52px] rounded-xl font-black text-lg"
          style={picked ? { background: 'var(--kyb-chip)', color: 'var(--gb-text)', border: '2px solid var(--gb-text)' } : { background: color, color: ink }}
        >
          {picked ? 'Remove from My Ballot' : 'Add to My Ballot'}
        </button>
      </div>
    </Dialog>
  );
}

// ---- head-to-head --------------------------------------------------------------

export function Compare({ race, color, ink, numbered, picked, onPick, onInfo, onClose }: { race: Race; color: string; ink: string; numbered: boolean; picked: number[]; onPick: (ballot: number) => void; onInfo: (c: Candidate) => void; onClose: () => void }) {
  const max = Math.max(1, ...race.candidates.map((c) => c.money ? Math.max(c.money.raised, c.money.spent, c.money.cash) : 0));
  const anyMoney = race.candidates.some((c) => c.money);
  return (
    <Dialog title={`Compare: ${race.office}`} onClose={onClose}>
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${race.candidates.length}, minmax(170px, 1fr))` }}>
          {race.candidates.map((c) => {
            const on = picked.includes(c.ballot);
            return (
              <div key={c.ballot} className="flex flex-col gap-4 rounded-2xl border-2 bg-[var(--gb-surface)] p-4" style={{ borderColor: on ? color : 'var(--gb-border)' }}>
                <div className="space-y-2">
                  <p className="text-lg font-black leading-tight text-[var(--gb-text)]">{c.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{c.party}</Badge>
                    {numbered && <Badge>#{c.ballot}</Badge>}
                  </div>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-[var(--gb-text)]">Incumbent</dt><dd className="font-bold text-[var(--gb-text)]">{c.incumbent ? 'Yes' : 'No'}</dd></div>
                </dl>
                {anyMoney && (c.money ? <MoneyBars c={c} max={max} /> : <p className="text-sm text-[var(--gb-text)]">No campaign reports found.</p>)}
                <button type="button" onClick={() => onInfo(c)} className="mt-auto inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border-2 border-[var(--gb-border)] bg-[var(--kyb-chip)] font-bold text-[var(--gb-text)] hover:border-[var(--gb-text)]">
                  <Info className="w-4 h-4" aria-hidden="true" /> Details
                </button>
                <button
                  type="button"
                  onClick={() => onPick(c.ballot)}
                  className="min-h-[44px] rounded-xl font-bold"
                  style={on ? { background: color, color: ink } : { border: '2px solid var(--gb-text)', color: 'var(--gb-text)' }}
                >
                  {on ? '✓ On My Ballot' : 'Pick'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {!anyMoney && <p className="mt-4 text-[15px] text-[var(--gb-text)]">No campaign reports found for anyone in this race this cycle.</p>}
      <p className="mt-4 text-[15px] text-[var(--gb-text)]">Money and incumbency come from official FEC and Illinois State Board of Elections records. Tap “ⓘ Details” under a name for donors, background and their campaign site.</p>
    </Dialog>
  );
}

// ---- retention & referenda -------------------------------------------------------

export const RetentionCard = memo(function RetentionCard({ color, r, choice, onChoose: chooseFor }: { key?: string; /** Section colour, for the border. */ color: string; r: Retention; choice: Choice | undefined; onChoose: (id: string, c: Choice) => void }) {
  const onChoose = (c: Choice) => chooseFor(r.id, c);
  return (
    <div id={`race-${r.id}`} className="scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,260px)+16px)] rounded-2xl border-[3px] bg-[var(--gb-surface)] p-4 space-y-3" style={{ borderColor: color }}>
      <div>
        <p className="font-black text-[var(--gb-text)] leading-snug">{r.judge}</p>
        <p className="text-sm text-[var(--gb-text)]">{r.court} · {r.withdrawn ? 'withdrew' : 'keep this judge?'}</p>
      </div>
      {(r.bar || r.profile) && (
        <div className="space-y-1 text-sm text-[var(--gb-text)]">
          {r.bar && <p>Rated qualified by <b>{r.bar.yes} of {r.bar.of}</b> bar groups.</p>}
          {r.profile && <a href={r.profile} target="_blank" rel="noreferrer noopener" className="block w-fit font-bold text-[var(--gb-link)] underline underline-offset-2">Injustice Watch profile ↗</a>}
        </div>
      )}
      {r.withdrawn
        ? <p className="text-[15px] font-bold text-[var(--gb-amber-hi)]">Withdrew after the ballot was finalized. This name is still on your ballot, but votes for or against this judge won’t count.</p>
        : <YesNo value={choice} onChange={onChoose} label={`Retain ${r.judge}?`} />}
    </div>
  );
});

const SCOPE: Record<Measure['scope']['type'], (m: Measure) => string> = {
  county: () => 'All of Cook County',
  city: () => 'All of Chicago',
  ward: (m) => `Ward ${(m.scope as { id: string }).id} only`,
  precinct: (m) => { const s = m.scope as { ward: string; precinct: string }; return `Ward ${s.ward}, Precinct ${s.precinct} only`; },
  named: (m) => `Only inside the ${(m.scope as { name: string }).name}`,
};

export const MeasureCard = memo(function MeasureCard({ color, m, choice, onChoose: chooseFor }: { key?: string; /** Section colour, for the border. */ color: string; m: Measure; choice: Choice | undefined; onChoose: (id: string, c: Choice) => void }) {
  const onChoose = (c: Choice) => chooseFor(m.id, c);
  return (
    <article id={`race-${m.id}`} className="scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,260px)+16px)] rounded-2xl border-[3px] bg-[var(--gb-surface)] p-5 space-y-4" style={{ borderColor: color }}>
      <div className="space-y-2">
        <Badge>{SCOPE[m.scope.type](m)}</Badge>
        <h3 className="text-lg font-black leading-tight text-[var(--gb-text)]">{m.title}</h3>
        {m.scope.type === 'named' && <p className="text-sm text-[var(--gb-amber-hi)] font-bold">Only on ballots inside this proposed area. Your official sample ballot will show it if it’s on yours.</p>}
        <blockquote className="rounded-xl bg-[var(--gb-bg)] p-4 text-[15px] leading-relaxed text-[var(--gb-text)]">
          <span className="block mb-1 text-xs font-black uppercase tracking-widest text-[var(--gb-text)]">Official ballot text</span>
          “{m.question}”
        </blockquote>
      </div>
      <YesNo value={choice} onChange={onChoose} label={m.title} />
    </article>
  );
});
