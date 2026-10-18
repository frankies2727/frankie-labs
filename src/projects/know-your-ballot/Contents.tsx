import { Check, ChevronDown, Circle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

// The ballot's table of contents, course-style: each section with its races,
// ticked off as they're decided. A side column on desktop; a drawer on phones.

export interface ContentsSection { id: string; title: string; emoji: string; color: string; ids: string[]; done: number }

interface Props {
  sections: ContentsSection[];
  current: string | null;
  isDone: (id: string) => boolean;
  labelOf: (id: string) => string;
  onSection: (id: string) => void;
  onRace: (sectionId: string, id: string) => void;
}

function List({ sections, current, isDone, labelOf, onSection, onRace }: Props) {
  // The section you're in lists its races; tapping its header folds them away.
  const [folded, setFolded] = useState<string | null>(null);
  return (
    <nav aria-label="Ballot contents" className="text-[15px]">
      <ol className="space-y-4 p-4">
        {sections.map((s, i) => {
          const here = s.id === current;
          const open = here && folded !== s.id;
          // Each section framed in its colour; the one you're on pulses.
          return (
            <li key={s.id} className={`rounded-xl border-[3px] ${here ? 'kyb-pulse' : ''}`}
              style={{ borderColor: s.color, ['--pulse' as string]: s.color }}>
              <button type="button" onClick={() => { if (here) setFolded(open ? s.id : null); else { setFolded(null); onSection(s.id); } }} aria-expanded={open} aria-current={here ? 'step' : undefined}
                className={`w-full flex items-center gap-2 px-3 py-3 text-left font-bold hover:bg-[var(--kyb-chip)] ${open ? 'bg-[var(--kyb-chip)] rounded-t-[9px]' : 'rounded-[9px]'}`}>
                <span aria-hidden="true">{s.emoji}</span>
                <span className="flex-1 leading-snug">{i + 1}. {s.title}</span>
                <span className="text-sm font-black">{s.done === s.ids.length ? <Check className="w-4 h-4 text-[var(--gb-primary)]" strokeWidth={3} aria-label="done" /> : `${s.done}/${s.ids.length}`}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open && (
                <ul className="pb-2">
                  {s.ids.map((id) => {
                    const done = isDone(id);
                    return (
                      <li key={id}>
                        <button type="button" onClick={() => onRace(s.id, id)} className="w-full flex items-start gap-2.5 py-2 pl-6 pr-3 text-left hover:bg-[var(--kyb-chip)]">
                          {done
                            ? <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--gb-primary)]" strokeWidth={3} aria-label="decided" />
                            : <Circle className="w-4 h-4 mt-0.5 shrink-0" aria-label="not decided yet" />}
                          <span className="leading-snug">{labelOf(id)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Desktop: a sticky column beside the ballot. */
export function ContentsColumn(props: Props) {
  return (
    <aside style={{ ['--scroll' as string]: props.sections.find((x) => x.id === props.current)?.color ?? 'var(--gb-border-strong)' }} className="kyb-scroll-bar hidden lg:block sticky top-[calc(var(--kyb-top)+var(--kyb-bar,0px)+16px)] max-h-[calc(100dvh-var(--kyb-top)-var(--kyb-bar,0px)-32px)] overflow-y-auto rounded-2xl border-2 border-[var(--gb-text)] bg-[var(--gb-surface)]">
      <p className="px-3 py-3 font-black border-b border-[var(--gb-border)]">☰ Contents</p>
      <List {...props} />
    </aside>
  );
}

/** Phones and tablets: the same list in a drawer from the left. */
export function ContentsDrawer({ open, onClose, ...props }: Props & { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  // Choosing anything closes the drawer.
  const close = <A extends unknown[]>(f: (...a: A) => void) => (...a: A) => { onClose(); f(...a); };
  return (
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Contents">
      <button type="button" aria-label="Close contents" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-y-0 left-0 w-[86vw] max-w-sm overflow-y-auto border-r-2 border-[var(--gb-text)] bg-[var(--gb-surface)] text-[var(--gb-text)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-3 border-b border-[var(--gb-border)] bg-[var(--gb-surface)]">
          <p className="font-black">☰ Contents</p>
          <button type="button" onClick={onClose} aria-label="Close contents" className="w-10 h-10 rounded-full border-2 border-[var(--gb-text)] flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <List {...props} onRace={close(props.onRace)} />
      </div>
    </div>
  );
}
