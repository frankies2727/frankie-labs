import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { Law } from './types';

// Illinois bills that change how elections and schools work, from govbot's
// legislation data. Text comes from outside, so it's only ever rendered as
// text, and links are kept only if they're plain https.

const TOPICS = [
  { tag: 'elections & voting', label: 'Elections & voting' },
  { tag: 'education', label: 'Schools' },
] as const;
const FIRST = 5;

const safeUrl = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);
const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const day = (iso: string) => dateLabel.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

function Bill({ b }: { key?: string; b: Law }) {
  const url = safeUrl(b.url);
  const slip = safeUrl(b.hearing?.witness_slip_url);
  return (
    <li className="px-4 py-3 space-y-1">
      <p className="font-bold text-[#F5F6F7] leading-snug">
        <span className="font-black">{b.id}</span>{' '}
        {url
          ? <a href={url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-[#009CDF]">{b.title}<ExternalLink className="inline w-3.5 h-3.5 ml-1 align-[-2px]" aria-hidden="true" /></a>
          : b.title}
      </p>
      {b.latest_action && <p className="text-sm text-[#E2E4E8]">Latest, {day(b.latest_action)}: {b.latest_action_desc}</p>}
      {b.hearing && (
        <p className="text-sm font-bold text-[#FFB900]">
          Up for a hearing{b.hearing.committee ? ` in ${b.hearing.committee}` : ''}{b.hearing.scheduled_display ? `, ${b.hearing.scheduled_display}` : ''}.
          {slip && <> <a href={slip} target="_blank" rel="noreferrer noopener" className="underline">Have your say (witness slip)</a></>}
        </p>
      )}
    </li>
  );
}

export function Laws({ laws, asOf }: { laws: Law[]; asOf: string }) {
  const counts = TOPICS.map((t) => laws.filter((b) => b.tags.includes(t.tag)).length);
  const [topic, setTopic] = useState(() => Math.max(0, counts.findIndex((n) => n > 0)));
  const [all, setAll] = useState(false);
  if (!laws.length) return null;
  const list = laws.filter((b) => b.tags.includes(TOPICS[topic].tag));
  return (
    <section aria-labelledby="kyb-laws" className="space-y-3">
      <h2 id="kyb-laws" className="text-2xl font-black">🏛️ Laws that shape your ballot</h2>
      <p className="text-[15px] leading-relaxed text-[#E2E4E8]">Bills in Springfield that change how Illinois votes and runs its schools, newest action first. From <a href="https://github.com/chihacknight/govbot" target="_blank" rel="noreferrer noopener" className="font-bold text-[#F5F6F7] underline">govbot</a>, updated {day(asOf)}.</p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Bill topics">
        {TOPICS.map((t, i) => (
          <button key={t.tag} type="button" role="tab" aria-selected={topic === i} onClick={() => { setTopic(i); setAll(false); }}
            className={`min-h-[44px] rounded-full border-2 px-4 font-bold ${topic === i ? 'border-[#F5F6F7] bg-[#F5F6F7] text-[#0F1117]' : 'border-[#2E343F] text-[#F5F6F7] hover:border-[#F5F6F7]'}`}>
            {t.label} ({counts[i]})
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] divide-y divide-[#262B34]">
          {(all ? list : list.slice(0, FIRST)).map((b) => <Bill key={b.id} b={b} />)}
        </ul>
      ) : <p className="text-[15px] text-[#E2E4E8]">No recent bills on this topic.</p>}
      {list.length > FIRST && (
        <button type="button" onClick={() => setAll(!all)} className="min-h-[44px] rounded-xl border-2 border-[#F5F6F7] px-4 font-bold text-[#F5F6F7]">
          {all ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}
