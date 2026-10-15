import { ChevronDown, MapPin } from 'lucide-react';
import { useCallback, useEffect, type ReactNode } from 'react';
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
export function BrowsingNotice({ region, onAddAddress }: { region: string; onAddAddress: () => void }) {
  return (
    <div role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--gb-amber-hi)] bg-[var(--kyb-chip)] px-3 py-2 text-[15px] leading-snug">
      <p className="min-w-0 flex-1">You’re seeing <strong>every</strong> race on any ballot in {region}. Picks and trophies are off until it’s <em>your</em> ballot.</p>
      <button type="button" onClick={onAddAddress} className="inline-flex items-center gap-1.5 min-h-[40px] rounded-lg bg-[var(--gb-text)] px-3 font-bold text-[var(--gb-bg)]">
        <MapPin className="w-4 h-4" aria-hidden="true" /> Enter your address
      </button>
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
 * The details view (progress bar, contents, the ballot) lives at its own URL,
 * projects/<id>/ballot, so it can be linked and the Back button returns to
 * the landing page. Returns whether it's showing, and a way to show or hide
 * it. With `resume` (saved progress), the first open goes straight there.
 */
export function useBallotView(projectId: string, resume: boolean): [boolean, (on: boolean) => void] {
  const route = useRoute();
  const path = `projects/${projectId}/ballot`;
  const onBallot = route === path;
  const show = useCallback((on: boolean) => navigate(on ? path : `projects/${projectId}`), [path, projectId]);
  // Replacing, not pushing: Back then leaves the guide rather than landing on
  // a page that would bounce straight back.
  useEffect(() => { if (resume && !onBallot) navigate(path, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [onBallot, show];
}

export interface SectionCard { id: string; title: string; emoji: string; color: string; ink: string; n: number; hint: string }

/** The rest of the ballot by section, as cards in the contents list's colours; a tap browses that section. */
export function SectionCards({ cards, heading, intro, onOpen }: { cards: SectionCard[]; heading: string; intro: string; onOpen: (sectionId: string) => void }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby="kyb-more" className="space-y-4">
      <div className="space-y-1">
        <h2 id="kyb-more" className="text-2xl sm:text-3xl leading-[1.05]">{heading}</h2>
        <p className="text-[15px]">{intro}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c.id)} className="w-full h-full flex items-center gap-3 rounded-2xl border-[3px] bg-[var(--gb-surface)] px-4 py-3 text-left hover:bg-[var(--kyb-chip)]" style={{ borderColor: c.color }}>
              <span className="text-2xl" aria-hidden="true">{c.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-black leading-tight">{c.title}</span>
                <span className="block text-sm">{c.hint}</span>
              </span>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-sm font-black" style={{ background: c.color, color: c.ink }}>{c.n}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A fold-away explainer of the ballot's layout, remembered open or closed on this device. */
export function HowBallotWorks({ storageKey, title, children }: { storageKey: string; title: string; children: ReactNode }) {
  const [open, toggle] = useOpen(storageKey);
  return (
    <section aria-labelledby="kyb-how" className="rounded-2xl border border-[var(--gb-border)] bg-[var(--gb-surface)] p-4 sm:p-5 space-y-3">
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
