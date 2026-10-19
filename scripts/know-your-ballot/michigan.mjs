#!/usr/bin/env node
// Know Your Ballot: Michigan — data build.
//
// Pulls everything from key-free sources and writes static JSON the site
// reads (no server, no API keys in the browser):
//   1. Ballotpedia's race pages                 -> every statewide, congressional,
//      and Wikipedia's (university boards)         legislative and Court of Appeals
//                                                  contest on the Nov 3, 2026 ballot
//   2. Each candidate's Ballotpedia profile     -> photo, campaign site, social accounts
//   3. FEC bulk "all candidates" summary        -> money for federal candidates
//   4. Census TIGERweb                          -> district and county maps,
//                                                  the state outline for the hero
//   5. The certified statewide proposals (michigan/proposals.mjs)
//
// Needs `unzip`, `curl`, ImageMagick and OpenCV for Python (see face-check.py) on PATH. Run by .github/workflows/know-your-ballot-michigan.yml;
// locally: `node scripts/know-your-ballot/michigan.mjs`.

import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { changeLog } from './illinois/changes.mjs';
import { addFederalMoney, parseWeball } from './illinois/fec.mjs';
import { fetchPage, parseAppellate, parseHouseLists, parsePartisanTable, parseVoteboxes } from './michigan/ballotpedia.mjs';
import { buildDistricts, buildOutline } from './michigan/districts.mjs';
import { addProfiles } from './ballotpedia-profiles.mjs';
import { recentNews } from './news.mjs';
import { recentBills } from './illinois/govbot.mjs';
import { addStateMoney, fetchExports, MITN_EXPORTS } from './michigan/mitn.mjs';
import { keepMoneyForward } from './money-forward.mjs';
import { addHeadshots } from './headshots.mjs';
import { addPhotos } from './illinois/photos.mjs';
import { addSocial } from './illinois/social.mjs';
import { PROPOSALS, PROPOSALS_SOURCE } from './michigan/proposals.mjs';
import { boardCandidates } from './michigan/wikipedia.mjs';
import { addWiki } from './michigan/incumbents.mjs';
import { countiesFromLayers } from './michigan/counties.mjs';
import { addRecords } from './illinois/record.mjs';

const OUT = 'src/projects/know-your-ballot/data/michigan';
const PHOTOS_DIR = 'public/kyb-photos/michigan';
const FEC_WEBALL = 'https://www.fec.gov/files/bulk-downloads/2026/weball26.zip';
const ELECTION = { name: 'General Election', date: '2026-11-03' };

// Counties in each Court of Appeals election district (MCL 600.302).
const COA = {
  1: ['Branch', 'Hillsdale', 'Kalamazoo', 'Lenawee', 'Monroe', 'St. Joseph', 'Wayne'],
  2: ['Genesee', 'Macomb', 'Oakland'],
  3: ['Allegan', 'Barry', 'Berrien', 'Calhoun', 'Cass', 'Eaton', 'Ionia', 'Jackson', 'Kent', 'Mason', 'Montcalm', 'Muskegon', 'Newaygo', 'Oceana', 'Ottawa', 'Van Buren', 'Washtenaw'],
};
const coaOf = (county) => Object.entries(COA).find(([, list]) => list.includes(county))?.[0] ?? '4';

