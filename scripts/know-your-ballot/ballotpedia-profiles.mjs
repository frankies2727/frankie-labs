// Candidates' photos, campaign websites and social accounts from their
// Ballotpedia profiles. Ballotpedia labels every link it has ("Campaign
// website", "Official Facebook", "Personal LinkedIn"), so accounts are taken
// only from those labels, campaign first; the photo is the one on the
// profile, saved with the site and credited to Ballotpedia.
//
// A candidate whose list entry links to their profile (Michigan) is read
// there. Anyone else is looked for at ballotpedia.org/<First_Last> (and the
// usual variants), and the page is kept only when its title is their name
// and it places them in this state and this election.
//
// Michigan fills everything from here; Illinois, whose official sources come
// first, fills only what's still missing. A profile that can't be read today
// keeps what the last build saved.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageType, shrink } from './illinois/photos.mjs';
import { browserPage } from './browser.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const BUDGET_MS = 12 * 60_000;
const POOL = 3;
const PLACEHOLDER = /SubmitPhoto|Silhouette|Placeholder/i;

// Ballotpedia's link labels -> the app's platforms (../types.ts SocialPlatform).
const PLATFORM = { x: 'x', twitter: 'x', facebook: 'facebook', instagram: 'instagram', youtube: 'youtube', tiktok: 'tiktok', bluesky: 'bluesky', threads: 'threads', linkedin: 'linkedin' };
// Campaign accounts first, then the office's, then personal ones.
const RANK = { campaign: 0, official: 1, personal: 2 };

const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&#160;|&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

// Ballotpedia's firewall answers Node's own HTTP client with a challenge but
// usually lets curl through, so pages and photos come via curl. Some days it
// challenges curl too (whole refreshes used to read nothing); then the page is
// read in the headless browser, where the challenge resolves itself.
function curl(url, binary = false) {
  return execFileSync('curl', ['-sSL', '--compressed', '--max-time', '60', '-A', UA, url], { maxBuffer: 32e6, encoding: binary ? 'buffer' : 'utf8' });
}
// Every real Ballotpedia page, a profile or not, carries the site's name in its title; a challenge page doesn't.
const isBallotpedia = (html) => /<title>[^<]*Ballotpedia<\/title>/.test(html);
async function ballotpediaPage(url) {
  const html = curl(url);
  if (isBallotpedia(html)) return html;
  return (await browserPage(url, isBallotpedia, UA)) ?? html;
}

