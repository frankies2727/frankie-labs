import { MapPin } from 'lucide-react';
import { useEffect } from 'react';

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
