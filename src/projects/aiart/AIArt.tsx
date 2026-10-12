import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, AtSign, Check, ChevronDown, Copy, Cpu, ExternalLink, Link2, Search, Shuffle, Tag, User, X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// AI Art — a gallery of AI-generated images and the exact prompts behind them,
// migrated from Frankie's Notion collection. Browse the images, copy any prompt
// to your clipboard with one tap, and jump to the creator's original post.
//
// Every entry credits its creator, links to the source, tags a theme, and names
// the AI model used. Data lives in ./data/gallery.json; images are self-hosted
// (compressed webp) under public/projects/ai-art/ so the gallery is fully
// standalone — nothing loads from Notion at runtime.
// ---------------------------------------------------------------------------

interface GalleryEntry {
  id: string;
  name: string;
  prompt: string;
  user: string;
  url: string;
  model: string;
  themes: string[];
  img: string;
  w: number;
  h: number;
}

// Eager glob import keeps us off a tsconfig `resolveJsonModule` change and
// matches the pattern used elsewhere in the projects area.
const GALLERY: GalleryEntry[] = (
  Object.values(
    import.meta.glob('./data/gallery.json', { eager: true }) as Record<string, { default: GalleryEntry[] }>,
  )[0]?.default ?? []
).filter((e) => e.img);

const IMG_BASE = `${import.meta.env.BASE_URL}projects/ai-art/`;
const ACCENT = '#ccff00';

interface FacetOption { value: string; n: number }

// Distinct values + counts for a facet, sorted by frequency (busiest first).
function facet(getVals: (e: GalleryEntry) => string[]): FacetOption[] {
  const count: Record<string, number> = {};
  for (const e of GALLERY) for (const v of getVals(e)) if (v) count[v] = (count[v] || 0) + 1;
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, n]) => ({ value, n }));
}

const USERS = facet((e) => [e.user]);
const MODELS = facet((e) => [e.model]);
const THEMES = facet((e) => e.themes);

// Stable colour per tag string, so a theme/model keeps the same hue everywhere.
const TAG_PALETTE = [
  '#e2679a', '#e2a15a', '#5fb878', '#5aa9e2', '#9b7ede', '#e2725b',
  '#4fb3a5', '#d4a13c', '#c07de0', '#6f8fe0', '#d95f6e', '#6cc04a',
];
function tagColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

// "https://x.com/rovvmut_/status/1970442830289215653" -> "x.com/rov...215653"
function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    const host = url.host.replace(/^www\./, '');
    const segs = url.pathname.split('/').filter(Boolean);
    if (!segs.length) return host;
    const first = segs[0].slice(0, 3);
    const last = segs[segs.length - 1];
    const tail = last.length > 6 ? last.slice(-6) : last;
    return segs.length > 1 ? `${host}/${first}...${tail}` : `${host}/${first}…`;
  } catch {
    return u;
  }
}

function xHandleUrl(user: string, fallback: string) {
  const h = user.replace(/^@/, '').trim();
  return h ? `https://x.com/${h}` : fallback;
}

// --- Coloured pill (theme / model) ------------------------------------------
interface PillProps {
  key?: string;
  label: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}
