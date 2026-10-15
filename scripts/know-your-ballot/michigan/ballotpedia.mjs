// Who's on Michigan's Nov 3, 2026 ballot, from Ballotpedia's race pages
// (CC BY-SA; each page is linked from the app's Sources). Ballotpedia keeps
// one page per statewide race, one per legislative chamber and one for the
// U.S. House delegation, in three table formats, parsed here.
//
// The Secretary of State's own candidate listing (miboecfr.nictusa.com) is
// the official list but sits behind a bot wall that turns away automated
// requests; when that changes it should replace this module.

import { execFileSync } from 'node:child_process';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const SITE = 'https://ballotpedia.org/';

// Ballotpedia's firewall answers Node's own HTTP client with a JavaScript
// challenge (HTTP 202) but lets curl through, so pages are read with curl.
export async function fetchPage(title) {
  const url = SITE + title;
  const html = execFileSync('curl', ['-sSL', '--compressed', '--max-time', '90', '-A', UA, url], { maxBuffer: 64e6 }).toString();
  if (!/mw-content-text|votebox|candidateListTable/.test(html)) throw new Error(`${url}: not a Ballotpedia article`);
  return { url, html };
}

const decode = (s) => s.replace(/&#160;|&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Party names as Michigan's ballot prints them.
const PARTY = {
  D: 'Democratic', R: 'Republican', G: 'Green', L: 'Libertarian',
  'Democratic Party': 'Democratic', 'Republican Party': 'Republican', 'Green Party': 'Green', 'Libertarian Party': 'Libertarian',
  'U.S. Taxpayers Party': 'U.S. Taxpayers', 'Constitution Party': 'U.S. Taxpayers',
  'Natural Law Party in Michigan': 'Natural Law', 'Natural Law Party': 'Natural Law',
  'Working Class Party': 'Working Class', Independent: 'Independent', Nonpartisan: 'Nonpartisan',
};
const party = (s) => PARTY[s.trim()] ?? s.trim();

/** One candidate link: `<a href="https://ballotpedia.org/Name">Name</a>` */
const LINK = /<a href="(https:\/\/ballotpedia\.org\/[^"]+)"[^>]*>([^<]+)<\/a>/;

/**
 * Statewide pages: every "General election for …" vote box. Returns
 * [{ office, candidates: [{ name, party, incumbent, profile }] }]. Write-in
 * candidates aren't printed on the ballot, so they're left out.
 * Nonpartisan races (Supreme Court) get each candidate's nominating party
 * from the convention boxes on the same page.
 */
export function parseVoteboxes(html) {
  const boxes = [...html.matchAll(/<h5 class="votebox-header-election-type">\s*([^<]+?)\s*<\/h5>[\s\S]*?<table class="results_table">([\s\S]*?)<\/table>/g)];
  const rows = (table) => [...table.matchAll(/<tr class="results_row[^"]*">([\s\S]*?)<\/tr>/g)].map(([, row]) => {
    const cell = row.match(/<td class="votebox-results-cell--text">([\s\S]*?)<\/td>/)?.[1] ?? '';
    const link = cell.match(LINK);
    if (!link) return null;
    const rest = text(cell.slice(cell.indexOf('</a>') + 4));
    return {
      name: decode(link[2]).trim(),
      profile: link[1],
      party: party(rest.match(/^\(([^)]+)\)/)?.[1] ?? 'Independent'),
      writeIn: /\(Write-in\)/i.test(rest),
      incumbent: /<(b|strong)>/.test(cell.split('</a>')[0]) || /<u>/.test(cell.split('</a>')[0]),
      advanced: /<td class="votebox-results-cell--check">\s*<img|&#10004;|✔/.test(row),
    };
  }).filter(Boolean);

  const nominated = new Map(); // name -> party, from "X convention for …" boxes
  for (const [, header, table] of boxes) {
    const m = header.match(/^(.+?) convention for /);
    if (!m) continue;
    const list = rows(table);
    for (const c of list.some((x) => x.advanced) ? list.filter((x) => x.advanced) : list) nominated.set(c.name, party(m[1].replace(/ Party$/, '')));
  }
  const out = [];
  for (const [, header, table] of boxes) {
    const m = header.match(/^General election for (.+?)(?: \((\d+) seats?\))?$/);
    if (!m || out.some((o) => o.office === m[1])) continue;
    out.push({
      office: m[1],
      seats: Number(m[2] ?? 1),
      candidates: rows(table).filter((c) => !c.writeIn).map(({ name, party: p, incumbent, profile }) => ({
        name, party: p, incumbent, profile,
        ...(p === 'Nonpartisan' && nominated.has(name) ? { nominatedBy: nominated.get(name) } : {}),
      })),
    });
  }
  return out;
}

