import { useEffect, useState, type ReactNode } from 'react';
import judgesUrl from './data/illinois/judges.json?url';
import type { JudgeProfile, JudgesFile } from './types';

// Injustice Watch's profile of a judge or judicial candidate: everything
// their page in the guide shows, word for word, with the guide's glossary
// definitions a tap away. The file holds every judge and is fetched once, the
// first time a judge's details open (scripts/know-your-ballot/illinois/judges.mjs).

const EMPTY: JudgesFile = { asOf: '', glossary: {}, profiles: {} };
let promise: Promise<JudgesFile> | null = null;
const load = () => (promise ??= fetch(judgesUrl).then((r) => (r.ok ? r.json() : EMPTY)).catch(() => { promise = null; return EMPTY; }));

function useJudges(wanted: boolean) {
  const [file, setFile] = useState<JudgesFile | null>(null);
  useEffect(() => { if (wanted && !file) load().then(setFile); }, [wanted, file]);
  return file;
}

type Glossary = JudgesFile['glossary'];

/** A glossary term: dotted underline; a tap shows the guide's definition under it. */
function Term({ slug, label, glossary }: { key?: number; slug: string; label: string; glossary: Glossary }) {
  const [open, setOpen] = useState(false);
  const def = glossary[slug];
  if (!def) return <>{label}</>;
  return (
    <>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="font-bold underline decoration-dotted decoration-2 underline-offset-4 text-[var(--gb-text)]">{label}</button>
      {open && <span className="block my-1.5 rounded-lg bg-[var(--kyb-chip)] px-3 py-2 text-sm leading-snug"><strong>{def.name}:</strong> {def.description}</span>}
    </>
  );
}

// The guide's inline markup: [text](https://…), [term](#slug), **bold**.
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
function Inline({ text, glossary }: { text: string; glossary: Glossary }) {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const [, label, href, bold] = m;
    if (bold) out.push(<strong key={m.index}>{bold}</strong>);
    else if (href.startsWith('#')) out.push(<Term key={m.index} slug={href.slice(1)} label={label} glossary={glossary} />);
    // Only web links are followed; anything else the guide wrote stays as its text.
    else if (/^https?:\/\//.test(href)) out.push(<a key={m.index} href={href} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">{label}</a>);
    else out.push(label);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/** Paragraphs and "- " lists, as the guide wrote them. */
function Rich({ text, glossary }: { text: string; glossary: Glossary }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length} className="list-disc space-y-1 pl-5">{list.map((l, i) => <li key={i}><Inline text={l} glossary={glossary} /></li>)}</ul>); list = []; } };
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (/^[-*] /.test(line)) list.push(line.slice(2));
    else { flush(); blocks.push(<p key={blocks.length}><Inline text={line} glossary={glossary} /></p>); }
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

const H = ({ children }: { children: ReactNode }) => <h4 className="text-xs font-black uppercase tracking-wide text-[var(--gb-text)]">{children}</h4>;

