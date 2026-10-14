// Candidates' photos, saved with the site (public/kyb-photos/<state>/) so a
// visitor's browser never calls a third party for them. ./social.mjs decides
// whose photo is whose (`photoFrom` on a matched candidate); this step fetches
// it, keeps it only if it really is an image, and records where it came from
// and its credit. Wikimedia Commons files carry their author and license.
//
// Re-downloads only when the source changes; a candidate whose source can't be
// read in time (or wasn't matched) today keeps the photo the last build saved; files
// nobody uses any more are deleted.

import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { join } from 'node:path';
import tls from 'node:tls';

// Wikimedia asks for a contact in the User-Agent; the General Assembly's image
// server turns away any User-Agent carrying a URL, so it gets the plain name.
const UA_WIKIMEDIA = 'KnowYourBallot/1.0 (https://github.com/frankies2727/frankie-labs)';
const UA_PLAIN = 'KnowYourBallot/1.0';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const MAX_BYTES = 1_500_000;
const WIDTH = 360; // a thumbnail size from Commons: twice the 176 px circle
const BUDGET_MS = 5 * 60_000; // a slow or blocking image server can't hold up the daily build

const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stripHtml = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** The file type from its first bytes, or null when it isn't a photo. */
function imageType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

// An image is asked for the way a web page asks for one (an image Accept and the
// site's own address as Referer), as govbot does for the same hosts.
const headersFor = (url, ua, image) => image
  ? { 'User-Agent': ua, Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8', Referer: `${new URL(url).origin}/` }
  : { 'User-Agent': ua, Accept: 'application/json' };

async function get(url, ua, image = false) {
  const headers = headersFor(url, ua, image);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1000 * Math.min(Number(res.headers.get('retry-after')) || 2 ** attempt, 10)));
      continue;
    }
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
  }
}

// Some sites (the General Assembly's image server among them) send their
// certificate without the intermediate that links it to a trusted root. A browser
// downloads that intermediate from the "CA Issuers" address in the certificate;
// Node refuses the site instead. So, only after that error, do what the browser
// does: read the site's certificate (never trusting it) for the address, download
// the intermediate, and retry with the usual trusted roots plus that one
// certificate. The chain must still reach a trusted root and the hostname is
// still checked, so a forged intermediate fails. (govbot handles the same sites
// the same way.)
const INCOMPLETE_CHAIN = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);

/** The "CA Issuers" address in a certificate's infoAccess text, if any. */
export const caIssuersUrl = (infoAccess) => infoAccess?.match(/CA Issuers - URI:(http\S+)/)?.[1] ?? null;

const intermediates = new Map(); // host → Promise<PEM>
function intermediateFor(host) {
  if (!intermediates.has(host)) {
    const p = new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15_000 }, () => {
        const address = caIssuersUrl(socket.getPeerX509Certificate()?.infoAccess);
        socket.destroy();
        address ? resolve(address) : reject(new Error('no CA Issuers address'));
      });
      socket.on('error', reject).on('timeout', () => socket.destroy(new Error('timeout')));
    }).then(async (address) => {
      const res = await fetch(address, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`intermediate: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString('latin1').startsWith('-----BEGIN') ? buf.toString() : new X509Certificate(buf).toString();
    });
    p.catch(() => intermediates.delete(host)); // a network blip isn't remembered; the next photo retries
    intermediates.set(host, p);
  }
  return intermediates.get(host);
}

function getWithIntermediate(url, headers, ca) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, ca: [...tls.rootCertificates, ca], timeout: 20_000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > MAX_BYTES) req.destroy(new Error('too large')); else chunks.push(c); });
      res.on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
    });
    req.on('error', reject).on('timeout', () => req.destroy(new Error('timeout')));
  });
}

/** An image's bytes, filling in a missing intermediate certificate when a site needs it. */
async function download(url, ua) {
  try {
    return Buffer.from(await (await get(url, ua, true)).arrayBuffer());
  } catch (err) {
    if (!INCOMPLETE_CHAIN.has(err.cause?.code)) throw err;
    return getWithIntermediate(url, headersFor(url, ua, true), await intermediateFor(new URL(url).hostname));
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
  let fetched = 0, kept = 0, failed = 0, late = 0;
  const why = new Map(); // host + reason → how many, so the log says why photos were missed
  const deadline = Date.now() + BUDGET_MS;

  await pool(entries.filter((e) => e.c.photoFrom), 4, async (e) => {
    if (Date.now() > deadline) { late++; return; }
    const from = e.c.photoFrom;
    try {
      const src = from.commons ? await fromCommons(from.commons) : from;
      if (!src) throw new Error(`no Commons file ${from.commons}`);
      const old = before.get(e.key);
      if (old?.from === src.url && saved(old)) { e.c.photo = old; kept++; return; }
      const buf = await download(src.url, /wikimedia\.org/.test(src.url) ? UA_WIKIMEDIA : UA_PLAIN);
      const type = imageType(buf);
      if (!type || buf.length > MAX_BYTES) throw new Error(`${src.url}: not a usable image`);
      const name = `${slug(e.c.name.split(' & ')[0])}-${slug(e.race.id).slice(0, 40)}.${type}`;
      writeFileSync(join(dir, name), buf);
      e.c.photo = { file: `${publicPath}/${name}`, credit: src.credit, link: src.link, from: src.url };
      fetched++;
    } catch (err) {
      failed++;
      const host = from.commons ? 'commons.wikimedia.org' : new URL(from.url).host;
      const reason = `${host}: ${String(err.cause?.code ?? err.code ?? err.message).replace(/^https?:\/\/\S+: /, '')}`;
      why.set(reason, (why.get(reason) ?? 0) + 1);
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
  const reasons = [...why].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, n]) => `  missed ${n} × ${r}`);
  return { withPhoto: used.size, total: entries.length, log: [`photos: ${fetched} fetched, ${kept} unchanged, ${failed} couldn't be fetched, ${late} skipped (time limit)`, ...reasons] };
}