// Ballotpedia pages, and the office wording Michigan's ballot uses.
const STATEWIDE = [
  ['Michigan_gubernatorial_election,_2026', 'Governor of Michigan', 'Governor and Lieutenant Governor', 'state'],
  ['Michigan_Secretary_of_State_election,_2026', 'Michigan Secretary of State', 'Secretary of State', 'state'],
  ['Michigan_Attorney_General_election,_2026', 'Attorney General of Michigan', 'Attorney General', 'state'],
  ['United_States_Senate_election_in_Michigan,_2026', 'U.S. Senate Michigan', 'United States Senator', 'federal'],
  ['Michigan_State_Board_of_Education_election,_2026', 'Michigan State Board of Education', 'Member of the State Board of Education', 'education'],
  ['Michigan_Supreme_Court_elections,_2026', 'Michigan Supreme Court', 'Justice of the Supreme Court', 'judicial'],
];
const BOARDS = [
  ['2026_University_of_Michigan_Board_of_Regents_election', 'Regent of the University of Michigan'],
  ['2026_Michigan_State_University_Board_of_Trustees_election', 'Trustee of Michigan State University'],
  ['2026_Wayne_State_University_Board_of_Governors_election', 'Governor of Wayne State University'],
];
// Lieutenant governor running mates, which the candidate boxes leave out
// (en.wikipedia.org/wiki/2026_Michigan_gubernatorial_election, checked
// Oct 15, 2026). Tickets can't change once the ballot is certified.
const RUNNING_MATES = {
  'Jocelyn Benson': 'Winnie Brinks', 'John James': 'Jay DeBoyer', 'Anthony Hudson': 'Beau Parmenter',
  'Donna Brandenburg': 'Robert Donald Cowper II', 'Douglas Campbell': 'Bobbie Clay',
};
const US_HOUSE = 'United_States_House_of_Representatives_elections_in_Michigan,_2026';
const STATE_SENATE = 'Michigan_State_Senate_elections,_2026';
const STATE_HOUSE = 'Michigan_House_of_Representatives_elections,_2026';
const APPEALS = 'Michigan_intermediate_appellate_court_elections,_2026';

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Michigan ballots don't number candidates: `ballot` only identifies picks.
// Major parties first, as the ballot lists them, then the rest alphabetically.
const PARTY_ORDER = ['Democratic', 'Republican', 'Libertarian', 'U.S. Taxpayers', 'Green', 'Natural Law', 'Working Class', 'Independent', 'Nonpartisan'];
const order = (c) => { const i = PARTY_ORDER.indexOf(c.nominatedBy ?? c.party); return i < 0 ? PARTY_ORDER.length : i; };
function race({ id, office, section, area = null, seats = 1, candidates, source }) {
  const list = [...candidates].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    .map((c, i) => ({ ballot: i + 1, name: c.name, party: c.party, ...(c.nominatedBy ? { nominatedBy: c.nominatedBy } : {}), ...(c.incumbent ? { incumbent: true } : {}), ...(c.profile ? { profile: c.profile } : {}) }));
  return { id: slug(id), office, section, area, voteFor: seats, candidates: list, writeIn: true, numbered: false, source };
}

async function download(url, file) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
}

