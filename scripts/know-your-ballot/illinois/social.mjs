// Candidates' social media accounts, only from sources that are theirs or
// official, never guessed from a name alone:
//   1. Members of Congress: the @unitedstates congress-legislators social file.
//   2. Sitting Illinois legislators: Open States (their homepage and Wikipedia
//      page), matched by district and last name.
//   3. Wikidata, through that Wikipedia page, or a Wikipedia page titled with
//      the candidate's exact name whose Wikidata entry describes an Illinois or
//      Chicago politician.
//   4. The candidate's own campaign website (from their State Board filing or
//      Open States): the social links on its home page, kept only when the
//      account name carries part of the candidate's name. Sites also link to
//      their party caucus, their web designer or a theme vendor.
// Earlier sources win when two disagree.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONGRESS = 'https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const UA = 'KnowYourBallot/1.0 (https://github.com/frankies2727/frankie-labs)';

const PLATFORMS = {
  x: (h) => `https://x.com/${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  youtube: (h) => `https://www.youtube.com/channel/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  bluesky: (h) => `https://bsky.app/profile/${h}`,
};

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Last name of a ballot name ("Darren Bailey & Aaron B. Del Mar" -> "bailey"). */
const lastName = (name) => fold(name.split(' & ')[0].replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).trim().split(/\s+/).pop();

async function json(url, opts = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000), ...opts });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// ---- 1. Congress --------------------------------------------------------------
async function congress() {
  const [people, social] = await Promise.all([json(`${CONGRESS}legislators-current.json`), json(`${CONGRESS}legislators-social-media.json`)]);
  const byId = new Map(social.map((s) => [s.id.bioguide, s.social]));
  const out = [];
  for (const p of people) {
    const term = p.terms.at(-1);
    if (term.state !== 'IL') continue;
    const s = byId.get(p.id.bioguide) ?? {};
    out.push({
      last: fold(p.name.last), type: term.type, district: term.district != null ? String(term.district) : null,
      social: { x: s.twitter && PLATFORMS.x(s.twitter), facebook: s.facebook && PLATFORMS.facebook(s.facebook), instagram: s.instagram && PLATFORMS.instagram(s.instagram), youtube: s.youtube_id && PLATFORMS.youtube(s.youtube_id) },
      website: term.url,
    });
  }
  return out;
}

// ---- 2. Open States (Illinois legislators) ------------------------------------------
// A few fields from each person's YAML; the files are regular enough to read by line.
function readPerson(text) {
  const name = text.match(/^name: "?(.+?)"?$/m)?.[1]?.replace(/\\x([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const roles = [...text.matchAll(/- (?:start_date: \S+\n\s+)?type: (lower|upper)[\s\S]*?district: '?(\d+)'?/g)];
  const role = roles.at(-1);
  const links = [...text.matchAll(/^- url: (\S+)/gm)].map((m) => m[1]);
  return {
    last: name && fold(text.match(/^family_name: "?(.+?)"?$/m)?.[1]?.replace(/\\x([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))) ?? name.split(' ').pop()),
    chamber: role?.[1], district: role?.[2],
    website: links.find((u) => !/ilga\.gov|wikipedia|ballotpedia|openstates/i.test(u)),
    wiki: links.find((u) => /en\.wikipedia\.org\/wiki\//.test(u))?.split('/wiki/')[1],
  };
}

function openStates(work) {
  const dir = join(work, 'openstates');
  execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/openstates/people', dir]);
  execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', 'data/il/legislature']);
  const legis = join(dir, 'data/il/legislature');
  return readdirSync(legis).map((f) => readPerson(readFileSync(join(legis, f), 'utf8'))).filter((p) => p.last && p.district);
}

// ---- 3. Wikidata ------------------------------------------------------------------------
const PROPS = { P2002: 'x', P2013: 'facebook', P2003: 'instagram', P2397: 'youtube', P7085: 'tiktok', P12361: 'bluesky' };

/** Social accounts by Wikipedia title; with `mustBeLocal`, only entries describing an Illinois/Chicago politician. */
async function wikidata(titles, mustBeLocal) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const q = new URLSearchParams({ action: 'wbgetentities', sites: 'enwiki', titles: batch.join('|'), props: 'claims|descriptions|sitelinks', languages: 'en', normalize: '1', format: 'json' });
    const d = await json(`${WIKIDATA}?${q}`);
    for (const e of Object.values(d.entities ?? {})) {
      if (e.missing !== undefined) continue;
      const desc = e.descriptions?.en?.value ?? '';
      if (mustBeLocal && !(/politician|judge|candidate|activist|businessman|businesswoman|attorney|lawyer/i.test(desc) && /illinois|chicago/i.test(desc))) continue;
      const social = {};
      for (const [p, key] of Object.entries(PROPS)) {
        const v = e.claims?.[p]?.find((c) => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value;
        if (typeof v === 'string' && /^[\w.@-]+$/.test(v)) social[key] = PLATFORMS[key](v);
      }
      const title = e.sitelinks?.enwiki?.title?.replace(/ /g, '_');
      if (title && Object.keys(social).length) out.set(fold(title), social);
    }
  }
  return out;
}

// ---- 4. Campaign websites ------------------------------------------------------------------
const PATTERNS = {
  x: /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?!intent|share|home|search|hashtag)([A-Za-z0-9_]{1,15})\/?$/i,
  facebook: /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|profile\.php)([\w.-]+)\/?$/i,
  instagram: /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore)([\w.]+)\/?$/i,
  youtube: /^https?:\/\/(?:www\.)?youtube\.com\/((?:@|channel\/|c\/|user\/)[\w.-]+)\/?$/i,
  tiktok: /^https?:\/\/(?:www\.)?tiktok\.com\/@([\w.]+)\/?$/i,
  bluesky: /^https?:\/\/bsky\.app\/profile\/([\w.-]+)\/?$/i,
  threads: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([\w.]+)\/?$/i,
  linkedin: /^https?:\/\/(?:www\.)?linkedin\.com\/(in|company)\/([\w-]+)\/?$/i,
};

