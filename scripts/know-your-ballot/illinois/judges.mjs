// Judges: what voters can't easily find elsewhere on one screen.
//   - Injustice Watch's Cook County judicial guide
//     (https://2026retention.injusticewatch.org/): a link to each judge's
//     profile, the judge's photo from it (credited and linked; for the
//     contested seats the photo comes from their March primary guide,
//     https://2026primary.injusticewatch.org/, which has one for every
//     candidate who went on to November), each bar
//     group's rating of the judges up for retention, and judges who withdrew
//     after the ballots were printed (still on the ballot, votes not
//     counted), whom the Board's candidate list leaves out. Their reporting
//     itself stays on their site: we link to it, not copy it.
//   - The Alliance of Bar Associations for Judicial Screening
//     (https://www.voteforjudges.org/): each member group's rating of every
//     candidate in a contested judgeship.
// Ratings are kept per group ({ CCL: "Recommended", ... }); the page draws them.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageType, shrink } from './photos.mjs';

const SITE = 'https://2026retention.injusticewatch.org/';
const DATA = `${SITE}cacheddata/current-en.json`;
const PRIMARY = 'https://2026primary.injusticewatch.org/';
const PRIMARY_DATA = `${PRIMARY}cacheddata/current-en.json`;
const ALLIANCE = 'https://www.voteforjudges.org/';
const UA = 'KnowYourBallot/1.0 (https://github.com/frankies2727/frankie-labs)';

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const key = (s) => fold(s).replace(/[^a-z]/g, '');
// The judge whose seat it was: "Curry, Jr." and "McLean Meyerson" vs "Meyerson".
const seat = (s) => key(s.replace(/,?\s*Jr\.?$/i, ''));
const vacatedSeat = (office) => seat(office.match(/(?:Vacancy|Judgeship) of ([^)]+)\)/)?.[1] ?? '');
/** The guide's photo of a judge, as its URL on the site; most judges have one. */
const photoUrl = (c) => { const f = c.photo_provided?.[0]?.filename; return f ? `${SITE}images/candidates/${encodeURIComponent(f)}` : undefined; };
// Their profile pages: /candidate/<name as a slug>-<candidate id>.
const profileUrl = (c) => `${SITE}candidate/${fold(c.nameFormatted).replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${c.candidateId}`;

