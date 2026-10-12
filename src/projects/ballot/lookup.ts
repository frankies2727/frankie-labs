import type { BallotData, Districts, Measure, Race } from './types';

// Address -> coordinates. Cook County's own address locator is official,
// key-free, built from the county's address points (building-level) and
// allows browser requests. OpenStreetMap's Nominatim covers the rest of
// Illinois and stands in when the county's is down; its policy caps a whole
// app at ~1 request/second, too little to lean on for Cook.
const COOK_LOCATOR = 'https://gis.cookcountyil.gov/traditional/rest/services/AddressLocator/CookAddressComposite/GeocodeServer/findAddressCandidates';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const ILLINOIS_VIEWBOX = '-91.52,42.51,-87.02,36.97';
const MIN_SCORE = 85; // below this the locator is guessing (e.g. wrong N/S)
// A lookup that hangs would leave the voter staring at a spinner.
const TIMEOUT_MS = 10_000;

export interface Place { lat: number; lng: number; label: string }

// A bare street address is most likely in Chicago; anything naming a town or
// ZIP is left alone so suburban addresses resolve where they are.
const withCity = (address: string) => (/,|\b(il|illinois)\b|\d{5}/i.test(address) ? address : `${address}, Chicago, IL`);
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function cookCounty(address: string): Promise<Place | null> {
  const res = await fetch(`${COOK_LOCATOR}?SingleLine=${encodeURIComponent(withCity(address))}&maxLocations=1&outSR=4326&f=json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Cook County locator: ${res.status}`);
  const { candidates } = (await res.json()) as { candidates?: { address: string; score: number; location: { x: number; y: number } }[] };
  const hit = candidates?.[0];
  return hit && hit.score >= MIN_SCORE
    ? { lat: hit.location.y, lng: hit.location.x, label: titleCase(hit.address.split(',')[0]) }
    : null;
}

async function openStreetMap(address: string): Promise<Place | null> {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=us&viewbox=${ILLINOIS_VIEWBOX}&bounded=1&q=${encodeURIComponent(withCity(address))}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Nominatim: ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name.split(',').slice(0, 2).join(',') } : null;
}

export async function geocode(address: string): Promise<Place | null> {
  try {
    const hit = await cookCounty(address);
    if (hit) return hit;
  } catch { /* county service down: try the fallback */ }
  return openStreetMap(address);
}

// Coordinates -> districts, against the pre-baked maps (loaded on demand so
// people who only browse never download them).
type Layer = { id: string; rings: number[][] }[];

function inRing(x: number, y: number, ring: number[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type Maps = Promise<{ default: unknown }>;
let maps: Maps | null = null;
let stateMaps: Maps | null = null;
// A failed download (flaky connection) is forgotten so the next lookup retries.
export const prefetchDistricts = () =>
  (maps ??= import('./data/districts.json').catch((e) => { maps = null; throw e; }));
// Congressional and legislative maps for all of Illinois, only fetched for
// addresses outside Cook.
const stateDistricts = () =>
  (stateMaps ??= import('./data/districts-il.json').catch((e) => { stateMaps = null; throw e; }));

async function lookIn(maps: Maps, lat: number, lng: number): Promise<Districts> {
  const { layers } = (await maps).default as { layers: Record<string, Layer> };
  const out: Districts = {};
  for (const [type, features] of Object.entries(layers)) {
    // Odd number of rings containing the point = inside (handles holes).
    const hit = features.find((f) => f.rings.filter((r) => inRing(lng, lat, r)).length % 2 === 1);
    if (hit) out[type as keyof Districts] = hit.id;
  }
  return out;
}

/** The voter's districts; empty outside Illinois. */
export async function districtsAt(lat: number, lng: number): Promise<Districts> {
  const out = await lookIn(prefetchDistricts(), lat, lng);
  // The Cook maps are clipped to a box around the county, so outside Cook
  // only the statewide maps can be trusted.
  if (!inCook(out)) return lookIn(stateDistricts(), lat, lng);
  if (out.ward) {
    out.city = 'chicago'; // Chicago-only contests key off this
    // Only precincts with a precinct-level question are pre-baked (all 1,291
    // would dwarf the rest of the maps), so ask the City for the others.
    out.precinct ??= await chicagoPrecinct(lat, lng);
  }
  return out;
}

const PRECINCTS = 'https://data.cityofchicago.org/resource/i8fv-xe4b.json';
/** "ward-precinct" from the City's 2025 precinct map, or nothing if it doesn't answer. */
async function chicagoPrecinct(lat: number, lng: number): Promise<string | undefined> {
  try {
    const q = new URLSearchParams({ $select: 'ward,precinct', $where: `intersects(the_geom,'POINT(${lng} ${lat})')` });
    const res = await fetch(`${PRECINCTS}?${q}`, { signal: AbortSignal.timeout(6000) });
    const [hit] = (await res.json()) as { ward?: string; precinct?: string }[];
    return hit?.ward && hit.precinct && /^\d+$/.test(hit.ward) && /^\d+$/.test(hit.precinct) ? `${+hit.ward}-${+hit.precinct}` : undefined;
  } catch {
    return undefined; // a missing precinct only hides that one chip
  }
}

/** Every Chicago address is in a ward; every Cook address in a County Board district. */
export const inChicago = (d: Districts) => Boolean(d.ward);
export const inCook = (d: Districts) => Boolean(d.commissioner);
/** Every Illinois address is in a state House district. */
export const inIllinois = (d: Districts) => Boolean(d.sldl);

// Districts -> the contests on this voter's ballot.
const raceApplies = (race: Race, d: Districts | null) =>
  !race.area || !d || d[race.area.type] === race.area.id;

function measureApplies(m: Measure, d: Districts | null): boolean {
  const s = m.scope;
  if (s.type === 'county' || !d) return true;
  // Everything else on the list is a City of Chicago question.
  if (!inChicago(d)) return false;
  if (s.type === 'city' || s.type === 'named') return true;
  if (s.type === 'ward') return d.ward === s.id;
  return s.type === 'precinct' && d.precinct === `${s.ward}-${s.precinct}`;
}

/** Ids of every contest on the ballot for these districts. */
export function ballotIdsFor(data: BallotData, d: Districts | null): Set<string> {
  const b = ballotFor(data, d);
  return new Set([...b.races, ...b.retentions, ...b.measures].map((x) => x.id));
}

export function ballotFor(data: BallotData, d: Districts | null) {
  // Outside Cook: statewide offices and the voter's own U.S. House and
  // legislative races. Everything else we carry is a Cook County contest.
  if (d && !inCook(d)) {
    return {
      races: data.races.filter((r) => (r.area ? d[r.area.type] === r.area.id : r.section === 'federal' || r.section === 'state')),
      retentions: [],
      measures: [],
    };
  }
  return {
    races: data.races.filter((r) => !r.outsideCook && raceApplies(r, d)),
    retentions: data.retentions,
    measures: data.measures.filter((m) => measureApplies(m, d)),
  };
}
