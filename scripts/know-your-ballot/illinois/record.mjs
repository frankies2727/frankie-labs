// A candidate who already sits in Congress or the General Assembly has a
// public record: the bills they sponsored this session. govbot publishes
// every bill with its sponsors (from Open States and Congress.gov), so the
// record is read from there and linked bill by bill to the official page and
// to govbot's catalog. Only candidates in federal and state races are matched
// (a county candidate who shares a legislator's name must not inherit their
// bills), and only against Illinois' own members.

import { sameName } from './incumbents.mjs';

const GOVBOT_BILLS = 'https://chihacknight.github.io/govbot/dashboard/bills/';
const ROSTER = 'https://chihacknight.github.io/govbot/dashboard/people.json';
const SHOW = 5;

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const surname = (n) => fold(n.split(' & ')[0].replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).split(/[^a-z]+/).filter(Boolean).at(-1);

/** Illinois' sitting legislators: [{ name, chamber: 'usa' | 'il', seat }]. */
export function illinoisMembers(people) {
  const out = [];
  for (const rows of Object.values(people.usa ?? {})) for (const [, full, , area] of rows) {
    if (/· IL-\d+$|· Illinois$/.test(area ?? '')) out.push({ name: full, chamber: 'usa', seat: area });
  }
  for (const rows of Object.values(people.il ?? {})) for (const [, full, , area] of rows) out.push({ name: full, chamber: 'il', seat: area });
  return out;
}

/**
 * The bills a member sponsored, newest action first: { sponsored, bills: [...SHOW] }.
 * Sponsors are written as the legislature writes them ("Jawaharial Williams",
 * "Dagmara Avelar"), so a sponsor counts when it agrees with the roster name
 * or with any alias (the ballot name, which carries the nickname).
 */
export function recordFor(member, bills, aliases = []) {
  const last = surname(member.name);
  const names = [member.name, ...aliases];
  const mine = bills.filter((b) => (b.sponsors ?? []).some((s) => surname(s) === last && names.some((n) => sameName(s, n))));
  mine.sort((a, b) => (b.latest_action ?? '').localeCompare(a.latest_action ?? ''));
  return {
    sponsored: mine.length,
    bills: mine.slice(0, SHOW).map((b) => ({ state: b.state, session: b.session, id: b.id, title: b.title, latest_action: b.latest_action, url: b.url })),
  };
}

/**
 * Attach `record` to each federal/state candidate who is a sitting Illinois
 * legislator. Fetchers are injectable for tests; a failed fetch keeps
 * yesterday's records.
 */
export async function addRecords(races, { prev = null, fetchJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); }) } = {}) {
  const log = [];
  const before = new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => c.record).map((c) => [`${r.id}|${c.name}`, c.record])));
  let people, il, usa;
  try {
    [people, il, usa] = await Promise.all([fetchJson(ROSTER), fetchJson(`${GOVBOT_BILLS}il.json`), fetchJson(`${GOVBOT_BILLS}usa.json`)]);
  } catch (e) {
    log.push(`govbot: ${e.message}; keeping yesterday's records`);
    for (const r of races) for (const c of r.candidates) { const k = before.get(`${r.id}|${c.name}`); if (k) c.record = k; }
    return { matched: 0, kept: before.size, log };
  }
  const members = illinoisMembers(people);
  const bills = { il: il.bills ?? [], usa: usa.bills ?? [] };
  const source = { il: 'Illinois General Assembly, via govbot', usa: 'Congress.gov, via govbot' };
  let matched = 0;
  const asOf = new Date().toISOString().slice(0, 10);
  for (const r of races) {
    if (r.section !== 'federal' && r.section !== 'state') continue;
    for (const c of r.candidates) {
      delete c.record;
      const hits = members.filter((m) => surname(m.name) === surname(c.name) && sameName(c.name, m.name));
      // Two members with the same name: say nothing rather than guess.
      if (hits.length !== 1) { if (hits.length > 1) log.push(`${c.name}: ${hits.length} legislators match`); continue; }
      const m = hits[0];
      const rec = recordFor(m, bills[m.chamber], [c.name]);
      if (!rec.sponsored) continue;
      c.record = { ...rec, seat: m.seat, source: source[m.chamber], asOf };
      matched += 1;
    }
  }
  return { matched, kept: 0, log };
}

// Standalone: refresh the committed Illinois data's records.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const file = new URL('../../../src/projects/know-your-ballot/data/illinois/ballot.json', import.meta.url);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const r = await addRecords(data.races, { prev: data });
  console.log(`Records: ${r.matched} candidates are sitting legislators`);
  for (const l of r.log) console.log('  ' + l);
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}
