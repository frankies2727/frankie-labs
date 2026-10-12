import { Check, ExternalLink, Info, Scale, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { explainOffice } from './offices';
import { researchLinks } from './research';
import { money, type Choice } from './store';
import type { Candidate, Measure, Race, Retention } from './types';

const AREA_LABEL: Record<string, string> = {
  cd: 'Congressional District', sldu: 'State Senate District', sldl: 'State House District',
  commissioner: 'County Board District', bor: 'Board of Review District', subcircuit: 'Judicial Subcircuit', school: 'School Subdistrict',
};
const areaLabel = (r: Race) => (r.area ? `${AREA_LABEL[r.area.type]} ${r.area.id}` : 'Everyone in Chicago');

// ---- shared bits ---------------------------------------------------------

function Badge({ children, tone = '#262B34', ink = '#F5F6F7' }: { children: ReactNode; tone?: string; ink?: string }) {
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border-2 border-[#2E343F] bg-[#14171E] p-6 outline-none"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <h2 className="text-2xl font-black leading-tight text-[#F5F6F7]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-11 h-11 rounded-full bg-[#262B34] flex items-center justify-center text-[#F5F6F7] hover:bg-[#323A47]">
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
    { v: 'yes', text: 'Yes', on: 'bg-[#5EBD3E] border-[#5EBD3E] text-[#0F1117]' },
    { v: 'no', text: 'No', on: 'bg-[#E23838] border-[#E23838] text-white' },
    { v: 'skip', text: 'Skip', on: 'bg-[#F5F6F7] border-[#F5F6F7] text-[#0F1117]' },
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
          className={`min-h-[44px] rounded-xl border-2 font-bold transition-colors ${value === o.v ? o.on : 'border-[#2E343F] bg-[#262B34] text-[#F5F6F7] hover:border-[#F5F6F7]'}`}
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
    ['Raised', c.money.raised, '#5EBD3E'],
    ['Spent', c.money.spent, '#F78200'],
    ['Cash', c.money.cash, '#009CDF'],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([label, n, color]) => (
        <div key={label}>
          <div className="flex justify-between gap-2 text-sm font-bold text-[#F5F6F7]"><span>{label}</span><span>{money(n)}</span></div>
          <div className="h-2.5 rounded-full bg-[#262B34] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${max ? Math.max(2, (Math.max(n, 0) / max) * 100) : 0}%`, background: color }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-[#E2E4E8]">{c.money.source === 'FEC' ? 'Federal Election Commission' : 'Illinois State Board of Elections'} reports, Jan 2025 through {c.money.through}. Cash is what’s left on hand.</p>
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
  choice: Choice | undefined;
  onChoose: (c: Choice) => void;
  onInfo: (c: Candidate) => void;
  onCompare: () => void;
}

export function RaceCard({ race, color, ink, choice, onChoose, onInfo, onCompare }: RaceProps) {
  const picked = Array.isArray(choice) ? choice : [];
  const toggle = (ballot: number) => {
    if (race.voteFor === 1) return onChoose(picked[0] === ballot ? [] : [ballot]);
    if (picked.includes(ballot)) return onChoose(picked.filter((b) => b !== ballot));
    if (picked.length < race.voteFor) onChoose([...picked, ballot]);
  };
  const full = picked.length >= race.voteFor;
  const decided = choice === 'skip' || picked.length > 0;

  return (
    <article id={`race-${race.id}`} className="scroll-mt-40 rounded-2xl border-2 bg-[#1A1D24] overflow-hidden" style={{ borderColor: decided ? color : '#2E343F' }}>
      <div className="h-1.5" style={{ background: color }} />
      <div className="p-5 space-y-4">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{areaLabel(race)}</Badge>
            {race.voteFor > 1 && <Badge tone={color} ink={ink}>Pick up to {race.voteFor}</Badge>}
            {decided && <Badge tone="#5EBD3E" ink="#0F1117">✓ Done</Badge>}
          </div>
          <h3 className="text-xl font-black leading-tight text-[#F5F6F7]">{race.office}</h3>
          <p className="text-[15px] leading-relaxed text-[#E2E4E8]">{explainOffice(race.office)}</p>
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
                  style={on ? { borderColor: color, background: `${color}26` } : { borderColor: '#2E343F', background: '#262B34' }}
                >
                  <span className="shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-black" style={on ? { background: color, borderColor: color, color: ink } : { borderColor: '#F5F6F7', color: '#F5F6F7' }}>
                    {on ? <Check className="w-5 h-5" strokeWidth={3} /> : c.ballot}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug text-[#F5F6F7]">{c.name}</span>
                    <span className="flex flex-wrap gap-1.5 mt-1">
                      <Badge tone="#0F1117">{c.party}</Badge>
                      {c.incumbent && <Badge tone="#F5F6F7" ink="#0F1117">Incumbent</Badge>}
                      {c.money && <Badge tone="#0F1117">{money(c.money.raised)} raised</Badge>}
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => onInfo(c)} aria-label={`About ${c.name}`} className="shrink-0 w-12 rounded-xl border-2 border-[#2E343F] bg-[#262B34] flex items-center justify-center text-[#F5F6F7] hover:border-[#F5F6F7]">
                  <Info className="w-5 h-5" />
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex flex-wrap items-center gap-2">
          {race.candidates.length > 1 && (
            <button type="button" onClick={onCompare} className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border-2 border-[#F5F6F7] px-4 font-bold text-[#F5F6F7] hover:bg-[#262B34]">
              <Scale className="w-4 h-4" aria-hidden="true" /> Compare
            </button>
          )}
          <button
            type="button"
            aria-pressed={choice === 'skip'}
            onClick={() => onChoose(choice === 'skip' ? [] : 'skip')}
            className={`min-h-[44px] rounded-xl border-2 px-4 font-bold ${choice === 'skip' ? 'border-[#F5F6F7] bg-[#F5F6F7] text-[#0F1117]' : 'border-[#2E343F] text-[#F5F6F7] hover:border-[#F5F6F7]'}`}
          >
            {choice === 'skip' ? 'Skipped' : 'Skip this one'}
          </button>
          {race.candidates.length === 1 && <span className="text-sm text-[#E2E4E8]">Only one candidate is running.</span>}
          {race.writeIn && <span className="text-sm text-[#E2E4E8]">Write-ins allowed.</span>}
        </footer>
      </div>
    </article>
  );
}

// ---- candidate sheet ---------------------------------------------------------

export function CandidateSheet({ race, c, color, ink, picked, onPick, onClose }: { race: Race; c: Candidate; color: string; ink: string; picked: boolean; onPick: () => void; onClose: () => void }) {
  return (
    <Dialog title={c.name} onClose={onClose}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge tone={color} ink={ink}>{race.office}</Badge>
          <Badge>{c.party}</Badge>
          <Badge>Ballot #{c.ballot}</Badge>
          {c.incumbent && <Badge tone="#F5F6F7" ink="#0F1117">Incumbent</Badge>}
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F6F7]">💰 Campaign money</h3>
          {c.money ? (
            <MoneyBars c={c} max={Math.max(c.money.raised, c.money.spent, c.money.cash)} />
          ) : (
            <p className="text-[15px] text-[#E2E4E8]">{race.section === 'federal'
              ? 'No FEC filings found. Federal candidates who raise or spend under $5,000 don’t have to file.'
              : 'No campaign reports found for this cycle. Illinois candidates who raise or spend under $5,000 in a year don’t need a campaign committee.'}</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-[#F5F6F7]">🔎 Dig deeper</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {researchLinks(c, race).map((l) => (
              <li key={l.label}>
                <a href={l.href} target="_blank" rel="noreferrer noopener" className="flex h-full items-start justify-between gap-3 rounded-xl border-2 border-[#2E343F] bg-[#1A1D24] p-3 hover:border-[#F5F6F7]">
                  <span>
                    <span className="block font-bold text-[#F5F6F7]">{l.label}</span>
                    <span className="block text-sm text-[#E2E4E8]">{l.note}</span>
                  </span>
                  <ExternalLink className="w-4 h-4 shrink-0 mt-1 text-[#F5F6F7]" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          onClick={() => { onPick(); onClose(); }}
          className="w-full min-h-[52px] rounded-xl font-black text-lg"
          style={picked ? { background: '#262B34', color: '#F5F6F7', border: '2px solid #F5F6F7' } : { background: color, color: ink }}
        >
          {picked ? 'Remove from My Ballot' : 'Add to My Ballot'}
        </button>
      </div>
    </Dialog>
  );
}

// ---- head-to-head --------------------------------------------------------------

export function Compare({ race, color, ink, picked, onPick, onClose }: { race: Race; color: string; ink: string; picked: number[]; onPick: (ballot: number) => void; onClose: () => void }) {
  const max = Math.max(1, ...race.candidates.map((c) => c.money ? Math.max(c.money.raised, c.money.spent, c.money.cash) : 0));
  const anyMoney = race.candidates.some((c) => c.money);
  return (
    <Dialog title={`Compare: ${race.office}`} onClose={onClose}>
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${race.candidates.length}, minmax(170px, 1fr))` }}>
          {race.candidates.map((c) => {
            const on = picked.includes(c.ballot);
            return (
              <div key={c.ballot} className="flex flex-col gap-4 rounded-2xl border-2 bg-[#1A1D24] p-4" style={{ borderColor: on ? color : '#2E343F' }}>
                <div className="space-y-2">
                  <p className="text-lg font-black leading-tight text-[#F5F6F7]">{c.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{c.party}</Badge>
                    <Badge>#{c.ballot}</Badge>
                  </div>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-[#E2E4E8]">Incumbent</dt><dd className="font-bold text-[#F5F6F7]">{c.incumbent ? 'Yes' : 'No'}</dd></div>
                </dl>
                {anyMoney && (c.money ? <MoneyBars c={c} max={max} /> : <p className="text-sm text-[#E2E4E8]">No campaign reports found.</p>)}
                <button
                  type="button"
                  onClick={() => onPick(c.ballot)}
                  className="mt-auto min-h-[44px] rounded-xl font-bold"
                  style={on ? { background: color, color: ink } : { border: '2px solid #F5F6F7', color: '#F5F6F7' }}
                >
                  {on ? '✓ On My Ballot' : 'Pick'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {!anyMoney && <p className="mt-4 text-[15px] text-[#E2E4E8]">No campaign reports found for anyone in this race this cycle.</p>}
      <p className="mt-4 text-[15px] text-[#E2E4E8]">Money and incumbency come from official FEC and Illinois State Board of Elections records. Tap ⓘ on a candidate for donors, bio and campaign site.</p>
    </Dialog>
  );
}

// ---- retention & referenda -------------------------------------------------------

export function RetentionCard({ r, choice, onChoose }: { key?: string; r: Retention; choice: Choice | undefined; onChoose: (c: Choice) => void }) {
  return (
    <div id={`race-${r.id}`} className="scroll-mt-40 rounded-2xl border-2 bg-[#1A1D24] p-4 space-y-3" style={{ borderColor: choice ? '#FFB900' : '#2E343F' }}>
      <div>
        <p className="font-black text-[#F5F6F7] leading-snug">{r.judge}</p>
        <p className="text-sm text-[#E2E4E8]">{r.court} · keep this judge?</p>
      </div>
      <YesNo value={choice} onChange={onChoose} label={`Retain ${r.judge}?`} />
    </div>
  );
}

const SCOPE: Record<Measure['scope']['type'], (m: Measure) => string> = {
  county: () => 'All of Cook County',
  city: () => 'All of Chicago',
  ward: (m) => `Ward ${(m.scope as { id: string }).id} only`,
  precinct: (m) => { const s = m.scope as { ward: string; precinct: string }; return `Ward ${s.ward}, Precinct ${s.precinct} only`; },
  named: (m) => `Only inside the ${(m.scope as { name: string }).name}`,
};

export function MeasureCard({ m, choice, onChoose }: { key?: string; m: Measure; choice: Choice | undefined; onChoose: (c: Choice) => void }) {
  return (
    <article id={`race-${m.id}`} className="scroll-mt-40 rounded-2xl border-2 bg-[#1A1D24] p-5 space-y-4" style={{ borderColor: choice ? '#E23838' : '#2E343F' }}>
      <div className="space-y-2">
        <Badge>{SCOPE[m.scope.type](m)}</Badge>
        <h3 className="text-lg font-black leading-tight text-[#F5F6F7]">{m.title}</h3>
        {m.scope.type === 'named' && <p className="text-sm text-[#FFB900] font-bold">Only on ballots inside this proposed area. Your official sample ballot will show it if it’s on yours.</p>}
        <blockquote className="rounded-xl bg-[#0F1117] p-4 text-[15px] leading-relaxed text-[#F5F6F7]">
          <span className="block mb-1 text-xs font-black uppercase tracking-widest text-[#F5F6F7]">Official ballot text</span>
          “{m.question}”
        </blockquote>
      </div>
      <YesNo value={choice} onChange={onChoose} label={m.title} />
    </article>
  );
}
