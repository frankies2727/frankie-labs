// Reconciliation: before a ballot is written, every piece attached to a
// candidate is checked against the candidate's name, and anything whose
// source names someone else is dropped and logged. The steps upstream match
// carefully, but one wrong match (a challenger handed the sitting member's
// portrait because they share a surname) is worse than a blank, and this is
// the last line.
//
// Checks, per candidate:
//   - a photo credited to a legislature (Congress, the General Assembly, the
//     Michigan Legislature) only for a sitting legislator of that name;
//   - a website on a legislature's own domain (house.gov, senate.gov,
//     ilga.gov, legislature.mi.gov) likewise, and with it the issues page and
//     the accounts read off it;
//   - a Ballotpedia page (profile, survey answers) whose title is their name;
//   - a legislative record for a sitting legislator of that name;
//   - a money report id used by no other candidate;
//   - a photo file, website or account used by no other candidate.

import { membersOf } from './illinois/record.mjs';
import { sameName } from './wiki.mjs';

const LEGISLATURE_PHOTO = /U\.S\. Congress|General Assembly|Michigan Legislature/i;
const LEGISLATURE_SITE = /\.(house|senate)\.gov(\/|$)|\bilga\.gov|\blegislature\.mi\.gov|\bhouse\.mi\.gov|\bsenate\.michigan\.gov/i;
const titleOf = (url) => decodeURIComponent(url.split('/').pop() ?? '').replace(/_/g, ' ').replace(/\s*\(.*\)$/, '');