/** Every race and its candidates, read from Ballotpedia and Wikipedia today. */
async function gatherRaces() {
  const races = [];
  const pages = {};

  // Statewide races, one page each.
  for (const [title, header, office, section] of STATEWIDE) {
    const page = await fetchPage(title);
    pages[office] = page.url;
    const box = parseVoteboxes(page.html).find((b) => b.office === header);
    if (!box) throw new Error(`${title}: no "General election for ${header}" box`);
    if (box.candidates.length < 2) throw new Error(`${title}: only ${box.candidates.length} candidates`);
    const seats = box.seats;
    const candidates = office === 'Governor and Lieutenant Governor'
      ? box.candidates.map((c) => (RUNNING_MATES[c.name] ? { ...c, name: `${c.name} & ${RUNNING_MATES[c.name]}` } : c))
      : box.candidates;
    races.push(race({ id: office, office: seats > 1 ? `${office} (${seats} seats)` : office, section, seats, candidates, source: page.url }));
    console.log(`${office}: ${box.candidates.length} candidates`);
  }
  // University boards, from Wikipedia.
  for (const [article, office] of BOARDS) {
    const { url, candidates } = await boardCandidates(article);
    pages[office] = url;
    races.push(race({ id: office, office: `${office} (2 seats)`, section: 'education', seats: 2, candidates, source: url }));
    console.log(`${office}: ${candidates.length} candidates`);
  }
  // U.S. House, state Senate, state House: one page per chamber.
  const house = await fetchPage(US_HOUSE);
  for (const { district, candidates } of parseHouseLists(house.html)) {
    races.push(race({ id: `cd-${district}`, office: `Representative in Congress, ${ordinal(+district)} District`, section: 'federal', area: { type: 'cd', id: district }, candidates, source: house.url }));
  }
  const senate = await fetchPage(STATE_SENATE);
  for (const { district, candidates } of parsePartisanTable(senate.html)) {
    races.push(race({ id: `sldu-${district}`, office: `State Senator, ${ordinal(+district)} District`, section: 'legislature', area: { type: 'sldu', id: district }, candidates, source: senate.url }));
  }
  const stateHouse = await fetchPage(STATE_HOUSE);
  for (const { district, candidates } of parsePartisanTable(stateHouse.html)) {
    races.push(race({ id: `sldl-${district}`, office: `Representative in State Legislature, ${ordinal(+district)} District`, section: 'legislature', area: { type: 'sldl', id: district }, candidates, source: stateHouse.url }));
  }
  const appeals = await fetchPage(APPEALS);
  for (const { district, seats, candidates } of parseAppellate(appeals.html)) {
    const term = seats === 1 && candidates.length === 1 && /Lievense/.test(candidates[0].name) ? ', partial term' : '';
    races.push(race({ id: `coa-${district}-${seats}`, office: `Judge of the Court of Appeals, ${ordinal(+district)} District${term} (${seats} seat${seats === 1 ? '' : 's'})`, section: 'judicial', area: { type: 'coa', id: district }, seats, candidates, source: appeals.url }));
  }
  const counts = { cd: 13, sldu: 38, sldl: 110 };
  for (const [type, n] of Object.entries(counts)) {
    const have = races.filter((r) => r.area?.type === type).length;
    if (have !== n) throw new Error(`${type}: expected ${n} races, parsed ${have} — refusing to overwrite`);
  }
  console.log(`${races.length} races`);
  return { races, pages };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'ballot-mi-'));
  let prev = null;
  try { prev = JSON.parse(readFileSync(join(OUT, 'ballot.json'), 'utf8')); } catch { /* first build */ }

  // Candidates. Ballotpedia blocks some addresses outright; rather than lose
  // the day, a refresh it turns away keeps yesterday's candidates and still
  // updates money, profiles, photos, maps, news and bills.
  let races, pages;
  let asOf = new Date().toISOString().slice(0, 10);
  try {
    ({ races, pages } = await gatherRaces());
  } catch (e) {
    if (!prev?.races?.length) throw e;
    console.warn(`Candidates: ${e.message}; keeping yesterday's ${prev.races.length} races`);
    ({ races, sources: { candidates: { pages, asOf } } } = structuredClone(prev));
  }

  // Federal money.
  await download(FEC_WEBALL, join(work, 'weball.zip'));
  execFileSync('unzip', ['-o', '-q', join(work, 'weball.zip'), '-d', work]);
  const money = addFederalMoney(races, parseWeball(readFileSync(join(work, 'weball26.txt'), 'utf8')), 'MI');
  console.log(`FEC: matched ${money.matched}/${money.total} federal candidates`);
  // State and local money from MiTN's exports; if they can't be read today, each candidate keeps yesterday's figures.
  try {
    const mitn = join(work, 'mitn');
    mkdirSync(mitn, { recursive: true });
    await fetchExports(mitn);
    const state = await addStateMoney(races, mitn);
    console.log(`MiTN: matched ${state.matched}/${state.total} state & local candidates (${state.committees} candidate committees)`);
    for (const line of state.log) console.log('  ' + line);
  } catch (e) {
    console.warn(`MiTN: ${e.message}; keeping the last figures`);
  }
  console.log(`Money: ${keepMoneyForward(races, prev)} candidates kept yesterday's later figures`);

  // Photos, websites and social accounts: each candidate's Ballotpedia
  // profile first; then the official sources (Congress portraits, the
  // Legislature's member photos, Wikidata and Wikimedia Commons, campaign
  // sites), which win where they overlap; then, for anyone still without a
  // photo, the headshot on their own campaign site.
  const profiles = await addProfiles(races, { dir: PHOTOS_DIR, publicPath: 'kyb-photos/michigan', prev, state: 'Michigan' });
  console.log(`Profiles: ${profiles.withProfile}/${profiles.total} candidates; photos ${profiles.withPhoto}, social ${profiles.withSocial}`);
  for (const line of profiles.log) console.log('  ' + line);
  const social = await addSocial(races, work, null, prev, 'MI');
  console.log(`Social accounts: ${social.withSocial}/${social.total} candidates`);
  for (const line of social.log) console.log('  ' + line);
  const photos = await addPhotos(races, { dir: PHOTOS_DIR, publicPath: 'kyb-photos/michigan', prev, chosen: new URL('./michigan/photos-chosen.json', import.meta.url) });
  console.log(`Photos: ${photos.withPhoto}/${photos.total} candidates`);
  for (const line of photos.log) console.log('  ' + line);
  const heads = await addHeadshots(races, { dir: PHOTOS_DIR, publicPath: 'kyb-photos/michigan', prev });
  console.log(`Campaign-site headshots: ${heads.found} new, ${heads.kept} kept, of ${heads.tried} sites read`);
  for (const line of heads.log) console.log('  ' + line);

  // Maps, and the county -> Court of Appeals district table the app needs.
  const districts = await buildDistricts();
  const coa = Object.fromEntries(districts.layers.county.map((c) => [c.id, coaOf(c.id)]));
  // Which districts reach into each county, for browsing a county without an address.
  const counties = countiesFromLayers(districts.layers);
  const outline = await buildOutline();

  // Headlines for the activity feed; Google News being down keeps yesterday's.
  let news = prev?.news ?? [];
  try { news = await recentNews(['Michigan election 2026', 'Michigan governor race Benson James', 'Michigan Senate race El-Sayed Rogers', 'Michigan ballot proposal 2026', 'Michigan Supreme Court election 2026'], ['Michigan governor campaign fundraising', 'Michigan election campaign donations super PAC', 'Michigan Senate race campaign money', 'Michigan campaign finance']); } catch (e) { console.warn(`news: ${e.message}; keeping the last copy`); }
  console.log(`News: ${news.length} headlines`);

  const next = { races, retentions: [], measures: PROPOSALS.map(({ plain, ...m }) => m) };
  const changes = changeLog(prev, next, new Date().toISOString());
  console.log(`Changes since last refresh: ${changes.length - (prev?.changes?.length ?? 0)} new, ${changes.length} kept`);

  // govbot being briefly down shouldn't hold up the ballot: keep yesterday's bills.
  let laws = prev?.laws ?? [];
  try { laws = await recentBills('mi'); console.log(`govbot: ${laws.length} Lansing bills`); } catch (e) { console.warn(`govbot: ${e.message}; keeping the last copy`); }
  // Who holds each seat and whether they're running, candidates' endorsements
  // (Wikipedia's articles on the races) and sitting legislators' bills (govbot).
  const wiki = await addWiki(races, { prev });
  console.log(`Incumbents: ${wiki.incumbents.found} races read, ${wiki.incumbents.kept} kept from yesterday, ${wiki.incumbents.running} on their own ballot, ${wiki.incumbents.noted} with a note; endorsements for ${wiki.endorsements.withList} candidates`);
  for (const line of wiki.log) console.log('  ' + line);
  const rec = await addRecords(races, { state: 'mi', prev });
  console.log(`Records: ${rec.matched} candidates are sitting legislators${rec.kept ? ` (${rec.kept} kept from yesterday)` : ''}`);
  for (const line of rec.log) console.log('  ' + line);

  writeFileSync(join(OUT, 'ballot.json'), JSON.stringify({
    election: ELECTION,
    sources: {
      candidates: { pages, asOf },
      money: { url: 'https://www.fec.gov/data/', file: FEC_WEBALL },
      stateMoney: { url: MITN_EXPORTS },
      proposals: PROPOSALS_SOURCE,
    },
    races,
    retentions: [],
    measures: PROPOSALS,
    coa,
    changes,
    news,
    laws,
    counties,
  }, null, 1) + '\n');
  writeFileSync(join(OUT, 'districts.json'), JSON.stringify(districts) + '\n');
  writeFileSync(join(OUT, 'outline.json'), JSON.stringify(outline) + '\n');
  console.log(`Wrote ${races.length} races, ${PROPOSALS.length} proposals.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
