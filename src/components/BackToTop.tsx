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
      className="fixed right-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 inline-flex items-center gap-1.5 min-h-[44px] rounded-full border-2 border-[#0F1117] bg-[#F5F6F7] px-4 font-black text-[#0F1117] shadow-lg hover:bg-white print:hidden"
    >
      <ArrowUp className="w-5 h-5" strokeWidth={3} aria-hidden="true" /> Top
    </button>
  );
}
