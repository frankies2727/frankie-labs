// The three university boards (Regents of the University of Michigan, MSU
// Trustees, Wayne State Governors): Ballotpedia has no 2026 page for them, so
// their nominees come from Wikipedia's election articles (CC BY-SA), whose
// results table lists every name on the ballot with its party.

const UA = 'frankie-labs know-your-ballot (https://github.com/frankies2727/frankie-labs)';
const REST = 'https://en.wikipedia.org/api/rest_v1/page/html/';

const PARTY = {
  Democratic: 'Democratic', Republican: 'Republican', Libertarian: 'Libertarian', Green: 'Green',
  // Michigan's Constitution Party affiliate is on the ballot as the U.S. Taxpayers Party.
  Constitution: 'U.S. Taxpayers', 'U.S. Taxpayers': 'U.S. Taxpayers', 'Working Class': 'Working Class', 'Natural Law': 'Natural Law', Independent: 'Independent',
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** The general election table of a Wikipedia election article: [{ name, party, incumbent }]. */
export async function boardCandidates(article) {
  const url = `https://en.wikipedia.org/wiki/${article}`;
  const res = await fetch(REST + article, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const html = await res.text();
  // The results table whose caption names this election's results.
  const table = [...html.matchAll(/<table[^>]*class="wikitable[^"]*"[^>]*>[\s\S]*?<caption>([\s\S]*?)<\/caption>([\s\S]*?)<\/table>/g)]
    .find(([, caption]) => /2026 .* election results/i.test(caption))?.[2];
  if (!table) throw new Error(`${url}: no 2026 results table`);
  const candidates = [...table.matchAll(/<tr class="vcard">([\s\S]*?)<\/tr>/g)].map(([, row]) => {
    const p = text(row.match(/<td class="org"[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? '');
    const n = text(row.match(/<th[^>]*class="fn"[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? '');
    return { name: n.replace(/\s*\(incumbent\)/i, '').trim(), party: PARTY[p] ?? p, incumbent: /\(incumbent\)/i.test(n) };
  }).filter((c) => c.name);
  if (candidates.length < 2) throw new Error(`${url}: only ${candidates.length} candidates parsed`);
  return { url, candidates };
}
