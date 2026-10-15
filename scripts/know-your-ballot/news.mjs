// Recent news about the election, for the ballot view's activity feed:
// headlines from Google News' RSS search for a few queries per state, each
// with its date and the outlet that wrote it. Headlines are outside text,
// only ever rendered as text; links are kept only if they're https.
//
// Google News being briefly down shouldn't hold up a build: the caller keeps
// yesterday's list then.

const RSS = 'https://news.google.com/rss/search';
const KEEP = 40;
const DAYS = 45;

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();

/** One query's items: [{ at, title, url, source }]. */
async function search(q) {
  const url = `${RSS}?${new URLSearchParams({ q, hl: 'en-US', gl: 'US', ceid: 'US:en' })}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (KnowYourBallot; +https://github.com/frankies2727/frankie-labs)' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const source = decode(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '');
    let title = decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    // Google appends " - Outlet" to every title.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3);
    const link = decode(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    const at = new Date(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '');
    return { at: Number.isNaN(at.getTime()) ? null : at.toISOString(), title, url: /^https:\/\//.test(link) ? link : null, source };
  }).filter((n) => n.at && n.title && n.url && n.source);
}

/** The newest headlines across `queries`, one per story, newest first. */
export async function recentNews(queries) {
  const since = Date.now() - DAYS * 86_400_000;
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    for (const n of await search(q)) {
      const key = n.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(key) || Date.parse(n.at) < since) continue;
      seen.add(key);
      out.push(n);
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, KEEP);
}
