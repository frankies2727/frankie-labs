import { ArrowUpRight, ChevronDown, Rss, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ClearButton } from '../../components/ClearButton';
import { useOpen } from './store';
import type { Law } from './types';

// Illinois bills that change how elections and schools work, from govbot's
// legislation data, laid out like govbot's own elections page. Text comes from
// outside, so it's only ever rendered as text, and links are kept only if
// they're plain https.

const GOVBOT = 'https://chihacknight.github.io/govbot/dashboard/';
const TOPICS = ['elections & voting', 'education'];
const TABS = [
  { id: 'elections & voting', label: 'Elections & voting' },
  { id: 'education', label: 'Education' },
  { id: 'other', label: 'Other' },
] as const;
// The most recent few per topic; govbot's catalog has the rest.
const SHOWN = 9;

const safeUrl = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);
// The bill's own card in govbot's catalog (its state's catalog opens underneath),
// else the legislature's page.
export const billUrl = (b: Law) => (b.state && b.session
  ? `${GOVBOT}legislation.html#bill=${[b.state, b.session, b.id].map(encodeURIComponent).join('~')}`
  : safeUrl(b.url));
const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const day = (iso: string) => dateLabel.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
const inTab = (b: Law, tab: string) => (tab === 'other' ? !b.tags.some((t) => TOPICS.includes(t)) : b.tags.includes(tab));
const dot = (t: string) => (t === 'elections & voting' ? 'var(--gb-blue-hi)' : t === 'education' ? 'var(--kyb-gold)' : 'var(--gb-primary)');

function Bill({ b }: { key?: string; b: Law }) {
  const url = billUrl(b);
  const slip = safeUrl(b.hearing?.witness_slip_url);
  const body = (
    <>
      <div className="flex items-start gap-2">
        <span className="shrink-0 rounded-md bg-[var(--kyb-gold)] px-1.5 text-xs font-black text-[var(--gb-bg)]">IL</span>
        <span className="font-black leading-tight">{b.id}</span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {b.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-[var(--gb-border-strong)] px-2 text-[11px] font-bold leading-5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot(t) }} aria-hidden="true" />{t}
            </span>
          ))}
        </span>
        {url && <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />}
      </div>
      <p className="font-bold leading-snug">{b.title}</p>
      {b.latest_action && <p className="text-sm leading-snug">{day(b.latest_action)} · {b.latest_action_desc}</p>}
    </>
  );
  const card = 'flex h-full flex-col gap-2 rounded-xl border-2 border-[var(--kyb-gold)] bg-[var(--gb-bg)] p-3 text-[var(--gb-text)]';
  return (
    <li>
      {url
        ? <a href={url} target="_blank" rel="noreferrer noopener" className={`${card} hover:bg-[var(--kyb-chip)]`}>{body}</a>
        : <div className={card}>{body}</div>}
      {b.hearing && (
        <p className="mt-1 px-1 text-sm font-bold text-[var(--gb-amber-hi)]">
          Up for a hearing{b.hearing.committee ? ` in ${b.hearing.committee}` : ''}{b.hearing.scheduled_display ? `, ${b.hearing.scheduled_display}` : ''}.
          {slip && <> <a href={slip} target="_blank" rel="noreferrer noopener" className="underline">Have your say (witness slip)</a></>}
        </p>
      )}
    </li>
  );
}

export function Laws({ laws }: { laws: Law[] }) {
  const [tab, setTab] = useState<string>(TABS[0].id);
  const [q, setQ] = useState('');
  const [open, toggle] = useOpen('kyb-laws-open');
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return laws.filter((b) => inTab(b, tab) && words.every((w) => `${b.id} ${b.title} ${b.latest_action_desc ?? ''} ${b.tags.join(' ')}`.toLowerCase().includes(w)));
  }, [laws, tab, q]);
  if (!laws.length) return null;
  return (
    <section aria-labelledby="kyb-laws" className="rounded-2xl border-[3px] border-[var(--kyb-gold)] bg-[var(--gb-surface)] p-4 sm:p-5 space-y-4">
      <div className="space-y-1">
        <h2 id="kyb-laws" className="text-2xl">
          <button type="button" onClick={toggle} aria-expanded={open} aria-controls="kyb-laws-body" className="inline-flex min-h-[44px] items-center gap-2 text-left">
            🏛️ The laws that shape your ballot, from Springfield
            <ChevronDown className={`w-6 h-6 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            <span className="sr-only">{open ? '(hide)' : '(show)'}</span>
          </button>
        </h2>
      </div>

      {open && <div id="kyb-laws-body" className="space-y-4">
      <div className="space-y-1">
        <p className="text-[15px] leading-relaxed max-w-[75ch]">The Illinois bills that shape how elections and schools work, from campaign finance and voting rules to ward boundaries and school governance, with action in the last six months.<br /><br />“Other” is the rest of Illinois’ recent legislative activity.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bill topics">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`min-h-[40px] rounded-full border-2 border-[var(--kyb-gold)] px-4 text-sm font-bold ${tab === t.id ? 'bg-[var(--kyb-gold)] text-[var(--gb-bg)]' : ''}`}>
              {t.label}
            </button>
          ))}
        </div>
        <a href={`${GOVBOT}elections/springfield.xml`} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1.5 min-h-[40px] rounded-full border-2 border-[var(--kyb-gold)] px-3 text-sm font-bold">
          <Rss className="w-4 h-4" aria-hidden="true" /> Follow (RSS)
        </a>
        <div className="relative w-full sm:w-auto sm:min-w-[22rem] sm:flex-1 lg:flex-none lg:w-[24rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" aria-hidden="true" />
          <label htmlFor="kyb-law-search" className="sr-only">Search Illinois bills</label>
          <input id="kyb-law-search" type="text" inputMode="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search Illinois bills by number, title or topic…"
            className="w-full min-h-[40px] rounded-full border-2 border-[var(--kyb-gold)] bg-[var(--gb-bg)] pl-9 pr-10 text-sm text-[var(--gb-text)] focus:outline-none" />
          {q && <ClearButton onClear={() => setQ('')} className="right-0 w-9 h-9" />}
        </div>
      </div>

      {list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, SHOWN).map((b) => <Bill key={b.id} b={b} />)}
        </ul>
      ) : <p className="text-[15px]">{q ? 'No bills match that search.' : 'No bills in this category in the last 6 months.'}</p>}

      <a href={`${GOVBOT}legislation.html#state=il`} target="_blank" rel="noreferrer noopener"
        className="flex items-center justify-center gap-2 min-h-[56px] rounded-xl border-[3px] border-[var(--kyb-gold)] px-4 text-lg font-black text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
        Explore entire catalog of IL bills <ArrowUpRight className="w-5 h-5" aria-hidden="true" />
      </a>
      </div>}
    </section>
  );
}
