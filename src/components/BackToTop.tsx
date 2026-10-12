import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';

/** A "back to top" pill once the page has scrolled a good way down. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => setShow(window.scrollY > 800);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      // Frosted glass: heavy blur and a see-through tint, a bright rim and a
      // soft glow. On govbot-styled pages it follows their theme colours.
      className="fixed right-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-2 min-h-[48px] rounded-full px-5 font-black
        text-[var(--gb-text,#F5F6F7)] bg-[color-mix(in_srgb,var(--gb-surface,#1A1D24)_38%,transparent)]
        border border-white/45 backdrop-blur-2xl backdrop-saturate-200
        shadow-[0_10px_36px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(255,255,255,0.12)]
        hover:bg-[color-mix(in_srgb,var(--gb-surface,#1A1D24)_55%,transparent)] motion-safe:transition-colors print:hidden"
    >
      <ArrowUp className="w-5 h-5" strokeWidth={3} aria-hidden="true" /> Back to top
    </button>
  );
}
