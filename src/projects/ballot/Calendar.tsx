import { CalendarPlus } from 'lucide-react';
import { CITY_2027, dayLabel, downloadReminder, forVoter, NEXT_ELECTION, NOV_3, type KeyDate } from './dates';
import { daysUntil, useNow } from './store';

const when = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);

function Group({ title, dates, now, info }: { title: string; dates: KeyDate[]; now: Date; info: string }) {
  // Past dates drop off, so the list is always "what's next".
  const ahead = dates.filter((d) => daysUntil(d.date, now) >= 0);
  if (!ahead.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-black text-[#F5F6F7]">{title}</h3>
      <ul className="rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] divide-y divide-[#262B34]">
        {ahead.map((d) => {
          const days = daysUntil(d.date, now);
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-20 shrink-0">
                <p className="font-black text-[#F5F6F7] leading-tight">{dayLabel(d.date).replace(/^\w+, /, '')}</p>
                <p className={`text-sm font-bold ${days <= 1 ? 'text-[#FFB900]' : 'text-[#E2E4E8]'}`}>{when(days)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#F5F6F7] leading-snug">{d.title}</p>
                {d.detail && <p className="text-sm text-[#E2E4E8]">{d.detail}</p>}
              </div>
              <button type="button" onClick={() => downloadReminder(d, info)} aria-label={`Add to calendar: ${d.title}, ${dayLabel(d.date)}`}
                className="shrink-0 w-11 h-11 rounded-xl border-2 border-[#2E343F] flex items-center justify-center text-[#F5F6F7] hover:border-[#F5F6F7]">
                <CalendarPlus className="w-5 h-5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** What's coming up, for this voter: Nov 3 first, then 2027. */
export function KeyDates({ chicago, info }: { chicago: boolean; info: string }) {
  const now = useNow();
  return (
    <section aria-labelledby="kyb-dates" className="space-y-4">
      <h2 id="kyb-dates" className="text-2xl font-black">Key dates</h2>
      <Group title="Nov 3, 2026 election" dates={forVoter(NOV_3, chicago)} now={now} info={info} />
      <Group title={chicago ? 'Coming up: Chicago’s 2027 city election' : 'Coming up: 2027 local elections'} dates={forVoter(CITY_2027, chicago)} now={now} info={info} />
    </section>
  );
}

const NEXT_UP = {
  chicago: 'Chicago elects its mayor, all 50 alderpersons and the police district councils.',
  suburbs: 'Local primaries where needed, then village, school and park boards on Apr 6.',
  either: 'Chicago elects its mayor, alderpersons and police district councils; suburban village, school and park boards follow on Apr 6.',
};

/** A quiet heads-up about the next election, counting down by the day. No address yet: `chicago` unset. */
export function NextElectionNote({ chicago }: { chicago?: boolean }) {
  const days = daysUntil(NEXT_ELECTION, useNow());
  if (days < 0) return null;
  return (
    <aside aria-label="Next election" className="flex items-center gap-4 rounded-2xl border-2 border-[#2E343F] bg-[#1A1D24] px-4 py-3">
      <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-[#E2E4E8]">
        <strong className="text-[#F5F6F7]">Get ready for Feb 23, 2027 too!</strong>{' '}
        {NEXT_UP[chicago === undefined ? 'either' : chicago ? 'chicago' : 'suburbs']}{' '}
        We’ll be here with everything nice and tidy for you.
      </p>
      <p className="shrink-0 text-center text-[#F5F6F7]">
        <span className="block text-2xl font-black leading-none">{days}</span>
        <span className="text-sm font-bold">day{days === 1 ? '' : 's'}</span>
      </p>
    </aside>
  );
}
