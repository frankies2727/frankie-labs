// Michigan: which Wikipedia article and section covers each race, for the
// seat's current holder and the candidates' endorsements (../wiki.mjs does
// the reading). Legislators' names come from govbot's roster first.

import { applyEndorsements, applyIncumbents, block, fetchPages, fetchText, incumbentBullets, incumbentFrom, incumbentInProse, infobox, outgoingLine, ROSTER, sameSurname, seatsFromRoster } from '../wiki.mjs';

export const PAGES = {
  overview: '2026_Michigan_elections',
  senate: '2026_United_States_Senate_election_in_Michigan',
  governor: '2026_Michigan_gubernatorial_election',
  ag: '2026_Michigan_Attorney_General_election',
  sos: '2026_Michigan_Secretary_of_State_election',
  house: '2026_United_States_House_of_Representatives_elections_in_Michigan',
  misenate: '2026_Michigan_Senate_election',
  mihouse: '2026_Michigan_House_of_Representatives_election',
  supreme: '2026_Michigan_Supreme_Court_election',
  sbe: '2026_Michigan_State_Board_of_Education_election',
  um: '2026_University_of_Michigan_Board_of_Regents_election',
  msu: '2026_Michigan_State_University_Board_of_Trustees_election',
  wsu: '2026_Wayne_State_University_Board_of_Governors_election',
};

/** The statewide races: [race id, office article, overview section]. */
const STATEWIDE = [
  ['united-states-senator', 'senate', 'United States Senate'],
  ['governor-and-lieutenant-governor', 'governor', 'Governor and lieutenant governor'],
  ['secretary-of-state', 'sos', 'Secretary of state'],
  ['attorney-general', 'ag', 'Attorney general'],
];
// Multi-seat statewide boards: the article lists "Name, incumbent justice/regent/…" under each party's nominees.
const BOARDS = {
  'justice-of-the-supreme-court': 'supreme', 'member-of-the-state-board-of-education': 'sbe',
  'regent-of-the-university-of-michigan': 'um', 'trustee-of-michigan-state-university': 'msu', 'governor-of-wayne-state-university': 'wsu',
};

export function locate(race, pages) {
  const a = race.area;
  const sw = STATEWIDE.find(([id]) => id === race.id);
  if (sw) return pages[sw[1]] ? { page: PAGES[sw[1]], wt: pages[sw[1]] } : null;
  if (BOARDS[race.id]) { const k = BOARDS[race.id]; return pages[k] ? { page: PAGES[k], wt: pages[k] } : null; }
  const part = (key, title) => { const b = pages[key] && block(pages[key], title); return b ? { page: PAGES[key], wt: b.text, section: b.title, lead: b.lead } : null; };
  if (a?.type === 'cd') return part('house', `District ${+a.id}`);
  if (a?.type === 'sldu') return part('misenate', `District ${+a.id}`);
  if (a?.type === 'sldl') return part('mihouse', `District ${+a.id}`);
  return null;
}

export function readIncumbents(race, pages, seats) {
  const sw = STATEWIDE.find(([id]) => id === race.id);
  if (sw) {
    const [, key, section] = sw;
    const office = pages[key];
    const over = pages.overview && block(pages.overview, section, 3);
    const box = office ? infobox(office) : {};
    const prose = over ? incumbentInProse(over.lead) : null;
    const name = box.name ?? prose?.name;
    if (!name) return null;
    const text = [over?.lead, office && office.split(/\n==/)[0]].filter(Boolean).join('\n');
    return [incumbentFrom(PAGES[over ? 'overview' : key], name, box.party ?? prose?.party, text, over ? section : undefined)];
  }
  if (BOARDS[race.id]) {
    const wt = pages[BOARDS[race.id]];
    if (!wt) return null;
    return incumbentBullets(wt).map((b) => {
      const inc = incumbentFrom(PAGES[BOARDS[race.id]], b.name, undefined, null, b.heading);
      // What happened to an incumbent is the heading they're listed under (the article's prose is lists, not sentences).
      inc.note = (/eliminated/i.test(b.heading) ? 'Lost the party’s nomination at its convention.' : /withdr/i.test(b.heading) ? 'Withdrew.' : /declined/i.test(b.heading) ? 'Declined to run.' : undefined);
      return inc;
    });
  }
  const a = race.area;
  const where = locate(race, pages);
  if (a?.type === 'cd') {
    if (!where) return null;
    const seat = seats[`cd:${+a.id}`];
    const box = infobox(where.wt);
    const wiki = box.name ?? incumbentInProse(where.lead)?.name;
    if (!seat && !wiki) return null;
    const agree = !wiki || !seat || sameSurname(seat.name, wiki);
    return [incumbentFrom(PAGES.house, seat?.name ?? wiki, seat?.party ?? box.party, agree ? where.lead : null, where.section, agree ? wiki : undefined)];
  }
  if (a?.type === 'sldu' || a?.type === 'sldl') {
    const key = a.type === 'sldu' ? 'misenate' : 'mihouse';
    const seat = seats[`${a.type}:${+a.id}`];
    if (!pages[key]) return seat ? [{ ...seat, source: { name: 'Open States (via govbot)', url: ROSTER } }] : null;
    const wiki = where ? incumbentInProse(where.lead) : null;
    const name = seat?.name ?? wiki?.name;
    if (!name) return null;
    const agree = !wiki || !seat || sameSurname(seat.name, wiki.name);
    const out = outgoingLine(pages[key], +a.id);
    const inc = incumbentFrom(PAGES[key], name, seat?.party ?? wiki?.party, agree ? [out?.text, where?.lead].filter(Boolean).join('\n') : null, out ? out.heading : where?.section, agree ? wiki?.name : undefined);
    // The Senate article lists term-limited members under that heading without saying so in each line.
    if (!inc.note && out && agree) inc.note = /term.limit/i.test(out.heading) ? 'Term-limited.' : /retir/i.test(out.heading) ? 'Retiring.' : undefined;
    return [inc];
  }
  return null;
}

export async function addWiki(races, { prev = null, fetchPage = fetchText, pause = 800 } = {}) {
  const { pages, log } = await fetchPages(PAGES, { fetchPage, pause });
  let seats = {};
  try { seats = seatsFromRoster(JSON.parse(await fetchPage(ROSTER)), 'MI'); } catch (e) { log.push(`roster: ${e.message}`); }
  const incumbents = applyIncumbents(races, (r) => readIncumbents(r, pages, seats), prev);
  const endorsements = applyEndorsements(races, (r) => locate(r, pages), prev);
  return { incumbents, endorsements, log: [...log, ...incumbents.log, ...endorsements.log] };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const file = new URL('../../../src/projects/know-your-ballot/data/michigan/ballot.json', import.meta.url);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const r = await addWiki(data.races, { prev: data });
  console.log(`Incumbents: ${r.incumbents.found} races read, ${r.incumbents.kept} kept, ${r.incumbents.running} on their ballot, ${r.incumbents.noted} with a note; endorsements: ${r.endorsements.withList} candidates`);
  for (const l of r.log) console.log('  ' + l);
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}
