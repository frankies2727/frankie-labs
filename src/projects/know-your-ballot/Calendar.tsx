import { CalendarPlus } from 'lucide-react';
import { CITY_2027, dayLabel, downloadReminder, forVoter, NOV_3, type KeyDate } from './dates';
import { daysUntil, useNow } from './store';

const when = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);

export function Group({ title, dates, now, info }: { title: string; dates: KeyDate[]; now: Date; info: string }) {
  // Past dates drop off, so the list is always "what's next".
  const ahead = dates.filter((d) => daysUntil(d.date, now) >= 0);
  if (!ahead.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-black text-[var(--gb-text)]">{title}</h3>
      <ul className="rounded-2xl border-2 border-[var(--gb-border)] bg-[var(--gb-surface)] divide-y divide-[var(--kyb-chip)]">
        {ahead.map((d) => {
          const days = daysUntil(d.date, now);
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-20 shrink-0">
                <p className="font-black text-[var(--gb-text)] leading-tight">{dayLabel(d.date).replace(/^\w+, /, '')}</p>
                <p className={`text-sm font-bold ${days <= 1 ? 'text-[var(--gb-amber-hi)]' : 'text-[var(--gb-text)]'}`}>{when(days)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--gb-text)] leading-snug">{d.title}</p>
                {d.detail && <p className="text-sm text-[var(--gb-text)]">{d.detail}</p>}
              </div>
              <button type="button" onClick={() => downloadReminder(d, info)} aria-label={`Add to calendar: ${d.title}, ${dayLabel(d.date)}`}
                className="shrink-0 w-11 h-11 rounded-xl border-2 border-[var(--gb-border)] flex items-center justify-center text-[var(--gb-text)] hover:border-[var(--gb-text)]">
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
