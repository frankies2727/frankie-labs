// Candidates' photos, saved with the site (public/kyb-photos/<state>/) so a
// visitor's browser never calls a third party for them. ./social.mjs decides
// whose photo is whose (`photoFrom` on a matched candidate); this step fetches
// it, keeps it only if it really is an image, and records where it came from
// and its credit. Wikimedia Commons files carry their author and license.
//
// Re-downloads only when the source changes; a candidate whose source can't be
// read (or wasn't matched) today keeps the photo the last build saved; files
// nobody uses any more are deleted.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Wikimedia asks for a contact in the User-Agent; the General Assembly's image
// server turns away any User-Agent carrying a URL, so it gets the plain name.
const UA_WIKIMEDIA = 'KnowYourBallot/1.0 (https://github.com/frankies2727/frankie-labs)';
const UA_PLAIN = 'KnowYourBallot/1.0';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const MAX_BYTES = 1_500_000;
const WIDTH = 360; // a thumbnail size from Commons: twice the 176 px circle

const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stripHtml = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** The file type from its first bytes, or null when it isn't a photo. */
function imageType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

async function get(url, ua) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'image/*,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1000 * Math.min(Number(res.headers.get('retry-after')) || 2 ** attempt, 10)));
      continue;
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  }
}

/** A Commons file's thumbnail, author and license. */
async function fromCommons(file) {
  const q = new URLSearchParams({ action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(WIDTH), format: 'json' });
  const page = Object.values((await (await get(`${COMMONS}?${q}`, UA_WIKIMEDIA)).json()).query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  const meta = info.extmetadata ?? {};
  const artist = stripHtml(meta.Artist?.value ?? '') || 'Unknown author';
  const license = stripHtml(meta.LicenseShortName?.value ?? '') || 'see file page';
  return { url: info.thumburl, credit: `${artist} · ${license} · Wikimedia Commons`, link: info.descriptionurl };
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/**
 * Turn each candidate's `photoFrom` into `photo` ({ file, credit, link, from }),
 * `file` being a path under the site root. `dir` is where the files go on disk,
 * `publicPath` the same folder as the site serves it.
 */
export async function addPhotos(races, { dir, publicPath, prev }) {
  mkdirSync(dir, { recursive: true });
  const before = new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => c.photo).map((c) => [`${r.id}|${c.name}`, c.photo])));
  const saved = (p) => p && existsSync(join(dir, p.file.split('/').pop()));
  const entries = races.flatMap((race) => race.candidates.map((c) => ({ race, c, key: `${race.id}|${c.name}` })));
  const used = new Set();
  let fetched = 0, kept = 0, failed = 0;

  await pool(entries.filter((e) => e.c.photoFrom), 4, async (e) => {
    const from = e.c.photoFrom;
    try {
      const src = from.commons ? await fromCommons(from.commons) : from;
      if (!src) throw new Error(`no Commons file ${from.commons}`);
      const old = before.get(e.key);
      if (old?.from === src.url && saved(old)) { e.c.photo = old; kept++; return; }
      const res = await get(src.url, /wikimedia\.org/.test(src.url) ? UA_WIKIMEDIA : UA_PLAIN);
      const buf = Buffer.from(await res.arrayBuffer());
      const type = imageType(buf);
      if (!type || buf.length > MAX_BYTES) throw new Error(`${src.url}: not a usable image`);
      const name = `${slug(e.c.name.split(' & ')[0])}-${slug(e.race.id).slice(0, 40)}.${type}`;
      writeFileSync(join(dir, name), buf);
      e.c.photo = { file: `${publicPath}/${name}`, credit: src.credit, link: src.link, from: src.url };
      fetched++;
    } catch {
      failed++;
    }
  });

  for (const e of entries) {
    delete e.c.photoFrom;
    // Couldn't fetch (or match) it today: keep the last saved photo.
    if (!e.c.photo && saved(before.get(e.key))) e.c.photo = before.get(e.key);
    if (e.c.photo) used.add(e.c.photo.file.split('/').pop()); else delete e.c.photo;
  }
  // A photo nobody uses any more (a candidate who left the race) goes too.
  for (const f of readdirSync(dir)) if (!used.has(f)) rmSync(join(dir, f));
  return { withPhoto: used.size, total: entries.length, log: [`photos: ${fetched} fetched, ${kept} unchanged, ${failed} couldn't be fetched`] };
}
