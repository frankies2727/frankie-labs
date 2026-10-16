// Campaign money for Michigan's state and local candidates, from the
// Michigan Transparency Network's all-transaction exports (the Bureau of
// Elections' campaign finance system, MiTN): tab-delimited yearly files of
// every contribution and expenditure, refreshed nightly. Each contribution
// row names the committee's candidate, office and district; expenditures
// carry the committee id, so the two join on it. Summed over the cycle
// (2025 and 2026 files). MiTN's exports carry no cash-on-hand figure, so
// state candidates show raised and spent only.
//   https://www.michigan.gov/sos/elections/disclosure/cfr

import { createReadStream, readdirSync, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MITN = 'https://mi-boe.entellitrak.com/etk-mi-boe-prod/page.request.do?page=gov.mi.boe.component.cfrexport.page.';
export const MITN_EXPORTS = `${MITN}cfrexportdownload`;
const LIST = `${MITN}cfrexportresults&pageSize=100&pageNumber=1&sortDirection=DESC&sortBy=year&type=`;
const FILE = (id) => `${MITN}cfrexportfile&id=${id}`;
const YEARS = [2025, 2026];
const KINDS = ['Contribution', 'Expenditure'];
const UA = 'KnowYourBallot/1.0 (https://github.com/frankies2727/frankie-labs)';

/** Download this cycle's contribution and expenditure exports into `dir`, unzipped. */
export async function fetchExports(dir) {
  const res = await fetch(LIST, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`MiTN export list: HTTP ${res.status}`);
  const list = (await res.json()).data?.list ?? [];
  const wanted = list.filter((f) => YEARS.includes(f.year) && KINDS.includes(f.transactiontype));
  if (wanted.length < YEARS.length * KINDS.length) throw new Error(`MiTN export list: only ${wanted.length} of ${YEARS.length * KINDS.length} files listed`);
  for (const f of wanted) {
    const zip = join(dir, `${f.transactiontype}_${f.year}.zip`);
    const r = await fetch(FILE(f.download), { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${zip}: HTTP ${r.status}`);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(zip));
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  }
  return wanted.map((f) => f.lastupdatedraw ?? f.lastupdated);
}

async function* rows(path) {
  let header = null;
  for await (const raw of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    const cells = raw.replace(/\r$/, '').split('\t');
    if (!header) { header = cells; continue; }
    if (cells.length < header.length - 2) continue; // a wrapped line inside a field
    yield Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  }
}

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const parts = (n) => fold(n.split(' & ')[0].replace(/["“”][^"“”]*["“”]/g, ' ').replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).split(/[^a-z]+/).filter(Boolean);
const SHORT = { jim: 'james', bill: 'william', bob: 'robert', rob: 'robert', dick: 'richard', rick: 'richard', mike: 'michael', tom: 'thomas', joe: 'joseph', dan: 'daniel', chris: 'christopher', charlie: 'charles', chuck: 'charles', ben: 'benjamin', tony: 'anthony', ted: 'edward', ed: 'edward', jack: 'john', liz: 'elizabeth', beth: 'elizabeth', kathy: 'katherine', kate: 'katherine', katie: 'katherine', peggy: 'margaret', sam: 'samuel', steve: 'steven', matt: 'matthew', pat: 'patrick', andy: 'andrew', nick: 'nicholas', greg: 'gregory', jeff: 'jeffrey', ken: 'kenneth', ron: 'ronald', don: 'donald', fred: 'frederick', larry: 'lawrence', jerry: 'gerald', tim: 'timothy', jon: 'jonathan', dave: 'david', doug: 'douglas', sue: 'susan', deb: 'deborah', jen: 'jennifer', alex: 'alexander', ray: 'raymond', russ: 'russell', marty: 'martin', pete: 'peter', josh: 'joshua', zach: 'zachary', nate: 'nathan', vince: 'vincent', abdul: 'abdul' };
const sameFirst = (a, b) => a === b || (SHORT[a] ?? a) === (SHORT[b] ?? b) || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
/** Same person: last names equal, first names agree ("Dan" ~ "Daniel"). */
function sameName(ours, theirsFirst, theirsLast) {
  const a = parts(ours);
  const last = fold(theirsLast).replace(/[^a-z]/g, '');
  if (a.length < 2 || !last || a.at(-1) !== last && !a.slice(1).join('').endsWith(last)) return false;
  const first = parts(theirsFirst)[0];
  return !!first && sameFirst(a[0], first);
}

// Our office names -> MiTN's `can_office_sought`.
const OFFICE = {
  'Governor and Lieutenant Governor': 'Governor',
  'Secretary of State': 'Secretary of State',
  'Attorney General': 'Attorney General',
  'State Senator': 'State Senator',
  'Representative in State Legislature': 'Representative in State Legislature',
  'Justice of the Supreme Court': 'Justice of Supreme Court',
  'Regent of the University of Michigan': 'Regent of the University of Michigan',
  'Trustee of Michigan State University': 'Trustee of Michigan State University',
  'Governor of Wayne State University': 'Governor of Wayne State University',
  'Member of the State Board of Education': 'Member of the State Board of Education',
  'Judge of the Court of Appeals': 'Judge of Court of Appeals',
};
const districtOf = (s) => s.match(/\d+/)?.[0] ?? '';
const dollars = (s) => Math.round(Number(s.replace(/[^0-9.-]/g, '')) || 0);
const iso = (mdy) => { const m = mdy.match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : ''; };

/**
 * Attach `money` ({ source: 'MiTN', id, raised, spent, through }) to every
 * state or local candidate whose committee is in the exports under `dir`.
 * A candidate with two committees for the office (rare) gets both summed.
 */
export async function addStateMoney(races, dir) {
  const files = readdirSync(dir).filter((f) => /^\d{4}_mi_cfr_(contributions|expenditures)\d*\.txt$/.test(f));
  if (!files.length) throw new Error(`no MiTN export files in ${dir}`);
  const committees = new Map(); // cfr_com_id -> { first, last, office, district, raised, spent, through }
  for (const f of files.filter((x) => x.includes('contributions'))) {
    for await (const r of rows(join(dir, f))) {
      if (r.com_type !== 'Candidate') continue;
      let c = committees.get(r.cfr_com_id);
      if (!c) { c = { first: r.can_first_name, last: r.can_last_name, office: r.can_office_sought, district: districtOf(r.can_district_sought), raised: 0, spent: 0, through: '' }; committees.set(r.cfr_com_id, c); }
      c.raised += dollars(r.amount);
      const d = iso(r.received_date);
      if (d > c.through) c.through = d;
    }
  }
  for (const f of files.filter((x) => x.includes('expenditures'))) {
    for await (const r of rows(join(dir, f))) {
      const c = committees.get(r.cfr_com_id);
      if (!c) continue;
      c.spent += dollars(r.amount);
      const d = iso(r.exp_date);
      if (d > c.through) c.through = d;
    }
  }
  let matched = 0, total = 0;
  const ambiguous = [];
  for (const race of races) {
    const office = OFFICE[race.office.replace(/,.*$/, '').replace(/\s*\(.*$/, '')];
    if (!office) continue;
    const district = race.area ? String(race.area.id) : '';
    for (const c of race.candidates) {
      total++;
      const hits = [...committees].filter(([, k]) => k.office === office && (!district || k.district === district) && sameName(c.name, k.first, k.last));
      if (!hits.length) continue;
      const raised = hits.reduce((n, [, k]) => n + k.raised, 0), spent = hits.reduce((n, [, k]) => n + k.spent, 0);
      const through = hits.map(([, k]) => k.through).sort().at(-1);
      const [m, d, y] = [through.slice(5, 7), through.slice(8, 10), through.slice(0, 4)];
      c.money = { source: 'MiTN', id: hits.map(([id]) => id).join('+'), raised, spent, through: `${m}/${d}/${y}` };
      if (hits.length > 1) ambiguous.push(`${c.name}: ${hits.length} committees summed`);
      matched++;
    }
  }
  return { matched, total, committees: committees.size, log: ambiguous.slice(0, 10) };
}
