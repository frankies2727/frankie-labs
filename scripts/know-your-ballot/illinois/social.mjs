// Candidates' social media accounts, only from sources that are theirs or
// official, never guessed from a name alone:
//   1. Members of Congress: the @unitedstates congress-legislators social file.
//   2. Sitting Illinois legislators: Open States (their homepage and Wikipedia
//      page), matched by district and last name.
//   3. Wikidata, through that Wikipedia page, or found by Wikidata's own search
//      (its documented API) when the entry's name matches and its description
//      is an Illinois or Chicago politician, judge or the like. Wikidata also
//      gives an official website when we have none.
//   4. The candidate's own campaign website (from their State Board filing,
//      Open States or Wikidata): the social links anywhere on its home page
//      (links, embedded Facebook page boxes, page metadata), kept only when the
//      account name carries part of the candidate's name or their initials.
//      Sites also link to their party caucus, their web designer or a theme
//      vendor. Sites that turn away plain requests are read in a real browser.
//      Vote Smart / Ballotpedia profile pages aren't campaign sites.
// Earlier sources win when two disagree.
//
// The same matches give each candidate a photo source (`photoFrom`, turned into
// a saved photo by ./photos.mjs): Congress's official portrait, the General
// Assembly's member photo (listed by Open States), or the Wikidata entry's
// image on Wikimedia Commons. Only ever for a candidate matched above.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONGRESS = 'https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const SEARCH_MINUTES = 8;
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
  // Wikidata asks bots to slow down with a 429: wait as told, then try again.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000), ...opts });
    if (res.status === 429 && attempt < 5) {
      await res.body?.cancel(); // free the connection, or later requests queue behind it
      await new Promise((r) => setTimeout(r, 1000 * Math.min(Number(res.headers.get('retry-after')) || 2 ** attempt, 10)));
      continue;
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }
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
      // Official portraits, public domain (via the @unitedstates project).
      photo: { url: `https://unitedstates.github.io/images/congress/450x550/${p.id.bioguide}.jpg`, credit: 'Official portrait, U.S. Congress (public domain)', link: `https://bioguide.congress.gov/search/bio/${p.id.bioguide}` },
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
    photo: (() => {
      // Only the General Assembly's own photos: a few point at news sites' photos, which we can't reuse.
      const url = text.match(/^image: (https:\/\/cdn\.ilga\.gov\/\S+)/m)?.[1];
      return url ? { url, credit: 'Illinois General Assembly', link: 'https://www.ilga.gov/' } : undefined;
    })(),
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

const ROLE = /politician|judge|candidate|activist|businessman|businesswoman|attorney|lawyer|official|commissioner|educator|alderm|legislator|sheriff|clerk|assessor|treasurer/i;
const isLocal = (desc) => /politician|judge|candidate|activist|businessman|businesswoman|attorney|lawyer|official|commissioner|educator|alderm|legislator/i.test(desc) && /illinois|chicago|cook county/i.test(desc);
const claim = (e, p) => e.claims?.[p]?.find((c) => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value;

/** An entity's social accounts and official website. */
function accountsOf(e) {
  const social = {};
  for (const [p, key] of Object.entries(PROPS)) {
    const v = claim(e, p);
    if (typeof v === 'string' && /^[\w.@-]+$/.test(v)) social[key] = PLATFORMS[key](v);
  }
  const site = claim(e, 'P856');
  const image = claim(e, 'P18'); // a Wikimedia Commons file name
  return {
    social,
    website: typeof site === 'string' && /^https?:\/\//.test(site) ? site : undefined,
    photo: typeof image === 'string' ? { commons: image } : undefined,
  };
}

/** Accounts by Wikipedia title (from Open States' links: already the right person). */
async function wikidata(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const q = new URLSearchParams({ action: 'wbgetentities', sites: 'enwiki', titles: titles.slice(i, i + 50).join('|'), props: 'claims|sitelinks', normalize: '1', format: 'json' });
    const d = await json(`${WIKIDATA}?${q}`);
    for (const e of Object.values(d.entities ?? {})) {
      const title = e.sitelinks?.enwiki?.title?.replace(/ /g, '_');
      if (e.missing === undefined && title) out.set(fold(title), accountsOf(e));
    }
  }
  return out;
}

