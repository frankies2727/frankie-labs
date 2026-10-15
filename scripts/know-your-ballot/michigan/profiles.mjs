// Each Michigan candidate's photo, campaign website and social accounts,
// from their Ballotpedia profile (the page their name links to in the
// candidate lists). Ballotpedia labels every link it has ("Campaign
// website", "Official Facebook", "Personal LinkedIn"), so accounts are taken
// only from those labels, campaign first; the photo is the one on the
// profile, saved with the site and credited to Ballotpedia.
//
// Candidates from Wikipedia (the university boards) have no profile link;
// their profile is looked for at ballotpedia.org/<First_Last> and kept only
// when that page is about a Michigan candidate for that board.
//
// A profile that can't be read today keeps what the last build saved.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageType, shrink } from '../illinois/photos.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const BUDGET_MS = 12 * 60_000;
const POOL = 3;
const PLACEHOLDER = /SubmitPhoto|Silhouette|Placeholder/i;

// Ballotpedia's link labels -> the app's platforms (../types.ts SocialPlatform).
const PLATFORM = { x: 'x', twitter: 'x', facebook: 'facebook', instagram: 'instagram', youtube: 'youtube', tiktok: 'tiktok', bluesky: 'bluesky', threads: 'threads', linkedin: 'linkedin' };
// Campaign accounts first, then the office's, then personal ones.
const RANK = { campaign: 0, official: 1, personal: 2 };

const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&#160;|&nbsp;/g, ' ');

// Ballotpedia's firewall answers Node's own HTTP client with a challenge but
// lets curl through (./ballotpedia.mjs), so pages and photos come via curl.
function curl(url, binary = false) {
  return execFileSync('curl', ['-sSL', '--compressed', '--max-time', '60', '-A', UA, '-w', binary ? '' : '', url], { maxBuffer: 32e6, encoding: binary ? 'buffer' : 'utf8' });
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
 * Is a page found by name this candidate's? Its title must be their name and
 * it must mention their university (the boards are the only candidates
 * looked up this way) and this election year.
 */
const UNIVERSITY = /University of Michigan|Michigan State University|Wayne State University/;
const isAbout = (html, name, office) => html.includes(`<title>${name}`) && /2026/.test(html) && html.includes(office.match(UNIVERSITY)?.[0] ?? office);

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); });
  await Promise.all(workers);
}

/**
 * Attach `website`, `social` and `photo` to every candidate whose profile can
 * be read. Photos go in `dir` (served at `publicPath`); unused ones are removed.
 */
export async function addProfiles(races, { dir, publicPath, prev }) {
  mkdirSync(dir, { recursive: true });
  const prevBy = new Map((prev?.races ?? []).flatMap((r) => r.candidates.map((c) => [`${r.id}|${c.name}`, c])));
  const started = Date.now();
  const log = [];
  const used = new Set();
  let withPhoto = 0, withSocial = 0, withProfile = 0, total = 0;
  const jobs = races.flatMap((race) => race.candidates.map((c) => ({ race, c })));
  total = jobs.length;

  await pool(jobs, POOL, async ({ race, c }) => {
    const key = `${race.id}|${c.name}`;
    const was = prevBy.get(key);
    const keep = () => {
      if (was?.photo && existsSync(join(dir, was.photo.file.split('/').pop()))) { c.photo = was.photo; used.add(was.photo.file.split('/').pop()); }
      if (was?.social) c.social = was.social;
      if (was?.website && !c.website) c.website = was.website;
    };
    if (Date.now() - started > BUDGET_MS) { keep(); return; }
    try {
      // The boards' candidates: find the profile by name, and make sure it's them.
      if (!c.profile) {
        const guess = `https://ballotpedia.org/${c.name.split(' & ')[0].replace(/\s+/g, '_')}`;
        for (const url of [guess, `${guess}_(Michigan)`]) {
          const html = curl(url);
          if (isAbout(html, c.name, race.office)) { c.profile = url; break; }
        }
        if (!c.profile) { keep(); log.push(`no profile found for ${c.name} (${race.office})`); return; }
      }
      const page = parseProfile(curl(c.profile));
      if (page.website && !c.website) c.website = page.website;
      if (Object.keys(page.social).length) c.social = page.social;
      if (page.photo) {
        const file = `${slug(`${c.name.split(' & ')[0]}-${race.id}`)}.jpg`;
        if (was?.photo?.from === page.photo && existsSync(join(dir, file))) {
          c.photo = was.photo;
        } else {
          const raw = curl(page.photo, true);
          const type = imageType(raw);
          if (!type) throw new Error(`not an image: ${page.photo}`);
          writeFileSync(join(dir, file), shrink(raw, type).bytes);
          c.photo = { file: `${publicPath}/${file}`, credit: 'Ballotpedia', link: c.profile, from: page.photo };
        }
        used.add(file);
      } else keep();
    } catch (e) {
      keep();
      log.push(`${c.name}: ${e.message.split('\n')[0].slice(0, 120)}`);
    }
  });

  for (const { c } of jobs) { if (c.photo) withPhoto++; if (c.social) withSocial++; if (c.profile) withProfile++; }
  for (const f of readdirSync(dir)) if (!used.has(f)) rmSync(join(dir, f));
  return { withPhoto, withSocial, withProfile, total, log };
}
