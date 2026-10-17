// Campaign money and incumbency for state and local candidates, from the
// Illinois State Board of Elections' key-free bulk disclosure files
// (https://www.elections.il.gov/CampaignDisclosureDataFiles/, refreshed daily):
//   Candidates.txt          who has ever filed, with office and district
//   CanElections.txt        per election: Inc / Chal / Open / Ret(ention)
//   CmteCandidateLinks.txt  candidate -> their committee(s)
//   FiledDocs.txt           every report, with its period and filing time
//   D2Totals.txt            the totals on each report (receipts, spending, cash)
//   Receipts.txt            every itemized contribution (about 1 GB; optional,
//                           see below)
//
// All tab-separated with a header row and CRLF line ends.
//
// A quarterly report (D-2) is up to three months old, but a committee must
// report every contribution of $1,000 or more within five business days
// (an A-1 report). "Raised" is therefore the quarterly total plus the A-1
// receipts dated after that quarter ended: the same arithmetic as the
// Sun-Times voter guide and Illinois Sunshine. The A-1 amounts live only
// in Receipts.txt; when that file is missing or unreadable the quarterly
// total stands on its own.

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

export const ISBE_FILES = ['Candidates', 'CanElections', 'CmteCandidateLinks', 'FiledDocs', 'D2Totals'];
/** The big itemized file, read when present (the build downloads it fail-soft). */
export const ISBE_RECEIPTS = 'Receipts';
export const ISBE_BASE = 'https://www.elections.il.gov/CampaignDisclosureDataFiles/';

// The cycle for Nov 2026 money: everything reported since Jan 1, 2025.
const CYCLE_START = '2025-01-01';
const ELECTION_YEAR = '2026';

async function* rows(path) {
  let header = null;
  for await (const raw of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    const cells = raw.replace(/\r$/, '').split('\t');
    if (!header) { header = cells; continue; }
    yield Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  }
}

const SUFFIX = /^(jr|sr|ii|iii|iv|mr|mrs|ms|dr|hon)$/;
const words = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/"[^"]*"/g, (m) => ` ${m} `)
  .replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((w) => w && !SUFFIX.test(w));
const day = (s) => (s || '').slice(0, 10); // "2026-06-30 00:00:00" -> "2026-06-30"

// The office on file must be the same kind of job as the ballot race, or a
// namesake slips in (a judicial candidate shares a name with a state rep).
// Spellings on file vary ("commssioner"), hence the loose patterns.
const OFFICE_ON_FILE = [
  [/^Governor/, /governor/],
  [/^Attorney General/, /attorney general/],
  [/^Secretary of State/, /secretary/],
  [/^Comptroller/, /comptroller/],
  [/^Treasurer$|^County Treasurer/, /treasurer/],
  [/^State Senator/, /senat/],
  [/^State Representative/, /representative/],
  [/^Metropolitan Water/, /comm?i?s+ioner|trustee/],
  [/^President of County Board/, /president|chair/],
  [/^County Clerk/, /clerk/],
  [/^County Sheriff/, /sheriff/],
  [/^County Assessor/, /assessor/],
  [/^County Commissioner/, /comm?i?s+ioner/],
  [/^Board of Review/, /review/],
  [/^Judge/, /judge|justice/],
  [/Board of Education/, /board|member|president|education/],
];
const officeFits = (ballotOffice, fileOffice) =>
  OFFICE_ON_FILE.some(([ballot, file]) => ballot.test(ballotOffice) && file.test(fileOffice));
// "6th District" / "3rd Subcircuit" on the ballot vs a bare number on file.
const districtFits = (ballotOffice, fileDistrict) => {
  const want = (ballotOffice.match(/(\d+)(?:st|nd|rd|th) (?:District|Subcircuit)/) || [])[1];
  const have = (fileDistrict.match(/^(\d+)/) || [])[1];
  return !want || !have || want === have;
};

/**
 * Attach `money` (and incumbency) to every non-federal candidate the state's
 * files can vouch for. `dir` holds the downloaded ISBE files.
 */
