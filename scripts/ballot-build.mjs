#!/usr/bin/env node
// Know Your Ballot — data build.
//
// Pulls everything from official, key-free sources and writes static JSON the
// site reads (no server, no API keys in the browser):
//   1. Chicago Board of Elections candidate list (PDF, every contest on any
//      Chicago ballot, in ballot order)          -> races, retentions, referenda
//   2. FEC bulk "all candidates" summary          -> money for federal candidates
//   3. District maps (Census TIGERweb, Cook County, City of Chicago)
//                                                 -> address -> your contests
//   4. Injustice Watch's judicial guide          -> judges' bar ratings and profiles
//   5. Chicago community areas, Census places    -> the neighborhoods a district covers
//
// Needs `pdftotext` (poppler-utils) and `unzip` on PATH. Run by
// .github/workflows/ballot-refresh.yml; locally: `node scripts/ballot-build.mjs`.
// CANDIDATE_PDF=<url or path> skips the page lookup (handy if the Board's site
// is blocking automated requests).

import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeLog } from './ballot/changes.mjs';
import { govbotSlices } from './ballot/govbot.mjs';
import { addJudges } from './ballot/judges.mjs';
import { addSocial } from './ballot/social.mjs';
import { parseCandidateList } from './ballot/candidates.mjs';
import { parseWeball, addFederalMoney } from './ballot/fec.mjs';
import { ISBE_BASE, ISBE_FILES, addStateMoney } from './ballot/isbe.mjs';
import { addStateList, fetchCertifiedList } from './ballot/statewide.mjs';
import { buildDistricts, buildStateDistricts, placesIn, touchesCook } from './ballot/districts.mjs';

const OUT = 'src/projects/ballot/data';
const CANDIDATES_PAGE = 'https://chicagoelections.gov/getting-ballot/candidates';
const EARLY_VOTING_PAGE = 'https://chicagoelections.gov/voting/early-votingvote-centers';
const FEC_WEBALL = 'https://www.fec.gov/files/bulk-downloads/2026/weball26.zip';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const work = mkdtempSync(join(tmpdir(), 'ballot-'));

// Streams to disk: some state disclosure files run to 150 MB.
async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  return file;
}

// The Board's pages sit behind a bot check that sometimes turns away plain
// requests; a real browser gets through. One browser is shared for the run.
let browser = null;
// `looksRight` tells a real page from a bot-check interstitial.
async function fetchPage(url, looksRight) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const html = await res.text();
      if (looksRight(html)) return html;
    }
  } catch { /* fall through to the browser */ }
  if (!browser) browser = await (await import('playwright')).chromium.launch();
  const page = await browser.newPage({ userAgent: UA });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // The bot check resolves itself after a few seconds, then reloads.
    for (let waited = 0; waited < 30_000; waited += 1_000) {
      const html = await page.content().catch(() => '');
      if (looksRight(html)) return html;
      await page.waitForTimeout(1_000);
    }
    throw new Error(`${url} never got past the bot check`);
  } finally {
    await page.close();
  }
}

