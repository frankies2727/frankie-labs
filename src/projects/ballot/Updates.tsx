import { money, type Choice } from './store';
import type { Change } from './types';

const sinceLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
const MAX_CONTESTS = 6;

function line(c: Change, picked: boolean): string {
  switch (c.kind) {
    case 'candidate-removed': return `${c.name} is no longer on the candidate list.${picked ? ' You’d picked them, so take another look.' : ''}`;
    case 'candidate-added': return `${c.name} was added to the candidate list.`;
    case 'money': return `${c.name} filed a new money report: ${money(c.raised ?? 0)} raised so far.`;
    case 'contest-added': return 'New on the ballot.';
    case 'contest-removed': return 'No longer on the ballot.';
  }
}

interface Props {
  /** Changes since `since` that touch this voter's ballot, oldest first. */
  changes: Change[];
  since: string;
  picks: Record<string, Choice>;
  onJump: (id: string) => void;
  onDismiss: () => void;
}

/** "Since your last visit": what the daily refresh changed on this ballot. */
export function SinceLastVisit({ changes, since, picks, onJump, onDismiss }: Props) {
  const byContest = new Map<string, Change[]>();
  for (const c of changes) byContest.set(c.id, [...(byContest.get(c.id) ?? []), c]);
  const contests = [...byContest.values()];
  return (
    <section aria-labelledby="kyb-updates" className="rounded-2xl border-2 border-[#009CDF] bg-[#1A1D24] p-4 space-y-3">
      <h2 id="kyb-updates" className="font-black text-lg">Since your last visit ({sinceLabel.format(new Date(since))})</h2>
      <ul className="space-y-3">
        {contests.slice(0, MAX_CONTESTS).map((list) => {
          const { id, what, kind } = list[0];
          const pick = picks[id];
          return (
            <li key={id} className="text-[15px] leading-relaxed text-[#E2E4E8]">
              {kind === 'contest-removed'
                ? <strong className="text-[#F5F6F7]">{what}</strong>
                : <button type="button" onClick={() => onJump(id)} className="font-bold text-[#F5F6F7] underline underline-offset-2 text-left">{what}</button>}
              <ul className="mt-1 space-y-1">
                {list.map((c, i) => {
                  const picked = c.kind === 'candidate-removed' && Array.isArray(pick) && c.ballot !== undefined && pick.includes(c.ballot);
                  return <li key={i} className={picked ? 'font-bold text-[#FFB900]' : undefined}>{line(c, picked)}</li>;
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      {contests.length > MAX_CONTESTS && <p className="text-[15px] text-[#E2E4E8]">And changes to {contests.length - MAX_CONTESTS} more contests.</p>}
      <button type="button" onClick={onDismiss} className="min-h-[44px] rounded-xl border-2 border-[#F5F6F7] px-4 font-bold text-[#F5F6F7]">Got it</button>
    </section>
  );
}
