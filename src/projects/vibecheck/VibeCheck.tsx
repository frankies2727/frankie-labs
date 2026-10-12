import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Zap, Sun, Moon, BookOpen, Building2, Calendar, Sparkles, AlertCircle, Share2, Download, Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import { ClearButton } from '../../components/ClearButton';

// ---------------------------------------------------------------------------
// VibeCheck runs entirely against Wikipedia's public, key-free, CORS-enabled
// APIs — no API key, no backend, so it works as a static site. We "search the
// web" by resolving the query to the best-matching Wikipedia article, then pull
// the summary, infobox facts, a mined timeline and fun facts from it.
// ---------------------------------------------------------------------------

const WIKI = 'https://en.wikipedia.org';

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// --- Wiki fetch helpers -----------------------------------------------------

async function wikiSearchTitle(q: string): Promise<string | null> {
  const url = `${WIKI}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`;
  const r = await fetch(url);
  const j = await r.json();
  return j?.query?.search?.[0]?.title ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function wikiSummary(title: string): Promise<any> {
  const r = await fetch(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!r.ok) throw new Error('summary failed');
  return r.json();
}

// Does this article read like a company/brand rather than, say, a place that
// happens to share the name (e.g. "Patagonia" the region vs. the clothier)?
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looksLikeCompany(summary: any): boolean {
  const d = (summary?.description || '') as string;
  return /(compan|brand|corporation|manufactur|service|retailer|maker|startup|firm|conglomerate|drink|platform|studio|label|publisher|airline|bank|software|\bapp\b|games?|streaming|technology|automaker|enterprise)/i.test(d);
}

// Generic corporate/legal words that don't identify a specific entity, so they
// shouldn't count toward whether an article actually matches the query.
const GENERIC_TOKENS = new Set([
  'vc', 'inc', 'llc', 'ltd', 'corp', 'corporation', 'company', 'co', 'ventures',
  'venture', 'capital', 'partners', 'group', 'holdings', 'the', 'and', 'of',
  'plc', 'limited', 'sa', 'ag', 'gmbh',
]);

const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Does the resolved article actually correspond to the query? Wikipedia's search
// always returns *something*, so for a niche company with no article it hands
// back an unrelated page. We reject the match unless a distinctive (non-generic)
// word from the query shows up in the article title.
function isRelevantMatch(query: string, title: string): boolean {
  const nt = normalizeText(title);
  const titleTokens = new Set(nt.split(' ').filter(Boolean));
  const queryTokens = normalizeText(query).split(' ').filter(Boolean);
  let distinctive = queryTokens.filter((t) => t.length >= 2 && !GENERIC_TOKENS.has(t));
  if (distinctive.length === 0) distinctive = queryTokens;
  return distinctive.some((t) => titleTokens.has(t) || nt.includes(t));
}

// Resolve a free-text query to the best company/brand article. Wikipedia's top
// hit is sometimes a disambiguation page or the wrong same-named entity, so if
// the first result doesn't look like a company we retry biased with "company".
// Returns { notFound: true } when no result actually matches the query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveEntity(query: string): Promise<{ title: string; summary: any } | { notFound: true } | null> {
  let title = await wikiSearchTitle(query);
  if (!title) return { notFound: true };
  let summary = await wikiSummary(title).catch(() => null);
  if (!summary || summary.type === 'disambiguation' || !looksLikeCompany(summary)) {
    const altTitle = await wikiSearchTitle(`${query} company`);
    if (altTitle && altTitle !== title) {
      const altSummary = await wikiSummary(altTitle).catch(() => null);
      const firstWasBad = !summary || summary.type === 'disambiguation';
      if (altSummary && altSummary.type !== 'disambiguation' && (looksLikeCompany(altSummary) || firstWasBad)) {
        title = altTitle;
        summary = altSummary;
      }
    }
  }
  // Final safety net: if the best match doesn't relate to the query, it's a
  // Wikipedia miss (too niche / private / misspelled) rather than a real hit.
  if (!isRelevantMatch(query, title)) return { notFound: true };
  return { title, summary };
}

