// The Illinois State Board of Elections' certified candidate list for the
// Nov 3, 2026 general election (federal, state, legislative and judicial
// contests statewide). It fills in the suburban Cook districts the Chicago
// list doesn't cover, and gives candidates' websites from their filings.
//
// The download is an ASP.NET postback: GET the page for its form state,
// then POST it back with the "Text" link as the event target.

const PAGE = 'https://www.elections.il.gov/ElectionOperations/DownloadCandidates.aspx?ID=sejIrI%2bQmww%3d';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function fetchCertifiedList() {
  const page = await fetch(PAGE, { headers: { 'User-Agent': UA } });
  if (!page.ok) throw new Error(`${PAGE} -> HTTP ${page.status}`);
  const cookie = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const html = await page.text();
  const form = new URLSearchParams();
  for (const [, name, value] of html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) form.set(name, decode(value));
  form.set('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$btnText');
  const res = await fetch(PAGE, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: form,
  });
  const text = await res.text();
  if (!res.ok || !text.startsWith('CandidateID')) throw new Error('State Board candidate download did not return the data file');
  return { url: PAGE, text };
}

const title = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m) => m.toUpperCase()).replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`);
// The file escapes apostrophes as SQL: "O' + Char(39) + 'MALLEY".
const unescapeSql = (s) => s.replace(/' \+ Char\(39\) \+ '/g, "'").replace(/''/g, "'");

// Office names in the file -> the Chicago list's wording and district type.
function officeOf(name) {
  let m;
  if ((m = name.match(/^(\d+)(ST|ND|RD|TH) CONGRESS$/))) return { office: `U.S. Representative, ${m[1]}${m[2].toLowerCase()} District`, area: { type: 'cd', id: m[1] }, section: 'federal' };
  if ((m = name.match(/^(\d+)(ST|ND|RD|TH) SENATE$/))) return { office: `State Senator, ${m[1]}${m[2].toLowerCase()} District`, area: { type: 'sldu', id: m[1] }, section: 'state' };
  if ((m = name.match(/^(\d+)(ST|ND|RD|TH) REPRESENTATIVE$/))) return { office: `State Representative, ${m[1]}${m[2].toLowerCase()} District`, area: { type: 'sldl', id: m[1] }, section: 'state' };
  if ((m = name.match(/^COOK CIRCUIT - (\d+)(ST|ND|RD|TH) SUBCIRCUIT - (.+) VACANCY$/))) {
    return { office: `Judge, ${m[1]}${m[2].toLowerCase()} Subcircuit (Vacancy of ${title(m[3])})`, area: { type: 'subcircuit', id: m[1] }, section: 'judicial' };
  }
  return null; // statewide, countywide and retention contests: same as the Chicago list
}

const key = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const website = (w) => (w ? (/^https?:\/\//i.test(w) ? w : `https://${w}`) : undefined);

/**
 * Add contests from the state list whose district appears on the (Cook)
 * maps and isn't already on the Chicago list, and attach official websites.
 */
export function addStateList(text, races, layers, inCook) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split('\t');
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [header[i], v.trim()])))
    .filter((r) => r.CandidateStatus === 'Active');

  const have = new Set(races.filter((r) => r.area).map((r) => `${r.area.type}:${r.area.id}`));
  // Statewide file: keep only districts that actually reach into Cook.
  const onMap = (a) => inCook(layers, a.type, a.id);
  const added = new Map();
  for (const r of rows) {
    const o = officeOf(unescapeSql(r.OfficeName));
    if (!o || have.has(`${o.area.type}:${o.area.id}`) || !onMap(o.area)) continue;
    const id = `${o.area.type}-${o.area.id}-${key(o.office)}`.slice(0, 90);
    if (!added.has(id)) {
      added.set(id, { id, office: o.office, section: o.section, area: o.area, voteFor: 1, candidates: [], writeIn: false, numbered: false });
    }
    added.get(id).candidates.push({ party: r.PartyName ? title(r.PartyName) : 'Independent', seq: +r.PartySequence || 99, name: `${r.FirstName} ${r.LastName}`.replace(/\s+/g, ' ') });
  }
  // No ballot positions in this file: list by party order, number only for picks.
  for (const race of added.values()) {
    race.candidates.sort((a, b) => a.seq - b.seq).forEach((c, i) => { c.ballot = i + 1; delete c.seq; });
  }

  // Official websites, matched by full name within the same race wording.
  // A name listed with two different sites belongs to two people: use neither.
  const sites = new Map();
  for (const r of rows.filter((x) => x.WebSiteAddress)) {
    const k = key(`${r.FirstName}${r.LastName}`);
    const w = website(r.WebSiteAddress);
    sites.set(k, sites.has(k) && sites.get(k) !== w ? null : w);
  }
  const all = [...races, ...added.values()];
  let withSite = 0;
  for (const race of all) for (const c of race.candidates) {
    const lead = c.name.split(' & ')[0];
    const site = sites.get(key(lead));
    if (site) { c.website = site; withSite += 1; }
  }
  return { races: all, added: added.size, withSite };
}
