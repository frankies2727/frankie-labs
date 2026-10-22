// Illinois: which Wikipedia article and section covers each race, for the
// seat's current holder and the candidates' endorsements (../wiki.mjs does
// the reading). Names come first from govbot's roster of sitting legislators
// (Open States' official people data), then from the article.

import { applyEndorsements, applyIncumbents, articleStatus, block, fetchPages, fetchText, incumbentBullets, incumbentFrom, incumbentInProse, infobox, linkTarget, ordinal, outgoingLine, primaryEntered, ROSTER, sameName, sameSurname, seatsFromRoster } from '../wiki.mjs';
import { ballotpediaPage } from '../ballotpedia-profiles.mjs';

// ---- why a judge's seat is open ---------------------------------------------------
// The Illinois Courts' official list of circuit vacancies for this election
// says why each seat opened and when ("Retired 08/31/25", "Deceased
// 11/28/24", "Elected to the Appellate Court on 12/02/24", "Appointed
// Circuit Judge 04/29/24" for an associate judgeship that became an elected
// seat). Appellate vacancies are the State Board's, not on that page; the
// one on this ballot is noted from the Supreme Court's own announcement.
const COURTS = 'https://www.illinoiscourts.gov/judicial-vacancies/circuit/';
const COURTS_NAME = 'Illinois Courts';
const APPELLATE = {
  hoffman: { note: 'Justice Thomas E. Hoffman died on July 4, 2025; the Supreme Court filled the seat by assignment until this election.', source: { name: 'Illinois Supreme Court', url: 'https://www.illinoiscourts.gov/News/1578/Illinois-Supreme-Court-assigns-Hon-Clare-J-Quish-to-the-First-District-Appellate-Court/news-detail/' } },
};
const letters = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '');
const cellText = (c) => c.replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\uFEFF/g, '').replace(/\s+/g, ' ').trim();

/** This election's Cook County vacancies from the page: [{ name, status }]. */
export function parseCourtVacancies(html) {
  const from = html.search(/Judicial Vacancies for the \d{4} Election/);
  const to = html.search(/Judicial Vacancies for the \d{4} Election(?![\s\S]*Judicial Vacancies for the \d{4} Election)/);
  const part = from >= 0 && to > from ? html.slice(from, to) : html;
  const out = [];
  for (const [tr] of part.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => cellText(m[1]));
    // "John. J. Curry, Jr." on the page: a stray full stop after a first name.
    if (cells.length >= 5 && cells[0] === 'Cook') out.push({ name: cells[3].replace(/\b([A-Za-z]{2,})\.(?=\s[A-Z]\.)/g, '$1'), status: cells[4].replace(/\s*\*?See note.*$/i, '').trim() });
  }
  return out;
}

