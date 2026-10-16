import { NextUp } from '../Calendar';

// Michigan's regular election dates after Nov 3, 2026 (first Tuesday after
// the first Monday in May, August and November; Michigan election law,
// MCL 168.641): what tends to be on each.
const MAY_4 = '2027-05-04';

const DATES = [
  { date: 'Tue, May 4, 2027', what: 'School and local ballot questions (millages, bonds), where a district or community calls one.' },
  { date: 'Tue, Aug 3, 2027', what: 'Primaries for the cities that elect their council or mayor in odd years.' },
  { date: 'Tue, Nov 2, 2027', what: 'City elections in those cities, and whatever local questions are called for November.' },
];

/** A heads-up about 2027: no statewide election, but local ones for many. */
export function NextElectionNote() {
  return (
    <NextUp date={MAY_4} title="Get ready for 2027 too!" lead="No statewide election next year, but many Michigan communities vote: school and local questions in May, and city councils and mayors in August and November where cities elect in odd years.">
      <div className="space-y-3 border-t-2 border-[var(--kyb-chip)] pt-3">
        <p className="text-[15px] font-bold">Your city or township clerk sets what’s on each date. Candidates and questions show up here once they’re certified.</p>
        <ul className="space-y-3">
          {DATES.map((d) => (
            <li key={d.date} className="text-[15px] leading-relaxed">
              <p className="font-black">{d.date}</p>
              <p>{d.what}</p>
            </li>
          ))}
        </ul>
      </div>
    </NextUp>
  );
}
