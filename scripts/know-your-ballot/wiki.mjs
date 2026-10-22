// Reading Wikipedia's articles on this year's races: who holds each seat,
// why the ones leaving are leaving, and who has endorsed whom. Shared by the
// Illinois and Michigan builds; each state's incumbents.mjs says which
// article and section covers each race.
//
// Articles are read as raw wikitext (index.php?action=raw), the same
// documented, keyless endpoint any wiki client uses, because the infobox
// fields and endorsement templates are only there. Everything quoted on the
// site is a sentence or list from the article, linked to its section, never
// a summary of ours.

import { namesAgree } from './ballotpedia-profiles.mjs';

export const ROSTER = 'https://chihacknight.github.io/govbot/dashboard/people.json';
const WIKI = 'https://en.wikipedia.org/w/index.php?action=raw&title=';
const UA = 'chihacknight-civic-data/1.0 (https://github.com/frankies2727/frankie-labs; chn.govbot@gmail.com)';

export async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** Fetch each article in `titles` ({ key: title }), politely; a page that fails is left out and logged. */
export async function fetchPages(titles, { fetchPage = fetchText, pause = 800 } = {}) {
  const pages = {};
  const log = [];
  for (const [key, title] of Object.entries(titles)) {
    try { pages[key] = await fetchPage(`${WIKI}${encodeURIComponent(title)}`); } catch (e) { log.push(`${title}: ${e.message}`); }
    if (pause) await new Promise((r) => setTimeout(r, pause));
  }
  return { pages, log };
}

export const wikiUrl = (title, section) => `https://en.wikipedia.org/wiki/${title}${section ? `#${section.replace(/\s+/g, '_')}` : ''}`;
export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;

// ---- wikitext -> text --------------------------------------------------------

/** Plain text from wikitext: links to their labels, templates, refs and markup dropped. */
export function clean(wt) {
  let s = wt.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  // {{ushr|IL|7|IL-7}} is a seat ("IL-7"); other templates are footnotes and citations.
  s = s.replace(/\{\{ushr\|([A-Z]{2})\|(\d+|AL)(?:\|([^}|]*))?\}\}/g, (_, st, n, label) => label || `${st}-${n}`);
  for (let i = 0; i < 6 && /\{\{/.test(s); i++) s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1').replace(/\[https?:[^\s\]]+ ([^\]]+)\]/g, '$1');
  s = s.replace(/^[=]{2,}\s*.*?\s*[=]{2,}\s*$/gm, '').replace(/^[*#:;]+\s*/gm, '');
  return s.replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The article's sections: [{ level, title, body }], body = the text under that heading only. */
export function sections(wt) {
  const out = [];
  let cur = { level: 1, title: '', body: [] };
  for (const line of wt.split('\n')) {
    const m = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (m) { out.push(cur); cur = { level: m[1].length, title: m[2].trim(), body: [] }; } else cur.body.push(line);
  }
  out.push(cur);
  return out.map((s) => ({ ...s, body: s.body.join('\n') }));
}

export const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** A section (by title, at `level`; any level when 0) and everything nested under it: { lead, text }. */
export function block(wt, title, level = 2) {
  const all = sections(wt);
  const at = all.findIndex((s) => (level ? s.level === level : s.level > 1) && fold(s.title) === fold(title));
  if (at < 0) return null;
  const lv = all[at].level;
  let text = all[at].body;
  for (let i = at + 1; i < all.length && all[i].level > lv; i++) text += `\n${'='.repeat(all[i].level)}${all[i].title}${'='.repeat(all[i].level)}\n${all[i].body}`;
  return { lead: all[at].body, text, title: all[at].title };
}

const PARTY = /\b(Democrat(?:ic)?|Republican|Independent|Libertarian|Green)\b/;
export const shortParty = (p) => (/democrat/i.test(p) ? 'Democratic' : /republican/i.test(p) ? 'Republican' : /independent/i.test(p) ? 'Independent' : /libertarian/i.test(p) ? 'Libertarian' : /green/i.test(p) ? 'Green' : p ? p.replace(/ Party.*$/, '') : undefined);
const unlink = (s) => s.replace(/\s*\([^)]*\)$/, '').trim();

/** Infobox fields that name the sitting officeholder. */
export function infobox(wt) {
  const name = wt.match(/\|\s*before_election\s*=\s*([^\n]*)/)?.[1];
  const party = wt.match(/\|\s*before_party\s*=\s*([^\n]*)/)?.[1];
  const n = name ? clean(name).replace(/\s*\(.*\)$/, '') : '';
  return { name: n && !/^(vacant|none|tbd)$/i.test(n) ? n : undefined, party: party ? shortParty(clean(party)) : undefined };
}

/** "incumbent … Democrat [[Name]]", "Incumbent 1st district commissioner Name, a Democrat" -> { name, party }. */
export function incumbentInProse(wt) {
  let m = wt.match(new RegExp(`[Ii]ncumbent[^.\\n]{0,80}?${PARTY.source}[^.\\n[]{0,24}\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]`));
  if (m) return { name: m[3] ?? unlink(m[2]), party: shortParty(m[1]) };
  m = wt.match(/[Ii]ncumbent(?: \d+(?:st|nd|rd|th) district)? (?:commissioner|clerk|sheriff|treasurer|assessor|president|senator|representative|governor)\s+(?:\[\[(?:[^\]|]+\|)?([^\]]+)\]\]|([A-Z][\w.'-]+(?: [A-Z][\w.'-]+){1,3}))(?:,| who| is)/);
  if (m) return { name: m[1] ?? m[2], party: shortParty(wt.match(/,\s*an? (Democrat|Republican|Independent)\b/)?.[1] ?? '') || undefined };
  return null;
}