/** Pieces of a ballot name worth finding in a handle: names and quoted nicknames, 3+ letters. */
const nameParts = (name) => [...new Set(fold(name.split(' & ')[0]).replace(/["“”]/g, ' ').split(/[^a-z]+/))]
  .filter((w) => w.length >= 3 && !['jr', 'sr', 'iii'].includes(w));
const handleOf = (url) => fold(decodeURIComponent(url.replace(/^https?:\/\/[^/]+\//, ''))).replace(/[^a-z]/g, '');

async function fromWebsite(url, name) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return {};
    const html = (await res.text()).slice(0, 2_000_000);
    const found = {};
    for (const [, href] of html.matchAll(/href=["']([^"'#?]+)["'?#]/gi)) {
      const link = href.trim();
      for (const [key, re] of Object.entries(PATTERNS)) {
        if (found[key] || !re.test(link)) continue;
        const handle = handleOf(link);
        if (nameParts(name).some((w) => handle.includes(w))) found[key] = link.replace(/^http:/, 'https:').replace(/\/$/, '');
      }
    }
    return found;
  } catch {
    return {}; // a site that's down just adds nothing
  }
}

async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const n = i++; out[n] = await fn(items[n]); } }));
  return out;
}

/** Attach `social` (and a missing `website`) to every candidate we can. */
export async function addSocial(races, work) {
  const log = [];
  const tryStep = async (name, f) => { try { return await f(); } catch (e) { log.push(`${name}: ${e.message}`); return null; } };
  const members = (await tryStep('congress', congress)) ?? [];
  const legislators = (await tryStep('open states', () => openStates(work))) ?? [];

  const entries = races.flatMap((race) => race.candidates.map((c) => ({ race, c, last: lastName(c.name) })));
  for (const e of entries) {
    const { race, last } = e;
    if (race.area?.type === 'cd') e.member = members.find((m) => m.type === 'rep' && m.district === race.area.id && m.last === last);
    if (race.office === 'United States Senator') e.member = members.find((m) => m.type === 'sen' && m.last === last);
    const chamber = race.area?.type === 'sldl' ? 'lower' : race.area?.type === 'sldu' ? 'upper' : null;
    if (chamber) e.legislator = legislators.find((l) => l.chamber === chamber && l.district === race.area.id && l.last === last);
  }

  const viaOpenStates = (await tryStep('wikidata (open states)', () => wikidata([...new Set(entries.map((e) => e.legislator?.wiki).filter(Boolean))], false))) ?? new Map();
  const leadName = (c) => c.name.split(' & ')[0].trim().replace(/ /g, '_');
  const byName = (await tryStep('wikidata (names)', () => wikidata([...new Set(entries.map((e) => leadName(e.c)))], true))) ?? new Map();

  for (const e of entries) e.website = e.c.website ?? e.legislator?.website ?? e.member?.website;
  const sites = await pool(entries, 8, (e) => (e.website ? fromWebsite(e.website, e.c.name) : {}));

  const merged = entries.map((e, i) => {
    const m = {};
    for (const src of [e.member?.social, e.legislator?.wiki && viaOpenStates.get(fold(e.legislator.wiki)), byName.get(fold(leadName(e.c))), sites[i]]) {
      for (const [k, v] of Object.entries(src ?? {})) if (v && !m[k]) m[k] = v;
    }
    return m;
  });
  // An account found for two different candidates can't be pinned to either.
  const seen = new Map();
  for (const m of merged) for (const v of Object.values(m)) seen.set(v.toLowerCase(), (seen.get(v.toLowerCase()) ?? 0) + 1);
  let withSocial = 0;
  entries.forEach((e, i) => {
    const m = Object.fromEntries(Object.entries(merged[i]).filter(([, v]) => seen.get(v.toLowerCase()) === 1));
    if (Object.keys(m).length) { e.c.social = m; withSocial++; } else delete e.c.social;
    if (!e.c.website && e.website) e.c.website = e.website;
  });
  return { withSocial, total: entries.length, log };
}
