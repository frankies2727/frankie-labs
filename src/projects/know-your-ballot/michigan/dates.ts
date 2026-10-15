import type { KeyDate } from '../dates';

// Michigan's Nov 3, 2026 dates, from the Michigan Department of State's
// election calendar (michigan.gov/sos/elections/voting) and election law:
// registration closes online and by mail 15 days out, early voting runs the
// nine days from the second Saturday before to the Sunday before, absentee
// applications are due the Friday before (5pm, online or by mail) or the
// Monday before (4pm, in person), polls run 7am–8pm. Checked October 15, 2026.

export const ELECTION_DAY = '2026-11-03';

export const KEY_DATES: KeyDate[] = [
  { id: 'register', date: '2026-10-19', title: 'Last day to register online or by mail', detail: 'After this, register in person at your city or township clerk’s office, with proof of where you live, right up to 8pm on Election Day.' },
  { id: 'early-opens', date: '2026-10-24', title: 'Early voting opens', detail: 'Nine days, through Sun, Nov 1, at your community’s early voting site. Hours vary: find yours at Michigan.gov/Vote.', remind: ['0900', '1000'] },
  { id: 'absentee', date: '2026-10-30', title: 'Last day to request an absentee ballot online or by mail', detail: 'By 5pm. Apply earlier to be safe: the ballot still has to reach you and get back.', remind: ['0900', '0930'] },
  { id: 'last-early', date: '2026-11-01', title: 'Last day of early voting', remind: ['0900', '1000'] },
  { id: 'absentee-in-person', date: '2026-11-02', title: 'Last day to request an absentee ballot in person', detail: 'At your clerk’s office, by 4pm. You can fill it out and hand it in right there.' },
  { id: 'election', date: ELECTION_DAY, title: 'Election Day', detail: 'Polls open 7am–8pm. Absentee ballots must reach your clerk or a drop box by 8pm.', remind: ['0600', '0700'] },
];

export const byId = (id: string) => KEY_DATES.find((d) => d.id === id)!;
