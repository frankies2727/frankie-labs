import { ChevronDown, ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { money, useOpen } from './store';
import type { Change, Law, NewsItem } from './types';
import type { KeyDate } from './dates';

// "What's new": one feed of everything that moved lately, newest first, each
// item dated and sourced. Ballot changes the daily refresh noticed, news
// headlines, bills (where the state has them) and the next key dates.

export type Kind = 'ballot' | 'news' | 'money' | 'bill' | 'date';

export interface FeedItem {
  at: string; // ISO
  kind: Kind;
  title: string;
  detail?: string;
  /** Who said so, and where. */
  source: { name: string; url?: string };
  /** A contest on the ballot to jump to. */
  jump?: string;
}

const KINDS: { id: Kind | 'all'; label: string; color: string }[] = [
  { id: 'all', label: 'Everything', color: 'var(--gb-text)' },
  { id: 'news', label: 'News', color: 'var(--gb-blue-hi)' },
  { id: 'money', label: 'Money', color: 'var(--kyb-orange)' },
  { id: 'ballot', label: 'Ballot changes', color: 'var(--gb-primary)' },
  { id: 'bill', label: 'Bills', color: 'var(--kyb-gold)' },
  { id: 'date', label: 'Key dates', color: 'var(--gb-amber-hi)' },
];
const KIND_LABEL: Record<Kind, string> = { ballot: 'Ballot', news: 'News', money: 'Money', bill: 'Bill', date: 'Date' };

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const when = (iso: string) => day.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));

const safe = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);

/** What a daily-refresh change says, and who it comes from. */
export function changeItems(changes: Change[], source: (c: Change) => { name: string; url?: string }): FeedItem[] {
  return changes.map((c) => {
    const title = c.kind === 'candidate-added' ? `${c.name} joined the ballot for ${c.what}`
      : c.kind === 'candidate-removed' ? `${c.name} is no longer on the ballot for ${c.what}`
      : c.kind === 'money' ? `${c.name} filed a new money report: ${money(c.raised ?? 0)} raised`
      : c.kind === 'contest-added' ? `New on the ballot: ${c.what}` : `No longer on the ballot: ${c.what}`;
    return { at: c.at, kind: c.kind === 'money' ? 'money' : 'ballot', title, detail: c.kind === 'money' ? c.what : undefined, source: source(c), jump: c.kind === 'contest-removed' ? undefined : c.id };
  });
}

export const newsItems = (news: NewsItem[]): FeedItem[] =>
  news.map((n) => ({ at: n.at, kind: n.topic === 'money' ? 'money' : 'news', title: n.title, source: { name: n.source, url: safe(n.url) } }));

export const billItems = (laws: Law[], billUrl: (b: Law) => string | undefined, legislature: string): FeedItem[] =>
  laws.filter((b) => b.latest_action).map((b) => ({
    at: b.latest_action!, kind: 'bill', title: `${b.id}: ${b.title}`, detail: b.latest_action_desc, source: { name: `${legislature}, via govbot`, url: billUrl(b) },
  }));

/** The next few dates, as items dated on the day itself. */
export const dateItems = (dates: KeyDate[], today: string, source: { name: string; url: string }): FeedItem[] =>
  dates.filter((d) => d.date >= today).slice(0, 3).map((d) => ({ at: d.date, kind: 'date', title: d.title, detail: d.detail, source }));

const SHOWN = 10;

/** `storageKey` remembers whether the feed is shown or hidden; it starts shown. */
export function Feed({ items, storageKey, onJump }: { items: FeedItem[]; storageKey: string; onJump: (id: string) => void }) {
  const [open, toggle] = useOpen(storageKey, true);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...items].sort((a, b) => b.at.localeCompare(a.at)), [items]);
  const shown = sorted.filter((i) => kind === 'all' || i.kind === kind);
  const list = all ? shown : shown.slice(0, SHOWN);
  if (!items.length) return null;
  const color = (k: Kind) => KINDS.find((x) => x.id === k)!.color;
  return (
    <section aria-labelledby="kyb-feed" className="rounded-2xl border-[3px] border-[var(--gb-blue-hi)] bg-[var(--gb-surface)] p-4 sm:p-5 space-y-4">
      <div className="space-y-1">
        <h2 id="kyb-feed" className="text-2xl">
          <button type="button" onClick={toggle} aria-expanded={open} aria-controls="kyb-feed-body" className="inline-flex min-h-[44px] items-center gap-2 text-left">
            📰 What’s new
            <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            <span className="sr-only">{open ? '(hide)' : '(show)'}</span>
          </button>
        </h2>
        {open && <p className="text-[15px] leading-relaxed">Everything that moved lately: news, campaign money (new reports and stories about who’s funding whom), changes to the ballot the daily refresh noticed, bills and the dates coming up. Each item says where it comes from.</p>}
      </div>
      {open && <div id="kyb-feed-body" className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kinds of activity">
        {KINDS.filter((k) => k.id === 'all' || sorted.some((i) => i.kind === k.id)).map((k) => (
          <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => { setKind(k.id); setAll(false); }}
            className="min-h-[40px] rounded-full border-2 px-4 text-sm font-bold" style={kind === k.id ? { background: k.color, borderColor: k.color, color: 'var(--gb-bg)' } : { borderColor: k.color }}>
            {k.label}
          </button>
        ))}
      </div>
      <ol className="divide-y divide-[var(--kyb-chip)]">
        {list.map((i, n) => (
          <li key={`${i.kind}-${i.at}-${n}`} className="flex gap-3 py-3">
            <div className="w-16 shrink-0">
              <p className="font-black leading-tight">{when(i.at)}</p>
              <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide" style={{ background: color(i.kind), color: 'var(--gb-bg)' }}>{KIND_LABEL[i.kind]}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {i.jump
                ? <button type="button" onClick={() => onJump(i.jump!)} className="text-left font-bold leading-snug underline underline-offset-2">{i.title}</button>
                : <p className="font-bold leading-snug">{i.title}</p>}
              {i.detail && <p className="text-sm leading-snug">{i.detail}</p>}
              <p className="text-sm">
                {i.source.url
                  ? <a href={i.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-bold text-[var(--gb-link)] underline underline-offset-2">{i.source.name}<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></a>
                  : <span className="font-bold">{i.source.name}</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {shown.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="min-h-[44px] rounded-xl border-2 border-[var(--gb-text)] px-4 font-bold">
          {all ? 'Show fewer' : `Show all ${shown.length}`}
        </button>
      )}
      {!shown.length && <p className="text-[15px]">Nothing of this kind lately.</p>}
      </div>}
    </section>
  );
}
