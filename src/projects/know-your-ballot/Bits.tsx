import { ChevronDown, Info, ListChecks, MapPin, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GOVBOT_ASSETS, GOVBOT_SITE } from './GovbotChrome';
import { Face } from './Face';
import type { Candidate, Race } from './types';
import { navigate, useRoute } from '../../lib/router';
import { useOpen } from './store';

// Small pieces every state's guide shows: the progress ring in the pinned
// bar, and the confetti when a ballot is finished.

export function Ring({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(pct * 100)}% of your ballot decided`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--kyb-chip-hi)' }} strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--gb-primary)' }} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fill: 'var(--gb-text)' }} fontSize={size * 0.26} fontWeight="900">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

/**
 * The pinned bar's height as --kyb-bar (the contents column, jumped-to races
 * and the race boxes sit below it), and `kyb-ballot` on the page while the bar
 * is up: on phones govbot's header then scrolls away and the bar is the whole
 * sticky top (ballot.css).
 */
export function usePinnedBar() {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((bar: HTMLDivElement | null) => {
    observer.current?.disconnect();
    const root = document.documentElement;
    root.classList.toggle('kyb-ballot', !!bar);
    if (!bar) { root.style.removeProperty('--kyb-bar'); return; }
    // Setting a variable on the page root makes the browser recheck every
    // element's style, so only when the height really changed (resizing the
    // window or zooming changes the width far more often).
    let last = '';
    observer.current = new ResizeObserver(([entry]) => {
      const h = `${Math.round(entry.borderBoxSize?.[0]?.blockSize ?? bar.offsetHeight)}px`;
      if (h !== last) root.style.setProperty('--kyb-bar', (last = h));
    });
    observer.current.observe(bar);
  }, []);
}

interface ProgressProps { done: number; total: number; allDone: boolean; place?: string; region: string; onChangeAddress: () => void }

/** The count line and the address under it: "258 contests to browse · Browsing every race in … · Add address". */
export function ProgressLine({ done, total, allDone, place, region, onChangeAddress }: ProgressProps) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-black text-lg leading-tight">{!place ? `${total} contests to browse` : allDone ? 'Ballot ready 🎉' : `${done} of ${total} decided`}</p>
      <button type="button" onClick={onChangeAddress} className="flex max-w-full flex-wrap items-center gap-x-1.5 text-left text-sm leading-snug text-[var(--gb-text)]">
        <span>{place ? `📍 ${place}` : `Browsing every race in ${region}`}</span>
        <span className="shrink-0 font-bold text-[var(--gb-text)] underline underline-offset-2">{place ? 'Change' : 'Add address'}</span>
      </button>
    </div>
  );
}

/**
 * The head of the pinned bar. Wide screens: the ring and the count line. Phones,
 * where every pinned pixel is one the ballot loses: one short row of govbot's
 * logo, the contents button, the ring and its fraction, nothing else; the
 * count line goes under the bar (ProgressLine) and scrolls with the page.
 */
export function ProgressHead({ wide, onContents, ...p }: ProgressProps & { wide: boolean; onContents: () => void }) {
  const pct = p.total ? p.done / p.total : 0;
  if (wide) return <div className="flex items-center gap-4"><Ring pct={pct} /><ProgressLine {...p} /></div>;
  return (
    <div className="flex items-center gap-3">
      <a href={GOVBOT_SITE} aria-label="Govbot home" className="shrink-0">
        <img src={`${GOVBOT_ASSETS}govbot-mark.png`} width="40" height="40" alt="" className="h-10 w-10 rounded-lg" />
      </a>
      <button type="button" onClick={onContents} aria-label="Contents"
        className="shrink-0 w-11 h-11 rounded-xl border-2 border-[var(--gb-text)] flex items-center justify-center text-[var(--gb-text)] hover:bg-[var(--kyb-chip)]">
        <ListChecks className="w-5 h-5" aria-hidden="true" />
      </button>
      <Ring pct={pct} size={52} />
      <p className="font-black text-xl leading-none tabular-nums" aria-label={`${p.done} of ${p.total} decided`}>{p.done}<span className="text-base font-bold"> / {p.total}</span></p>
    </div>
  );
}

export function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  const colors = ['#5EBD3E', '#FFB900', '#F78200', '#E23838', '#973999', '#009CDF'];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden motion-reduce:hidden">
      <style>{'@keyframes kyb-fall{to{transform:translateY(110vh) rotate(720deg)}}'}</style>
      {Array.from({ length: 80 }, (_, i) => (
        <span key={i} className="absolute top-[-20px] w-2.5 h-4 rounded-sm" style={{
          left: `${(i * 37) % 100}%`, background: colors[i % 6],
          animation: `kyb-fall ${2 + (i % 5) * 0.3}s ${(i % 10) * 0.08}s ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

/** Pinned under the progress bar while there's no address: picks are off until there is one. */
export function BrowsingNotice({ region, onAddAddress, counties }: { region: string; onAddAddress: () => void; /** Browse one county's races without an address; `all` labels the whole-state choice (value ''). */ counties?: { list: string[]; value: string; onChange: (county: string) => void; all?: string } }) {
  // The native dropdown draws its own list, so each option gets explicit colours: in dark mode the
  // page's light text was landing on the system's white list.
  const option = { color: '#111', background: '#fff' };
  return (
    <div role="status" data-browsing-notice className="mt-3 flex flex-col items-start lg:flex-row lg:flex-wrap lg:items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--gb-amber-hi)] bg-[var(--kyb-chip)] px-3 py-2 text-sm lg:text-[15px] leading-snug">
      <p className="min-w-0 flex-1">You’re seeing <strong>every</strong> race on any ballot in {region}. Picks are off until it’s <em>your</em> ballot.</p>
      <div className="flex flex-wrap items-center gap-2">
        {counties && (
          <label className="inline-flex items-center gap-1.5 min-h-[40px] rounded-lg border-2 border-[var(--gb-text)] bg-[var(--gb-surface)] pl-2.5 pr-1 font-bold text-[var(--gb-text)]">
            <span className="sr-only">County to browse</span>
            <span aria-hidden="true">Browse:</span>
            <select value={counties.value} onChange={(e) => counties.onChange(e.target.value)} className="min-h-[36px] max-w-[11rem] bg-transparent font-bold text-[var(--gb-text)] outline-none">
              {counties.all && <option value="" style={option}>{counties.all}</option>}
              {counties.list.map((c) => <option key={c} value={c} style={option}>{c} County</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={onAddAddress} className="inline-flex items-center gap-1.5 min-h-[40px] rounded-lg bg-[var(--gb-text)] px-3 font-bold text-[var(--gb-bg)]">
          <MapPin className="w-4 h-4" aria-hidden="true" /> Enter your address
        </button>
      </div>
    </div>
  );
}

/** Phones: the same warning as a small yield-sign badge that stays on screen
 *  while the page scrolls (the full notice scrolls away with the tools).
 *  Tapping it opens the full sentence and the address button. */
export function BrowsingBadge({ region, onAddAddress }: { region: string; onAddAddress: () => void }) {
  const [open, setOpen] = useState(false);
  // Hidden while the full notice is on screen; it takes over once that scrolls away.
  const [noticeShown, setNoticeShown] = useState(true);
  useEffect(() => {
    const notice = document.querySelector('[data-browsing-notice]');
    if (!notice || typeof IntersectionObserver === 'undefined') { setNoticeShown(false); return; }
    const io = new IntersectionObserver(([e]) => setNoticeShown(e.isIntersecting));
    io.observe(notice);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  if (noticeShown && !open) return null;
  return (
    <div className="fixed bottom-5 left-4 z-[45] print:hidden">
      {open ? (
        <div role="status" className="relative max-w-[calc(100vw-2rem)] w-80 rounded-xl border-2 border-[var(--gb-amber-hi)] bg-[var(--gb-surface)] p-3 pr-11 text-sm leading-snug text-[var(--gb-text)] shadow-2xl">
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute top-2 right-2 w-8 h-8 rounded-full border-2 border-[var(--gb-text)] flex items-center justify-center"><X className="w-4 h-4" aria-hidden="true" /></button>
          <p>Candidate picks are off: you’re seeing <strong>every</strong> race on any ballot in {region}, not just yours. Enter your address to pick.</p>
          <button type="button" onClick={() => { setOpen(false); onAddAddress(); }} className="mt-2 inline-flex items-center gap-1.5 min-h-[40px] rounded-lg bg-[var(--gb-text)] px-3 font-bold text-[var(--gb-bg)]">
            <MapPin className="w-4 h-4" aria-hidden="true" /> Enter your address
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={`Candidate picks are off: you’re seeing every race in ${region}, not just yours. Enter your address to pick`}
          className="inline-flex items-center gap-1.5 min-h-[40px] rounded-full border-2 border-[var(--gb-amber-hi)] bg-[var(--gb-surface)] pl-2.5 pr-3 text-[13px] font-bold text-[var(--gb-text)] shadow-lg">
          <TriangleAlert className="w-5 h-5 text-[var(--gb-amber-hi)]" aria-hidden="true" /> Candidate picks off
        </button>
      )}
    </div>
  );
}

/** True on wide screens (Tailwind's lg, 1024px), where the ballot view has room for a sticky toolbar. */
export function useWide() {
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/** While the browser finds the voter and their districts are looked up: a spinning ring over the page. */
export function Locating({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-black/55 backdrop-blur-[2px]">
      <div className="kyb-rainbow w-20 h-20 rounded-full animate-spin" aria-hidden="true" />
      <p className="rounded-full bg-[var(--gb-surface)] px-4 py-2 font-black text-[var(--gb-text)]">Finding where you are…</p>
    </div>
  );
}

/** The browser tab's title and icon while a guide is open; the lab's own come back on exit. */
export function useDocumentMeta(title: string, emoji: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const was = { title: document.title, href: link?.href ?? '', type: link?.type ?? '' };
    document.title = title;
    if (link) {
      link.type = 'image/svg+xml';
      link.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="52" font-size="52" text-anchor="middle">${emoji}</text></svg>`)}`;
    }
    return () => { document.title = was.title; if (link) { link.href = was.href; link.type = was.type; } };
  }, [title, emoji]);
}

/**
 * Which page of the guide is open: the landing (`projects/<id>`) or the ballot
 * (`projects/<id>/ballot`), which has its own URL so it can be linked and the
 * Back button returns to the landing. The landing never forwards a returning voter to
 * their ballot on its own (a link to the guide should land on the guide); it
 * offers them a "Back to my ballot" card instead.
 */
export function useBallotView(projectId: string): [boolean, (on: boolean) => void] {
  const route = useRoute();
  const path = `projects/${projectId}/ballot`;
  const show = useCallback((on: boolean) => navigate(on ? path : `projects/${projectId}`), [path, projectId]);
  return [route === path, show];
}

export interface SectionItem {
  id: string; title: string; /** Its district, court or scope. */ sub: string; race?: Race;
  /** A ballot question: its official wording, and what yes or no does. */
  question?: string; plain?: string;
}
export interface SectionCard { id: string; title: string; emoji: string; color: string; ink: string; n: number; hint: string; items: SectionItem[] }

/** One section as a card that flips to list its contests (or questions). */
export function SectionFlip({ card, onOpen, onOpenRace, onJump }: { key?: string; card: SectionCard; onOpen: (race: Race, c: Candidate) => void; onOpenRace: (race: Race) => void; onJump: (sectionId: string, id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`kyb-flip ${open ? 'sm:col-span-2' : ''}`}>
      <div className={`kyb-flip-inner ${open ? 'kyb-flipped' : ''}`}>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} inert={open}
          className={`kyb-face ${open ? 'kyb-off' : ''} flex items-center gap-3 rounded-2xl border-[3px] bg-[var(--gb-surface)] px-4 py-3 text-left hover:bg-[var(--kyb-chip)]`} style={{ borderColor: card.color }}>
          <span className="text-2xl" aria-hidden="true">{card.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-black leading-tight">{card.title}</span>
            <span className="block text-sm">{card.hint} · {card.items.some((it) => it.question) ? 'tap to read the questions' : 'tap to see who’s running'}</span>
          </span>
          <span className="shrink-0 rounded-full px-2.5 py-1 text-sm font-black" style={{ background: card.color, color: card.ink }}>{card.n}</span>
        </button>
        <div className={`kyb-face kyb-back ${open ? '' : 'kyb-off'} rounded-2xl border-[3px] bg-[var(--gb-surface)] p-4 flex flex-col gap-3`} style={{ borderColor: card.color }} inert={!open}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-black leading-tight"><span aria-hidden="true">{card.emoji}</span> {card.title} <span className="font-bold">· {card.n}</span></p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Flip back" className="shrink-0 w-9 h-9 -mt-1 -mr-1 rounded-full flex items-center justify-center hover:bg-[var(--kyb-chip)]">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="kyb-scroll-bar max-h-[440px] overflow-y-auto divide-y divide-[var(--kyb-chip)] rounded-xl border border-[var(--gb-border)]" style={{ ['--scroll' as string]: card.color }}>
            {card.items.map((it) => it.race ? (
              <li key={it.id}>
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-[var(--kyb-chip)]">
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-snug">{it.title}</span>
                      <span className="block text-xs">{it.sub} · {it.race.candidates.length} candidate{it.race.candidates.length === 1 ? '' : 's'}</span>
                    </span>
                  </summary>
                  <ul className="px-3 pb-3 space-y-1.5">
                    {it.race.candidates.map((c) => (
                      <li key={c.ballot}>
                        <button type="button" onClick={() => onOpen(it.race!, c)} aria-label={`${c.name}: more about them`} className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--kyb-chip)]">
                          <Face c={c} className="w-9 h-9 text-xs" />
                          <span className="min-w-0 flex-1 text-sm font-bold leading-tight">{c.name}</span>
                          <span className="shrink-0 rounded-full bg-[var(--kyb-chip)] px-2 py-0.5 text-[11px] font-bold">{c.nominatedBy ?? c.party}</span>
                          <Info className="w-5 h-5 shrink-0 text-[var(--gb-link)]" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                    <li><button type="button" onClick={() => onOpenRace(it.race!)} className="mt-1 text-sm font-bold underline underline-offset-2">Open this race on the ballot →</button></li>
                  </ul>
                </details>
              </li>
            ) : it.question ? (
              <li key={it.id}>
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 hover:bg-[var(--kyb-chip)]">
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-snug">{it.title}</span>
                      <span className="block text-xs">{it.sub} · yes or no</span>
                    </span>
                  </summary>
                  <div className="px-3 pb-3 space-y-2 text-sm leading-relaxed">
                    {it.plain && <p>{it.plain}</p>}
                    <p className="rounded-lg bg-[var(--kyb-chip)] p-2.5"><span className="block text-[11px] font-black uppercase tracking-wide">Official ballot text</span>“{it.question}”</p>
                    <button type="button" onClick={() => onJump(card.id, it.id)} className="font-bold underline underline-offset-2">Decide on the ballot →</button>
                  </div>
                </details>
              </li>
            ) : (
              <li key={it.id}>
                <button type="button" onClick={() => onJump(card.id, it.id)} className="w-full px-3 py-2.5 text-left hover:bg-[var(--kyb-chip)]">
                  <span className="block text-[15px] font-bold leading-snug">{it.title}</span>
                  <span className="block text-xs">{it.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

/**
 * The rest of the ballot by section, as cards in the contents list's
 * colours. A card flips to list every contest in it with its district; each
 * race opens to its candidates (photo, name, party), and a candidate opens
 * their details.
 */
export function SectionCards({ cards, heading, intro, onOpen, onOpenRace, onJump }: { cards: SectionCard[]; heading: string; intro: string; onOpen: (race: Race, c: Candidate) => void; onOpenRace: (race: Race) => void; onJump: (sectionId: string, id: string) => void }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby="kyb-more" className="space-y-4">
      <div className="space-y-1">
        <h2 id="kyb-more" className="text-2xl sm:text-3xl leading-[1.05]">{heading}</h2>
        <p className="text-[15px]">{intro}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-start">
        {cards.map((c) => <SectionFlip key={c.id} card={c} onOpen={onOpen} onOpenRace={onOpenRace} onJump={onJump} />)}
      </ul>
    </section>
  );
}

/** A fold-away explainer of the ballot's layout, remembered open or closed on this device. */
export function HowBallotWorks({ storageKey, title, defaultOpen = false, children }: { storageKey: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, toggle] = useOpen(storageKey, defaultOpen);
  return (
    <section aria-labelledby="kyb-how" className="rounded-2xl border-[3px] border-[var(--kyb-gold)] bg-[var(--gb-surface)] p-4 sm:p-5 space-y-3">
      <h2 id="kyb-how" className="text-xl">
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="kyb-how-body" className="inline-flex min-h-[44px] items-center gap-2 text-left">
          🧾 {title}
          <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          <span className="sr-only">{open ? '(hide)' : '(show)'}</span>
        </button>
      </h2>
      {open && <div id="kyb-how-body" className="space-y-2 text-[15px] leading-relaxed">{children}</div>}
    </section>
  );
}

/** On the landing page, when a ballot is already saved: back into it in one tap. */
export function ContinueCard({ label, onContinue }: { label: string; onContinue: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border-[3px] border-[var(--gb-primary)] bg-[var(--gb-surface)] p-4">
      <p className="min-w-0 flex-1 font-bold">📍 {label}</p>
      <button type="button" onClick={onContinue} className="min-h-[44px] rounded-xl bg-[var(--gb-primary)] px-4 font-black text-[var(--gb-on-primary)]">Back to my ballot →</button>
    </div>
  );
}
