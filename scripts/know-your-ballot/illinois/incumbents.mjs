// Illinois: which Wikipedia article and section covers each race, for the
// seat's current holder and the candidates' endorsements (../wiki.mjs does
// the reading). Names come first from govbot's roster of sitting legislators
// (Open States' official people data), then from the article.

import { applyEndorsements, applyIncumbents, block, fetchPages, fetchText, incumbentBullets, incumbentFrom, incumbentInProse, infobox, ordinal, outgoingLine, ROSTER, sameSurname, seatsFromRoster } from '../wiki.mjs';

export const PAGES = {
  overview: '2026_Illinois_elections',
  senate: '2026_United_States_Senate_election_in_Illinois',
  governor: '2026_Illinois_gubernatorial_election',
  ag: '2026_Illinois_Attorney_General_election',
  sos: '2026_Illinois_Secretary_of_State_election',
  comptroller: '2026_Illinois_Comptroller_election',
  house: '2026_United_States_House_of_Representatives_elections_in_Illinois',
  ilsenate: '2026_Illinois_Senate_election',
  ilhouse: '2026_Illinois_House_of_Representatives_election',
  cook: '2026_Cook_County,_Illinois,_elections',
  cookboard: '2026_Cook_County_Board_of_Commissioners_election',
  cps: '2026_Chicago_Board_of_Education_election',
};

/** The 2026 statewide races: [race id, office article, overview section]. */
const STATEWIDE = [
  ['united-states-senator', 'senate', 'United States Senate'],
  ['governor-lieutenant-governor', 'governor', 'Governor and lieutenant governor'],
  ['attorney-general', 'ag', 'Attorney general'],
  ['secretary-of-state', 'sos', 'Secretary of state'],
  ['comptroller', 'comptroller', 'Comptroller'],
  ['treasurer', null, 'Treasurer'],
];
const COOK_EXEC = { 'president-of-county-board': 'President of the Cook County Board of Commissioners', 'county-clerk': 'Clerk', 'county-sheriff': 'Sheriff', 'county-treasurer': 'Treasurer', 'county-assessor': 'Assessor' };

/** Where a race's own wikitext is: { page, wt, section } (section = the anchor to link), or null. */
export function locate(race, pages) {
  const a = race.area;
  const sw = STATEWIDE.find(([id]) => id === race.id);
  if (sw) { const key = sw[1] ?? 'overview'; return pages[key] ? { page: PAGES[key], wt: pages[key], section: sw[1] ? undefined : sw[2] } : null; }
  const part = (key, title, level = 2) => { const b = pages[key] && block(pages[key], title, level); return b ? { page: PAGES[key], wt: b.text, section: b.title, lead: b.lead } : null; };
  if (a?.type === 'cd') return part('house', `District ${+a.id}`);
  if (a?.type === 'sldu') return part('ilsenate', `District ${+a.id}`);
  if (a?.type === 'sldl') return part('ilhouse', `District ${+a.id}`);
  if (COOK_EXEC[race.id]) return part('cook', COOK_EXEC[race.id]);
  if (a?.type === 'commissioner') return part('cookboard', `${ordinal(+a.id)} district`);
  if (a?.type === 'bor') { const b = part('cook', 'Cook County Board of Review'); const d = b && block(b.wt, `${ordinal(+a.id)} district`, 3); return d ? { ...b, wt: d.text } : null; }
  if (a?.type === 'mwrd') { const b = part('cook', 'Water Reclamation District Board'); const d = b && block(b.wt, /unexpired/i.test(race.office) ? 'Special election' : 'Regular election', 3); return d ? { ...b, wt: d.text } : null; }
  if (a?.type === 'school') return part('cps', `District ${a.id}`);
  if (race.id === 'president-of-the-chicago-board-of-education') return part('cps', 'Board President');
  return null;
}