/** First and last name agree ("Kimberly Du Buclet" ~ "Kimberly A. Du Buclet"). */
const namesAgree = (a, b) => {
  const parts = (n) => fold(n.replace(/["“”][^"“”]*["“”]/g, ' ').replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).split(/[^a-z]+/).filter(Boolean);
  const [pa, pb] = [parts(a), parts(b)];
  return pa.length > 1 && pb.length > 1 && pa[0] === pb[0] && pa.at(-1) === pb.at(-1);
};

/** Accounts by candidate name, through Wikidata's search: only an entry with the
 *  same first and last name whose description is local (an Illinois/Chicago
 *  politician, judge, …), and only when exactly one entry qualifies. */
async function wikidataSearch(names) {
  const out = new Map();
  let failed = 0;
  // One request at a time, as Wikimedia asks of bots. One name failing doesn't
  // cost the rest, and after SEARCH_MINUTES the step keeps what it has rather
  // than hold up the build.
  const deadline = Date.now() + SEARCH_MINUTES * 60_000;
  let skipped = 0;
  await pool(names, 1, async (name) => { if (Date.now() > deadline) { skipped++; return; } try {
    const q = new URLSearchParams({ action: 'wbsearchentities', search: name.replace(/["“”][^"“”]*["“”]/g, ' ').replace(/\s+/g, ' ').trim(), language: 'en', type: 'item', limit: '7', format: 'json' });
    // A short description often just says "American politician": then the
    // opening of their Wikipedia article has to place them in Illinois.
    const named = ((await json(`${WIKIDATA}?${q}`)).search ?? []).filter((h) => namesAgree(h.label ?? '', name) && ROLE.test(h.description ?? ''));
    const hits = [];
    for (const h of named) {
      const g = new URLSearchParams({ action: 'wbgetentities', ids: h.id, props: 'claims|sitelinks', format: 'json' });
      const e = (await json(`${WIKIDATA}?${g}`)).entities?.[h.id];
      if (!e) continue;
      if (isLocal(h.description ?? '')) { hits.push(e); continue; }
      const title = e.sitelinks?.enwiki?.title;
      if (!title) continue;
      const summary = await json(`${WIKIPEDIA_SUMMARY}${encodeURIComponent(title.replace(/ /g, '_'))}`).catch(() => null);
      if (/illinois|chicago|cook county/i.test(summary?.extract ?? '')) hits.push(e);
    }
    if (hits.length === 1) out.set(name, accountsOf(hits[0]));
  } catch { failed++; } });
  if (failed || skipped) console.warn(`wikidata search: ${failed} failed, ${skipped} skipped (time limit) of ${names.length}`);
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

/** The candidate's initials, when there are three or more ("Mary Beth Canty" -> "mbc", as in @repmbc). */
const initials = (name) => {
  const words = fold(name.split(' & ')[0]).replace(/["“”][^"“”]*["“”]/g, ' ').split(/[^a-z]+/).filter((w) => w && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w));
  return words.length >= 3 ? words.map((w) => w[0]).join('') : null;
};
const isTheirs = (handle, name) => nameParts(name).some((w) => handle.includes(w)) || (initials(name) && handle.includes(initials(name)));

// Every social link on a page, wherever it sits: links, embedded Facebook page
// boxes (…/plugins/page.php?href=<the page>), and page metadata (JSON-LD sameAs).
const SOCIAL_URL = /https?:\/\/(?:www\.|m\.|mobile\.)?(?:facebook|fb|twitter|x|instagram|youtube|tiktok|threads)\.(?:com|net)\/[^\s"'<>\\)]+|https?:\/\/bsky\.app\/profile\/[^\s"'<>\\)]+|https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[^\s"'<>\\)]+/gi;
function socialLinks(html) {
  const text = html.replace(/&quot;|&#34;/g, '"').replace(/&amp;/g, '&').replace(/\\\//g, '/');
  const out = new Set();
  for (let [url] of text.matchAll(SOCIAL_URL)) {
    const inner = url.match(/facebook\.com\/plugins\/page\.php\?(?:[^"]*&)?href=([^&"]+)/i);
    if (inner) { try { url = decodeURIComponent(inner[1]); } catch { continue; } }
    out.add(url.replace(/[?#].*$/, '').replace(/^http:/, 'https:').replace(/\/\/(?:m|mobile)\.facebook/, '//www.facebook').replace(/\/\/fb\.com/, '//www.facebook.com').replace(/\/$/, ''));
  }
  return [...out];
}

const NOT_A_SITE = /votesmart\.org|ballotpedia\.org/i;
// A bot check or an empty shell instead of the real page.
const looksReal = (html) => html.length > 3000 && !/just a moment|cf-chl|attention required|captcha|access denied/i.test(html.slice(0, 20_000));

async function fromWebsite(url, name, render) {
  let html = '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    if (res.ok) html = (await res.text()).slice(0, 2_000_000);
  } catch { /* try the browser */ }
  if (!looksReal(html) && render) {
    try { html = await render(url); } catch { /* down or behind a bot check */ }
  }
  if (!looksReal(html)) return null; // couldn't read it today
  const found = {};
  for (const link of socialLinks(html)) {
    for (const [key, re] of Object.entries(PATTERNS)) {
      if (!found[key] && re.test(link) && isTheirs(handleOf(link), name)) found[key] = link;
    }
  }
  return found;
}

async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const n = i++; out[n] = await fn(items[n]); } }));
  return out;
}

/**
 * Attach `social` (and a missing `website`) to every candidate we can. A
 * campaign site that can't be read today keeps the accounts `prev` (the last
 * build's ballot) found for that candidate.
 */
export async function addSocial(races, work, render, prev) {
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

  const viaOpenStates = (await tryStep('wikidata (open states)', () => wikidata([...new Set(entries.map((e) => e.legislator?.wiki).filter(Boolean))]))) ?? new Map();
  const leadName = (c) => c.name.split(' & ')[0].trim();
  const byName = (await tryStep('wikidata (search)', () => wikidataSearch([...new Set(entries.map((e) => leadName(e.c)))]))) ?? new Map();
  for (const e of entries) {
    e.wiki = (e.legislator?.wiki && viaOpenStates.get(fold(e.legislator.wiki))) || byName.get(leadName(e.c));
    // A profile page on Vote Smart or Ballotpedia isn't their campaign site.
    if (e.c.website && NOT_A_SITE.test(e.c.website)) delete e.c.website;
  }

  for (const e of entries) e.website = [e.c.website, e.legislator?.website, e.member?.website, e.wiki?.website].find((u) => u && !NOT_A_SITE.test(u));
  const sites = await pool(entries, 6, (e) => (e.website ? fromWebsite(e.website, e.c.name, render) : {}));
  const before = new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => c.social).map((c) => [`${r.id}|${c.name}`, c.social])));
  let unread = 0;
  entries.forEach((e, i) => { if (sites[i] === null) { unread++; sites[i] = before.get(`${e.race.id}|${e.c.name}`) ?? {}; } });
  if (unread) log.push(`campaign sites: ${unread} couldn't be read today (kept their last accounts)`);

  const merged = entries.map((e, i) => {
    const m = {};
    for (const src of [e.member?.social, e.wiki?.social, sites[i]]) {
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
    const photo = e.member?.photo ?? e.legislator?.photo ?? e.wiki?.photo;
    if (photo) e.c.photoFrom = photo; else delete e.c.photoFrom;
  });
  return { withSocial, total: entries.length, log };
}