/** What a profile page says: its photo and labelled links. */
export function parseProfile(html) {
  const out = { social: {}, website: undefined, photo: undefined };
  const ranked = {};
  for (const [, href, whose, what] of html.matchAll(/<a [^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*(Campaign|Official|Personal) (website|Facebook|X|Twitter|Instagram|YouTube|TikTok|Bluesky|Threads|LinkedIn)\s*<\/a>/gi)) {
    const url = decode(href).trim();
    if (!/^https:\/\//.test(url) || /ballotpedia\.org/.test(url)) continue;
    const kind = whose.toLowerCase();
    const rank = RANK[kind];
    const key = /^website$/i.test(what) ? 'website' : PLATFORM[what.toLowerCase()];
    if (!key || key === 'website' && kind === 'personal') continue;
    if (ranked[key] === undefined || rank < ranked[key]) { ranked[key] = rank; if (key === 'website') out.website = url; else out.social[key] = url; }
  }
  const img = [...html.matchAll(/<img [^>]*src="(https?:\/\/[^"]+)"[^>]*class="widget-img"[^>]*>/g)].map((m) => decode(m[1])).find((u) => !PLACEHOLDER.test(u));
  if (img) out.photo = img;
  return out;
}

/**
 * The candidate's own answer to Ballotpedia's Candidate Connection survey
 * question "Please list below 3 key messages of your campaign", verbatim:
 * { messages: [...], asOf: 'YYYY-MM-DD' } or null. Ballotpedia publishes the
 * answers under CC BY-SA; the candidate wrote them.
 */
export function parseStances(html) {
  const at = html.search(/key messages of your campaign/i);
  if (at < 0) return null;
  const after = html.slice(at);
  const box = after.match(/<div class="answers-container">([\s\S]*?)<\/div>/)?.[1];
  if (!box) return null;
  const text = (t) => decode(t.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  let messages = [...box.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1])).filter(Boolean);
  if (!messages.length) messages = box.split(/<\/p>|<br\s*\/?>/i).map(text).filter(Boolean);
  messages = messages.slice(0, 3).map((m) => (m.length > 700 ? m.slice(0, 697).replace(/\s+\S*$/, '') + '…' : m));
  if (!messages.length) return null;
  const asOf = html.slice(Math.max(0, at - 400), at).match(/-(\d{4}-\d{2}-\d{2})-/g)?.at(-1)?.slice(1, 11);
  return { messages, asOf };
}

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const parts = (n) => fold(n.split(' & ')[0].replace(/["“”][^"“”]*["“”]/g, ' ').replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).split(/[^a-z]+/).filter(Boolean);
// Short forms Ballotpedia and ballots disagree on ("Dan Swanson" is "Daniel Swanson" there).
const SHORT = { angie: 'angelica', jaz: 'jasper', timmy: 'timothy', jim: 'james', jimmy: 'james', bill: 'william', billy: 'william', will: 'william', bob: 'robert', rob: 'robert', bobby: 'robert', dick: 'richard', rick: 'richard', mike: 'michael', tom: 'thomas', tommy: 'thomas', joe: 'joseph', joey: 'joseph', dan: 'daniel', danny: 'daniel', chris: 'christopher', charlie: 'charles', chuck: 'charles', ben: 'benjamin', tony: 'anthony', ted: 'edward', ed: 'edward', eddie: 'edward', jack: 'john', johnny: 'john', liz: 'elizabeth', beth: 'elizabeth', betty: 'elizabeth', kathy: 'katherine', kate: 'katherine', katie: 'katherine', peggy: 'margaret', maggie: 'margaret', meg: 'margaret', sam: 'samuel', steve: 'steven', stephen: 'steven', matt: 'matthew', pat: 'patrick', andy: 'andrew', drew: 'andrew', nick: 'nicholas', greg: 'gregory', jeff: 'jeffrey', ken: 'kenneth', ron: 'ronald', don: 'donald', fred: 'frederick', frank: 'francis', larry: 'lawrence', jerry: 'gerald', terry: 'terrence', tim: 'timothy', jon: 'jonathan', dave: 'david', doug: 'douglas', gabby: 'gabrielle', sue: 'susan', debbie: 'deborah', deb: 'deborah', jen: 'jennifer', jenny: 'jennifer', jess: 'jessica', vicky: 'victoria', vicki: 'victoria', alex: 'alexander', al: 'albert', abe: 'abraham', ray: 'raymond', russ: 'russell', marty: 'martin', manny: 'manuel', pete: 'peter', josh: 'joshua', zach: 'zachary', nate: 'nathan', lou: 'louis', vince: 'vincent', max: 'maxwell' };
const sameFirst = (a, b) => a === b || (SHORT[a] ?? a) === (SHORT[b] ?? b) || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
/** The quoted nickname, if any ("Christopher "C.D." Davidsmeyer" -> "cd"). */
const nickname = (n) => { const q = n.match(/["“”]([^"“”]+)["“”]/)?.[1]; return q ? fold(q).replace(/[^a-z]/g, '') : null; };
/** First and last name agree ("Robert W. Fioretti" ~ "Robert Fioretti", "Dan" ~ "Daniel", a quoted nickname as the first name). */
export const namesAgree = (a, b) => {
  const [pa, pb] = [parts(a), parts(b)];
  if (pa.length < 2 || pb.length < 2 || pa.at(-1) !== pb.at(-1)) return false;
  const firsts = (n, p) => [p[0], nickname(n)].filter(Boolean);
  return firsts(a, pa).some((x) => firsts(b, pb).some((y) => sameFirst(x, y)));
};

/**
 * Is a page found by name this candidate's? Its title must be their name, and
 * it must place them in this state (and, for the university boards, name the
 * university) and in this election year.
 */
const UNIVERSITY = /University of Michigan|Michigan State University|Wayne State University/;
function isAbout(html, name, office, state) {
  const title = html.match(/<title>([^<|-]+)/)?.[1]?.trim() ?? '';
  return namesAgree(title, name) && /2026/.test(html) && html.includes(state) && html.includes(office.match(UNIVERSITY)?.[0] ?? '');
}

/** Page names to try for someone whose profile isn't linked: as written, without middle names or nicknames, with the state. */
function guesses(name, state) {
  const lead = name.split(' & ')[0].trim();
  const plain = lead.replace(/["“”][^"“”]*["“”]/g, ' ').replace(/\b[A-Z]\.\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const p = parts(lead);
  const short = `${p[0]} ${p.at(-1)}`;
  const names = [...new Set([lead, plain, short].map((n) => n.replace(/\s+/g, '_')))];
  return names.flatMap((n) => [`https://ballotpedia.org/${n}`, `https://ballotpedia.org/${n}_(${state})`]);
}

/** Ballotpedia's own search for the name: the first few pages whose title is the name. */
async function searchHits(name) {
  const lead = name.split(' & ')[0].trim().replace(/["“”][^"“”]*["“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const html = await ballotpediaPage(`https://ballotpedia.org/wiki/index.php?${new URLSearchParams({ search: lead, fulltext: '1', ns0: '1' })}`);
  return [...html.matchAll(/class="mw-search-result-heading"><a href="(\/[^"]+)"[^>]*title="([^"]+)"/g)]
    .filter(([, , title]) => namesAgree(title.replace(/\s*\([^)]*\)\s*$/, ''), lead))
    .map(([, href]) => `https://ballotpedia.org${href}`).slice(0, 3);
}

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); });
  await Promise.all(workers);
}

/**
 * Attach `website`, `social` and `photo` from each candidate's profile.
 * `state` is the state's name, for checking pages found by name. With `fill:
 * 'missing'`, a candidate keeps what they already have and only gaps are
 * filled, and the profile URL is not recorded (Illinois uses `profile` for
 * judges' Injustice Watch pages). Photos go in `dir` (served at `publicPath`).
 */
export async function addProfiles(races, { dir, publicPath, prev, state = 'Michigan', fill = 'all' }) {
  if (dir) mkdirSync(dir, { recursive: true });
  // 'stances': only find each candidate's page and read their survey answers (the standalone refresh).
  const stancesOnly = fill === 'stances';
  const prevBy = new Map((prev?.races ?? []).flatMap((r) => r.candidates.map((c) => [`${r.id}|${c.name}`, c])));
  const started = Date.now();
  const log = [];
  const used = new Set();
  const missing = fill === 'missing' || stancesOnly;
  let withPhoto = 0, withSocial = 0, withProfile = 0, total = 0;
  const jobs = races.flatMap((race) => race.candidates.map((c) => ({ race, c })));
  total = jobs.length;
  for (const { c } of jobs) if (c.photo) used.add(c.photo.file.split('/').pop());

  await pool(jobs, POOL, async ({ race, c }) => {
    const key = `${race.id}|${c.name}`;
    const was = prevBy.get(key);
    const keep = () => {
      if (stancesOnly) { if (!c.stances && was?.stances) c.stances = was.stances; if (!c.ballotpedia && was?.ballotpedia) c.ballotpedia = was.ballotpedia; return; }
      if (!c.photo && was?.photo && existsSync(join(dir, was.photo.file.split('/').pop()))) { c.photo = was.photo; used.add(was.photo.file.split('/').pop()); }
      if (!c.social && was?.social) c.social = was.social;
      if (!c.website && was?.website) c.website = was.website;
      if (!c.stances && was?.stances) c.stances = was.stances;
      if (!c.ballotpedia && was?.ballotpedia) c.ballotpedia = was.ballotpedia;
    };
    // Someone whose page was already read keeps their survey answers until the page is read again.
    if (missing && c.photo && c.social && c.website && (was?.ballotpedia || c.ballotpedia) && !stancesOnly) { keep(); return; }
    if (Date.now() - started > BUDGET_MS) { keep(); return; }
    try {
      // No profile linked: find it by name, and make sure it's them.
      let profile = c.profile?.match(/^https:\/\/ballotpedia\.org\/\S+$/)?.[0] ?? c.ballotpedia ?? was?.ballotpedia ?? was?.photo?.link?.match(/^https:\/\/ballotpedia\.org\/\S+$/)?.[0];
      if (!profile) {
        for (const url of guesses(c.name, state)) {
          if (isAbout(await ballotpediaPage(url), c.name, race.office, state)) { profile = url; break; }
        }
        if (!profile) {
          for (const url of await searchHits(c.name)) {
            if (isAbout(await ballotpediaPage(url), c.name, race.office, state)) { profile = url; break; }
          }
        }
        if (!profile) { keep(); log.push(`no profile found for ${c.name} (${race.office})`); return; }
      }
      if (!missing) c.profile = profile;
      c.ballotpedia = profile;
      const html = await ballotpediaPage(profile);
      // A challenge page the browser couldn't clear, or an error page, is not their profile: keep what the last read found.
      if (!isBallotpedia(html) || !/infobox person|widget-row/.test(html)) throw new Error('profile page not readable today');
      const stances = parseStances(html);
      // An answer from an earlier run for another office isn't this campaign's message.
      if (stances && (!stances.asOf || stances.asOf >= '2025-01-01')) c.stances = { ...stances, url: profile }; else delete c.stances;
      if (stancesOnly) return;
      const page = parseProfile(html);
      if (page.website && !c.website) c.website = page.website;
      if (Object.keys(page.social).length && !(missing && c.social)) c.social = page.social;
      if (missing && c.photo) return;
      if (page.photo) {
        const file = `${slug(`${c.name.split(' & ')[0]}-${race.id}`)}.jpg`;
        if (was?.photo?.from === page.photo && existsSync(join(dir, file))) {
          c.photo = was.photo;
        } else {
          const raw = curl(page.photo, true);
          const type = imageType(raw);
          if (!type) throw new Error(`not an image: ${page.photo}`);
          writeFileSync(join(dir, file), shrink(raw, type).bytes);
          c.photo = { file: `${publicPath}/${file}`, credit: 'Ballotpedia', link: profile, from: page.photo };
        }
        used.add(file);
      } else keep();
    } catch (e) {
      keep();
      log.push(`${c.name}: ${e.message.split('\n')[0].slice(0, 120)}`);
    }
  });

  for (const { c } of jobs) { if (c.photo) withPhoto++; if (c.social) withSocial++; if (c.profile || (missing && c.photo?.credit === 'Ballotpedia')) withProfile++; }
  if (!missing) for (const f of readdirSync(dir)) if (!used.has(f) && !f.startsWith('retain-')) rmSync(join(dir, f));
  return { withPhoto, withSocial, withProfile, total, log };
}

// Standalone: refresh the committed data's survey answers (`node ballotpedia-profiles.mjs illinois|michigan`).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync: read, writeFileSync: write } = await import('node:fs');
  const which = process.argv[2] ?? 'michigan';
  const file = new URL(`../../src/projects/know-your-ballot/data/${which}/ballot.json`, import.meta.url);
  const data = JSON.parse(read(file, 'utf8'));
  const r = await addProfiles(data.races, { prev: data, state: which === 'michigan' ? 'Michigan' : 'Illinois', fill: 'stances' });
  const n = data.races.flatMap((x) => x.candidates).filter((c) => c.stances).length;
  console.log(`Stances: ${n} of ${r.total} candidates answered Ballotpedia's survey`);
  for (const l of r.log.slice(0, 30)) console.log('  ' + l);
  write(file, JSON.stringify(data, null, 1) + '\n');
}