function Pill({ label, color, active, onClick, title }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="max-w-full inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight border transition-transform active:scale-95"
      style={{
        background: active ? color : `${color}26`,
        color: active ? '#0a0a0a' : '#eef0ea',
        borderColor: active ? color : `${color}66`,
      }}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

// --- Labeled metadata row (Notion-style: icon · label · value) --------------
function MetaRow({ icon: Icon, label, children }: { icon: typeof Tag; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-neutral-100 mt-[3px] shrink-0" />
      <span className="w-11 shrink-0 text-[10px] font-mono uppercase tracking-wide text-neutral-100 mt-[3px]">{label}</span>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

// --- Multi-select filter dropdown (checkboxes, OR within the facet) ----------
interface FilterDropdownProps {
  label: string;
  icon: typeof Tag;
  options: FacetOption[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  searchable?: boolean;
}
function FilterDropdown({ label, icon: Icon, options, selected, onToggle, onClear, searchable }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const shown = q ? options.filter((o) => o.value.toLowerCase().includes(q.toLowerCase())) : options;
  const count = selected.size;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
          count > 0 ? 'text-white border-[#ccff00]/60 bg-[#ccff00]/10' : 'text-neutral-100 border-white/15 hover:text-white'
        }`}
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] text-black" style={{ background: ACCENT }}>
            {count}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 w-64 max-h-[60vh] flex flex-col rounded-xl border border-white/10 bg-[#151515] shadow-2xl overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-white/10">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Filter ${label.toLowerCase()}…`}
                autoFocus
                className="w-full bg-neutral-900 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-100 outline-none focus:border-[#ccff00]/60"
              />
            </div>
          )}
          <div className="overflow-y-auto py-1">
            {shown.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-neutral-100 font-mono uppercase tracking-widest">None</div>
            ) : (
              shown.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => onToggle(o.value)}
                    className="w-3.5 h-3.5 shrink-0 accent-[#ccff00]"
                  />
                  <span className="flex-1 min-w-0 truncate text-[13px] text-neutral-200">{o.value}</span>
                  <span className="text-[11px] text-neutral-100 tabular-nums">{o.n}</span>
                </label>
              ))
            )}
          </div>
          {count > 0 && (
            <button
              onClick={onClear}
              className="border-t border-white/10 py-2 text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-100 hover:text-white hover:bg-white/5"
            >
              Clear {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Lightbox: big image + full prompt, copy, credit, model, themes ---------
function Lightbox({
  entry, onClose, onPrev, onNext, onTheme,
}: {
  entry: GalleryEntry;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTheme: (t: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const copy = () => {
    navigator.clipboard?.writeText(entry.prompt).then(() => {
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] flex flex-col lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lg:w-3/5 bg-black flex items-center justify-center min-h-[40vh] max-h-[50vh] lg:max-h-[92vh]">
          <img src={`${IMG_BASE}${entry.img}`} alt={entry.name} className="w-full h-full object-contain" />
        </div>

        <div className="lg:w-2/5 flex flex-col min-h-0 max-h-[52vh] lg:max-h-[92vh]">
          <div className="p-5 overflow-y-auto space-y-3">
            <h2 className="text-xl font-black tracking-tight text-white leading-tight">{entry.name}</h2>

            <MetaRow icon={Tag} label="Theme">
              {entry.themes.length
                ? entry.themes.map((t) => <Pill key={t} label={t} color={tagColor(t)} onClick={() => onTheme(t)} title={`Filter: ${t}`} />)
                : <span className="text-xs text-neutral-100">—</span>}
            </MetaRow>
            <MetaRow icon={AtSign} label="User">
              <a href={xHandleUrl(entry.user, entry.url)} target="_blank" rel="noreferrer noopener" className="text-xs font-mono text-neutral-200 hover:text-[#ccff00] transition-colors truncate">
                {entry.user || 'Unknown'}
              </a>
            </MetaRow>
            <MetaRow icon={Cpu} label="Model">
              {entry.model ? <Pill label={entry.model} color={tagColor(entry.model)} /> : <span className="text-xs text-neutral-100">—</span>}
            </MetaRow>
            <MetaRow icon={Link2} label="URL">
              {entry.url
                ? <a href={entry.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-mono text-neutral-100 hover:text-[#ccff00] transition-colors"><span className="truncate">{shortUrl(entry.url)}</span><ExternalLink className="w-3 h-3 shrink-0" /></a>
                : <span className="text-xs text-neutral-100">—</span>}
            </MetaRow>

            <div className="pt-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-100">Prompt</span>
              <p className="mt-1.5 text-sm text-neutral-100 leading-relaxed whitespace-pre-wrap break-words">
                {entry.prompt || <span className="italic text-neutral-100">No prompt provided.</span>}
              </p>
            </div>
          </div>

          <div className="mt-auto flex gap-2 p-4 border-t border-white/10 bg-[#0d0d0d]">
            <button
              onClick={copy}
              disabled={!entry.prompt}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-black transition-transform active:scale-[0.98] disabled:cursor-not-allowed"
              style={{ background: ACCENT }}
            >
              {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy prompt</>}
            </button>
            <a
              href={entry.url || xHandleUrl(entry.user, '#')}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-white/10 hover:bg-white/15 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Original
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Card: image + organized metadata block ---------------------------------
interface CardProps {
  key?: string;
  entry: GalleryEntry;
  onOpen: () => void;
  onCopy: (e: GalleryEntry) => void;
  copiedId: string;
  onTheme: (t: string) => void;
  onModel: (m: string) => void;
  activeThemes: Set<string>;
  activeModels: Set<string>;
}
function Card({ entry, onOpen, onCopy, copiedId, onTheme, onModel, activeThemes, activeModels }: CardProps) {
  const ratio = entry.w && entry.h ? entry.h / entry.w : 1;
  const copied = copiedId === entry.id;
  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-white/10 bg-[#141414]">
      {/* Image */}
      <button onClick={onOpen} className="group block w-full text-left" aria-label={`Open ${entry.name}`}>
        <div style={{ paddingBottom: `${Math.min(ratio, 1.4) * 100}%` }} className="relative w-full bg-black">
          <img
            src={`${IMG_BASE}${entry.img}`}
            alt={entry.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      </button>

      {/* Metadata block */}
      <div className="p-3 space-y-2">
        <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{entry.name}</h3>

        <MetaRow icon={Tag} label="Theme">
          {entry.themes.length
            ? entry.themes.map((t) => (
                <Pill key={t} label={t} color={tagColor(t)} active={activeThemes.has(t)} onClick={() => onTheme(t)} title={`Filter: ${t}`} />
              ))
            : <span className="text-xs text-neutral-100">—</span>}
        </MetaRow>

        <MetaRow icon={AtSign} label="User">
          <a
            href={xHandleUrl(entry.user, entry.url)}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs font-mono text-neutral-200 hover:text-[#ccff00] transition-colors truncate"
          >
            {entry.user || 'Unknown'}
          </a>
        </MetaRow>

        <MetaRow icon={Cpu} label="Model">
          {entry.model
            ? <Pill label={entry.model} color={tagColor(entry.model)} active={activeModels.has(entry.model)} onClick={() => onModel(entry.model)} title={`Filter: ${entry.model}`} />
            : <span className="text-xs text-neutral-100">—</span>}
        </MetaRow>

        <MetaRow icon={Link2} label="URL">
          {entry.url
            ? (
              <a href={entry.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-mono text-neutral-100 hover:text-[#ccff00] transition-colors">
                <span className="truncate">{shortUrl(entry.url)}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )
            : <span className="text-xs text-neutral-100">—</span>}
        </MetaRow>

        {/* Copy prompt */}
        <button
          onClick={() => onCopy(entry)}
          disabled={!entry.prompt}
          className={`mt-1 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:cursor-not-allowed ${
            copied ? 'text-black' : 'text-[#ccff00] border border-[#ccff00]/30 hover:bg-[#ccff00]/10'
          }`}
          style={copied ? { background: ACCENT } : undefined}
        >
          {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy prompt</>}
        </button>
      </div>
    </div>
  );
}

// --- Active-filter chip -----------------------------------------------------
function ActiveChip({ label, color, onRemove }: { key?: string; label: string; color: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-medium border"
      style={{ background: `${color}22`, color: '#eef0ea', borderColor: `${color}66` }}
    >
      <span className="truncate max-w-[160px]">{label}</span>
      <button onClick={onRemove} className="rounded-full hover:bg-white/15 p-0.5" aria-label={`Remove ${label}`}>
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// --- Main -------------------------------------------------------------------
export function AIArt({ onExit }: { onExit: () => void }) {
  const [query, setQuery] = useState('');
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set());
  const [selModels, setSelModels] = useState<Set<string>>(new Set());
  const [selThemes, setSelThemes] = useState<Set<string>>(new Set());
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState('');
  const copyTimer = useRef<number | null>(null);

  const toggleIn = (setter: (fn: (prev: Set<string>) => Set<string>) => void) => (v: string) =>
    setter((prev) => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const toggleUser = toggleIn(setSelUsers);
  const toggleModel = toggleIn(setSelModels);
  const toggleTheme = toggleIn(setSelThemes);
  const clearAll = () => { setSelUsers(new Set()); setSelModels(new Set()); setSelThemes(new Set()); setQuery(''); };
  const activeCount = selUsers.size + selModels.size + selThemes.size + (query ? 1 : 0);

  const quickCopy = (e: GalleryEntry) => {
    navigator.clipboard?.writeText(e.prompt).then(() => {
      setCopiedId(e.id);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(''), 1500);
    });
  };
  useEffect(() => () => { if (copyTimer.current) window.clearTimeout(copyTimer.current); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GALLERY.filter((e) => {
      if (selUsers.size && !selUsers.has(e.user)) return false;
      if (selModels.size && !selModels.has(e.model)) return false;
      if (selThemes.size && !e.themes.some((t) => selThemes.has(t))) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.prompt.toLowerCase().includes(q) ||
        e.user.toLowerCase().includes(q) ||
        e.model.toLowerCase().includes(q) ||
        e.themes.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, selUsers, selModels, selThemes]);

  const openEntry = openIdx != null ? filtered[openIdx] : null;
  const go = (delta: number) => {
    setOpenIdx((i) => (i == null || filtered.length === 0 ? i : (i + delta + filtered.length) % filtered.length));
  };
  const shuffle = () => { if (filtered.length) setOpenIdx(Math.floor(Math.random() * filtered.length)); };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-neutral-100 font-sans selection:bg-[#ccff00] selection:text-black">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/85 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              title="Back to projects"
              className="group inline-flex items-center justify-center w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-100 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black tracking-tighter uppercase italic text-white leading-none">AI Art</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-100 mt-0.5 truncate">
                {filtered.length}/{GALLERY.length} prompts · tap to copy
              </p>
            </div>

            {/* Search */}
            <div className="ml-auto relative w-40 sm:w-72 shrink">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-100 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search prompts…"
                className="w-full bg-neutral-900 border border-white/10 rounded-full pl-9 pr-8 py-2 text-sm text-white placeholder:text-neutral-100 outline-none focus:border-[#ccff00]/60 transition-colors"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-100 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter row: three multi-select facets */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <FilterDropdown label="User" icon={User} options={USERS} selected={selUsers} onToggle={toggleUser} onClear={() => setSelUsers(new Set())} searchable />
            <FilterDropdown label="Model" icon={Cpu} options={MODELS} selected={selModels} onToggle={toggleModel} onClear={() => setSelModels(new Set())} />
            <FilterDropdown label="Theme" icon={Tag} options={THEMES} selected={selThemes} onToggle={toggleTheme} onClear={() => setSelThemes(new Set())} searchable />
            <button
              onClick={shuffle}
              title="Surprise me"
              className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border border-white/15 text-neutral-100 hover:text-white transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5" /> Random
            </button>
            {activeCount > 0 && (
              <button
                onClick={clearAll}
                className="shrink-0 text-[11px] font-mono font-bold uppercase tracking-wide px-3 py-1.5 rounded-full text-neutral-100 hover:text-white transition-colors ml-auto"
              >
                Clear all ({activeCount})
              </button>
            )}
          </div>

          {/* Active filters */}
          {(selUsers.size > 0 || selModels.size > 0 || selThemes.size > 0) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {[...selUsers].map((v) => <ActiveChip key={`u${v}`} label={v} color="#5aa9e2" onRemove={() => toggleUser(v)} />)}
              {[...selModels].map((v) => <ActiveChip key={`m${v}`} label={v} color={tagColor(v)} onRemove={() => toggleModel(v)} />)}
              {[...selThemes].map((v) => <ActiveChip key={`t${v}`} label={v} color={tagColor(v)} onRemove={() => toggleTheme(v)} />)}
            </div>
          )}
        </div>
      </header>

      {/* Gallery */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-neutral-100 font-mono uppercase tracking-widest text-sm">
            No artwork matches your filters.
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
            {filtered.map((entry: GalleryEntry, i: number) => (
              <Card
                key={entry.id}
                entry={entry}
                onOpen={() => setOpenIdx(i)}
                onCopy={quickCopy}
                copiedId={copiedId}
                onTheme={toggleTheme}
                onModel={toggleModel}
                activeThemes={selThemes}
                activeModels={selModels}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="text-center py-10 text-[10px] font-mono uppercase tracking-widest text-neutral-100">
        Prompts credit their original creators · migrated from Notion
      </footer>

      {openEntry && (
        <Lightbox
          entry={openEntry}
          onClose={() => setOpenIdx(null)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onTheme={(t) => { toggleTheme(t); setOpenIdx(null); }}
        />
      )}
    </div>
  );
}