/** Run the checks; returns the log lines. `members` is the state's sitting legislators from the roster. */
export function audit(races, members) {
  const log = [];
  const isLegislator = (name) => members.some((m) => sameName(name, m.name));
  const drop = (c, race, what, why) => { for (const k of what) delete c[k]; log.push(`${race.office} | ${c.name}: dropped ${what.join(', ')} (${why})`); };
  const seen = new Map(); // value -> first "race|name"
  const note = (key, value, race, c) => {
    if (!value) return;
    const k = `${key}:${String(value).toLowerCase()}`;
    if (seen.has(k) && seen.get(k) !== `${race.id}|${c.name}`) log.push(`${race.office} | ${c.name}: ${key} ${value} is also ${seen.get(k)}'s`); else seen.set(k, `${race.id}|${c.name}`);
  };
  for (const race of races) {
    for (const c of race.candidates) {
      const legislator = isLegislator(c.name);
      if (c.photo && LEGISLATURE_PHOTO.test(c.photo.credit ?? '') && !legislator) drop(c, race, ['photo'], 'a legislature portrait, but no sitting legislator has this name');
      if (c.website && LEGISLATURE_SITE.test(c.website) && !legislator) drop(c, race, ['website', 'issuesUrl', 'social'].filter((k) => c[k]), 'a legislature site, but no sitting legislator has this name');
      if (c.issuesUrl && c.website && !c.issuesUrl.startsWith(new URL(c.website).origin)) drop(c, race, ['issuesUrl'], 'not on their campaign site');
      for (const k of ['ballotpedia', 'profile']) {
        if (c[k] && /ballotpedia\.org\//.test(c[k]) && !sameName(c.name, titleOf(c[k]))) drop(c, race, [k, ...(k === 'ballotpedia' && c.stances ? ['stances'] : [])], 'a Ballotpedia page with another name');
      }
      if (c.stances && c.ballotpedia && c.stances.url !== c.ballotpedia) drop(c, race, ['stances'], 'survey answers from a different page than their profile');
      if (c.record && !legislator) drop(c, race, ['record'], 'a legislative record, but no sitting legislator has this name');
      note('money id', c.money?.id, race, c);
      note('photo', c.photo?.from ?? c.photo?.file, race, c);
      note('website', c.website, race, c);
      for (const v of Object.values(c.social ?? {})) note('account', v, race, c);
    }
    for (const inc of race.incumbents ?? []) {
      if (inc.ballot && !race.candidates.some((c) => c.ballot === inc.ballot && sameName(c.name, inc.name))) { delete inc.ballot; log.push(`${race.office}: incumbent ${inc.name} marked as running, but no candidate of that name`); }
    }
  }
  // Something two candidates share can't be both of theirs. A site or account
  // stays with the one whose name is in its address (Barbara Hernandez keeps
  // staterepresentativebarbarahernandez.com; the other Hernandez loses it);
  // a money id or photo shared by two is dropped from both.
  const all = races.flatMap((r) => r.candidates.map((c) => ({ r, c })));
  const tokens = (name) => name.split(' & ')[0].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/["“”][^"“”]*["“”]/g, ' ').split(/[^a-z]+/).filter((t) => t.length > 2);
  const inAddress = (name, url) => { const u = url.toLowerCase().replace(/[^a-z]/g, ''); const t = tokens(name); return t.length > 0 && t.at(-1) && u.includes(t.at(-1)) && u.includes(t[0]); };
  const valuesOf = (key, c) => (key === 'website' ? [c.website] : key === 'money' ? [c.money?.id] : key === 'photo' ? [c.photo?.from ?? c.photo?.file] : Object.values(c.social ?? {})).filter(Boolean).map((v) => String(v).toLowerCase());
  const holders = (key, value) => all.filter(({ c }) => valuesOf(key, c).includes(String(value).toLowerCase()));
  for (const line of [...log]) {
    const m = line.match(/: (website|account|money id|photo) (\S+) is also /);
    if (!m) continue;
    const [, key, value] = m;
    const who = holders(key === 'money id' ? 'money' : key === 'account' ? 'social' : key, value);
    if (who.length < 2) continue;
    const keepers = key === 'website' || key === 'account' ? who.filter(({ c }) => inAddress(c.name, value)) : [];
    for (const { r, c } of who) {
      if (keepers.length === 1 && keepers[0].c === c) continue;
      if (key === 'website') drop(c, r, ['website', ...(c.issuesUrl ? ['issuesUrl'] : [])], `shared with ${who.filter((x) => x.c !== c).map((x) => x.c.name).join(', ')}`);
      else if (key === 'account') { for (const [k, v] of Object.entries(c.social ?? {})) if (v.toLowerCase() === value.toLowerCase()) delete c.social[k]; if (c.social && !Object.keys(c.social).length) delete c.social; log.push(`${r.office} | ${c.name}: dropped account ${value} (shared)`); }
      else if (key === 'money id') drop(c, r, ['money'], `shared id ${value}`);
      else drop(c, r, ['photo'], 'the same photo as another candidate');
    }
  }
  return log;
}

const ROSTER = 'https://chihacknight.github.io/govbot/dashboard/people.json';
/** The state's sitting legislators, for `audit`; [] when the roster can't be read (the name checks then only use what's on the ballot). */
export async function rosterMembers(state) {
  try {
    const res = await fetch(ROSTER);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return membersOf(await res.json(), state);
  } catch (e) {
    console.warn(`audit: roster unavailable (${e.message}); legislature-sourced fields are kept as they are`);
    return null;
  }
}

/** Audit with the roster; without one, every candidate counts as a possible legislator (nothing legislature-sourced is dropped). */
export async function reconcile(races, state) {
  const members = await rosterMembers(state);
  return audit(races, members ?? races.flatMap((r) => r.candidates.map((c) => ({ name: c.name }))));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const state = process.argv[2] ?? 'il';
  const file = new URL(`../../src/projects/know-your-ballot/data/${state === 'mi' ? 'michigan' : 'illinois'}/ballot.json`, import.meta.url);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const members = await rosterMembers(state);
  const log = audit(data.races, members ?? []);
  console.log(`Audit (${state}): ${log.length} finding${log.length === 1 ? '' : 's'}`);
  for (const l of log) console.log('  ' + l);
  if (process.argv.includes('--write')) writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}