// Resolve a free-text company name to its Wikipedia lead image (usually the
// logo or a hero shot). Key-free and CORS-enabled. Used to give featured
// profiles a real company image even when Openverse has nothing on-topic —
// most featured companies still have a Wikipedia article to borrow from.
async function wikiImageFor(query: string): Promise<string | null> {
  try {
    const title = await wikiSearchTitle(query);
    if (!title) return null;
    let summary = await wikiSummary(title).catch(() => null);
    // Bias toward the company: a bare name like "Patagonia" resolves to the
    // region (a map image), so if the first hit isn't company-shaped, retry
    // with a "company" hint before giving up.
    if (!summary || !looksLikeCompany(summary)) {
      const alt = await wikiSearchTitle(`${query} company`);
      if (alt && alt !== title) {
        const altSummary = await wikiSummary(alt).catch(() => null);
        if (altSummary && looksLikeCompany(altSummary)) summary = altSummary;
      }
    }
    return summary?.originalimage?.source || summary?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function wikiWikitext(title: string): Promise<string> {
  const url = `${WIKI}/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&origin=*&redirects=1`;
  const r = await fetch(url);
  const j = await r.json();
  return j?.parse?.wikitext?.['*'] ?? '';
}

async function wikiExtract(title: string): Promise<string> {
  const url = `${WIKI}/w/api.php?action=query&prop=extracts&explaintext=1&exchars=12000&titles=${encodeURIComponent(title)}&format=json&origin=*&redirects=1`;
  const r = await fetch(url);
  const j = await r.json();
  const pages = j?.query?.pages ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = Object.values(pages)[0] as any;
  return first?.extract ?? '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// Rasterize a cross-origin image to a data URL via an anonymous <img> + canvas.
// This follows redirects at the image layer (so Wikimedia's Special:FilePath →
// upload.wikimedia.org chain works) and only succeeds when the *final* host
// serves CORS headers; if it can't, it resolves null instead of tainting.
function imageToDataUrlViaCanvas(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null); // tainted — can't export
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Inline a remote image as a data URL so it can be captured in a screenshot.
// Tries a CORS fetch first, then an anonymous <img>+canvas rasterization; if
// both fail (host serves no CORS headers) it returns the raw URL, which still
// DISPLAYS on screen but is skipped by the download so it never taints the
// canvas (see the `filter` in handleDownload).
async function fetchImageAsDataUrl(src?: string | null): Promise<string | null> {
  if (!src) return null;
  try {
    const res = await fetch(src, { mode: 'cors' });
    if (res.ok) {
      const durl = await blobToDataUrl(await res.blob());
      if (durl.startsWith('data:')) return durl;
    }
  } catch {
    // fall through to the canvas rasterization attempt
  }
  const viaCanvas = await imageToDataUrlViaCanvas(src);
  return viaCanvas ?? src;
}

// Resolve a Wikimedia Commons file name to a CORS-friendly image URL. The
// width param rasterizes SVG logos to PNG so they render cleanly as an <img>.
function commonsFileUrl(filename: string, width = 1024): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

// Is this image a logo/wordmark rather than a photo? Logos need contain-fit on
// a light card (many wordmarks are solid black and vanish on the dark hero),
// whereas photos look best as a full-bleed cover. Company lead images and
// Wikidata P154 files are conventionally named "…logo…", which classifies the
// common cases; ambiguous images fall through to the (safe) photo treatment.
function looksLikeLogo(url?: string | null): boolean {
  return !!url && /logo|wordmark/i.test(url);
}

// --- Wikidata: structured facts (key-free, CORS-enabled) --------------------

const WIKIDATA = 'https://www.wikidata.org/w/api.php';

// Given a Wikidata Q-id (from the Wikipedia summary's `wikibase_item`), pull a
// few high-confidence structured facts and resolve their entity references to
// English labels. Used to fill gaps the article infobox doesn't cover.
async function wikidataFacts(qid?: string | null): Promise<WikidataFacts | null> {
  if (!qid) return null;
  try {
    const r = await fetch(`${WIKIDATA}?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=claims&format=json&origin=*`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims: Record<string, any[]> = (await r.json())?.entities?.[qid]?.claims || {};
    const firstYear = (p: string) => {
      const t = claims[p]?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined;
      const m = t && t.match(/\+(\d{4})/);
      return m ? m[1] : '';
    };
    const firstStr = (p: string) => (claims[p]?.[0]?.mainsnak?.datavalue?.value as string) || '';
    const entityIds = (p: string) =>
      (claims[p] || []).map((c) => c?.mainsnak?.datavalue?.value?.id as string).filter(Boolean);

    const hqId = entityIds('P159')[0];
    const industryId = entityIds('P452')[0];
    const ceoId = entityIds('P169')[0];
    const founderIds = entityIds('P112');

    // Logo (P154) or, failing that, a representative image (P18) — a reliable
    // key-free image for companies whose Wikipedia article has no lead image.
    const logoFile = firstStr('P154') || firstStr('P18');

    const needed = [...new Set([hqId, industryId, ceoId, ...founderIds].filter(Boolean))];
    const labels: Record<string, string> = {};
    if (needed.length) {
      const r2 = await fetch(`${WIKIDATA}?action=wbgetentities&props=labels&languages=en&ids=${needed.join('|')}&format=json&origin=*`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ents: Record<string, any> = (await r2.json())?.entities || {};
      for (const [id, e] of Object.entries(ents)) labels[id] = e?.labels?.en?.value || '';
    }
    return {
      founded: firstYear('P571'),
      website: firstStr('P856').replace(/^https?:\/\//, '').replace(/\/$/, '').trim() || undefined,
      industry: labels[industryId] || '',
      headquarters: labels[hqId] || '',
      ceo: labels[ceoId] || '',
      founders: founderIds.map((id) => labels[id]).filter(Boolean),
      logo: logoFile ? commonsFileUrl(logoFile) : undefined,
    };
  } catch {
    return null;
  }
}

// --- Openverse: openly-licensed images (key-free, CORS-enabled) --------------

type ImageCredit = { title: string; creator: string; license: string; landing: string };

// Find a relevant, freely-reusable image for a query. Restricted to
// commercial-use + derivatives-OK licenses (cc0/pdm/by/by-sa) and filtered so a
// result actually mentions the company (avoids e.g. Patagonia-the-region photos).
// Returns null when nothing suitable is found — the caller keeps its gradient.
async function openverseImage(
  query: string,
  tokens: string[],
): Promise<{ src: string; credit: ImageCredit } | null> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=12&mature=false&license=cc0,pdm,by,by-sa`;
    const r = await fetch(url);
    if (!r.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = (await r.json())?.results || [];
    const want = tokens.filter((t) => t.length >= 3).map((t) => t.toLowerCase());
    const match = results.find((im) => {
      if (!im?.url) return false;
      if (!want.length) return true;
      const hay = `${im.title || ''} ${(im.tags || []).map((t: { name?: string }) => t?.name || '').join(' ')}`.toLowerCase();
      return want.some((t) => hay.includes(t));
    });
    if (!match) return null;
    return {
      src: match.url,
      credit: {
        title: match.title || 'Untitled',
        creator: match.creator || 'Unknown',
        license: (match.license || '').toUpperCase(),
        landing: match.foreign_landing_url || match.url,
      },
    };
  } catch {
    return null;
  }
}

// --- Wikitext cleaning + parsing --------------------------------------------

function cleanWiki(input: string): string {
  if (!input) return '';
  let t = input;
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '');
  t = t.replace(/<br\s*\/?>/gi, ', ');
  t = t.replace(/<[^>]+>/g, '');
  // A few templates we want to keep the useful bits of:
  t = t.replace(/\{\{\s*(?:US\$|USD|currency|monnaie)\s*\|\s*([^|}]+?)\s*(?:\|[^}]*)?\}\}/gi, '$$$1');
  t = t.replace(/\{\{\s*(?:NASDAQ|NYSE|LSE|TYO|Nasdaq|FWB|SEHK|BSE|NSE)\s*\|\s*([^|}]+?)\s*\}\}/gi, '$1');
  t = t.replace(/\{\{\s*start date(?:\s+and\s+age)?\s*\|\s*(\d{4})[^}]*\}\}/gi, '$1');
  t = t.replace(/\{\{\s*URL\s*\|\s*(?:1=)?\s*([^|}]+?)\s*(?:\|[^}]*)?\}\}/gi, '$1');
  t = t.replace(/\{\{\s*(?:nowrap|nobold|noitalic|small|nobr)\s*\|\s*([^{}]*)\}\}/gi, '$1');
  t = t.replace(/\{\{\s*(?:increase|decrease|steady|profit|loss|gain)\s*\}\}/gi, '');
  // Strip any remaining (possibly nested) templates.
  for (let k = 0; k < 5; k++) t = t.replace(/\{\{[^{}]*\}\}/g, ' ');
  // Wiki + external links.
  t = t.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1');
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/\S+\]/g, '');
  t = t.replace(/'''?/g, '');
  t = t.replace(/[{}]/g, '');
  // Decode the HTML entities that commonly survive infobox values.
  t = t
    .replace(/&nbsp;|&#0*160;/gi, ' ')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(+n); } catch { return ' '; } });
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[,;:\s]+|[,;:\s]+$/g, '');
  return t;
}

// Split a string on top-level '|' (ignoring pipes inside {{...}} or [[...]]).
function splitTopPipes(s: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let braces = 0;
  let brackets = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const c2 = s[i + 1];
    if (c === '{' && c2 === '{') { braces++; buf += '{{'; i++; continue; }
    if (c === '}' && c2 === '}') { braces--; buf += '}}'; i++; continue; }
    if (c === '[' && c2 === '[') { brackets++; buf += '[['; i++; continue; }
    if (c === ']' && c2 === ']') { brackets--; buf += ']]'; i++; continue; }
    if (c === '|' && braces === 0 && brackets === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

function parseList(val: string): string[] {
  if (!val) return [];
  const listMatch = val.match(/\{\{\s*(?:unbulleted list|ubl|plainlist|flatlist|hlist|bulleted list|cslist|collapsible list|ublist)\s*\|/i);
  if (listMatch) {
    const inner = val.slice(listMatch.index! + listMatch[0].length);
    const close = inner.lastIndexOf('}}');
    const body = close !== -1 ? inner.slice(0, close) : inner;
    // List templates use either top-level '|' (ubl) or '*' bullets (plainlist).
    return splitTopPipes(body)
      .flatMap((x) => x.replace(/[\r\n]+/g, ' ').split(/\s*\*\s+/))
      .map(cleanWiki)
      .filter((s) => s && s.length > 1)
      .slice(0, 6);
  }
  return val
    .replace(/[\r\n]+/g, ' ')
    .split(/<br\s*\/?>|\s*\*\s+/)
    .map((s) => s.replace(/^\s*\*+/, ''))
    .map(cleanWiki)
    .filter((s) => s && s.length > 1)
    .slice(0, 6);
}

function extractInfobox(wikitext: string): Record<string, string> {
  const start = wikitext.search(/\{\{\s*Infobox/i);
  if (start === -1) return {};
  let depth = 0;
  let end = -1;
  for (let i = start; i < wikitext.length - 1; i++) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') { depth--; i++; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) return {};
  const body = wikitext.slice(start + 2, end - 2);
  const fields = splitTopPipes(body);
  const out: Record<string, string> = {};
  for (const f of fields) {
    const eq = f.indexOf('=');
    if (eq === -1) continue;
    const key = f.slice(0, eq).trim().toLowerCase();
    const raw = f.slice(eq + 1).trim();
    if (key) out[key] = raw;
  }
  return out;
}

type Fact = { label: string; value: string };

type CompanyData = {
  name: string;
  description: string;
  summary: string;
  wikiUrl: string | null;
  website: string | null;
  founders: string[];
  facts: Fact[];
  timeline: { year: string; event: string }[];
  nuggets: string[];
  /** Where this profile came from, so the UI can label the content. */
  source: 'wikipedia' | 'featured';
  /** Web pages a pre-generated (featured) profile was grounded in, if any. */
  sources?: { title: string; url: string }[];
};

// A pre-generated ("featured") company profile, produced by the offline
// GitHub Action (Ollama + Gemma, grounded from the web) and committed as JSON
// under ./data. Loaded at build time so niche companies Wikipedia can't cover
// still resolve instantly for every visitor — no live model, no key, no server.
type FeaturedProfile = {
  name: string;
  slug: string;
  sector?: string;
  gradient?: string;
  tagline?: string;
  rundown?: string;
  founded?: string;
  industry?: string;
  headquarters?: string;
  founders?: string[];
  timeline?: { year: string; event: string }[];
  notableFacts?: string[];
  website?: string;
  /** Curated fallback image (logo/hero) URL, used as a last resort before the
   *  gradient when the live Wikipedia/Openverse lookups find nothing. */
  image?: string;
  sources?: { title: string; url: string }[];
  generatedBy?: string;
  updated?: string;
};

// Card gradients cycled through for featured profiles that don't specify one.
const FEATURED_GRADIENTS = [
  'from-[#635BFF] via-[#4b45c6] to-[#0a2540]',
  'from-orange-500 via-red-600 to-stone-800',
  'from-[#58CC02] via-[#46A302] to-[#2b6301]',
  'from-zinc-800 via-zinc-900 to-black',
  'from-teal-500 via-emerald-600 to-green-900',
  'from-blue-600 via-indigo-700 to-purple-900',
  'from-amber-600 via-yellow-700 to-yellow-900',
  'from-[#1DB954] via-[#1aa34a] to-[#121212]',
];

// Eagerly import every committed profile JSON. Vite inlines these at build time
// and rewrites paths for the /frankie-labs/ base, so the deploy always ships whatever
// the Action has committed.
const FEATURED: FeaturedProfile[] = Object.values(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).glob('./data/*.json', { eager: true }) as Record<string, { default: FeaturedProfile }>,
)
  .map((m) => m.default)
  .filter((p) => p && p.name)
  .map((p, i) => ({ ...p, gradient: p.gradient || FEATURED_GRADIENTS[i % FEATURED_GRADIENTS.length] }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Match a free-text query to a featured profile (e.g. "chingona ventures vc" ->
// the Chingona Ventures profile). Compares on the profile's name and slug after
// dropping generic corporate words.
function findFeatured(query: string): FeaturedProfile | undefined {
  const nq = normalizeText(query);
  const nqTokens = nq.split(' ').filter((t) => !GENERIC_TOKENS.has(t));
  const nqTrimmed = nqTokens.join(' ');
  const compact = (s: string) => s.replace(/\s+/g, '');
  return FEATURED.find((p) => {
    const nn = normalizeText(p.name);
    const slug = normalizeText(p.slug || '').replace(/-/g, ' ');
    if (!nn) return false;
    if (nq === nn || nq === slug) return true;
    if (compact(nq) === compact(nn) || compact(nqTrimmed) === compact(nn)) return true;
    if (nqTrimmed && (nqTrimmed.includes(nn) || nn.includes(nqTrimmed))) return true;
    return false;
  });
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mineTimeline(text: string): { year: string; event: string }[] {
  const out: { year: string; event: string }[] = [];
  const seen = new Set<string>();
  for (const s of splitSentences(text)) {
    const m = s.match(/\b(1[89]\d{2}|20\d{2})\b/);
    if (!m) continue;
    const year = m[1];
    if (seen.has(year)) continue;
    // Loosened bounds (was 25–240) so short-but-real milestones like
    // "Founded in 1998." and longer multi-clause sentences both make the cut,
    // giving the Journey more to work with.
    if (s.length < 18 || s.length > 320) continue;
    seen.add(year);
    out.push({ year, event: s });
  }
  out.sort((a, b) => +a.year - +b.year);
  // Keep a deeper history (was 6) — the slide scrolls, so more is better.
  return out.slice(0, 14);
}

function mineNuggets(text: string, usedYears: Set<string>): string[] {
  const kw = /\b(first|largest|world'?s|billion|million|most|named after|acquired|launched|known for|became|record|fastest|leading|popular|nickname|iconic|inspired)\b/i;
  const picks: string[] = [];
  for (const s of splitSentences(text)) {
    if (s.length < 40 || s.length > 220) continue;
    if (!kw.test(s)) continue;
    const yr = s.match(/\b(1[89]\d{2}|20\d{2})\b/);
    if (yr && usedYears.has(yr[1])) continue;
    picks.push(s);
    if (picks.length >= 5) break;
  }
  // If keyword matches were sparse, top up with a couple of substantive
  // sentences so the "Did You Know" slide still has something to say.
  if (picks.length < 2) {
    for (const s of splitSentences(text)) {
      if (picks.includes(s)) continue;
      if (s.length < 60 || s.length > 200) continue;
      const yr = s.match(/\b(1[89]\d{2}|20\d{2})\b/);
      if (yr && usedYears.has(yr[1])) continue;
      picks.push(s);
      if (picks.length >= 3) break;
    }
  }
  return picks.slice(0, 5);
}

type WikidataFacts = {
  founded?: string;
  website?: string;
  industry?: string;
  headquarters?: string;
  ceo?: string;
  founders?: string[];
  /** Commons logo/image URL, if the entity has one (P154 / P18). */
  logo?: string;
};

function buildCompanyData(
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any,
  wikitext: string,
  extract: string,
  wd?: WikidataFacts | null,
): CompanyData {
  const ib = extractInfobox(wikitext);
  const val = (...keys: string[]) => {
    for (const k of keys) if (ib[k]) return cleanWiki(ib[k]);
    return '';
  };
  // Prefer the infobox value; fall back to Wikidata's structured claim.
  const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const orWd = (infoboxVal: string, wdVal?: string) => infoboxVal || capitalize(wdVal || '');

  const founders =
    parseList(ib['founders'] || ib['founder'] || ib['foundation'] || '') ||
    [];
  const foundersFinal = founders.length ? founders : wd?.founders || [];

  const hq =
    val('headquarters', 'hq_location', 'location') ||
    [val('hq_location_city'), val('hq_location_country')].filter(Boolean).join(', ');

  const tickerList = parseList(ib['traded_as'] || '');
  const ticker = tickerList.find((t) => /^[A-Z.:]{1,6}$/.test(t)) || '';

  let website: string | null = null;
  const rawSite = ib['website'] || ib['homepage'] || ib['url'] || '';
  if (rawSite) {
    const cleaned = cleanWiki(rawSite).replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    if (cleaned && /\./.test(cleaned) && !/\s/.test(cleaned)) website = cleaned;
  }
  if (!website && wd?.website) website = wd.website;

  const facts: Fact[] = [];
  const push = (label: string, value: string) => {
    if (value && value.length < 120) facts.push({ label, value });
  };
  push('Founded', orWd(val('founded', 'foundation', 'formed', 'established'), wd?.founded));
  push('Industry', orWd(val('industry', 'type'), wd?.industry));
  push('Headquarters', orWd(hq, wd?.headquarters));
  push('Ticker', ticker);
  push('Revenue', val('revenue'));
  push('Employees', val('num_employees', 'employees'));
  push('Area served', val('area_served'));
  push('CEO', orWd(parseList(ib['key_people'] || '')[0] || '', wd?.ceo));

  const usedYears = new Set<string>();
  const timeline = mineTimeline(extract);
  timeline.forEach((t) => usedYears.add(t.year));
  const nuggets = mineNuggets(extract, usedYears);

  // The rundown = the leading paragraph(s) of the article.
  const intro = (summary?.extract || extract || '').trim();

  return {
    name: summary?.title || title,
    description: summary?.description || '',
    summary: intro,
    wikiUrl: summary?.content_urls?.desktop?.page || `${WIKI}/wiki/${encodeURIComponent(title)}`,
    website,
    founders: foundersFinal,
    facts: facts.slice(0, 8),
    timeline,
    nuggets,
    source: 'wikipedia',
  };
}

// Map a pre-generated featured profile onto the same shape the slides consume,
// so the whole immersive UI is reused regardless of data source.
function buildFromFeatured(p: FeaturedProfile): CompanyData {
  const facts: Fact[] = [];
  const push = (label: string, value?: string) => {
    if (value && value.length < 120) facts.push({ label, value });
  };
  push('Founded', p.founded);
  push('Industry', p.industry);
  push('Headquarters', p.headquarters);

  return {
    name: p.name,
    description: p.tagline || '',
    summary: p.rundown || '',
    wikiUrl: null,
    website: p.website || null,
    founders: Array.isArray(p.founders) ? p.founders : [],
    facts,
    timeline: Array.isArray(p.timeline)
      ? [...p.timeline].sort((a, b) => (+a.year || 0) - (+b.year || 0)).slice(0, 14)
      : [],
    nuggets: Array.isArray(p.notableFacts) ? p.notableFacts : [],
    source: 'featured',
    sources: Array.isArray(p.sources) ? p.sources.filter((s) => s && s.url).slice(0, 5) : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = any;

export function VibeCheck({ onExit }: { onExit: () => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null | undefined>(undefined);
  // A logo (vs. a photo) is rendered differently — contained on a white card
  // so dark wordmarks stay visible — instead of a full-bleed darkened cover.
  const [imageIsLogo, setImageIsLogo] = useState(false);
  const [imageCredit, setImageCredit] = useState<ImageCredit | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Always open VibeCheck on the search home. Drop any stale ?q left in the URL
  // by a previous visit so it doesn't auto-reload the last company.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('q')) {
      url.searchParams.delete('q');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Return to the empty search screen (used by the logo and after clearing).
  const resetToHome = () => {
    setData(null);
    setError(null);
    setLoading(false);
    setQuery('');
    setImage(undefined);
    setImageIsLogo(false);
    setImageCredit(null);
    setCurrentSlideIndex(0);
    const url = new URL(window.location.href);
    if (url.searchParams.has('q')) {
      url.searchParams.delete('q');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setQuery(searchQuery);

    setLoading(true);
    setError(null);
    setData(null);
    setImage(undefined);
    setImageIsLogo(false);
    setImageCredit(null);

    const pushUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('q', searchQuery);
      window.history.pushState({}, '', url.toString());
    };

    // Distinctive words from the query, used to keep Openverse images on-topic.
    const imgTokens = normalizeText(searchQuery).split(' ').filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));

    // Featured first: a pre-generated profile (covers niche/private companies)
    // resolves instantly, no network needed. Otherwise fall back to Wikipedia.
    const featured = findFeatured(searchQuery);
    if (featured) {
      pushUrl();
      setData(buildFromFeatured(featured));
      setImage(undefined);
      setLoading(false);
      // Find a real company image, in order of relevance:
      //   1. the company's Wikipedia lead image (logo/hero) — covers most,
      //   2. an openly-licensed Openverse photo,
      //   3. an explicit image URL committed with the profile — a curated
      //      last resort for companies the live sources can't cover,
      // and only fall back to the card gradient if all three come up empty.
      let src: string | null = await wikiImageFor(featured.name);
      let isLogo = looksLikeLogo(src);
      if (!src) {
        const ov = await openverseImage(featured.name, [featured.slug.replace(/-/g, ' '), ...imgTokens]);
        if (ov) {
          setImageCredit(ov.credit);
          src = ov.src;
          isLogo = false;
        }
      }
      // Curated fallbacks are hand-picked logos, so treat them as such.
      if (!src && featured.image) {
        src = featured.image;
        isLogo = true;
      }
      setImageIsLogo(!!src && isLogo);
      setImage(src ? await fetchImageAsDataUrl(src) : null);
      return;
    }

    try {
      const resolved = await resolveEntity(searchQuery);
      if (!resolved || 'notFound' in resolved) {
        setError(
          `No solid match for "${searchQuery}". VibeCheck reads from Wikipedia plus a set of hand-picked profiles, so very new, private, or niche companies may not be covered yet — try a more established name or double-check the spelling.`,
        );
        setLoading(false);
        return;
      }
      const { title, summary } = resolved;

      const [wikitext, extract, wd] = await Promise.all([
        wikiWikitext(title).catch(() => ''),
        wikiExtract(title).catch(() => ''),
        wikidataFacts(summary?.wikibase_item).catch(() => null),
      ]);

      const built = buildCompanyData(title, summary, wikitext, extract, wd);
      pushUrl();

      setData(built);
      setLoading(false);

      // Find an image for the queried company, in order of relevance:
      //   1. the article's own lead image (most relevant),
      //   2. the Wikidata logo/image (P154/P18) — covers companies whose
      //      article has no lead image, e.g. Anthropic, Scopely, Notion,
      //   3. a freely-licensed Openverse photo,
      // and only fall back to the gradient if all three come up empty.
      let imgSrc: string | null =
        summary?.originalimage?.source || summary?.thumbnail?.source || null;
      let isLogo = looksLikeLogo(imgSrc);
      if (!imgSrc && wd?.logo) {
        imgSrc = wd.logo;
        isLogo = true;
      }
      if (!imgSrc) {
        const ov = await openverseImage(built.name, imgTokens);
        if (ov) {
          setImageCredit(ov.credit);
          imgSrc = ov.src;
          isLogo = false;
        }
      }
      setImageIsLogo(!!imgSrc && isLogo);
      setImage(imgSrc ? await fetchImageAsDataUrl(imgSrc) : null);
    } catch (err) {
      console.error(err);
      setError('The web glitched out. Give it another shot.');
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const handleShare = async () => {
    if (!data) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(data.name)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${data.name} — VibeCheck`, text: `Check out this visual breakdown of ${data.name}!`, url: shareUrl });
      } catch (err) {
        console.log('Share cancelled', err);
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    }
  };

  const handleDownload = async (mode: 'current' | 'all') => {
    if (!data) return;
    setIsDownloading(true);
    setIsDownloadModalOpen(false);
    // Skip any image that couldn't be inlined to a data: URL. A cross-origin
    // <img> taints the canvas and makes the whole export throw; dropping it lets
    // the screenshot succeed (the slide just falls back to its gradient scene)
    // instead of failing outright.
    const filter = (node: HTMLElement) => {
      if (node instanceof HTMLImageElement) {
        const src = node.currentSrc || node.getAttribute('src') || '';
        return src.startsWith('data:');
      }
      return true;
    };
    const capture = async (i: number): Promise<boolean> => {
      const node = document.getElementById(`slide-${i}`);
      if (!node) return false;
      node.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      await delay(300);
      try {
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2, quality: 0.95, filter });
        saveAs(dataUrl, `${data.name.replace(/\s+/g, '_')}_Slide_${i + 1}.png`);
        return true;
      } catch (err) {
        console.error(`Slide ${i + 1} capture failed`, err);
        return false;
      }
    };
    try {
      let ok = 0;
      if (mode === 'current') {
        if (await capture(currentSlideIndex)) ok++;
      } else {
        for (let i = 0; i < slides.length; i++) {
          if (await capture(i)) ok++;
          await delay(400);
        }
      }
      if (ok === 0) alert('Sorry — the screenshot could not be generated. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // --- Slide assembly -------------------------------------------------------
  const slides: Slide[] = [];
  if (data) {
    slides.push({ id: 'hero', type: 'hero', accent: '#ccff00' });
    if (data.summary) slides.push({ id: 'rundown', type: 'text', title: 'The Rundown', accent: '#ff00ff', icon: <BookOpen className="w-8 h-8 text-[#ff00ff]" />, content: data.summary });
    if (data.facts.length) slides.push({ id: 'facts', type: 'facts', title: 'Fast Facts', accent: '#00ffcc', icon: <Building2 className="w-8 h-8 text-[#00ffcc]" />, facts: data.facts, founders: data.founders });
    if (data.timeline.length) slides.push({ id: 'timeline', type: 'timeline', title: 'The Journey', accent: '#ffaa00', icon: <Calendar className="w-8 h-8 text-[#ffaa00]" />, milestones: data.timeline });
    if (data.nuggets.length) slides.push({ id: 'nuggets', type: 'list', title: 'Did You Know', accent: '#ccff00', icon: <Sparkles className="w-8 h-8 text-[#ccff00]" />, items: data.nuggets });
    slides.push({ id: 'explore', type: 'links', title: 'Explore More', accent: '#00ffff', icon: <ExternalLink className="w-8 h-8 text-[#00ffff]" /> });
  }

  const SceneBg = ({ accent }: { accent: string }) => (
    <div className="absolute inset-0 z-0">
      {image === undefined ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gray-100 dark:bg-[#111]">
          <div className="w-12 h-12 border-4 border-gray-300 dark:border-white/10 border-t-[#ccff00] rounded-full animate-spin" />
        </div>
      ) : image && !imageIsLogo ? (
        <motion.img
          initial={{ scale: 1.12, opacity: 0 }}
          animate={{ scale: 1.04, opacity: 1 }}
          transition={{ opacity: { duration: 0.8 }, scale: { duration: 20, repeat: Infinity, repeatType: 'reverse', ease: 'linear' } }}
          src={image}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        // Logos and the no-image case share a branded gradient backdrop; a logo
        // is shown crisply on a light card by the slide itself, not stretched
        // full-bleed here (dark wordmarks would vanish into the overlay).
        <div className="w-full h-full" style={{ background: `radial-gradient(circle at 30% 20%, ${accent}55, transparent 60%), #0a0a0a` }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}22, transparent 55%)` }} />
    </div>
  );

  const renderSlide = (slide: Slide) => {
    if (slide.type === 'hero') {
      return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
          <SceneBg accent={slide.accent} />
          <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center text-center overflow-y-auto max-h-[85vh] custom-scrollbar">
            {image && imageIsLogo && (
              <div className="mb-6 sm:mb-8 bg-white rounded-3xl px-8 py-6 sm:px-12 sm:py-8 shadow-2xl shadow-black/50 max-w-[85%]">
                <img
                  src={image}
                  alt={`${data?.name} logo`}
                  className="max-h-[14vh] sm:max-h-[18vh] max-w-full object-contain"
                />
              </div>
            )}
            <h2 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter uppercase mb-4 sm:mb-6 text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] max-w-full break-words leading-tight">
              {data?.name}
            </h2>
            {data?.description && (
              <p className="text-lg sm:text-xl md:text-3xl text-[#ccff00] font-mono italic drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] max-w-4xl break-words bg-black/60 backdrop-blur-md border border-white/10 px-4 sm:px-6 py-3 rounded-2xl inline-block capitalize">
                {data.description}
              </p>
            )}
          </div>
          {imageCredit && (
            <a
              href={imageCredit.landing}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 left-4 z-20 text-[10px] text-white hover:text-white transition-colors max-w-[70vw] truncate"
              title="Image source"
            >
              Image: {imageCredit.title} · {imageCredit.creator} ({imageCredit.license}) · Openverse
            </a>
          )}
        </div>
      );
    }

    return (
      <div className="absolute inset-0 w-full h-full flex items-center justify-center md:justify-start md:pl-24 p-6">
        <SceneBg accent={slide.accent} />
        {image && imageIsLogo && (
          <div className="absolute top-24 right-6 z-20 hidden lg:block bg-white/95 rounded-2xl px-4 py-3 shadow-xl shadow-black/40">
            <img src={image} alt="" className="h-8 xl:h-10 max-w-[180px] object-contain" />
          </div>
        )}
        <div className="relative z-10 w-full max-w-2xl bg-black/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl overflow-y-auto max-h-[80vh] custom-scrollbar">
          <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
            {slide.icon}
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-wider text-white leading-tight drop-shadow-md">
              {slide.title}
            </h2>
          </div>

          {slide.type === 'text' && (
            <p className="text-lg md:text-xl lg:text-2xl text-gray-100 leading-relaxed font-medium drop-shadow-sm">
              {slide.content}
            </p>
          )}

          {slide.type === 'list' && (
            <ul className="space-y-4 md:space-y-6">
              {slide.items.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-3 md:gap-4">
                  <span className="text-2xl md:text-3xl leading-none mt-1 text-[#ccff00] shrink-0 drop-shadow-md">✨</span>
                  <span className="text-lg md:text-xl font-medium text-gray-100 leading-snug drop-shadow-sm">{item}</span>
                </li>
              ))}
            </ul>
          )}

          {slide.type === 'facts' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                {slide.facts.map((f: Fact, i: number) => (
                  <div key={i} className="bg-black/40 p-4 md:p-5 rounded-2xl border border-white/10">
                    <div className="text-[10px] md:text-xs text-gray-100 uppercase tracking-widest mb-1">{f.label}</div>
                    <div className="text-lg md:text-2xl font-black text-[#00ffcc] leading-tight drop-shadow-md break-words">{f.value}</div>
                  </div>
                ))}
              </div>
              {slide.founders.length > 0 && (
                <div className="bg-black/40 p-4 md:p-5 rounded-2xl border border-white/10">
                  <div className="text-[10px] md:text-xs text-gray-100 uppercase tracking-widest mb-2">Founders</div>
                  <div className="flex flex-wrap gap-2">
                    {slide.founders.map((f: string, i: number) => (
                      <span key={i} className="text-sm md:text-base font-bold text-white bg-white/10 px-3 py-1 rounded-full border border-white/10">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {slide.type === 'timeline' && (
            <>
              <p className="text-xs md:text-sm font-mono uppercase tracking-[0.2em] text-[#ffaa00]/80 mb-6 -mt-2">
                {slide.milestones.length} milestone{slide.milestones.length === 1 ? '' : 's'}
                {slide.milestones.length > 1 && (
                  <span className="text-gray-100">
                    {' · '}
                    {slide.milestones[0].year} → {slide.milestones[slide.milestones.length - 1].year}
                  </span>
                )}
              </p>
              <div className="space-y-6 md:space-y-8 mt-2 pl-6 md:pl-8 ml-3 md:ml-4 relative before:absolute before:left-0 before:top-1 before:bottom-1 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-[#ffaa00] before:via-[#ffaa00]/40 before:to-transparent">
                {slide.milestones.map((m: { year: string; event: string }, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.08, 0.8) }} className="relative">
                    <div className="absolute -left-[35px] md:-left-[42px] top-1.5 w-5 h-5 md:w-6 md:h-6 rounded-full bg-[#ffaa00] shadow-[0_0_15px_rgba(255,170,0,0.8)] border-4 border-[#0a0a0a]" />
                    <h4 className="text-xl md:text-2xl font-black text-[#ffaa00] mb-1 md:mb-2 font-mono drop-shadow-md">{m.year}</h4>
                    <p className="text-gray-100 text-base md:text-lg leading-relaxed drop-shadow-sm">{m.event}</p>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {slide.type === 'links' && (
            <div className="space-y-4">
              {data?.wikiUrl && (
                <a href={data.wikiUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 bg-black/40 hover:bg-black/60 p-5 rounded-2xl border border-white/10 hover:border-[#00ffff] transition-colors group">
                  <div>
                    <div className="text-[10px] md:text-xs text-gray-100 uppercase tracking-widest mb-1">Read the full story</div>
                    <div className="text-lg md:text-xl font-black text-white">Wikipedia</div>
                  </div>
                  <ExternalLink className="w-6 h-6 text-[#00ffff] group-hover:translate-x-1 transition-transform" />
                </a>
              )}
              {data?.website && (
                <a href={`https://${data.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-4 bg-black/40 hover:bg-black/60 p-5 rounded-2xl border border-white/10 hover:border-[#ccff00] transition-colors group">
                  <div>
                    <div className="text-[10px] md:text-xs text-gray-100 uppercase tracking-widest mb-1">Official site</div>
                    <div className="text-lg md:text-xl font-black text-white break-all">{data.website}</div>
                  </div>
                  <ExternalLink className="w-6 h-6 text-[#ccff00] group-hover:translate-x-1 transition-transform" />
                </a>
              )}
              {data?.source === 'featured' && data.sources && data.sources.length > 0 && (
                <div className="bg-black/40 p-4 md:p-5 rounded-2xl border border-white/10">
                  <div className="text-[10px] md:text-xs text-gray-100 uppercase tracking-widest mb-3">Grounded in these sources</div>
                  <div className="space-y-2">
                    {data.sources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-100 hover:text-[#ccff00] transition-colors group">
                        <ExternalLink className="w-4 h-4 shrink-0 text-[#00ffff]" />
                        <span className="truncate group-hover:underline">{s.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {data?.source === 'featured' && (
                <p className="text-xs text-gray-100 leading-relaxed">
                  Pre-generated profile, grounded from the web with a local model. It's a helpful overview, not gospel — double-check anything important.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-[#0a0a0a] text-gray-900 dark:text-[#e5e5e5] font-sans selection:bg-[#ccff00] selection:text-black transition-colors duration-300 flex flex-col overflow-hidden">
        <header className="absolute top-0 left-0 right-0 z-50 bg-white/50 dark:bg-[#0a0a0a]/50 backdrop-blur-xl border-b border-gray-200/50 dark:border-white/10 p-4 transition-colors duration-300">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={onExit}
                className="p-2 rounded-full bg-white/50 dark:bg-black/50 border border-gray-300 dark:border-white/20 text-gray-900 dark:text-white hover:text-[#ccff00] hover:border-[#ccff00] transition-colors backdrop-blur-md shadow-sm shrink-0 mr-1"
                title="Back to projects"
                type="button"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onClick={resetToHome}
                className="flex items-center gap-2 group shrink-0"
                title="Back to search — check another company"
                type="button"
              >
                <Zap className="w-8 h-8 text-[#ccff00] group-hover:scale-110 transition-transform" />
                <h1 className="text-2xl font-bold tracking-tighter uppercase text-gray-900 dark:text-white drop-shadow-md hidden sm:block group-hover:text-[#ccff00] transition-colors">VibeCheck</h1>
              </button>
              {data && (
                <>
                  <span className="text-gray-900 dark:text-gray-100 mx-2 hidden sm:block">/</span>
                  <span className="font-bold text-gray-900 dark:text-white tracking-tight truncate max-w-[40vw]">{data.name}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              {data && (
                <form onSubmit={onSubmit} className="w-full md:w-auto relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-900 dark:text-gray-100 group-focus-within:text-[#ccff00] transition-colors" />
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search another company..."
                    className="w-full md:w-64 bg-white/50 dark:bg-black/50 border border-gray-300 dark:border-white/20 rounded-full py-2 pl-10 pr-10 focus:outline-none focus:border-[#ccff00] focus:ring-1 focus:ring-[#ccff00] transition-all placeholder-gray-900 dark:placeholder-gray-100 text-gray-900 dark:text-white backdrop-blur-md shadow-sm text-sm"
                  />
                  {query && <ClearButton onClear={() => setQuery('')} className="right-0 text-gray-900 dark:text-white hover:text-[#ccff00]" />}
                </form>
              )}
              {data && (
                <div className="flex items-center gap-2">
                  <button onClick={handleShare} className="p-2 rounded-full bg-white/50 dark:bg-black/50 border border-gray-300 dark:border-white/20 text-gray-900 dark:text-white hover:text-[#ccff00] hover:border-[#ccff00] transition-colors backdrop-blur-md shadow-sm shrink-0" title="Share Link">
                    <Share2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => setIsDownloadModalOpen(true)} disabled={isDownloading} className="p-2 rounded-full bg-white/50 dark:bg-black/50 border border-gray-300 dark:border-white/20 text-gray-900 dark:text-white hover:text-[#ccff00] hover:border-[#ccff00] transition-colors backdrop-blur-md shadow-sm shrink-0 disabled:cursor-not-allowed" title="Download Screenshots">
                    {isDownloading ? <Loader2 className="w-5 h-5 animate-spin text-[#ccff00]" /> : <Download className="w-5 h-5" />}
                  </button>
                </div>
              )}
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full bg-white/50 dark:bg-black/50 border border-gray-300 dark:border-white/20 text-gray-900 dark:text-white hover:text-[#ccff00] transition-colors backdrop-blur-md shadow-sm shrink-0" type="button">
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 relative w-full h-[100dvh] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] z-40">
                <div className="w-16 h-16 border-4 border-gray-200 dark:border-white/10 border-t-[#ccff00] rounded-full animate-spin mb-6" />
                <p className="text-gray-900 dark:text-gray-100 font-mono text-sm uppercase tracking-widest">Searching the web...</p>
              </motion.div>
            )}

            {error && (
              <motion.div key="error" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute z-40 bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex items-start gap-4 text-red-600 dark:text-red-400 max-w-lg mx-auto">
                <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                <p className="font-medium">{error}</p>
              </motion.div>
            )}

            {!data && !loading && !error && (
              <motion.div key="empty" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="absolute inset-0 overflow-y-auto pt-24 md:pt-32 pb-12 flex flex-col items-center justify-start z-10 px-4">
                <div className="w-24 h-24 md:w-32 md:h-32 bg-white dark:bg-[#141414] border border-gray-200 dark:border-white/10 rounded-full flex items-center justify-center mb-6 md:mb-8 shadow-[0_0_60px_rgba(204,255,0,0.15)] shrink-0">
                  <Zap className="w-12 h-12 md:w-16 md:h-16 text-[#ccff00]" />
                </div>
                <h2 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter uppercase mb-4 md:mb-6 text-gray-900 dark:text-white text-center">
                  Check the Vibe
                </h2>
                <p className="text-gray-900 dark:text-gray-100 text-lg md:text-xl max-w-2xl mx-auto text-center mb-8">
                  Type any company name below, or tap a featured profile, to generate an immersive, highly visual story.
                </p>

                <form onSubmit={onSubmit} className="w-full max-w-2xl mx-auto relative group mb-16">
                  <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                    <Search className="h-6 w-6 text-gray-900 dark:text-gray-100 group-focus-within:text-[#ccff00] transition-colors" />
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter a company name (e.g., Netflix, Nike, OpenAI)..."
                    className="w-full bg-white dark:bg-[#141414] border-2 border-gray-200 dark:border-white/10 rounded-full py-4 pl-16 pr-44 focus:outline-none focus:border-[#ccff00] transition-all placeholder-gray-900 dark:placeholder-gray-100 text-gray-900 dark:text-white shadow-xl text-lg md:text-xl"
                  />
                  {query && <ClearButton onClear={() => setQuery('')} className="right-32 text-gray-900 dark:text-white hover:text-[#ccff00]" />}
                  <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#ccff00] text-black px-6 py-2.5 rounded-full font-bold hover:bg-[#b3e600] transition-colors shadow-md">
                    Search
                  </button>
                </form>

                {FEATURED.length > 0 && (
                  <>
                    <p className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-gray-900 dark:text-gray-100 mb-4">
                      Featured profiles
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-5xl mx-auto">
                      {FEATURED.map((company) => (
                        <motion.button
                          key={company.slug || company.name}
                          whileHover={{ scale: 1.05, y: -5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleSearch(company.name)}
                          className={`relative overflow-hidden rounded-3xl p-6 text-left shadow-lg transition-all hover:shadow-2xl group bg-gradient-to-br ${company.gradient} animate-gradient min-h-[140px] md:min-h-[160px] flex flex-col justify-end border border-white/10`}
                        >
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90" />
                          <div className="relative z-10 transform group-hover:-translate-y-1 transition-transform duration-300">
                            <h3 className="text-xl md:text-2xl font-black text-white mb-1 tracking-tight drop-shadow-md">{company.name}</h3>
                            {company.sector && (
                              <p className="text-white text-xs font-bold uppercase tracking-widest drop-shadow-md">{company.sector}</p>
                            )}
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {data && !loading && (
              <>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-50">
                  {slides.map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i === currentSlideIndex ? 'bg-[#ccff00] scale-150' : 'bg-gray-400/50 dark:bg-gray-600/50'}`} />
                  ))}
                </div>

                {isDownloadModalOpen && (
                  <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#333] rounded-2xl p-6 shadow-2xl max-w-sm w-full">
                      <h3 className="text-xl font-bold mb-4 tracking-tight text-gray-900 dark:text-white">Download Screenshots</h3>
                      <p className="text-sm text-gray-900 dark:text-gray-100 mb-6">How would you like to save this VibeCheck?</p>
                      <div className="flex flex-col gap-3">
                        <button onClick={() => handleDownload('current')} className="w-full py-3 px-4 bg-gray-100 dark:bg-[#222] hover:bg-gray-200 dark:hover:bg-[#333] text-gray-900 dark:text-white rounded-xl font-medium transition-colors">
                          Download Current Slide: {currentSlideIndex + 1}
                        </button>
                        <button onClick={() => handleDownload('all')} className="w-full py-3 px-4 bg-[#ccff00] text-black hover:bg-[#b3e600] rounded-xl font-bold transition-colors shadow-lg shadow-[#ccff00]/20">
                          Download All ({slides.length} images)
                        </button>
                        <button onClick={() => setIsDownloadModalOpen(false)} className="w-full mt-2 py-2 text-sm text-gray-900 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white transition-colors">
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}

                <motion.div
                  key="slides"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 w-full h-full overflow-y-auto snap-y snap-mandatory custom-scrollbar scroll-smooth"
                  onScroll={(e) => {
                    const target = e.target as HTMLDivElement;
                    setCurrentSlideIndex(Math.round(target.scrollTop / target.clientHeight));
                  }}
                >
                  {slides.map((slide, index) => (
                    <div id={`slide-${index}`} key={slide.id} className="w-full h-[100dvh] snap-start relative bg-gray-50 dark:bg-[#0a0a0a]">
                      {renderSlide(slide)}
                      <div className="absolute bottom-6 right-6 text-xs font-bold font-mono text-gray-900 dark:text-gray-100 z-40 select-none">
                        {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                      </div>
                    </div>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <div className="fixed bottom-6 pb-[env(safe-area-inset-bottom)] left-1/2 -translate-x-1/2 z-50 text-xs font-medium text-gray-900 dark:text-gray-100 bg-white/60 dark:bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-gray-200/50 dark:border-white/10 shadow-sm whitespace-nowrap">
            Made by{' '}
            <a href="https://www.linkedin.com/in/francisco27/" target="_blank" rel="noopener noreferrer" className="hover:text-[#ccff00] dark:hover:text-[#ccff00] transition-colors font-bold">Frankie</a>
          </div>
        </main>
      </div>
    </div>
  );
}
