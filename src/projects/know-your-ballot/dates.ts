// Election dates, in one place for the calendar, reminders and countdowns.
// Nov 3 dates are from the Chicago Board of Elections and Illinois law,
// checked October 12, 2026. 2027 dates: Feb 23 is the consolidated primary
// (Chicago's city election), Apr 6 the consolidated election (Chicago's
// runoffs, suburban local races); Chicago's Oct 19–26 filing period is from
// the Board's 2027 calendar as reported by WTTW and CBS Chicago.

export interface KeyDate {
  id: string;
  /** YYYY-MM-DD, Chicago time. */
  date: string;
  title: string;
  detail?: string;
  /** Only for these voters; everyone otherwise. */
  only?: 'chicago' | 'suburbs';
  /** Calendar reminder, local [start, end] as HHMM. */
  remind?: [string, string];
}

export const NOV_3: KeyDate[] = [
  { id: 'register', date: '2026-10-18', title: 'Last day to register online', detail: 'After this, register in person when you vote, with two IDs.' },
  { id: 'ward-sites', date: '2026-10-19', title: 'Early voting opens at all 50 ward sites', only: 'chicago', remind: ['0900', '1000'] },
  { id: 'mail', date: '2026-10-29', title: 'Last day to apply for a mail ballot', remind: ['0900', '0930'] },
  { id: 'last-early', date: '2026-11-02', title: 'Last day of early voting', remind: ['0900', '1000'] },
  { id: 'election', date: '2026-11-03', title: 'Election Day', detail: 'Polls open 6am–7pm.', remind: ['0600', '0700'] },
];

export const NEXT_ELECTION = '2027-02-23';

export const CITY_2027: KeyDate[] = [
  { id: 'city-filing', date: '2026-10-26', title: 'Filing deadline for mayor, clerk, treasurer and alderperson', detail: 'Then we’ll know who’s running.', only: 'chicago' },
  { id: 'city-election', date: NEXT_ELECTION, title: 'Chicago city election', detail: 'Mayor, city clerk, treasurer, all 50 alderpersons and the police district councils.', only: 'chicago' },
  { id: 'burbs-primary', date: NEXT_ELECTION, title: 'Local primaries, only where needed', only: 'suburbs' },
  { id: 'city-runoff', date: '2027-04-06', title: 'Runoffs', detail: 'For any Chicago race where no one got more than half the vote.', only: 'chicago' },
  { id: 'burbs-local', date: '2027-04-06', title: 'Local elections', detail: 'Village and city councils, school, park and library boards.', only: 'suburbs' },
];

export const forVoter = (dates: KeyDate[], chicago: boolean) =>
  dates.filter((d) => !d.only || d.only === (chicago ? 'chicago' : 'suburbs'));

const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "Tue, Nov 3" for a YYYY-MM-DD date. */
export const dayLabel = (iso: string) => short.format(new Date(`${iso}T00:00:00Z`));

// A plain .ics so the reminder lands in whatever calendar the voter uses.
// Floating local times: everyone using this is in Cook County.
export function downloadReminder(d: KeyDate, info: string) {
  const [start, end] = d.remind ?? ['0900', '1000'];
  const day = d.date.replace(/-/g, '');
  const what = d.detail ? `${d.title}. ${d.detail}` : d.title;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Frankie Labs//Know Your Ballot//EN',
    'BEGIN:VEVENT', `UID:kyb-${d.id}-${day}@frankie-labs`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${day}T${start}00`, `DTEND:${day}T${end}00`, `SUMMARY:${what}`,
    `DESCRIPTION:Bring your My Ballot notes. Info: ${info}`,
    'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', `DESCRIPTION:${what}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${d.id}.ics` });
  a.click();
  URL.revokeObjectURL(url);
}
