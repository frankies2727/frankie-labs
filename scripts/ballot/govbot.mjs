// The parts of govbot's published election data this guide shows: Illinois
// bills that shape the ballot, and Chicago's Feb 23, 2027 city races. govbot
// rebuilds the file twice a day; we keep only the slices (it's ~800 KB whole).
// https://github.com/chihacknight/govbot

export const GOVBOT_ELECTIONS = 'https://chihacknight.github.io/govbot/dashboard/elections.json';

const keep = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));

export async function govbotSlices() {
  const res = await fetch(GOVBOT_ELECTIONS);
  if (!res.ok) throw new Error(`govbot elections.json: HTTP ${res.status}`);
  const d = await res.json();
  const laws = d.springfield.map((b) => keep(b, ['id', 'title', 'url', 'tags', 'latest_action', 'latest_action_desc', 'hearing']));
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
  return { asOf: d.generated_at, laws, city };
}