const longDate = (d) => { const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return d; const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return new Date(`${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
/** The official status in plain words: "Retired on Aug 31, 2025." */
export function vacancyWords(status) {
  const [, what, date] = status.match(/^(.*?)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})?$/) ?? [];
  const on = date ? ` on ${longDate(date)}` : '';
  const w = (what ?? status).replace(/\s+on$/, '').trim();
  if (/^Retired$/i.test(w)) return `Retired${on}.`;
  if (/^Retiring$/i.test(w)) return `Retiring${on}.`;
  if (/^Deceased$/i.test(w)) return `Died${on}.`;
  if (/^Resigned$/i.test(w)) return `Resigned${on}.`;
  if (/^Elected to the (Appellate|Supreme) Court$/i.test(w)) return `${w}${on}, leaving this seat open.`;
  if (/^Appointed to the (Appellate|Supreme) Court$/i.test(w)) return `${w}${on}, leaving this seat open.`;
  if (/^(Appointed|Elected) Circuit Judge$/i.test(w)) return `${w.split(' ')[0]} a circuit judge${on}; the associate judgeship became this elected seat.`;
  if (/^Not Seeking Retention$/i.test(w)) return `Not seeking retention; the term ends${on}.`;
  return `${status}.`;
}

/** The vacancy row for the judge a seat is named after ("Curry, Jr.", "McLean Meyerson"); null unless exactly one row fits. */
function vacancyFor(vacated, rows) {
  const want = letters(vacated.replace(/,?\s*Jr\.?$/i, ''));
  const hits = rows.filter((r) => letters(r.name.replace(/,?\s*Jr\.?$/i, '')).endsWith(want));
  return hits.length === 1 ? hits[0] : hits.find((r) => letters(r.name.replace(/,?\s*Jr\.?$/i, '')) === want) ?? null;
}

// ---- why a legislator isn't on the ballot: Ballotpedia's lists -------------------
// Its election pages list, by name, the incumbents retiring, the ones
// defeated in a primary, and ("Did not make the ballot: Name (i)") the ones
// who filed but aren't on the November ballot.
const BP = { sldl: 'Illinois_House_of_Representatives_elections,_2026', sldu: 'Illinois_State_Senate_elections,_2026', cd: 'United_States_House_of_Representatives_elections_in_Illinois,_2026' };
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, '’').replace(/\s+/g, ' ').trim();
/** name -> { note, section } from one Ballotpedia election page. */
export function parseBallotpediaOutgoing(html) {
  const out = new Map();
  const put = (name, note, section) => { if (name && !out.has(name)) out.set(name, { note, section }); };
  for (const [, id, body] of html.matchAll(/<span class="mw-headline" id="([^"]+)"([\s\S]*?)(?=<span class="mw-headline"|$)/g)) {
    const note = /retir/i.test(id) ? 'Not seeking re-election.' : /defeated_in_primar/i.test(id) ? 'Lost the primary.' : /did_not_advance/i.test(id) ? 'Did not advance to the general election.' : null;
    if (!note) continue;
    const table = body.match(/<table[\s\S]*?<\/table>/)?.[0] ?? '';
    for (const [tr] of table.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
      if (cells.length >= 2 && cells[0] !== 'Name') put(cells[0], note, id);
    }
  }
  for (const [, blockHtml] of html.matchAll(/Did not make the ballot:([\s\S]*?)<\/p>/g)) {
    for (const [, name] of blockHtml.matchAll(/<a [^>]*>([^<]+)<\/a>[^<]*\(i\)/g)) put(text(name), 'Filed, but is not on the November ballot.', undefined);
  }
  return out;
}

const WIKI_RAW = 'https://en.wikipedia.org/w/index.php?action=raw&title=';
/**
 * For an incumbent who isn't on this ballot and has no reason yet: their own
 * Wikipedia article's sentence about this year, else Ballotpedia's lists.
 */
async function fillReasons(races, pages, { fetchPage, log }) {
  const lists = {};
  for (const r of races) {
    for (const inc of r.incumbents ?? []) {
      if (inc.ballot || inc.note) continue;
      const where = locate(r, pages);
      const target = where && linkTarget(where.wt, inc.name);
      if (target) {
        try {
          const note = articleStatus(await fetchPage(`${WIKI_RAW}${encodeURIComponent(target)}`), inc.name, 2026);
          if (note) { Object.assign(inc, { note, source: { name: `Wikipedia: ${target.replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(target.replace(/ /g, '_'))}` } }); continue; }
        } catch (e) { log.push(`${target}: ${e.message}`); }
      }
      const page = BP[r.area?.type];
      if (!page) continue;
      if (!lists[page]) {
        try { lists[page] = parseBallotpediaOutgoing(await ballotpediaPage(`https://ballotpedia.org/${page}`)); } catch (e) { lists[page] = new Map(); log.push(`Ballotpedia ${page}: ${e.message}`); }
      }
      const hit = [...lists[page]].find(([n]) => sameName(n, inc.name));
      if (hit) Object.assign(inc, { note: hit[1].note, source: { name: 'Ballotpedia', url: `https://ballotpedia.org/${page}${hit[1].section ? `#${hit[1].section}` : ''}` } });
    }
  }
  // Last resort, when no source has said it in words: the article lists them
  // as a candidate in a party's primary and the ballot's nominee for that
  // party is someone else. Only what both show is said.
  for (const r of races) {
    for (const inc of r.incumbents ?? []) {
      if (inc.ballot || inc.note) continue;
      const where = locate(r, pages);
      const party = where && primaryEntered(where.wt, inc.name);
      const nominee = party && r.candidates.find((c) => c.party?.toLowerCase().startsWith(party.toLowerCase()) && !sameName(c.name, inc.name));
      if (nominee) inc.note = `Ran in the ${party} primary; ${nominee.name} is the party’s nominee on this ballot.`;
    }
  }
}

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
export function readIncumbents(race, pages, seats, courts = []) {
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
    return [incumbentFrom(PAGES[over ? 'overview' : officeKey], name, box.party ?? prose?.party, text, over ? section : undefined, undefined, office ?? over?.text)];
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
    return [incumbentFrom(PAGES.house, seat?.name ?? wiki, seat?.party ?? box.party, agree ? where.lead : null, where.section, agree ? wiki : undefined, agree ? where.wt : null)];
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
    return [incumbentFrom(PAGES[key], name, seat?.party ?? wiki?.party, text, out ? out.heading : where?.section, agree ? wiki?.name : undefined, agree ? where?.wt : null)];
  }
  if (!where) {
    let m = race.office.match(/\(Vacancy of (.+)\)$/);
    if (m) {
      const row = vacancyFor(m[1], courts);
      if (row) return [{ name: `Judge ${row.name}`, note: vacancyWords(row.status), source: { name: COURTS_NAME, url: COURTS } }];
      const app = /Appellate/.test(race.office) && APPELLATE[letters(m[1])];
      if (app) return [{ name: `Justice ${m[1]}`, ...app }];
      return [{ name: `Judge ${m[1]}`, note: 'Left the bench; this election fills the vacancy.', source: { name: 'the ballot', url: '' } }];
    }
    m = race.office.match(/\(Converted from Associate Judgeship of (.+)\)$/);
    if (m) {
      const row = vacancyFor(m[1], courts);
      return [row
        ? { name: `Associate Judge ${row.name}`, note: vacancyWords(row.status), source: { name: COURTS_NAME, url: COURTS } }
        : { name: `Associate Judge ${m[1]}`, note: 'An appointed associate judgeship converted into this elected seat.', source: { name: 'the ballot', url: '' } }];
    }
    return null;
  }
  if (COOK_EXEC[race.id]) {
    const name = infobox(where.wt).name ?? incumbentBullets(where.wt)[0]?.name;
    return name ? [incumbentFrom(PAGES.cook, name, infobox(where.wt).party ?? incumbentInProse(where.lead)?.party, where.lead, where.section, undefined, where.wt)] : null;
  }
  if (a?.type === 'commissioner') {
    const who = incumbentInProse(where.lead) ?? { name: incumbentBullets(where.wt)[0]?.name };
    return who.name ? [incumbentFrom(PAGES.cookboard, who.name, who.party, where.lead, where.section, undefined, where.wt)] : null;
  }
  if (a?.type === 'bor' || a?.type === 'mwrd') {
    const names = incumbentBullets(where.wt).map((b) => b.name);
    return names.length ? names.map((n) => incumbentFrom(PAGES.cook, n, undefined, where.wt, where.section, undefined, where.wt)) : null;
  }
  if (a?.type === 'school') {
    const names = incumbentBullets(where.wt, /^incumbent board member/i).map((b) => b.name);
    return names.length ? names.map((n) => incumbentFrom(PAGES.cps, n, undefined, null, where.section, undefined, where.wt)) : null;
  }
  return null;
}

/** Read the articles once; attach incumbents and endorsements. Fail-soft: a page that can't be read keeps yesterday's. */
export async function addWiki(races, { prev = null, fetchPage = fetchText, pause = 800 } = {}) {
  const { pages, log } = await fetchPages(PAGES, { fetchPage, pause });
  let seats = {};
  try { seats = seatsFromRoster(JSON.parse(await fetchPage(ROSTER)), 'IL'); } catch (e) { log.push(`roster: ${e.message}`); }
  let courts = [];
  try { courts = parseCourtVacancies(await fetchPage(COURTS)); if (courts.length < 10) throw new Error(`only ${courts.length} Cook rows`); } catch (e) { courts = []; log.push(`Illinois Courts vacancies: ${e.message}; judges keep the last note`); }
  const incumbents = applyIncumbents(races, (r) => readIncumbents(r, pages, seats, courts), prev);
  // An official reason beats a generic one kept from yesterday's build.
  await fillReasons(races, pages, { fetchPage, log });
  incumbents.running = 0; incumbents.noted = 0;
  for (const r of races) for (const i of r.incumbents ?? []) { if (i.ballot) incumbents.running += 1; else if (i.note) incumbents.noted += 1; }
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
