// Which Illinois counties each congressional and legislative district on the
// ballot covers, so someone outside Cook can browse their county's races
// without typing an address. govbot computes the list for every district
// from the Census county map (actions/scrape-maps in
// github.com/chihacknight/govbot) and publishes it in maps.json.

const GOVBOT_MAPS = 'https://chihacknight.github.io/govbot/dashboard/maps.json';
const KIND = { us_house: 'cd', il_senate: 'sldu', il_house: 'sldl' };

/** govbot's districts -> { "DuPage": ["cd:6", "sldu:21", ...], ... }, counties A–Z, districts in map order. */
export function countiesFrom(maps) {
  const out = {};
  for (const [id, d] of Object.entries(maps.districts ?? {})) {
    const type = KIND[d.kind];
    const n = id.match(/(\d+)$/)?.[1];
    if (!type || !n) continue;
    for (const c of d.counties ?? []) {
      const county = c.replace(/ County$/, '');
      (out[county] ??= []).push(`${type}:${+n}`);
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** Fetch govbot's maps and reduce them; the caller keeps yesterday's copy if this throws. */
export async function districtCounties() {
  const res = await fetch(GOVBOT_MAPS);
  if (!res.ok) throw new Error(`govbot maps.json: HTTP ${res.status}`);
  const counties = countiesFrom(await res.json());
  // Illinois has 102 counties; a thin file would hide most of the state.
  if (Object.keys(counties).length < 90) throw new Error(`govbot maps.json names only ${Object.keys(counties).length} counties`);
  return counties;
}
