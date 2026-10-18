// Who holds each seat now, whether they're on this ballot, and — when they
// aren't — why, in the words of the source.
//
// Names and parties come first from govbot's roster of sitting legislators
// (Open States' official people data: Congress and the General Assembly),
// then from the Wikipedia article on each 2026 race, which names the
// officeholder in its infobox ("before_election") or its candidate lists
// ("…, incumbent commissioner"). Whether they're running is decided by our
// own candidate lists, never by prose: on this ballot, on another race's
// ballot ("running for X instead"), or on none. The reason an incumbent is
// leaving is the article's own sentence about them (retiring, lost the
// primary, appointed a judge…), quoted with a link to the section it came
// from, and only when the sentence names them and says something about their
// status. Nothing is inferred from a name's absence.
//
// Wikipedia's raw wikitext (action=raw) is read because it carries the
// infobox fields; it's the same documented, keyless endpoint any wiki client
// uses. Fail-soft: a page that can't be read today keeps yesterday's
// incumbents for the races it covers.

import { namesAgree } from '../ballotpedia-profiles.mjs';

const ROSTER = 'https://chihacknight.github.io/govbot/dashboard/people.json';
const WIKI = 'https://en.wikipedia.org/w/index.php?action=raw&title=';
const UA = 'chihacknight-civic-data/1.0 (https://github.com/frankies2727/frankie-labs; chn.govbot@gmail.com)';

const PAGES = {
  overview: '2026_Illinois_elections',
  senate: '2026_United_States_Senate_election_in_Illinois',
  governor: '2026_Illinois_gubernatorial_election',
  ag: '2026_Illinois_Attorney_General_election',
  sos: '2026_Illinois_Secretary_of_State_election',
  comptroller: '2026_Illinois_Comptroller_election',
  house: '2026_United_States_House_of_Representatives_elections_in_Illinois',
  ilsenate: '2026_Illinois_Senate_election',
  ilhouse: '2026_Illinois_House_of_Representatives_election',
  cook: '2026_Cook_County,_Illinois,_elections',
  cookboard: '2026_Cook_County_Board_of_Commissioners_election',
  cps: '2026_Chicago_Board_of_Education_election',
};

// ---- wikitext -> text --------------------------------------------------------