/** Each bar group's rating, by its short name (the guide uses the Alliance's). */
function barRatings(c) {
  const bar = Object.fromEntries((c.ratings ?? []).map((r) => [r.fields.slug, r.fields.rating]).filter(([g, r]) => g && r));
  return Object.keys(bar).length ? bar : undefined;
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** The primary guide's candidates: "first last" (folded) -> { photo, profile }. */
async function fetchPrimary() {
  const races = JSON.parse(await getText(PRIMARY_DATA));
  if (!Array.isArray(races) || races.length < 10) throw new Error(`${PRIMARY_DATA}: unexpected shape`);
  const out = new Map();
  for (const r of races) for (const { fields: c } of r.fields.candidates) {
    const file = c.photo?.[0]?.filename;
    if (!file) continue;
    const name = `${c.firstName} ${c.lastName}`;
    out.set(key(name), { photo: `${PRIMARY}images/candidates/${encodeURIComponent(file)}`, profile: `${PRIMARY}candidate/${fold(name).replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${c.candidateId}` });
  }
  return out;
}

async function fetchGuide() {
  const races = JSON.parse(await getText(DATA));
  if (!Array.isArray(races) || races.length < 20) throw new Error(`${DATA}: unexpected shape`);
  return races.map((r) => ({ ...r.fields, candidates: r.fields.candidates.map((c) => c.fields) }));
}

// ---- the Alliance's tables --------------------------------------------------------
// One table per contested seat: a header row ("Vacancy of the Hon. …", then
// each group's initials), then a row per candidate with each group's code.
const CODES = {
  HQ: 'Highly qualified', HR: 'Highly recommended', WQ: 'Well qualified', R: 'Recommended',
  Q: 'Qualified', NR: 'Not recommended', NQ: 'Not qualified', '¹': 'Not evaluated',
};
const cellText = (html) => html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();

/**
 * seats: [{ seat, candidates: [{ name, bar }] }] for every contested seat.
 * retained: [{ name, no: [groups] }] — for retentions the Alliance lists only
 * who says no ("CCBA and ISBA say no. All other reporting bars say yes.").
 * groups: the Alliance's members.
 */
async function fetchAlliance() {
  const html = await getText(ALLIANCE);
  const seats = [];
  const retained = [];
  const groups = new Set();
  // The tables sit in fold-out panels; a link ending in a panel's id opens it
  // and scrolls to it (their accordion script reads the address on load), and
  // a text fragment points at the name.
  const panels = [...html.matchAll(/class="vc_tta-panel[^"]*" id="([^"]+)"/g)].map((m) => [m.index, m[1]]);
  const sourceFor = (at, name) => {
    const panel = panels.filter(([i]) => i < at).at(-1)?.[1];
    return `${ALLIANCE}${panel ? `#${panel}` : ''}:~:text=${encodeURIComponent(name).replace(/-/g, '%2D')}`;
  };
  for (const { 0: table, index: at } of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = table.split(/<tr\b/i).slice(1)
      .map((tr) => tr.split(/<td\b/i).slice(1).map((td) => cellText(`<td${td}`)));
    for (const [name, verdict] of rows) {
      if (name && /\bsays? (no|yes)\b/i.test(verdict ?? '')) {
        retained.push({ name, source: sourceFor(at, name), no: /\bsays? no\b/i.test(verdict) ? verdict.split(/\bsays? no\b/i)[0].split(/,\s*(?:and\s+)?|\s+and\s+/).map((g) => g.trim()).filter(Boolean) : [] });
      }
    }
    const [header, ...people] = rows;
    const vacated = header?.[0]?.match(/Vacancy of the Hon\.?\s*(.+)$/i)?.[1];
    if (!vacated) continue;
    const columns = header.slice(1).map((g) => g.replace(/\s+/g, ''));
    for (const g of columns) if (g) groups.add(g);
    const candidates = people.filter((r) => r[0]).map(([name, ...codes]) => ({
      name, source: sourceFor(at, name),
      bar: Object.fromEntries(codes.map((c, i) => [columns[i], CODES[c.trim()]]).filter(([g, r]) => g && r)),
    }));
    seats.push({ seat: seat(vacated), candidates });
  }
  if (seats.length < 20 || retained.length < 40) throw new Error(`${ALLIANCE}: only ${seats.length} seats, ${retained.length} retentions found`);
  return { seats, retained, groups };
}

/** Same judge? Their list has typos ("Joan E. Powelll", "Edward A Arce"): last name and first initial. */
const sameJudge = (a, b) => {
  const parts = (n) => fold(n.replace(/,?\s*Jr\.?$/i, '')).split(/\s+/);
  const [pa, pb] = [parts(a), parts(b)];
  return pa[0][0] === pb[0][0] && key(pa.at(-1)).replace(/(.)\1+/g, '$1') === key(pb.at(-1)).replace(/(.)\1+/g, '$1');
};

/**
 * The guide's ratings with the Alliance's own word on its members laid over
 * them: the Alliance is the source, the guide a copy that can lag.
 */
function withAlliance(bar, no, groups) {
  const out = { ...bar };
  for (const g of groups) {
    if (no.includes(g)) out[g] = 'No';
    else if (/^no$/i.test(out[g] ?? '')) out[g] = 'Yes';
  }
  return out;
}

/** Judges up for retention, in ballot order, and judicial candidates' profiles by "race id|name". */
function fromGuide(guide, alliance, races, primary = new Map()) {
  const judges = guide.filter((r) => r.raceType === 'Retention').flatMap((r) => r.candidates.map((c) => ({
    id: `retain-${fold(c.nameFormatted).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    court: r.level, judge: c.nameFormatted, profile: profileUrl(c), bar: barRatings(c),
    withdrawn: /\bwithdrew\b/i.test(c.notable ?? '') || undefined, photoFrom: photoUrl(c),
  })));
  // Contested judgeships: "Burke Vacancy" ~ "(Vacancy of Burke)" or
  // "(… Associate Judgeship of Baird)", then the candidate's last name.
  const profiles = new Map();
  const photos = new Map();
  const bars = new Map();
  const judicial = races.filter((r) => /^Judge/.test(r.office));
  for (const v of guide.filter((r) => r.raceType === 'Vacancy')) {
    const vacated = seat(v.name.replace(/\s*Vacancy$/, ''));
    const race = judicial.find((r) => vacatedSeat(r.office).endsWith(vacated));
    for (const c of v.candidates) {
      const cand = race?.candidates.find((x) => key(x.name).includes(key(c.lastName)));
      if (!cand) continue;
      profiles.set(`${race.id}|${cand.name}`, profileUrl(c));
      // The general guide carries no photos for contested seats; the primary guide does.
      const fromPrimary = primary.get(key(cand.name)) ?? primary.get(key(`${c.firstName} ${c.lastName}`));
      const photo = photoUrl(c) ?? fromPrimary?.photo;
      if (photo) photos.set(`${race.id}|${cand.name}`, photo);
    }
  }
  for (const j of judges) {
    const said = alliance.retained.find((r) => sameJudge(r.name, j.judge));
    if (said && j.bar) { j.bar = withAlliance(j.bar, said.no, alliance.groups); j.barSource = said.source; }
  }
  // The Alliance names the whole judge ("Kathleen Marie Burke"); the Board, the last name.
  for (const s of alliance.seats) {
    const race = judicial.find((r) => vacatedSeat(r.office) && s.seat.endsWith(vacatedSeat(r.office)));
    for (const c of s.candidates) {
      const cand = race?.candidates.find((x) => key(x.name) === key(c.name) || key(x.name).endsWith(key(c.name.split(' ').at(-1))));
      if (cand && Object.keys(c.bar).length) bars.set(`${race.id}|${cand.name}`, { bar: c.bar, source: c.source });
    }
  }
  return { judges, profiles, photos, bars };
}

/** The same, from the last build, for when a source can't be read. */
const byCandidate = (prev, field, value = (c) => c[field]) => new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => c[field]).map((c) => [`${r.id}|${c.name}`, value(c)])));
const fromPrev = (prev) => ({
  judges: (prev?.retentions ?? []).map((r) => ({ ...r, photoFrom: r.photo?.from })),
  profiles: byCandidate(prev, 'profile'),
  photos: byCandidate(prev, 'photo', (c) => (c.photo.credit === CREDIT ? c.photo.from : undefined)),
  bars: byCandidate(prev, 'bar', (c) => ({ bar: c.bar, source: c.barSource })),
});

const CREDIT = 'Injustice Watch';
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The guide's photo of a judge, saved with the site as `retain-<name>.jpg`
 * (the candidates' photo step leaves files named so alone). `old` is the
 * last build's photo for them, kept if the site can't be read today.
 */
async function savePhoto(url, name, link, old, { dir, publicPath }) {
  const file = `retain-${slug(name)}.jpg`;
  if (old?.from === url && existsSync(join(dir, file))) return old;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const type = imageType(raw);
  if (!type) throw new Error(`${url}: not an image`);
  writeFileSync(join(dir, file), shrink(raw, type).bytes);
  return { file: `${publicPath}/${file}`, credit: CREDIT, link, from: url };
}

/**
 * Adds `profile`, `photo` and `bar` to `ballot.retentions` and to judicial
 * candidates, and slots in withdrawn judges. The Board's list sets the order.
 * Photos go in `dir` (served at `publicPath`).
 */
export async function addJudges(ballot, prev, { dir, publicPath }) {
  let found, note = '';
  let primary = new Map();
  try { primary = await fetchPrimary(); } catch (e) { note = ` (primary guide: ${e.message})`; }
  try { found = fromGuide(await fetchGuide(), await fetchAlliance(), ballot.races, primary); } catch (e) { found = fromPrev(prev); note += ` (${e.message}; kept the last copy)`; }
  const { judges, profiles, photos, bars } = found;
  mkdirSync(dir, { recursive: true });
  const log = [];
  let saved = 0;
  const photoFor = async (url, name, link, old) => {
    if (!url) return undefined;
    try { const p = await savePhoto(url, name, link, old, { dir, publicPath }); saved++; return p; } catch (e) {
      log.push(`  photo for ${name}: ${e.message.slice(0, 100)}`);
      return old?.credit === CREDIT && existsSync(join(dir, old.file.split('/').pop())) ? old : undefined;
    }
  };

  const details = new Map(judges.map((j) => [key(j.judge), j]));
  const prevRetention = new Map((prev?.retentions ?? []).map((r) => [r.id, r]));
  const retentions = [];
  for (const r of ballot.retentions) {
    const j = details.get(key(r.judge));
    if (!j) { retentions.push(r); continue; }
    const photo = await photoFor(j.photoFrom, r.judge, j.profile, prevRetention.get(r.id)?.photo);
    retentions.push({ ...r, profile: j.profile, bar: j.bar, barSource: j.barSource, ...(photo ? { photo } : {}) });
  }
  // A withdrawn judge goes back in after the judge they followed in the guide.
  judges.forEach((j, i) => {
    if (!j.withdrawn || retentions.some((r) => key(r.judge) === key(j.judge))) return;
    const at = retentions.findIndex((r) => key(r.judge) === key(judges[i - 1]?.judge ?? ''));
    retentions.splice(at + 1, 0, { id: j.id, court: j.court, judge: j.judge, withdrawn: true, profile: j.profile });
  });
  ballot.retentions = retentions;

  let linked = 0, rated = 0, total = 0;
  const prevCandidate = new Map((prev?.races ?? []).flatMap((x) => x.candidates.map((c) => [`${x.id}|${c.name}`, c])));
  for (const r of ballot.races) for (const c of r.candidates) {
    const url = profiles.get(`${r.id}|${c.name}`);
    if (url) { c.profile = url; linked++; } else delete c.profile;
    // The guide's photo, for a judicial candidate nothing else has a photo of.
    const old = prevCandidate.get(`${r.id}|${c.name}`)?.photo;
    if (!c.photo || c.photo.credit === CREDIT) {
      const photo = await photoFor(photos.get(`${r.id}|${c.name}`), c.name, url, old?.credit === CREDIT ? old : undefined);
      if (photo) c.photo = photo; else if (c.photo?.credit === CREDIT) delete c.photo;
    }
    const rating = bars.get(`${r.id}|${c.name}`);
    if (rating) { c.bar = rating.bar; c.barSource = rating.source; rated++; } else { delete c.bar; delete c.barSource; }
    if (/^Judge/.test(r.office)) total++;
  }
  const used = new Set([...retentions, ...ballot.races.flatMap((r) => r.candidates)].filter((x) => x.photo).map((x) => x.photo.file.split('/').pop()));
  for (const f of readdirSync(dir)) if (f.startsWith('retain-') && !used.has(f)) rmSync(join(dir, f));
  return { log: [`judges: ${retentions.filter((r) => r.bar).length}/${retentions.length} retentions rated, ${retentions.filter((r) => r.photo).length} with a photo, ${retentions.filter((r) => r.withdrawn).length} withdrawn, ${linked}/${total} judicial candidates linked, ${rated}/${total} rated, ${saved} photos saved${note}`, ...log] };
}