/** Candidate-list bullets that read "Name, incumbent <office>": [{ name, heading }], heading = the nearest subsection title. */
export function incumbentBullets(wt, role = /^incumbent\b/i) {
  const out = [];
  let heading = '';
  for (const line of wt.split('\n')) {
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (h) { heading = h[2].trim(); continue; }
    const m = line.match(/^\*\s*(?:\[\[(?:[^\]|]+\|)?([^\]]+)\]\]|([^,<[]+?)),\s*([^<\n]*)/);
    if (m && role.test(clean(m[3]))) out.push({ name: clean(m[1] ?? m[2]), heading });
  }
  return out;
}

// What a sentence has to say to count as the incumbent's status.
const STATUS = /\b(retir\w*|not seek\w*|won.t seek|will not seek|declin\w*|defeated|lost (?:\w+ ){0,3}(?:primary|renomination|nomination)|resign\w*|appointed|term.limit\w*|ineligible|running for|run for|ran for|seek\w* (?:re-?election|a \w+ term|another term)|stepping down|step down|withdr\w*|died|death|unsuccessfully)\b/i;

/** The first sentence that names the person and says where they stand, in plain text. */
export function statusSentence(wt, name) {
  const surname = fold(name.split(' & ')[0]).split(/[^a-z]+/).filter(Boolean).at(-1);
  if (!surname) return null;
  const text = clean(wt.replace(/^#\s*(?:\[\[[^\]]*\]\]|District \d+):\s*/gm, ''));
  // Sentences end at . ! or ?, but not inside "U.S.", an initial or a title.
  for (const s of text.split(/(?<!\bU\.S\.|\b[A-Z]\.|\b(?:Jr|Sr|Dr|Mr|Mrs|Ms|St|No|Gov|Sen|Rep)\.)(?<=[.!?])\s+(?=[A-Z"“])/)) {
    if (new RegExp(`\\b${surname}\\b`).test(fold(s)) && STATUS.test(s) && !/not yet stated|has not (?:yet )?(?:said|announced)/i.test(s)) {
      return s.length > 320 ? s.slice(0, 317).replace(/[,;:\s]+\S*$/, '') + '…' : s;
    }
  }
  return null;
}

const surnameOf = (name) => fold(name.split(' & ')[0].replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).split(/[^a-z]+/).filter(Boolean).at(-1);
const names = (name, s) => sameName(s, name) || (surnameOf(name) ? new RegExp(`\\b${surnameOf(name)}\\b`).test(fold(s)) : false);

/**
 * The incumbent in a results box ({{Election box …}}) with votes counted and
 * not on top: "Lost the Cook County Board of Review 2nd district Democratic
 * primary to Liz Nicholson, 37.7% to 62.3%."
 */
export function primaryLoss(wt, name) {
  for (const box of wt.split('{{Election box begin').slice(1)) {
    const title = clean(box.match(/\|\s*title\s*=\s*([^\n]+)/)?.[1] ?? '').replace(/^\d{4}\s+/, '');
    const rows = [...box.matchAll(/\{\{Election box candidate[^\n]*\n((?:\s*\|[^\n]*\n)+)/g)].map(([, body]) => ({
      name: clean(body.match(/\|\s*candidate\s*=\s*([^\n]+)/)?.[1] ?? '').replace(/\s*\((?:incumbent|write-in)\)/gi, '').trim(),
      votes: +(body.match(/\|\s*votes\s*=\s*([\d,]+)/)?.[1] ?? '').replace(/,/g, '') || 0,
      pct: body.match(/\|\s*percentage\s*=\s*([\d.]+)/)?.[1] ?? '',
    })).filter((r) => r.name);
    const me = rows.find((r) => names(name, r.name));
    if (!me || !rows.some((r) => r.votes)) continue;
    const top = rows.reduce((a, b) => (b.votes > a.votes ? b : a));
    if (top === me) return null;
    return `Lost the ${/primary/i.test(title) ? title : `${title} primary`} to ${top.name}${me.pct && top.pct ? `, ${me.pct}% to ${top.pct}%` : ''}.`;
  }
  return null;
}

// A candidates-list heading that says the person is out of the race.
const OUT_HEADING = /withdr|declin|did not qualify|disqualif|removed|eliminated|lost|did not file|not running/i;
/** The heading the incumbent is listed under when it says they're out: "Filed but did not qualify for the ballot." */
export function listStatus(wt, name) {
  let heading = '';
  for (const line of wt.split('\n')) {
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (h) { heading = h[2].trim(); continue; }
    if (/^\*/.test(line) && OUT_HEADING.test(heading) && names(name, clean(line).split(',')[0])) {
      const text = clean(heading).replace(/[.\s]+$/, '');
      return `${text[0].toUpperCase()}${text.slice(1)}.`;
    }
  }
  return null;
}

/** The party primary the person is listed as a candidate in ("Democratic"), from the headings above their line; null if none. */
export function primaryEntered(wt, name) {
  let party = null, out = false;
  for (const line of wt.split('\n')) {
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (h) {
      const p = h[2].match(/^(\w[\w ]*?) primary$/i);
      if (p) { party = p[1]; out = false; } else if (h[1].length > 3) out = OUT_HEADING.test(h[2]);
      continue;
    }
    if (party && !out && /^\*/.test(line) && names(name, clean(line).split(',')[0])) return party;
  }
  return null;
}

/** The article the race page links for the person ("Nicholas Smith (Illinois politician)"), to read their own page. */
export function linkTarget(wt, name) {
  for (const [, target, label] of wt.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)) {
    if (names(name, label ?? target) && !/^(?:File|Category|Image):/i.test(target)) return target.trim();
  }
  return null;
}

/** From the person's own article: the first sentence naming them, about this year's election, that says where they stand. */
export function articleStatus(articleWt, name, year) {
  const text = clean(articleWt.replace(/^\{\{[\s\S]*?\n\}\}\n/, ''));
  for (const s of text.split(/(?<!\bU\.S\.|\b[A-Z]\.|\b(?:Jr|Sr|Dr|Mr|Mrs|Ms|St|No|Gov|Sen|Rep)\.)(?<=[.!?])\s+(?=[A-Z"“])/)) {
    if (s.includes(String(year)) && STATUS.test(s) && names(name, s)) return s.length > 320 ? s.slice(0, 317).replace(/[,;:\s]+\S*$/, '') + '…' : s;
  }
  return null;
}

/**
 * The line about district `n` in the article's lists of outgoing members
 * ("Retirements", "Outgoing incumbents", "Incumbents defeated"), with what its
 * heading says when the line itself doesn't: { text, heading } or null.
 */
export function outgoingLine(wt, n) {
  const want = new RegExp(`\\b(?:District ${n}|${ordinal(n)} (?:House of Representatives |Senate )?district|district ${n})\\b`, 'i');
  for (const title of ['Retirements', 'Outgoing incumbents', 'Incumbents defeated']) {
    const b = block(wt, title);
    if (!b) continue;
    let heading = title;
    for (const line of b.text.split('\n')) {
      const h = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
      if (h) { heading = h[2].trim(); continue; }
      if (/^[#*]/.test(line) && want.test(line)) {
        // "2nd district: Name is retiring" -> "Name is retiring." (a list line has no full stop of its own)
        const text = clean(line).replace(/^[^:]{0,60}district:\s*/i, '').replace(/[,;\s]+$/, '');
        return { text: /[.!?]$/.test(text) ? text : `${text}.`, heading };
      }
    }
  }
  return null;
}

// ---- the roster --------------------------------------------------------------

/** Sitting members by seat for one state: { "cd:7": {name, party}, "sldu:9": …, "sldl:1": … }. */
export function seatsFromRoster(people, state) {
  const seats = {};
  for (const rows of Object.values(people.usa ?? {})) for (const [, full, party, area] of rows) {
    const m = area?.match(new RegExp(`^U\\.S\\. House · ${state}-(\\d+|AL)$`));
    if (m) seats[`cd:${m[1] === 'AL' ? '1' : +m[1]}`] = { name: full, party };
  }
  for (const rows of Object.values(people[state.toLowerCase()] ?? {})) for (const [, full, party, area] of rows) {
    const m = area?.match(/^(Senate|House) District (\d+)$/);
    if (m) seats[`${m[1] === 'Senate' ? 'sldu' : 'sldl'}:${+m[2]}`] = { name: full, party };
  }
  return seats;
}

export const sameSurname = (a, b) => {
  const last = (n) => fold(n.replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, '')).split(/[^a-z]+/).filter(Boolean).at(-1);
  return last(a) === last(b);
};

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

// ---- incumbents ----------------------------------------------------------------

// A sentence written before the primary can say an incumbent "is seeking
// re-election" when they're no longer on the ballot; it only stays when it
// says how that ended.
const SAYS_RUNNING = /\b(seeking|running for|run for|is running|will run|sought)\b/i;
const SAYS_OVER = /\b(not|unsuccessful\w*|defeated|lost|withdr\w*|retir\w*|resign\w*|appointed|died|instead|won.t|never|term.limited|ineligible)\b/i;

/** Mark each incumbent as on this ballot, on another race's, or neither. */
export function placeIncumbents(races) {
  for (const r of races) {
    for (const inc of r.incumbents ?? []) {
      // The roster's "Jaz Martus" is the ballot's "Jasper Martus": the article's spelling is tried too.
      const names = [inc.name, ...(inc.aliases ?? [])];
      delete inc.aliases;
      const here = r.candidates.find((c) => names.some((n) => sameName(c.name, n)));
      if (here) { inc.ballot = here.ballot; delete inc.note; continue; }
      if (inc.note && SAYS_RUNNING.test(inc.note) && !SAYS_OVER.test(inc.note)) delete inc.note;
      if (inc.note) continue;
      const elsewhere = races.find((o) => o !== r && o.candidates.some((c) => names.some((n) => sameName(c.name, n))));
      if (elsewhere) inc.note = `Running for ${elsewhere.office.replace(/ \(\d+ seats\)$/, '')} instead.`;
    }
  }
}

/**
 * One incumbent record from a page: name, party, the status sentence (if any)
 * and the source. `wt` is the prose to read a status sentence from; `full`
 * the whole section, for a primary they lost or a candidates-list heading
 * that says they're out.
 */
export function incumbentFrom(pageTitle, name, party, wt, section, alias, full) {
  // A counted primary result beats a sentence written before the primary ("is seeking re-election").
  const note = name && ((full && primaryLoss(full, name)) || (wt && statusSentence(wt, name)) || (full && listStatus(full, name))) || undefined;
  const inc = { name, party, note, source: { name: `Wikipedia: ${pageTitle.replace(/_/g, ' ')}`, url: wikiUrl(pageTitle, section) } };
  if (alias && alias !== name) inc.aliases = [alias];
  return inc;
}

/**
 * Attach `incumbents` to every race `read(race)` covers; a race whose page
 * couldn't be read today keeps yesterday's. Returns counts and a log.
 */
export function applyIncumbents(races, read, prev) {
  const log = [];
  const asOf = new Date().toISOString().slice(0, 10);
  const before = new Map((prev?.races ?? []).filter((r) => r.incumbents).map((r) => [r.id, r.incumbents]));
  let found = 0, kept = 0, running = 0, noted = 0;
  for (const r of races) {
    let list = null;
    try { list = read(r); } catch (e) { log.push(`${r.id}: ${e.message}`); }
    if (list?.length) { r.incumbents = list.map((i) => ({ ...i, asOf })); found += 1; } else if (before.has(r.id)) { r.incumbents = before.get(r.id); kept += 1; } else delete r.incumbents;
  }
  placeIncumbents(races);
  for (const r of races) for (const i of r.incumbents ?? []) { if (i.ballot) running += 1; else if (i.note) noted += 1; }
  return { found, kept, running, noted, log };
}

// ---- endorsements ------------------------------------------------------------

/** The text of each {{Endorsements box}} template in the wikitext, braces balanced. */
function templates(wt, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const start = wt.indexOf(`{{${name}`, from);
    if (start < 0) break;
    let depth = 0, i = start;
    for (; i < wt.length - 1; i++) {
      if (wt[i] === '{' && wt[i + 1] === '{') { depth++; i++; } else if (wt[i] === '}' && wt[i + 1] === '}') { depth--; i++; if (!depth) break; }
    }
    out.push(wt.slice(start, i + 1));
    from = i + 1;
  }
  return out;
}

/** The named parameter of a template, up to the next top-level "|param=". */
function param(tpl, key) {
  const m = tpl.match(new RegExp(`\\|\\s*${key}\\s*=`));
  if (!m) return '';
  let depth = 0, i = m.index + m[0].length;
  const start = i;
  for (; i < tpl.length - 1; i++) {
    const two = tpl.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; i++; } else if (two === '}}' || two === ']]') { if (!depth && two === '}}') break; depth--; i++; } else if (!depth && tpl[i] === '|' && /^\|\s*\w+\s*=/.test(tpl.slice(i))) break;
  }
  return tpl.slice(start, i);
}

/**
 * Every endorsement box in the wikitext: [{ title, groups: [{ category, names }] }].
 * Categories are the box's own ("Labor unions", "U.S. representatives");
 * each name keeps the role the article gives it, minus notes and citations.
 */
export function endorsementBoxes(wt) {
  const boxes = [];
  for (const tpl of templates(wt, 'Endorsements box')) {
    const title = clean(param(tpl, 'title'));
    if (!title) continue;
    const groups = [];
    let cat = 'Endorsements';
    for (const raw of param(tpl, 'list').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      let m;
      if ((m = line.match(/^;\s*(.+)$/)) || (m = line.match(/^'''(.+?)'''\s*$/))) { cat = clean(m[1]); continue; }
      if (!/^\*/.test(line)) continue;
      const name = clean(line.replace(/''\([^)]*\)''/g, '')).replace(/\s*\((?:co-)?endors\w*[^)]*\)\s*$/i, '').trim();
      if (!name || name.length > 140) continue;
      let g = groups.find((x) => x.category === cat);
      if (!g) groups.push((g = { category: cat, names: [] }));
      if (!g.names.includes(name)) g.names.push(name);
    }
    if (groups.length) boxes.push({ title, groups });
  }
  return boxes;
}

/**
 * Attach `endorsements` to the candidates named by an endorsement box in the
 * part of the article that covers their race. `locate(race)` -> { page: title,
 * wt: the race's wikitext, section } or null.
 */
export function applyEndorsements(races, locate, prev) {
  const log = [];
  const asOf = new Date().toISOString().slice(0, 10);
  const before = new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => c.endorsements).map((c) => [`${r.id}|${c.name}`, c.endorsements])));
  let withList = 0, kept = 0;
  for (const r of races) {
    let where = null;
    try { where = locate(r); } catch (e) { log.push(`${r.id}: ${e.message}`); }
    for (const c of r.candidates) {
      delete c.endorsements;
      if (!where) { const k = before.get(`${r.id}|${c.name}`); if (k) { c.endorsements = k; kept += 1; } continue; }
      const mine = endorsementBoxes(where.wt).filter((b) => sameName(b.title, c.name));
      if (!mine.length) continue;
      const groups = [];
      for (const b of mine) for (const g of b.groups) {
        let t = groups.find((x) => x.category === g.category);
        if (!t) groups.push((t = { category: g.category, names: [] }));
        for (const n of g.names) if (!t.names.includes(n)) t.names.push(n);
      }
      c.endorsements = { groups, total: groups.reduce((n, g) => n + g.names.length, 0), source: { name: `Wikipedia: ${where.page.replace(/_/g, ' ')}`, url: wikiUrl(where.page, where.section) }, asOf };
      withList += 1;
    }
  }
  return { withList, kept, log };
}
