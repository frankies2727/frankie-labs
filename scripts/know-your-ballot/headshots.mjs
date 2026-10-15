// A headshot from the candidate's own campaign website, for candidates no
// other source has a photo for. Only an image the site itself labels as
// them (its alt text or file name carries their last name, and no other
// candidate's), shaped like a portrait, and showing one clear face
// (face-check.py, OpenCV): sites label flyers, QR codes, logos and family
// photos with the candidate's name too. Credited to the campaign site.
// These are re-checked every build; a site that can't be read today keeps
// the photo the last build saved. Without OpenCV the step takes nothing.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageType, shrink } from './illinois/photos.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const BUDGET_MS = 6 * 60_000;
const MIN_SIDE = 180;
const MAX_TRIES = 3; // images per site

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');
const lastName = (name) => fold(name.split(' & ')[0].replace(/["“”][^"“”]*["“”]/g, ' ').replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).trim().split(/\s+/).pop();

const curl = (url, binary = false) =>
  execFileSync('curl', ['-sSL', '--compressed', '--max-time', '40', '--max-filesize', '8000000', '-A', UA, url], { maxBuffer: 16e6, encoding: binary ? 'buffer' : 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const FACE_CHECK = new URL('./face-check.py', import.meta.url).pathname;
/** Can OpenCV be run? Checked once. */
function faceCheckWorks() {
  try { execFileSync('python3', ['-c', 'import cv2; cv2.CascadeClassifier'], { stdio: 'ignore' }); return true; } catch { return false; }
}
/** One clear face? */
function isHeadshot(buf, type, scratch) {
  const file = join(scratch, `check.${type}`);
  writeFileSync(file, buf);
  return execFileSync('python3', [FACE_CHECK, file], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'yes';
}

/** Width and height, via ImageMagick; null when it isn't an image it can read. */
function size(buf, type) {
  try {
    const [w, h] = execFileSync('identify', ['-format', '%w %h', `${type}:-`], { input: buf, stdio: ['pipe', 'pipe', 'ignore'] }).toString().split(' ').map(Number);
    return w && h ? { w, h } : null;
  } catch { return null; }
}

/** Image URLs on a page that the page labels with this last name, best first. */
export function labelledImages(html, site, last, others) {
  const seen = new Set();
  const out = [];
  const consider = (src, label, weight) => {
    let url;
    try { url = new URL(decode(src), site).href; } catch { return; }
    if (!/^https?:/.test(url) || seen.has(url)) return;
    const text = fold(`${label} ${decodeURIComponent(url.split('/').pop() ?? '')}`);
    if (!text.includes(last) || others.some((o) => o !== last && text.includes(o))) return;
    if (/logo|icon|favicon|banner|signature|button|badge|sticker|yard|sign/.test(text)) return;
    seen.add(url);
    out.push({ url, weight: weight + (/headshot|portrait|about|bio|photo/.test(text) ? 1 : 0) });
  };
  for (const [, src] of html.matchAll(/<meta[^>]+property="og:image(?::secure_url)?"[^>]+content="([^"]+)"/gi)) consider(src, '', 1);
  for (const [, src] of html.matchAll(/<meta[^>]+content="([^"]+)"[^>]+property="og:image(?::secure_url)?"/gi)) consider(src, '', 1);
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = tag.match(/\s(?:data-src|src)="([^"]+)"/i)?.[1];
    const alt = tag.match(/\salt="([^"]*)"/i)?.[1] ?? '';
    if (src && !/^data:/.test(src)) consider(src, alt, 0);
  }
  return out.sort((a, b) => b.weight - a.weight).map((x) => x.url);
}

/**
 * Give every candidate with a `website` and no `photo` the headshot their
 * site labels as them. `dir` is where the files go, served at `publicPath`.
 */
export async function addHeadshots(races, { dir, publicPath, prev }) {
  mkdirSync(dir, { recursive: true });
  if (!faceCheckWorks()) return { found: 0, kept: 0, tried: 0, log: ['no OpenCV (pip install "opencv-python-headless<5"): campaign-site headshots skipped'] };
  const scratch = mkdtempSync(join(tmpdir(), 'headshot-'));
  // Hand-picked photos (photos-chosen.json) are credited "… (campaign site)"; these are "(their campaign site)".
  const isOurs = (photo) => photo && /\(their campaign site\)$/.test(photo.credit);
  const before = new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => isOurs(c.photo)).map((c) => [`${r.id}|${c.name}`, c.photo])));
  const log = [];
  const deadline = Date.now() + BUDGET_MS;
  let found = 0, kept = 0, tried = 0;
  for (const race of races) {
    const others = race.candidates.map((c) => lastName(c.name));
    for (const c of race.candidates) {
      // An earlier headshot from here is checked again; anything else stands.
      if (isOurs(c.photo)) delete c.photo;
      if (c.photo || !c.website) continue;
      const key = `${race.id}|${c.name}`;
      const old = before.get(key);
      const keep = () => { if (old && existsSync(join(dir, old.file.split('/').pop()))) { c.photo = old; kept++; } };
      if (Date.now() > deadline) { keep(); continue; }
      tried++;
      try {
        const html = curl(c.website).slice(0, 2_000_000);
        const last = lastName(c.name);
        for (const url of labelledImages(html, c.website, last, others).slice(0, MAX_TRIES)) {
          const buf = curl(url, true);
          const type = imageType(buf);
          if (!type) continue;
          const dim = size(buf, type);
          if (!dim || Math.min(dim.w, dim.h) < MIN_SIDE || dim.w / dim.h > 1.6 || dim.h / dim.w > 2.2) continue;
          if (!isHeadshot(buf, type, scratch)) continue;
          const file = `${slug(c.name.split(' & ')[0])}-${slug(race.id).slice(0, 40)}.jpg`;
          writeFileSync(join(dir, file), shrink(buf, type).bytes);
          c.photo = { file: `${publicPath}/${file}`, credit: `${c.name.split(' & ')[0]} (their campaign site)`, link: c.website, from: url };
          found++;
          break;
        }
      } catch (e) {
        keep();
        log.push(`${c.name}: ${String(e.message).split('\n')[0].slice(0, 100)}`);
      }
    }
  }
  return { found, kept, tried, log };
}
