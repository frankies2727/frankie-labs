import { AtSign, Check, ExternalLink, Facebook, Info, Instagram, Linkedin, Music2, Scale, Twitter, X, Youtube, type LucideIcon } from 'lucide-react';
import { GOVBOT_LEGISLATION } from './hosts';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { BarRatings } from './BarRatings';
import { Face } from './Face';
import { useReadOnly, useStateConfig } from './state';
import { money, type Choice } from './store';
import type { Candidate, Measure, Race, Retention, SocialPlatform } from './types';

const AREA_LABEL: Record<string, string> = {
  cd: 'Congressional District', sldu: 'State Senate District', sldl: 'State House District',
  commissioner: 'County Board District', bor: 'Board of Review District', subcircuit: 'Judicial Subcircuit', school: 'School Subdistrict',
};
export const areaLabel = (r: Race) => {
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
  const readOnly = useReadOnly();
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
          disabled={readOnly}
          onClick={() => onChange(o.v)}
          className={`min-h-[44px] rounded-xl border-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${value === o.v ? o.on : 'border-[var(--gb-border)] bg-[var(--kyb-chip)] text-[var(--gb-text)] hover:border-[var(--gb-text)]'}`}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function MoneyBars({ c, max }: { c: Candidate; max: number }) {
  const { moneySource } = useStateConfig();
  if (!c.money) return null;
  const rows: [string, number, string][] = [
    ['Raised', c.money.raised, 'var(--gb-primary)'],
    ['Spent', c.money.spent, 'var(--kyb-orange)'],
    ...(c.money.cash === undefined ? [] : [['Cash', c.money.cash, 'var(--gb-blue-hi)'] as [string, number, string]]),
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
      <p className="text-xs text-[var(--gb-text)]">{moneySource(c.money.source)} reports, Jan 2025 through {c.money.through}{c.money.recent ? `, plus ${money(c.money.recent)} in large contributions reported since (through ${c.money.recentThrough})` : ''}.{c.money.cash === undefined ? '' : ' Cash is what’s left on hand.'}</p>
    </div>
  );
}

/** The seat's holder is one of these candidates. */
export const isIncumbent = (race: Race, c: Candidate) => Boolean(c.incumbent || race.incumbents?.some((i) => i.ballot === c.ballot));

/** Who holds the seat now and whether they're on this ballot; open seats say who left. */
function Incumbents({ race }: { race: Race }) {
  const list = race.incumbents;
  if (!list?.length) return null;
  const open = /^(Associate )?Judge /.test(list[0].name);
  return (
    <div className="rounded-xl border-2 border-[var(--gb-border)] bg-[var(--kyb-chip)] px-3 py-2 text-sm leading-snug text-[var(--gb-text)] space-y-1.5">
      <p className="text-[11px] font-black uppercase tracking-widest">{open ? '🪑 Open seat' : '👤 In office now'}</p>
      {list.map((i) => (
        <p key={i.name}>
          <strong>{i.name}</strong>{i.party ? ` (${i.party})` : ''}
          {i.ballot ? <> · <span className="font-bold">running again</span>{race.numbered !== false && race.section !== 'federal' && race.section !== 'state' ? ` (ballot #${i.ballot})` : ''}</>
            : open ? null : <> · <span className="font-bold">not on this ballot</span></>}
          {i.note && <>{open ? ' · ' : ' '}<span className={open ? '' : 'italic'}>{open ? i.note : `“${i.note}”`}</span></>}
          {!i.ballot && !open && !i.note && <> (no reason is on record)</>}
          {i.source?.url && <> <a href={i.source.url} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">{i.source.name.replace(/^Wikipedia: .*/, 'Wikipedia')} ↗</a>{i.asOf ? <span className="text-xs"> · read {i.asOf}</span> : null}</>}
        </p>
      ))}
    </div>
  );
}

/** A sitting legislator's bills this session, from govbot. */
function Record({ c }: { c: Candidate }) {
  const r = c.record;
  if (!r) return null;
  const date = (d?: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const all = `${GOVBOT_LEGISLATION}#state=${r.bills[0]?.state ?? 'il'}&q=${encodeURIComponent(c.name.split(' & ')[0].replace(/["“”][^"“”]*["“”]\s*/g, ''))}`;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">📜 Their record in office</h3>
      <p className="text-[15px] leading-relaxed text-[var(--gb-text)]">As {r.seat}’s member they sponsored or co-sponsored <strong>{r.sponsored.toLocaleString()} bill{r.sponsored === 1 ? '' : 's'}</strong> this session. The newest:</p>
      <ul className="space-y-1.5 text-sm">
        {r.bills.map((b) => (
          <li key={b.id} className="leading-snug">
            {b.url ? <a href={b.url} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">{b.id}</a> : <strong>{b.id}</strong>}
            {' '}{b.title}{b.latest_action ? <span className="text-xs"> · {date(b.latest_action)}</span> : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--gb-text)]"><a href={all} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">Every bill with their name on it, on govbot ↗</a> · {r.source}, read {r.asOf}. Sponsoring a bill is one part of a record; how they voted is on the legislature’s own site.</p>
    </section>
  );
}

/** The candidate's own campaign messages (their Ballotpedia survey answer) and their site's issues page. */
function InTheirWords({ c }: { c: Candidate }) {
  if (!c.stances && !c.issuesUrl) return null;
  const when = c.stances?.asOf ? new Date(c.stances.asOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">🗣️ In their words</h3>
      {c.stances && (
        <>
          <ol className="space-y-2 text-[15px] leading-relaxed text-[var(--gb-text)]">
            {c.stances.messages.map((m) => <li key={m.slice(0, 40)} className="rounded-xl bg-[var(--gb-bg)] p-3">“{m}”</li>)}
          </ol>
          <p className="text-xs text-[var(--gb-text)]">Their answer to Ballotpedia’s survey question “What are the 3 key messages of your campaign?”{when ? `, ${when}` : ''}, word for word. <a href={c.stances.url} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">The whole survey ↗</a></p>
        </>
      )}
      {c.issuesUrl && (
        <a href={c.issuesUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
          Where they stand, on their campaign site <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
      )}
    </section>
  );
}

const ENDORSEMENTS_SHOWN = 8;

/** Who has endorsed them, as the Wikipedia article on the race lists it. */
function Endorsements({ c }: { c: Candidate }) {
  const [all, setAll] = useState(false);
  const e = c.endorsements;
  if (!e) return null;
  // The first few, across the article's own categories; the rest behind a tap.
  let left = all ? Infinity : ENDORSEMENTS_SHOWN;
  const groups = e.groups.map((g) => { const names = g.names.slice(0, Math.max(0, left)); left -= names.length; return { ...g, names }; }).filter((g) => g.names.length);
  const when = new Date(e.asOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">🤝 Endorsements <span className="normal-case tracking-normal">({e.total.toLocaleString()})</span></h3>
      <dl className="space-y-2 text-[15px] leading-snug text-[var(--gb-text)]">
        {groups.map((g) => (
          <div key={g.category}>
            <dt className="text-xs font-black uppercase tracking-wide">{g.category}</dt>
            <dd><ul className="list-disc pl-5">{g.names.map((n) => <li key={n}>{n}</li>)}</ul></dd>
          </div>
        ))}
      </dl>
      {e.total > ENDORSEMENTS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="min-h-[40px] rounded-xl border-2 border-[var(--gb-text)] px-3 text-sm font-bold text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
          {all ? 'Show fewer' : `Show all ${e.total.toLocaleString()}`}
        </button>
      )}
      <p className="text-xs text-[var(--gb-text)]">As listed by <a href={e.source.url} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">{e.source.name} ↗</a>, read {when}. An endorsement is the endorser’s choice, not a rating of the candidate; the article may not list every one.</p>
    </section>
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
  const { areaLabel, explainOffice } = useStateConfig();
  const readOnly = useReadOnly();
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
          <Incumbents race={race} />
        </header>

        <ul className="space-y-2">
          {race.candidates.map((c) => {
            const on = picked.includes(c.ballot);
            return (
              <li key={c.ballot} className="flex items-stretch gap-2">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={readOnly || (!on && full && race.voteFor > 1)}
                  onClick={() => toggle(c.ballot)}
                  className="flex-1 min-w-0 flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed"
                  style={on ? { borderColor: color, background: `color-mix(in srgb, ${color} 15%, transparent)` } : { borderColor: 'var(--gb-border)', background: 'var(--kyb-chip)' }}
                >
                  <span className="shrink-0 flex flex-col items-center gap-0.5">
                    {numbered && <span className="text-[9px] font-bold uppercase tracking-wide leading-none text-[var(--gb-text)]">Ballot #</span>}
                    <span className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-black" style={on ? { background: color, borderColor: color, color: ink } : { borderColor: 'var(--gb-text)', color: 'var(--gb-text)' }}>
                      {on ? <Check className="w-5 h-5" strokeWidth={3} /> : numbered ? c.ballot : ''}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold leading-snug text-[var(--gb-text)]">{c.name}</span>
                    <span className="flex flex-wrap gap-1.5 mt-1">
                      <Badge tone="var(--gb-bg)">{c.party}</Badge>
                      {c.nominatedBy && <Badge tone="var(--gb-bg)">{c.nominatedBy} nominee</Badge>}
                      {isIncumbent(race, c) && <Badge tone="var(--gb-text)" ink="var(--gb-bg)">Incumbent</Badge>}
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
          {!readOnly && (
            <button
              type="button"
              aria-pressed={choice === 'skip'}
              onClick={() => onChoose(choice === 'skip' ? [] : 'skip')}
              className={`min-h-[44px] rounded-xl border-2 px-4 font-bold ${choice === 'skip' ? 'border-[var(--gb-text)] bg-[var(--gb-text)] text-[var(--gb-bg)]' : 'border-[var(--gb-border)] text-[var(--gb-text)] hover:border-[var(--gb-text)]'}`}
            >
              {choice === 'skip' ? 'Skipped' : 'Skip this one'}
            </button>
          )}
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

export function CandidateSheet({ race, c, color, ink, numbered, picked, onPick, onShowRace, onClose }: { race: Race; c: Candidate; color: string; ink: string; numbered: boolean; picked: boolean; onPick: () => void; /** From the landing page: open their race on the ballot. */ onShowRace?: () => void; onClose: () => void }) {
  const { noMoney, researchLinks } = useStateConfig();
  const readOnly = useReadOnly();
  return (
    <Dialog title={c.name} onClose={onClose}>
      <div className="space-y-6">
        <figure className="flex items-center gap-4">
          <Face c={c} className="w-24 h-24 text-3xl" />
          {c.photo && (
            <figcaption className="text-xs leading-snug text-[var(--gb-text)]">
              Photo: {c.photo.link
                ? <a href={c.photo.link} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">{c.photo.credit}</a>
                : c.photo.credit}
            </figcaption>
          )}
        </figure>
        <div className="flex flex-wrap gap-2">
          <Badge tone={color} ink={ink}>{race.office}</Badge>
          <Badge>{c.party}</Badge>
          {c.nominatedBy && <Badge>{c.nominatedBy} nominee</Badge>}
          {numbered && <Badge>Ballot #{c.ballot}</Badge>}
          {isIncumbent(race, c) && <Badge tone="var(--gb-text)" ink="var(--gb-bg)">Incumbent</Badge>}
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">💰 Campaign money</h3>
          {c.money ? (
            <MoneyBars c={c} max={Math.max(c.money.raised, c.money.spent, c.money.cash ?? 0)} />
          ) : (
            <p className="text-[15px] text-[var(--gb-text)]">{noMoney(race)}</p>
          )}
        </section>

        <InTheirWords c={c} />

        <Endorsements c={c} />

        <Record c={c} />

        <Follow c={c} />


        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--gb-text)]">🔎 Dig deeper</h3>
          {c.bar && <BarRatings bar={c.bar} source={c.barSource} />}
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

        {!readOnly && (
          <button
            type="button"
            onClick={() => { onPick(); onClose(); }}
            className="w-full min-h-[52px] rounded-xl font-black text-lg"
            style={picked ? { background: 'var(--kyb-chip)', color: 'var(--gb-text)', border: '2px solid var(--gb-text)' } : { background: color, color: ink }}
          >
            {picked ? 'Remove from My Ballot' : 'Add to My Ballot'}
          </button>
        )}
        {onShowRace && (
          <button type="button" onClick={onShowRace}
            className="-mt-3 w-full min-h-[48px] rounded-xl border-2 border-[var(--gb-text)] font-bold text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
            See everyone in this race
          </button>
        )}
      </div>
    </Dialog>
  );
}

// ---- head-to-head --------------------------------------------------------------

/** One labelled block of the comparison card. */
function CompareRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-[var(--gb-border)] pt-2">
      <p className="text-[11px] font-black uppercase tracking-widest text-[var(--gb-text)]">{label}</p>
      <div className="mt-1 text-sm leading-snug text-[var(--gb-text)]">{children}</div>
    </div>
  );
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

export function Compare({ race, color, ink, numbered, picked, onPick, onInfo, onClose }: { race: Race; color: string; ink: string; numbered: boolean; picked: number[]; onPick: (ballot: number) => void; onInfo: (c: Candidate) => void; onClose: () => void }) {
  const { compareNote } = useStateConfig();
  const readOnly = useReadOnly();
  const max = Math.max(1, ...race.candidates.map((c) => c.money ? Math.max(c.money.raised, c.money.spent, c.money.cash) : 0));
  const anyMoney = race.candidates.some((c) => c.money);
  // A row shows for everyone when anyone in the race has it, so the columns line up and a blank reads as "none found".
  const any = (k: 'stances' | 'endorsements' | 'record' | 'bar') => race.candidates.some((c) => c[k]);
  const anyRecord = race.candidates.some((c) => c.record || isIncumbent(race, c));
  return (
    <Dialog title={`Compare: ${race.office}`} onClose={onClose}>
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${race.candidates.length}, minmax(170px, 1fr))` }}>
          {race.candidates.map((c) => {
            const on = picked.includes(c.ballot);
            return (
              <div key={c.ballot} className="flex flex-col gap-3 rounded-2xl border-2 bg-[var(--gb-surface)] p-4" style={{ borderColor: on ? color : 'var(--gb-border)' }}>
                <div className="flex items-center gap-3">
                  <Face c={c} className="w-14 h-14 text-lg" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-lg font-black leading-tight text-[var(--gb-text)]">{c.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{c.party}</Badge>
                      {numbered && <Badge>#{c.ballot}</Badge>}
                      {isIncumbent(race, c) && <Badge tone="var(--gb-text)" ink="var(--gb-bg)">Incumbent</Badge>}
                    </div>
                  </div>
                </div>
                {any('stances') && (
                  <CompareRow label="In their words">
                    {c.stances ? <p>“{clip(c.stances.messages[0], 220)}”{c.stances.messages.length > 1 ? ` (+${c.stances.messages.length - 1} more)` : ''}</p> : <p>No survey answer yet.</p>}
                  </CompareRow>
                )}
                {any('endorsements') && (
                  <CompareRow label={`Endorsements${c.endorsements ? ` (${c.endorsements.total.toLocaleString()})` : ''}`}>
                    {c.endorsements ? <ul className="list-disc pl-4">{c.endorsements.groups.flatMap((g) => g.names).slice(0, 4).map((n) => <li key={n}>{clip(n, 70)}</li>)}</ul> : <p>None listed.</p>}
                  </CompareRow>
                )}
                {anyRecord && (
                  <CompareRow label="Record in office">
                    {c.record ? <p><strong>{c.record.sponsored.toLocaleString()} bills</strong> sponsored this session as {c.record.seat}’s member; newest: {clip(c.record.bills[0].title, 80)}</p> : isIncumbent(race, c) ? <p>Holds the seat now.</p> : <p>Not in this office now.</p>}
                  </CompareRow>
                )}
                {any('bar') && (
                  <CompareRow label="Bar ratings">
                    {c.bar ? <p>{Object.entries(c.bar).map(([g, r]) => `${g}: ${r}`).join(' · ')}</p> : <p>Not rated.</p>}
                  </CompareRow>
                )}
                <CompareRow label="Campaign money">
                  {anyMoney && (c.money ? <MoneyBars c={c} max={max} /> : <p>No campaign reports found.</p>)}
                  {!anyMoney && <p>No reports found for anyone in this race.</p>}
                </CompareRow>
                <CompareRow label="Links">
                  <p className="flex flex-wrap gap-x-3 gap-y-1">
                    {c.website && <a href={c.website} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">Campaign site ↗</a>}
                    {c.issuesUrl && <a href={c.issuesUrl} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">Their issues page ↗</a>}
                    {c.stances && <a href={c.stances.url} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">Full survey ↗</a>}
                    {c.profile && <a href={c.profile} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">Profile ↗</a>}
                    {!c.website && !c.issuesUrl && !c.stances && !c.profile && <span>No site or profile on record.</span>}
                  </p>
                </CompareRow>
                <button type="button" onClick={() => onInfo(c)} className="mt-auto inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border-2 border-[var(--gb-border)] bg-[var(--kyb-chip)] font-bold text-[var(--gb-text)] hover:border-[var(--gb-text)]">
                  <Info className="w-4 h-4" aria-hidden="true" /> Details
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onPick(c.ballot)}
                    className="min-h-[44px] rounded-xl font-bold"
                    style={on ? { background: color, color: ink } : { border: '2px solid var(--gb-text)', color: 'var(--gb-text)' }}
                  >
                    {on ? '✓ On My Ballot' : 'Pick'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-4 text-[15px] text-[var(--gb-text)]">{compareNote} Survey answers are each candidate’s own words from Ballotpedia; endorsements are as the Wikipedia article on the race lists them.</p>
    </Dialog>
  );
}

// ---- retention & referenda -------------------------------------------------------

export const RetentionCard = memo(function RetentionCard({ color, r, choice, onChoose: chooseFor }: { key?: string; /** Section colour, for the border. */ color: string; r: Retention; choice: Choice | undefined; onChoose: (id: string, c: Choice) => void }) {
  const onChoose = (c: Choice) => chooseFor(r.id, c);
  return (
    <div id={`race-${r.id}`} className="scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,260px)+16px)] rounded-2xl border-[3px] bg-[var(--gb-surface)] p-4 space-y-3" style={{ borderColor: color }}>
      <div className="flex items-center gap-3">
        <Face c={{ name: r.judge, photo: r.photo }} className="w-14 h-14 text-lg" />
        <div className="min-w-0">
          <p className="font-black text-[var(--gb-text)] leading-snug">{r.judge}</p>
          <p className="text-sm text-[var(--gb-text)]">{r.court} · {r.withdrawn ? 'withdrew' : 'keep this judge?'}</p>
        </div>
      </div>
      {r.bar && !r.withdrawn && <BarRatings bar={r.bar} source={r.barSource} compact />}
      {r.profile && <p className="text-sm"><a href={r.profile} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">Injustice Watch profile ↗</a>{r.photo && <span className="text-[var(--gb-text-muted,inherit)]"> · Photo: {r.photo.credit}</span>}</p>}
      {r.withdrawn
        ? <p className="text-[15px] font-bold text-[var(--gb-amber-hi)]">Withdrew after the ballot was finalized. This name is still on your ballot, but votes for or against this judge won’t count.</p>
        : <YesNo value={choice} onChange={onChoose} label={`Retain ${r.judge}?`} />}
    </div>
  );
});

export const SCOPE: Record<Measure['scope']['type'], (m: Measure) => string> = {
  state: () => 'Statewide',
  county: () => 'All of Cook County',
  city: () => 'All of Chicago',
  ward: (m) => `Ward ${(m.scope as { id: string }).id} only`,
  precinct: (m) => { const s = m.scope as { ward: string; precinct: string }; return `Ward ${s.ward}, Precinct ${s.precinct} only`; },
  named: (m) => `Only inside the ${(m.scope as { name: string }).name}`,
};

export const MeasureCard = memo(function MeasureCard({ color, m, choice, onChoose: chooseFor }: { key?: string; /** Section colour, for the border. */ color: string; m: Measure; choice: Choice | undefined; onChoose: (id: string, c: Choice) => void }) {
  const { scopeLabel } = useStateConfig();
  const onChoose = (c: Choice) => chooseFor(m.id, c);
  return (
    <article id={`race-${m.id}`} className="scroll-mt-[calc(var(--kyb-top)+var(--kyb-bar,260px)+16px)] rounded-2xl border-[3px] bg-[var(--gb-surface)] p-5 space-y-4" style={{ borderColor: color }}>
      <div className="space-y-2">
        <Badge>{scopeLabel(m)}</Badge>
        <h3 className="text-lg font-black leading-tight text-[var(--gb-text)]">{m.title}</h3>
        {m.scope.type === 'named' && <p className="text-sm text-[var(--gb-amber-hi)] font-bold">Only on ballots inside this proposed area. Your official sample ballot will show it if it’s on yours.</p>}
        {m.plain && <p className="text-[15px] leading-relaxed text-[var(--gb-text)]">{m.plain}</p>}
        <blockquote className="rounded-xl bg-[var(--gb-bg)] p-4 text-[15px] leading-relaxed text-[var(--gb-text)]">
          <span className="block mb-1 text-xs font-black uppercase tracking-widest text-[var(--gb-text)]">Official ballot text</span>
          “{m.question}”
        </blockquote>
      </div>
      <YesNo value={choice} onChange={onChoose} label={m.title} />
    </article>
  );
});
