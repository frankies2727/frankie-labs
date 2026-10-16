// The parts of govbot's published election data this guide shows: a state's
// bills that shape the ballot (any state: govbot publishes every state's
// legislation), and Chicago's Feb 23, 2027 city races. govbot rebuilds the
// files twice a day; we keep only the slices (they run to megabytes whole).
// https://github.com/chihacknight/govbot

export const GOVBOT_ELECTIONS = 'https://chihacknight.github.io/govbot/dashboard/elections.json';
// A state's bills (govbot's legislation data): il_recent.json is Illinois'
// bills with recent activity (~1.5 MB); other states have <state>.json whole.
const GOVBOT_BILLS = 'https://chihacknight.github.io/govbot/dashboard/bills/';
// Like govbot's elections page: bills with action in the last 6 months, the
// curated elections/education list merged with every IL bill tagged that way,
// and an 'Other' tab of everything else (newest OTHER_MAX; the rest are on
// govbot's legislation page).
const RECENT_DAYS = 183;
const OTHER_MAX = 60;
const TOPICS = ['elections & voting', 'education'];

const keep = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));

// state + session + id is the bill's key in govbot's catalog (legislation.html#bill=…).
const LAW_FIELDS = ['state', 'session', 'id', 'title', 'url', 'tags', 'latest_action', 'latest_action_desc', 'hearing'];

/**
 * `state`'s bills with action in the last six months: the elections and
 * education ones (plus `curated`, govbot's own list for Illinois), then the
 * newest of the rest.
 */
export async function recentBills(state, curated = []) {
  const file = state === 'il' ? 'il_recent.json' : `${state}.json`;
  const res = await fetch(`${GOVBOT_BILLS}${file}`);
  if (!res.ok) throw new Error(`govbot ${file}: HTTP ${res.status}`);
  const all = (await res.json()).bills ?? [];
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recent = (b) => (b.latest_action ?? '').slice(0, 10) >= since;
  const newest = (a, b) => (b.latest_action ?? '').localeCompare(a.latest_action ?? '');
  // The curated list carries upcoming hearings, so it wins when a bill is in both.
  const byId = new Map(curated.map((b) => [b.id, b]));
  for (const b of all) if (!byId.has(b.id) && b.tags?.some((t) => TOPICS.includes(t))) byId.set(b.id, b);
  const topical = [...byId.values()].filter(recent);
  const other = all.filter((b) => !byId.has(b.id) && recent(b)).sort(newest).slice(0, OTHER_MAX);
  return [...topical, ...other].sort(newest).map((b) => keep({ state, ...b }, LAW_FIELDS));
}

// govbot's race ids, which its search, RSS and old links use
// (elections.html#race=<id>), mapped to ours so those links open the right
// race: "us-house-il-07" -> the race for congressional district 7. Feb 2027
// races map to "2027" (the page shows those in its Feb 2027 note).
const BY_AREA = { us_house: 'cd', il_senate: 'sldu', il_house: 'sldl', cps_board: 'school' };
const BY_OFFICE = {
  'us-senate-il': 'united-states-senator', 'il-governor': 'governor-lieutenant-governor',
  'il-attorney-general': 'attorney-general', 'il-secretary-of-state': 'secretary-of-state',
  'il-comptroller': 'comptroller', 'il-treasurer': 'treasurer',
  'cps-board-president': 'president-of-the-chicago-board-of-education',
};
function legacyIds(govbotRaces, races) {
  const ours = new Set(races.filter((r) => !r.outsideCook || ['cd', 'sldu', 'sldl'].includes(r.area?.type)).map((r) => r.id));
  const byArea = new Map(races.filter((r) => r.area).map((r) => [`${r.area.type}:${r.area.id.toUpperCase()}`, r.id]));
  const out = {};
  const missing = [];
  for (const r of govbotRaces) {
    if (r.ballot_date === '2027-02-23') { out[r.id] = '2027'; continue; }
    const area = BY_AREA[r.office_group];
    // "IL District 7" / "Senate District 59" / "Subdistrict 1A" -> "7" / "59" / "1A"
    const district = r.district?.match(/(\d+[A-Z]?)\s*$/i)?.[1]?.replace(/^0+(?=\d)/, '').toUpperCase();
    const id = area && district ? byArea.get(`${area}:${district}`) : BY_OFFICE[r.id];
    if (id && ours.has(id)) out[r.id] = id; else missing.push(r.id);
  }
  return { legacy: out, missing };
}

export async function govbotSlices(races) {
  const res = await fetch(GOVBOT_ELECTIONS);
  if (!res.ok) throw new Error(`govbot elections.json: HTTP ${res.status}`);
  const d = await res.json();
  const laws = await recentBills('il', d.springfield);
  const city = d.races
    .filter((r) => r.jurisdiction === 'chicago' && r.ballot_date === '2027-02-23')
    .map((r) => ({
      id: r.id,
      office: r.office,
      group: r.office_group,
      // "Ward 7" / "Police District 007" -> "7", matching our district maps.
      district: r.district ? String(Number(r.district.match(/\d+/)[0])) : null,
      seats: r.seats ?? 1,
      why: r.why_note ?? null,
      // Ward incumbents come from the City's alderperson list via govbot.
      incumbent: r.incumbent?.name ?? null,
      candidates: r.candidates.map((c) => c.name),
    }));
  const count = (g) => city.filter((r) => r.group === g).length;
  // A partial file would quietly drop races from people's 2027 ballots.
  if (count('citywide') !== 3 || count('council') !== 50 || count('police_district_council') !== 22) {
    throw new Error(`govbot 2027 races look incomplete: ${count('citywide')} citywide, ${count('council')} wards, ${count('police_district_council')} police districts`);
  }
  const { legacy, missing } = legacyIds(d.races, races);
  if (missing.length) console.warn(`govbot race ids with no race here: ${missing.join(', ')}`);
  return { asOf: d.generated_at, laws, city, legacy };
}