function Flags({ flags }: { flags: NonNullable<JudgeProfile['flags']> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {flags.map((f) => (
          <button key={f.name} type="button" onClick={() => setOpen(open === f.name ? null : f.name)} aria-expanded={open === f.name}
            className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${open === f.name ? 'border-[var(--gb-text)] bg-[var(--gb-text)] text-[var(--gb-bg)]' : 'border-[var(--gb-text)] text-[var(--gb-text)]'}`}>
            {f.name}
          </button>
        ))}
      </div>
      {open && <p className="text-sm leading-snug">{flags.find((f) => f.name === open)?.description}</p>}
    </div>
  );
}

/**
 * The profile for key `k` (a retention id, or `<race id>|<name>`). Loads the
 * file once `wanted`; nothing is drawn for a judge the guide doesn't profile.
 */
export function JudgeProfileBlock({ k, wanted }: { k: string; wanted: boolean }) {
  const file = useJudges(wanted);
  if (!wanted) return null;
  if (!file) return <p className="text-sm text-[var(--gb-text)]">Loading their profile…</p>;
  const p = file.profiles[k];
  if (!p) return null;
  const g = file.glossary;
  const when = file.asOf ? new Date(file.asOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const facts = [
    p.age && `🎂 Age ${p.age}`,
    p.lawSchool && `🎓 ${p.lawSchool}${p.graduationYear ? `, class of ${p.graduationYear}` : ''}`,
    p.judgeSince && `⚖️ Judge since ${p.judgeSince}`,
    p.neighborhood && `📍 ${p.neighborhood}`,
  ].filter(Boolean) as string[];
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-[var(--gb-text)]">
      {facts.length > 0 && <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">{facts.map((f) => <span key={f}>{f}</span>)}</p>}
      {p.flags && <Flags flags={p.flags} />}
      {(p.judicialExperience || p.pastExperience || p.experience) && (
        <div className="space-y-2">
          <H>Experience</H>
          {p.judicialExperience && <Rich text={p.judicialExperience} glossary={g} />}
          {p.pastExperience && <><p className="text-sm font-bold">Before the bench</p><Rich text={p.pastExperience} glossary={g} /></>}
          {p.experience && <Rich text={p.experience} glossary={g} />}
        </div>
      )}
      {p.notable && <div className="space-y-2"><H>Notable · Injustice Watch’s reporting</H><Rich text={p.notable} glossary={g} /></div>}
      {(p.surveyExcerpt || p.survey) && (
        <div className="space-y-2">
          <H>Candidate survey · in their own words</H>
          {p.surveyExcerpt && <blockquote className="rounded-xl bg-[var(--gb-bg)] p-3 italic"><Rich text={p.surveyExcerpt} glossary={g} /></blockquote>}
          {p.survey && (
            <div className="space-y-1.5">
              {p.survey.map((s) => (
                <details key={s.q} className="group rounded-xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)]">
                  <summary className="cursor-pointer list-none px-3 py-2.5 font-bold flex items-start justify-between gap-3">
                    <span><Inline text={s.q} glossary={g} /></span><span className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
                  </summary>
                  <div className="px-3 pb-3"><Rich text={s.a} glossary={g} /></div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
      {(p.ratingsExcerpt || p.ratings) && (
        <div className="space-y-2">
          <H>What the bar groups said</H>
          {p.ratingsExcerpt && <Rich text={p.ratingsExcerpt} glossary={g} />}
          {p.ratings && <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{p.ratings.map((r) => <li key={r.group} className="flex justify-between gap-3 border-b border-[var(--gb-border)] py-0.5"><span>{r.group}</span><strong className="shrink-0">{r.rating}</strong></li>)}</ul>}
        </div>
      )}
      {p.endorsements && (
        <div className="space-y-2">
          <H>Endorsed by</H>
          <ul className="space-y-1">{p.endorsements.map((e) => <li key={e.name}><strong>{e.name}</strong>{e.description && <span className="block text-sm leading-snug">{e.description}</span>}</li>)}</ul>
        </div>
      )}
      <p className="text-xs leading-snug">
        From <a href={p.url} target="_blank" rel="noreferrer noopener" className="font-bold text-[var(--gb-link)] underline underline-offset-2">Injustice Watch’s judicial election guide ↗</a>{when && `, read ${when}`}: their reporting and the candidate’s own survey answers, word for word (Creative Commons BY-ND). A dotted term opens the guide’s definition.
      </p>
    </div>
  );
}

/** On a retention card: the profile behind a "More about this judge" fold. */
export function JudgeFold({ k }: { k: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group rounded-xl border-2 border-[var(--gb-border)] bg-[var(--gb-bg)]" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer list-none min-h-[44px] px-3 py-2 font-bold text-[var(--gb-text)] flex items-center justify-between gap-3">
        <span>📖 More about this judge</span><span className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="px-3 pb-3"><JudgeProfileBlock k={k} wanted={open} /></div>
    </details>
  );
}
