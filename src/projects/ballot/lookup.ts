import type { BallotData, Districts, Measure, Race } from './types';

// Address -> coordinates. Cook County's own address locator is official,
// key-free, built from the county's address points (building-level) and
// allows browser requests. OpenStreetMap's Nominatim is the fallback; its
// policy caps a whole app at ~1 request/second, too little to lean on.
const COOK_LOCATOR = 'https://gis.cookcountyil.gov/traditional/rest/services/AddressLocator/CookAddressComposite/GeocodeServer/findAddressCandidates';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const CHICAGO_VIEWBOX = '-87.94,42.03,-87.52,41.64';
const MIN_SCORE = 85; // below this the locator is guessing (e.g. wrong N/S)

export interface Place { lat: number; lng: number; label: string }

const withCity = (address: string) => (/chicago/i.test(address) ? address : `${address}, Chicago, IL`);
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function cookCounty(address: string): Promise<Place | null> {
  const res = await fetch(`${COOK_LOCATOR}?SingleLine=${encodeURIComponent(withCity(address))}&maxLocations=1&outSR=4326&f=json`);
  if (!res.ok) throw new Error(`Cook County locator: ${res.status}`);
  const { candidates } = (await res.json()) as { candidates?: { address: string; score: number; location: { x: number; y: number } }[] };
  const hit = candidates?.[0];
  return hit && hit.score >= MIN_SCORE
    ? { lat: hit.location.y, lng: hit.location.x, label: titleCase(hit.address.split(',')[0]) }
    : null;
}

async function openStreetMap(address: string): Promise<Place | null> {
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=us&viewbox=${CHICAGO_VIEWBOX}&bounded=1&q=${encodeURIComponent(withCity(address))}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
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

export async function districtsAt(lat: number, lng: number): Promise<Districts> {
  const { layers } = (await import('./data/districts.json')).default as unknown as { layers: Record<string, Layer> };
  const out: Districts = {};
  for (const [type, features] of Object.entries(layers)) {
    // Odd number of rings containing the point = inside (handles holes).
    const hit = features.find((f) => f.rings.filter((r) => inRing(lng, lat, r)).length % 2 === 1);
    if (hit) out[type as keyof Districts] = hit.id;
  }
  return out;
}

/** Is this voter in Chicago at all? Every Chicago address is in a ward. */
export const inChicago = (d: Districts) => Boolean(d.ward);

// Districts -> the contests on this voter's ballot.
const raceApplies = (race: Race, d: Districts | null) =>
  !race.area || !d || d[race.area.type] === race.area.id;

function measureApplies(m: Measure, d: Districts | null): boolean {
  const s = m.scope;
  if (s.type === 'county' || s.type === 'city' || s.type === 'named') return true;
  if (!d) return true;
  if (s.type === 'ward') return d.ward === s.id;
  return s.type === 'precinct' && d.precinct === `${s.ward}-${s.precinct}`;
}

export function ballotFor(data: BallotData, d: Districts | null) {
  return {
    races: data.races.filter((r) => raceApplies(r, d)),
    retentions: data.retentions,
    measures: data.measures.filter((m) => measureApplies(m, d)),
  };
}