export async function addStateMoney(races, dir) {
  // 1. Everyone on the 2026 general election, and their status in it.
  const status = new Map(); // candidateId -> 'Inc' | 'Chal' | 'Open' | 'Ret'
  for await (const r of rows(`${dir}/CanElections.txt`)) {
    if (r.ElectionYear === ELECTION_YEAR && r.ElectionType === 'GE') status.set(r.CandidateID, r.IncChallOpen);
  }
  const people = [];
  for await (const r of rows(`${dir}/Candidates.txt`)) {
    if (status.has(r.ID)) people.push({ id: r.ID, last: words(r.LastName), first: words(r.FirstName), office: r.Office.toLowerCase(), district: r.District });
  }

  // 2. Their committees.
  const committeesOf = new Map();
  for await (const r of rows(`${dir}/CmteCandidateLinks.txt`)) {
    if (!status.has(r.CandidateID)) continue;
    if (!committeesOf.has(r.CandidateID)) committeesOf.set(r.CandidateID, new Set());
    committeesOf.get(r.CandidateID).add(r.CommitteeID);
  }
  const wanted = new Set([...committeesOf.values()].flatMap((s) => [...s]));

  // 3. Their reports this cycle. An amendment replaces the original for the
  //    same period, so keep the latest filing per committee + period.
  const docs = new Map(); // docId -> { committee, beg, end, rcvd }
  const a1Docs = new Map(); // docId -> committee, for the A-1 (large contribution) reports
  for await (const r of rows(`${dir}/FiledDocs.txt`)) {
    if (!wanted.has(r.CommitteeID)) continue;
    // FiledDocType is a numeric code; the report's kind is spelled out in DocName.
    if (r.DocName === 'A-1') { if (day(r.RcvdDateTime) >= CYCLE_START) a1Docs.set(r.ID, r.CommitteeID); continue; }
    if (day(r.RptPdEndDate) < CYCLE_START) continue;
    docs.set(r.ID, { committee: r.CommitteeID, beg: day(r.RptPdBegDate), end: day(r.RptPdEndDate), rcvd: r.RcvdDateTime });
  }
  const latestByPeriod = new Map(); // committee|beg|end -> { rcvd, receipts, spent, cash, end }
  for await (const r of rows(`${dir}/D2Totals.txt`)) {
    const d = docs.get(r.FiledDocID);
    if (!d) continue;
    const key = `${d.committee}|${d.beg}|${d.end}`;
    const prev = latestByPeriod.get(key);
    if (prev && prev.rcvd >= d.rcvd) continue;
    latestByPeriod.set(key, { committee: d.committee, rcvd: d.rcvd, end: d.end, receipts: +r.TotalReceipts || 0, spent: +r.TotalExpend || 0, cash: +r.EndFundsAvail || 0 });
  }
  const committeeMoney = new Map();
  for (const p of latestByPeriod.values()) {
    const m = committeeMoney.get(p.committee) ?? { raised: 0, spent: 0, cash: 0, through: '' };
    m.raised += p.receipts;
    m.spent += p.spent;
    if (p.end > m.through) { m.through = p.end; m.cash = p.cash; }
    committeeMoney.set(p.committee, m);
  }
  // A-1 receipts dated after the committee's latest quarterly report.
  let a1Rows = 0;
  if (existsSync(`${dir}/${ISBE_RECEIPTS}.txt`)) {
    for await (const r of rows(`${dir}/${ISBE_RECEIPTS}.txt`)) {
      const committee = a1Docs.get(r.FiledDocID);
      if (!committee) continue;
      const m = committeeMoney.get(committee);
      const on = day(r.RcvDate);
      if (!m || on <= m.through) continue;
      m.recent = (m.recent ?? 0) + (+r.Amount || 0);
      if (!m.recentThrough || on > m.recentThrough) m.recentThrough = on;
      a1Rows += 1;
    }
  }

  // 4. Match ballot names to people, unambiguously or not at all.
  let matched = 0;
  let total = 0;
  const log = []; // ballot office vs the office on file, for the build log
  for (const race of races) {
    if (race.section === 'federal') continue;
    for (const c of race.candidates) {
      total += 1;
      const w = words(c.name.split(' & ')[0]); // a governor ticket files as its lead
      const last = w[w.length - 1];
      let hits = people.filter((p) => (p.last.includes(last) || p.last.join('') === w.slice(-2).join(''))
        && officeFits(race.office, p.office) && districtFits(race.office, p.district));
      if (hits.length > 1) hits = hits.filter((p) => p.first.some((f) => f.slice(0, 3) === w[0].slice(0, 3)));
      const ids = new Set(hits.map((p) => p.id));
      if (!ids.size || new Set(hits.map((p) => p.last.join(' ') + '|' + (p.first[0] ?? ''))).size > 1) continue;

      log.push(`${race.office} | ${c.name} -> ${hits.map((p) => `${p.office} ${p.district}`.trim()).join(', ')}`);
      const st = [...ids].map((id) => status.get(id)).find(Boolean);
      if (st === 'Inc' || st === 'Ret') c.incumbent = true;
      // A person can have several committees over the years; the one carrying
      // this cycle's money is the one with the most raised.
      const best = [...ids].flatMap((id) => [...(committeesOf.get(id) ?? [])])
        .map((id) => ({ id, m: committeeMoney.get(id) }))
        .filter((x) => x.m)
        .sort((a, b) => b.m.raised - a.m.raised)[0];
      if (!best) continue;
      const us = (iso) => { const [y, mo, d] = iso.split('-'); return `${mo}/${d}/${y}`; };
      c.money = {
        source: 'ISBE',
        id: best.id,
        raised: Math.round(best.m.raised + (best.m.recent ?? 0)),
        spent: Math.round(best.m.spent),
        cash: Math.round(best.m.cash),
        through: us(best.m.through),
        ...(best.m.recent ? { recent: Math.round(best.m.recent), recentThrough: us(best.m.recentThrough) } : {}),
      };
      matched += 1;
    }
  }
  return { matched, total, log, a1Rows };
}