/** Plain text from wikitext: links to their labels, templates and refs dropped. */
export function clean(wt) {
  let s = wt.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  for (let i = 0; i < 6 && /\{\{/.test(s); i++) s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1').replace(/\[https?:[^\s\]]+ ([^\]]+)\]/g, '$1');
  s = s.replace(/^[=]{2,}\s*.*?\s*[=]{2,}\s*$/gm, '').replace(/^[*#:;]+\s*/gm, '');
  return s.replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The article's sections: [{ level, title, body }], body = the text under that heading only. */
export function sections(wt) {
  const out = [];
  const lines = wt.split('\n');
  let cur = { level: 1, title: '', body: [] };
  for (const line of lines) {
    const m = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (m) { out.push(cur); cur = { level: m[1].length, title: m[2].trim(), body: [] }; } else cur.body.push(line);
  }
  out.push(cur);
  return out.map((s) => ({ ...s, body: s.body.join('\n') }));
}

/** A top-level section and everything nested under it, as one block. */
export function block(wt, title, level = 2) {
  const all = sections(wt);
  const at = all.findIndex((s) => s.level === level && fold(s.title) === fold(title));
  if (at < 0) return null;
  let text = all[at].body;
  for (let i = at + 1; i < all.length && all[i].level > level; i++) text += `\n${'='.repeat(all[i].level)}${all[i].title}${'='.repeat(all[i].level)}\n${all[i].body}`;
  return { lead: all[at].body, text };
}

/** Infobox fields that name the sitting officeholder. */
export function infobox(wt) {
  const name = wt.match(/\|\s*before_election\s*=\s*([^\n|]*(?:\|[^\n\]]*\]\])?[^\n]*)/)?.[1];
  const party = wt.match(/\|\s*before_party\s*=\s*([^\n]*)/)?.[1];
  return { name: name ? clean(name).replace(/\s*\(.*\)$/, '') || undefined : undefined, party: party ? shortParty(clean(party)) : undefined };
}

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const shortParty = (p) => (/democrat/i.test(p) ? 'Democratic' : /republican/i.test(p) ? 'Republican' : /independent/i.test(p) ? 'Independent' : p ? p.replace(/ Party.*$/, '') : undefined);
const link = (s) => s.replace(/\s*\([^)]*\)$/, '').trim();

/** "incumbent … Democrat [[Name]]" or "Incumbent 1st district commissioner Name, a Democrat" -> { name, party }. */
export function incumbentInProse(wt) {
  let m = wt.match(/[Ii]ncumbent[^.\n]{0,80}?\b(Democrat|Republican|Independent)\b[^.\n[]{0,20}\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (m) return { name: m[3] ?? link(m[2]), party: shortParty(m[1]) };
  m = wt.match(/[Ii]ncumbent(?: \d+(?:st|nd|rd|th) district)? (?:commissioner|clerk|sheriff|treasurer|assessor|president)\s+(?:\[\[(?:[^\]|]+\|)?([^\]]+)\]\]|([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){1,3}))(?:,| who| is)/);
  if (m) return { name: m[1] ?? m[2], party: shortParty(wt.match(/,\s*an? (Democrat|Republican|Independent)\b/)?.[1] ?? '') || undefined };
  return null;
}

/** Candidate-list bullets that say "…, incumbent <office>" -> names. */
export function incumbentBullets(wt, office = /incumbent (?:commissioner|clerk|sheriff|treasurer|assessor|board member|state'?s attorney)/i) {
  const out = [];
  for (const line of wt.split('\n')) {
    const m = line.match(/^\*\s*(?:\[\[(?:[^\]|]+\|)?([^\]]+)\]\]|([^,<[]+?)),\s*([^<\n]*)/);
    if (m && office.test(m[3])) out.push(clean(m[1] ?? m[2]));
  }
  return out;
}

// What a sentence has to say to count as the incumbent's status.
const STATUS = /\b(retir\w*|not seek\w*|won.t seek|will not seek|declin\w*|defeated|lost (?:the |his |her |their )?(?:primary|renomination)|resign\w*|appointed|term.limit\w*|running for|run for|ran for|seek\w* (?:re-?election|a \w+ term|another term)|stepping down|step down|withdr\w*|died|death|unsuccessfully)\b/i;

/** The first sentence that names the person and says where they stand, in plain text. */
export function statusSentence(wt, name) {
  const surname = fold(name.split(' & ')[0]).split(/[^a-z]+/).filter(Boolean).at(-1);
  if (!surname) return null;
  const text = clean(wt.replace(/^#\s*District \d+:\s*/gm, ''));
  // Sentences end at . ! or ?, but not inside "U.S.", an initial or a title.
  for (const s of text.split(/(?<!\bU\.S\.|\b[A-Z]\.|\b(?:Jr|Sr|Dr|Mr|Mrs|Ms|St|No|Gov|Sen|Rep)\.)(?<=[.!?])\s+(?=[A-Z"“])/)) {
    if (new RegExp(`\\b${surname}\\b`).test(fold(s)) && STATUS.test(s) && !/not yet stated|has not (?:yet )?(?:said|announced)/i.test(s)) {
      return s.length > 320 ? s.slice(0, 317).replace(/[,;:\s]+\S*$/, '') + '…' : s;
    }
  }
  return null;
}

// ---- the roster --------------------------------------------------------------

/** Sitting members by seat: { "cd:7": {name, party}, "sldu:9": …, "sldl:1": … }. */
export function seatsFromRoster(people) {
  const seats = {};
  for (const rows of Object.values(people.usa ?? {})) for (const [, full, party, area] of rows) {
    const m = area?.match(/^U\.S\. House · IL-(\d+|AL)$/);
    if (m) seats[`cd:${m[1] === 'AL' ? '1' : +m[1]}`] = { name: full, party };
  }
  for (const rows of Object.values(people.il ?? {})) for (const [, full, party, area] of rows) {
    const m = area?.match(/^(Senate|House) District (\d+)$/);
    if (m) seats[`${m[1] === 'Senate' ? 'sldu' : 'sldl'}:${+m[2]}`] = { name: full, party };
  }
  return seats;
}

// ---- the plan: where each race's incumbent is written -----------------------

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;
const anchor = (title) => title.replace(/\s+/g, '_');
const wikiUrl = (page, section) => `https://en.wikipedia.org/wiki/${page}${section ? `#${anchor(section)}` : ''}`;

/** The 2026 statewide races: [race id, office page, overview section]. */
const STATEWIDE = [
  ['united-states-senator', 'senate', 'United States Senate'],
  ['governor-lieutenant-governor', 'governor', 'Governor and lieutenant governor'],
  ['attorney-general', 'ag', 'Attorney general'],
  ['secretary-of-state', 'sos', 'Secretary of state'],
  ['comptroller', 'comptroller', 'Comptroller'],
  ['treasurer', null, 'Treasurer'],
];
const COOK_EXEC = { 'president-of-county-board': 'President of the Cook County Board of Commissioners', 'county-clerk': 'Clerk', 'county-sheriff': 'Sheriff', 'county-treasurer': 'Treasurer', 'county-assessor': 'Assessor' };

/**
 * Read one race's incumbents from the pages. Returns [{ name, party?, note?, source }]
 * (without `ballot`: that's matched against the candidates afterwards), or
 * null when no page covers the race.
 */
export function readIncumbents(race, pages, seats) {
  const page = (k) => pages[k];
  const from = (k, name, party, wt, section) => ({ name, party, note: wt && name ? statusSentence(wt, name) ?? undefined : undefined, source: { name: `Wikipedia: ${PAGES[k].replace(/_/g, ' ')}`, url: wikiUrl(PAGES[k], section) } });

  const sw = STATEWIDE.find(([id]) => id === race.id);
  if (sw) {
    const [, officeKey, section] = sw;
    const office = officeKey && page(officeKey);
    const over = page('overview') && block(page('overview'), section, 3);
    const box = office ? infobox(office) : {};
    const prose = over ? incumbentInProse(over.lead) : null;
    const name = box.name ?? prose?.name;
    if (!name) return null;
    // The overview's one-line summary is the clearest sentence; the office article's lead backs it up.
    const text = [over?.lead, office && office.split(/\n==/)[0]].filter(Boolean).join('\n');
    return [from(over ? 'overview' : officeKey, name, box.party ?? prose?.party, text, over ? section : undefined)];
  }

  const a = race.area;
  if (a?.type === 'cd' && page('house')) {
    const sec = block(page('house'), `District ${+a.id}`);
    if (!sec) return null;
    const seat = seats[`cd:${+a.id}`];
    const box = infobox(sec.text);
    const wiki = box.name ?? incumbentInProse(sec.lead)?.name;
    if (!seat && !wiki) return null;
    // The official roster names the member; the article's sentence is used only when it's about the same person.
    const name = seat?.name ?? wiki;
    const agree = !wiki || !seat || sameSurname(seat.name, wiki);
    return [from('house', name, seat?.party ?? box.party, agree ? sec.lead : null, `District ${+a.id}`)];
  }
  if ((a?.type === 'sldu' || a?.type === 'sldl')) {
    const key = a.type === 'sldu' ? 'ilsenate' : 'ilhouse';
    const wt = page(key);
    const seat = seats[`${a.type}:${+a.id}`];
    if (!wt) return seat ? [{ ...seat, source: { name: 'Open States (via govbot)', url: ROSTER } }] : null;
    const sec = block(wt, `District ${+a.id}`);
    const wiki = sec ? incumbentInProse(sec.lead) : null;
    const name = seat?.name ?? wiki?.name;
    if (!name) return null;
    const agree = !wiki || !seat || sameSurname(seat.name, wiki.name);
    // The "Retirements" list says why a member is leaving; the district section says the rest.
    const retiring = (block(wt, 'Retirements')?.text ?? '').split('\n').find((l) => new RegExp(`^#\\s*District ${+a.id}:`).test(l));
    const text = agree ? [retiring, sec?.lead].filter(Boolean).join('\n') : null;
    return [from(key, name, seat?.party ?? wiki?.party, text, retiring ? 'Retirements' : sec ? `District ${+a.id}` : undefined)];
  }

  const cook = page('cook');
  if (COOK_EXEC[race.id] && cook) {
    const title = COOK_EXEC[race.id];
    const sec = block(cook, title);
    if (!sec) return null;
    const name = infobox(sec.text).name ?? incumbentBullets(sec.text)[0];
    if (!name) return null;
    return [from('cook', name, infobox(sec.text).party ?? incumbentInProse(sec.lead)?.party, sec.lead, title)];
  }
  if (a?.type === 'commissioner' && page('cookboard')) {
    const title = `${ordinal(+a.id)} district`;
    const sec = block(page('cookboard'), title);
    if (!sec) return null;
    const who = incumbentInProse(sec.lead) ?? { name: incumbentBullets(sec.text)[0] };
    if (!who.name) return null;
    return [from('cookboard', who.name, who.party, sec.lead, title)];
  }
  if (a?.type === 'bor' && cook) {
    const board = block(cook, 'Cook County Board of Review');
    const sec = board && block(board.text, `${ordinal(+a.id)} district`, 3);
    const name = sec && incumbentBullets(sec.text)[0];
    return name ? [from('cook', name, undefined, sec.text, 'Cook County Board of Review')] : null;
  }
  if (a?.type === 'mwrd' && cook) {
    const board = block(cook, 'Water Reclamation District Board');
    const sec = board && block(board.text, /unexpired/i.test(race.office) ? 'Special election' : 'Regular election', 3);
    const names = sec ? incumbentBullets(sec.text) : [];
    return names.length ? names.map((n) => from('cook', n, undefined, sec.text, 'Water Reclamation District Board')) : null;
  }
  if (a?.type === 'school' && page('cps')) {
    const sec = block(page('cps'), `District ${a.id}`);
    const names = sec ? incumbentBullets(sec.text, /incumbent board member/i) : [];
    return names.length ? names.map((n) => from('cps', n, undefined, null, `District ${a.id}`)) : null;
  }

  // Judicial vacancies name the judge who left right on the ballot.
  let m = race.office.match(/\(Vacancy of (.+)\)$/);
  if (m) return [{ name: `Judge ${m[1]}`, note: 'Left the bench; this election fills the vacancy.', source: { name: 'the ballot', url: '' } }];
  m = race.office.match(/\(Converted from Associate Judgeship of (.+)\)$/);
  if (m) return [{ name: `Associate Judge ${m[1]}`, note: 'An appointed associate judgeship converted into this elected seat.', source: { name: 'the ballot', url: '' } }];
  return null;
}

const sameSurname = (a, b) => {
  const last = (n) => fold(n).split(/[^a-z]+/).filter(Boolean).at(-1);
  return last(a) === last(b);
};

// A sentence written before the primary can say an incumbent "is seeking
// re-election" when they're no longer on the ballot; it only stays when it
// says how that ended.
const SAYS_RUNNING = /\b(seeking|running for|run for|is running|will run|sought)\b/i;
const SAYS_OVER = /\b(not|unsuccessful\w*|defeated|lost|withdr\w*|retir\w*|resign\w*|appointed|died|instead|won.t|never)\b/i;

/** Ballot names and roster names differ in small ways: "C.D." for a quoted nickname, "Du Buclet" for "DuBuclet". */
export function sameName(a, b) {
  if (namesAgree(a, b)) return true;
  const toks = (n) => fold(n.split(' & ')[0].replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).replace(/["“”]/g, ' ').split(/[^a-z.]+/).filter(Boolean);
  const [ta, tb] = [toks(a), toks(b)];
  if (ta.length < 2 || tb.length < 2) return false;
  const initials = (t) => t.replace(/\./g, '');
  const firstOk = initials(ta[0]) === initials(tb[0]) || initials(ta[0])[0] === initials(tb[0])[0] && (ta[0].includes('.') || tb[0].includes('.'));
  const lastOk = ta.at(-1) === tb.at(-1) || ta.slice(-2).join('') === tb.at(-1) || tb.slice(-2).join('') === ta.at(-1);
  return firstOk && lastOk;
}

/** Mark each incumbent as on this ballot, on another race's, or neither. */
export function placeIncumbents(races) {
  for (const r of races) {
    for (const inc of r.incumbents ?? []) {
      const here = r.candidates.find((c) => sameName(c.name, inc.name));
      if (here) { inc.ballot = here.ballot; delete inc.note; continue; }
      if (inc.note && SAYS_RUNNING.test(inc.note) && !SAYS_OVER.test(inc.note)) delete inc.note;
      if (inc.note) continue;
      const elsewhere = races.find((o) => o !== r && o.candidates.some((c) => sameName(c.name, inc.name)));
      if (elsewhere) inc.note = `Running for ${elsewhere.office} instead.`;
    }
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Attach `incumbents` to every race a source covers. A page that can't be
 * read keeps yesterday's incumbents for the races it covers.
 */
export async function addIncumbents(races, { prev = null, fetchPage = fetchText, pause = 800 } = {}) {
  const log = [];
  const pages = {};
  let people = null;
  try { people = JSON.parse(await fetchPage(ROSTER)); } catch (e) { log.push(`roster: ${e.message}`); }
  const seats = people ? seatsFromRoster(people) : {};
  for (const [key, title] of Object.entries(PAGES)) {
    try { pages[key] = await fetchPage(`${WIKI}${encodeURIComponent(title)}`); } catch (e) { log.push(`${title}: ${e.message}`); }
    if (pause) await new Promise((r) => setTimeout(r, pause));
  }
  const asOf = new Date().toISOString().slice(0, 10);
  const before = new Map((prev?.races ?? []).filter((r) => r.incumbents).map((r) => [r.id, r.incumbents]));
  let found = 0, kept = 0, running = 0, noted = 0;
  for (const r of races) {
    let list = null;
    try { list = readIncumbents(r, pages, seats); } catch (e) { log.push(`${r.id}: ${e.message}`); }
    if (list?.length) {
      r.incumbents = list.map((i) => ({ ...i, asOf }));
      found += 1;
    } else if (before.has(r.id)) {
      r.incumbents = before.get(r.id);
      kept += 1;
    } else delete r.incumbents;
  }
  placeIncumbents(races);
  for (const r of races) for (const i of r.incumbents ?? []) { if (i.ballot) running += 1; else if (i.note) noted += 1; }
  return { found, kept, running, noted, log };
}

// Standalone: refresh the committed Illinois data's incumbents.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const file = new URL('../../../src/projects/know-your-ballot/data/illinois/ballot.json', import.meta.url);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const r = await addIncumbents(data.races, { prev: data });
  console.log(`Incumbents: ${r.found} races read, ${r.kept} kept, ${r.running} on their ballot, ${r.noted} with a note`);
  for (const l of r.log) console.log('  ' + l);
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}