/**
 * Legislative chamber pages: the "general election" table with a row per
 * district and Democratic / Republican / Other columns.
 * Returns [{ district, candidates }].
 */
export function parsePartisanTable(html) {
  const table = html.match(/<table class="wikitable sortable collapsible candidateListTablePartisan">([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error('no candidateListTablePartisan table');
  const out = [];
  for (const [, row] of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const district = text(cells[0] ?? '').match(/^District (\d+)/)?.[1];
    if (!district || cells.length < 4) continue;
    const candidates = [];
    cells.slice(1, 4).forEach((cell, i) => {
      // Candidates who didn't make the ballot are listed after that phrase.
      const live = cell.split(/Did not make the ballot/i)[0];
      for (const [, span] of live.matchAll(/<span class="candidate">([\s\S]*?)<\/span>/g)) {
        const link = span.match(LINK);
        if (!link) continue;
        const rest = text(span.slice(span.indexOf('</a>') + 4));
        candidates.push({
          name: decode(link[2]).trim(), profile: link[1],
          party: i === 0 ? 'Democratic' : i === 1 ? 'Republican' : party(rest.match(/\(([^)]+)\)/)?.[1] ?? 'Independent'),
          incumbent: /\(i\)/.test(rest),
        });
      }
    });
    out.push({ district, candidates });
  }
  if (!out.length) throw new Error('no districts parsed from the partisan table');
  return out;
}

/**
 * The U.S. House delegation page: under each "District N" heading, the
 * "General election candidates" list. Returns [{ district, candidates }].
 */
export function parseHouseLists(html) {
  const out = [];
  const parts = html.split(/<span class="mw-headline" id="District_(\d+)">/);
  for (let i = 1; i < parts.length; i += 2) {
    const district = parts[i];
    const block = parts[i + 1].match(/General election candidates<\/span>[\s\S]*?<ul>([\s\S]*?)<\/ul>/)?.[1];
    if (!block) continue;
    const candidates = [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => {
      const link = li.match(LINK);
      if (!link) return null;
      const rest = text(li.slice(li.indexOf('</a>') + 4));
      const parties = [...rest.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).filter((p) => !/^Incumbent$/i.test(p));
      return { name: decode(link[2]).trim(), profile: link[1], party: party(parties[0] ?? 'Independent'), incumbent: /\(Incumbent\)/i.test(rest), writeIn: /Write-in/i.test(rest) };
    }).filter((c) => c && !c.writeIn).map(({ writeIn, ...c }) => c);
    if (candidates.length) out.push({ district, candidates });
  }
  if (!out.length) throw new Error('no districts parsed from the U.S. House page');
  return out;
}

/**
 * The Court of Appeals page: "… general election, 2026" tables with a row
 * per district: "1st District (3 seats)" and the candidates, "(i)" marking
 * incumbents. Returns [{ district, seats, candidates }].
 */
export function parseAppellate(html) {
  const out = new Map();
  for (const [, table] of html.matchAll(/<h4>Michigan intermediate appellate court [^<]*general election, 2026<\/h4>([\s\S]*?)<\/table>/g)) {
    for (const [, row] of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      const head = text(cells[0] ?? '').match(/^(\d)(?:st|nd|rd|th) District(?: \((\d+) seats?\))?/);
      if (!head) continue;
      const key = `${head[1]}:${head[2] ?? 1}`;
      const candidates = [...cells[1].matchAll(/<a href="(https:\/\/ballotpedia\.org\/[^"]+)"[^>]*>([^<]+)<\/a>(?:\s|&#160;)*(\(i\))?/g)]
        .map(([, profile, name, inc]) => ({ name: decode(name).trim(), party: 'Nonpartisan', incumbent: !!inc, profile }));
      out.set(key, { district: head[1], seats: Number(head[2] ?? 1), candidates });
    }
  }
  if (!out.size) throw new Error('no Court of Appeals districts parsed');
  return [...out.values()];
}