/** The race's current officeholder(s), before matching against the candidates. */
export function readIncumbents(race, pages, seats) {
  const sw = STATEWIDE.find(([id]) => id === race.id);
  if (sw) {
    const [, officeKey, section] = sw;
    const office = officeKey && pages[officeKey];
    const over = pages.overview && block(pages.overview, section, 3);
    const box = office ? infobox(office) : {};
    const prose = over ? incumbentInProse(over.lead) : null;
    const name = box.name ?? prose?.name;
    if (!name) return null;
    const text = [over?.lead, office && office.split(/\n==/)[0]].filter(Boolean).join('\n');
    return [incumbentFrom(PAGES[over ? 'overview' : officeKey], name, box.party ?? prose?.party, text, over ? section : undefined)];
  }
  const a = race.area;
  const where = locate(race, pages);
  if (a?.type === 'cd') {
    if (!where) return null;
    const seat = seats[`cd:${+a.id}`];
    const box = infobox(where.wt);
    const wiki = box.name ?? incumbentInProse(where.lead)?.name;
    if (!seat && !wiki) return null;
    // The official roster names the member; the article's sentence is used only when it's about the same person.
    const agree = !wiki || !seat || sameSurname(seat.name, wiki);
    return [incumbentFrom(PAGES.house, seat?.name ?? wiki, seat?.party ?? box.party, agree ? where.lead : null, where.section, agree ? wiki : undefined)];
  }
  if (a?.type === 'sldu' || a?.type === 'sldl') {
    const key = a.type === 'sldu' ? 'ilsenate' : 'ilhouse';
    const seat = seats[`${a.type}:${+a.id}`];
    if (!pages[key]) return seat ? [{ ...seat, source: { name: 'Open States (via govbot)', url: ROSTER } }] : null;
    const wiki = where ? incumbentInProse(where.lead) : null;
    const name = seat?.name ?? wiki?.name;
    if (!name) return null;
    const agree = !wiki || !seat || sameSurname(seat.name, wiki.name);
    const out = outgoingLine(pages[key], +a.id);
    const text = agree ? [out?.text, where?.lead].filter(Boolean).join('\n') : null;
    return [incumbentFrom(PAGES[key], name, seat?.party ?? wiki?.party, text, out ? out.heading : where?.section, agree ? wiki?.name : undefined)];
  }
  if (!where) {
    let m = race.office.match(/\(Vacancy of (.+)\)$/);
    if (m) return [{ name: `Judge ${m[1]}`, note: 'Left the bench; this election fills the vacancy.', source: { name: 'the ballot', url: '' } }];
    m = race.office.match(/\(Converted from Associate Judgeship of (.+)\)$/);
    if (m) return [{ name: `Associate Judge ${m[1]}`, note: 'An appointed associate judgeship converted into this elected seat.', source: { name: 'the ballot', url: '' } }];
    return null;
  }
  if (COOK_EXEC[race.id]) {
    const name = infobox(where.wt).name ?? incumbentBullets(where.wt)[0]?.name;
    return name ? [incumbentFrom(PAGES.cook, name, infobox(where.wt).party ?? incumbentInProse(where.lead)?.party, where.lead, where.section)] : null;
  }
  if (a?.type === 'commissioner') {
    const who = incumbentInProse(where.lead) ?? { name: incumbentBullets(where.wt)[0]?.name };
    return who.name ? [incumbentFrom(PAGES.cookboard, who.name, who.party, where.lead, where.section)] : null;
  }
  if (a?.type === 'bor' || a?.type === 'mwrd') {
    const names = incumbentBullets(where.wt).map((b) => b.name);
    return names.length ? names.map((n) => incumbentFrom(PAGES.cook, n, undefined, where.wt, where.section)) : null;
  }
  if (a?.type === 'school') {
    const names = incumbentBullets(where.wt, /^incumbent board member/i).map((b) => b.name);
    return names.length ? names.map((n) => incumbentFrom(PAGES.cps, n, undefined, null, where.section)) : null;
  }
  return null;
}

/** Read the articles once; attach incumbents and endorsements. Fail-soft: a page that can't be read keeps yesterday's. */
export async function addWiki(races, { prev = null, fetchPage = fetchText, pause = 800 } = {}) {
  const { pages, log } = await fetchPages(PAGES, { fetchPage, pause });
  let seats = {};
  try { seats = seatsFromRoster(JSON.parse(await fetchPage(ROSTER)), 'IL'); } catch (e) { log.push(`roster: ${e.message}`); }
  const incumbents = applyIncumbents(races, (r) => readIncumbents(r, pages, seats), prev);
  const endorsements = applyEndorsements(races, (r) => locate(r, pages), prev);
  return { incumbents, endorsements, log: [...log, ...incumbents.log, ...endorsements.log] };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const file = new URL('../../../src/projects/know-your-ballot/data/illinois/ballot.json', import.meta.url);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const r = await addWiki(data.races, { prev: data });
  console.log(`Incumbents: ${r.incumbents.found} races read, ${r.incumbents.kept} kept, ${r.incumbents.running} on their ballot, ${r.incumbents.noted} with a note; endorsements: ${r.endorsements.withList} candidates`);
  for (const l of r.log) console.log('  ' + l);
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}