// The candidate-list PDF gets a new URL every time the Board updates it, so
// read the current link off the candidates page.
async function findCandidatePdf() {
  if (process.env.CANDIDATE_PDF) return process.env.CANDIDATE_PDF;
  // The page's HTML spells the space in the file name literally.
  const link = /https:\/\/[^"']+Candidate(?:%20| )List[^"']+\.pdf/i;
  const url = ((await fetchPage(CANDIDATES_PAGE, (h) => link.test(h))).match(link) || [])[0]?.replace(/ /g, '%20');
  if (!url) throw new Error('No candidate-list PDF link found on ' + CANDIDATES_PAGE);
  return url;
}

// Each ward's early voting / vote center site, from the table on the Board's
// early voting page: ward | site | address | bilingual official.
async function earlyVotingSites() {
  const html = await fetchPage(EARLY_VOTING_PAGE, (h) => /Goldblatts|<td/i.test(h));
  const text = (cell) => cell.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const sites = {};
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(text);
    if (cells.length >= 3 && /^\d{1,2}$/.test(cells[0])) {
      sites[cells[0]] = { site: cells[1], address: cells[2], language: cells[3] || undefined };
    }
  }
  if (Object.keys(sites).length < 45) throw new Error(`Only ${Object.keys(sites).length} ward early voting sites parsed`);
  return sites;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let prev = null;
  try { prev = JSON.parse(readFileSync(join(OUT, 'ballot.json'), 'utf8')); } catch { /* first build */ }

  const pdfUrl = await findCandidatePdf();
  console.log('Candidate list:', pdfUrl);
  const pdf = /^https?:/.test(pdfUrl) ? await download(pdfUrl, join(work, 'candidates.pdf')) : pdfUrl;
  execFileSync('pdftotext', ['-layout', pdf, join(work, 'candidates.txt')]);
  const ballot = parseCandidateList(readFileSync(join(work, 'candidates.txt'), 'utf8'));
  // Guard against a reformatted PDF silently emptying the app.
  if (ballot.races.length < 50 || ballot.retentions.length < 10) {
    throw new Error(`Parsed only ${ballot.races.length} races / ${ballot.retentions.length} retentions — refusing to overwrite.`);
  }

  // Maps first: the suburban contests are kept only if their district is in Cook.
  const precinctKeys = ballot.measures.filter((m) => m.scope.type === 'precinct').map((m) => `${m.scope.ward}-${m.scope.precinct}`);
  const districts = await buildDistricts([...new Set(precinctKeys)]);
  // Where each district is, for search results on other ballots. Nice to
  // have: if a source is down, keep yesterday's.
  let places = prev?.places ?? {};
  try { places = await placesIn(districts.layers); } catch (e) { console.warn(`places: ${e.message}; keeping the last copy`); }

  // Suburban Cook: the State Board's certified list adds the congressional,
  // legislative and subcircuit contests outside Chicago (countywide contests
  // and retentions are the same everywhere in Cook) plus campaign websites.
  const certified = await fetchCertifiedList();
  const merged = addStateList(certified.text, ballot.races, districts.layers, touchesCook);
  ballot.races = merged.races;
  console.log(`State list: +${merged.added} contests (suburban Cook and the rest of Illinois), ${merged.withSite} candidate websites`);
  const stateDistricts = await buildStateDistricts();

  await download(FEC_WEBALL, join(work, 'weball.zip'));
  execFileSync('unzip', ['-o', '-q', join(work, 'weball.zip'), '-d', work]);
  const money = addFederalMoney(ballot.races, parseWeball(readFileSync(join(work, 'weball26.txt'), 'utf8')));
  console.log(`FEC: matched ${money.matched}/${money.total} federal candidates`);

  for (const f of ISBE_FILES) await download(`${ISBE_BASE}${f}.txt`, join(work, `${f}.txt`));
  const state = await addStateMoney(ballot.races, work);
  console.log(`Illinois: matched ${state.matched}/${state.total} state & local candidates`);
  for (const line of state.log) console.log('  ' + line);
  const social = await addSocial(ballot.races, work);
  console.log(`Social accounts: ${social.withSocial}/${social.total} candidates`);
  for (const line of social.log) console.log('  ' + line);

  const judges = await addJudges(ballot, prev);
  for (const line of judges.log) console.log(line);

  const sites = await earlyVotingSites();
  await browser?.close();

  // A race whose district isn't on the map would silently vanish from every
  // ballot, so treat that as a broken build.
  // (`city` isn't a map: it's "has a Chicago ward".)
  const mapFor = (r) => (r.outsideCook ? stateDistricts : districts).layers[r.area.type];
  const missing = ballot.races.filter((r) => r.area && r.area.type !== 'city' && !mapFor(r)?.some((f) => f.id === r.area.id));
  if (missing.length) throw new Error('No map for: ' + missing.map((r) => r.office).join('; '));

  const next = { races: ballot.races, retentions: ballot.retentions, measures: ballot.measures };
  const changes = changeLog(prev, next, new Date().toISOString());
  // govbot being briefly down shouldn't hold up the ballot: keep yesterday's.
  let govbot = prev?.govbot ?? null;
  try { govbot = await govbotSlices(); } catch (e) { console.warn(`govbot: ${e.message}; keeping the last copy`); }
  if (!govbot) throw new Error('No govbot data (Springfield bills, 2027 races) and no earlier copy');
  console.log(`govbot: ${govbot.laws.length} bills, ${govbot.city.length} 2027 races (as of ${govbot.asOf})`);
  console.log(`Changes since last refresh: ${changes.length - (prev?.changes?.length ?? 0)} new, ${changes.length} kept`);

  writeFileSync(join(OUT, 'ballot.json'), JSON.stringify({
    election: { name: 'General Election', date: '2026-11-03' },
    sources: {
      candidates: { url: pdfUrl, page: CANDIDATES_PAGE, asOf: ballot.asOf },
      stateCandidates: { url: certified.url },
      money: { url: 'https://www.fec.gov/data/', file: FEC_WEBALL },
      stateMoney: { url: ISBE_BASE },
      earlyVoting: { page: EARLY_VOTING_PAGE },
    },
    races: ballot.races,
    retentions: ballot.retentions,
    measures: ballot.measures,
    earlyVotingSites: sites,
    changes,
    govbot,
    places,
  }, null, 1) + '\n');
  writeFileSync(join(OUT, 'districts.json'), JSON.stringify(districts) + '\n');
  writeFileSync(join(OUT, 'districts-il.json'), JSON.stringify(stateDistricts) + '\n');
  console.log(`Wrote ${ballot.races.length} races, ${ballot.retentions.length} retentions, ${ballot.measures.length} measures.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
