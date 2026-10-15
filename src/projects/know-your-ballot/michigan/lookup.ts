import mapsUrl from '../data/michigan/districts.json?url';
import { getMaps, lookIn, type Maps } from '../lookup';
import type { Districts, Race } from '../types';
import type { MichiganData } from './types';

// Address -> coordinates. Photon (komoot's OpenStreetMap geocoder) is
// key-free, allows browser requests and answers fast; Nominatim stands in
// when it's down. Both are limited to Michigan so "Main St" lands in state.
const PHOTON = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// West, south, east, north.
const MI_BBOX = [-90.42, 41.69, -82.12, 48.31];
const TIMEOUT_MS = 10_000;

export interface Place { lat: number; lng: number; label: string }

// Anything not naming a town or ZIP is pinned to the state.
const withState = (address: string) => (/\b(mi|michigan)\b|\d{5}/i.test(address) ? address : `${address}, Michigan`);

async function photon(address: string): Promise<Place | null> {
  const url = `${PHOTON}?q=${encodeURIComponent(withState(address))}&limit=1&lang=en&bbox=${MI_BBOX.join(',')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Photon: ${res.status}`);
  const { features } = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] };
  const hit = features[0];
  if (!hit || hit.properties.state !== 'MI' && hit.properties.state !== 'Michigan') return null;
  const p = hit.properties;
  const street = [p.housenumber, p.street ?? p.name].filter(Boolean).join(' ');
  return { lat: hit.geometry.coordinates[1], lng: hit.geometry.coordinates[0], label: [street, p.city ?? p.county].filter(Boolean).join(', ') || 'Your address' };
}

async function openStreetMap(address: string): Promise<Place | null> {
  const [w, s, e, n] = MI_BBOX;
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=us&viewbox=${w},${n},${e},${s}&bounded=1&q=${encodeURIComponent(withState(address))}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Nominatim: ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name.split(',').slice(0, 2).join(',') } : null;
}

export async function geocode(address: string): Promise<Place | null> {
  try {
    return await photon(address);
  } catch {
    return openStreetMap(address); // Photon down: the slower fallback
  }
}

// Coordinates -> districts, against the pre-baked maps (Congress, Lansing,
// county), loaded on demand so people who only browse never download them.
// A failed download (flaky connection) is forgotten so the next lookup retries.
let maps: Maps | null = null;
export const prefetchDistricts = () =>
  (maps ??= getMaps(mapsUrl).catch((e) => { maps = null; throw e; }));

/** The voter's districts; empty outside Michigan. The county decides the Court of Appeals district. */
export async function districtsAt(lat: number, lng: number, coa: Record<string, string>): Promise<Districts> {
  const d = await lookIn(prefetchDistricts(), lat, lng);
  if (d.county && coa[d.county]) d.coa = coa[d.county];
  return d;
}

/** Every Michigan address is in a state House district. */
export const inMichigan = (d: Districts) => Boolean(d.sldl);

// Districts -> the contests on this voter's ballot. Proposals are statewide.
const raceApplies = (race: Race, d: Districts | null) => !race.area || !d || d[race.area.type] === race.area.id;

export function ballotFor(data: MichiganData, d: Districts | null) {
  return { races: data.races.filter((r) => raceApplies(r, d)), retentions: [], measures: data.measures };
}

export function ballotIdsFor(data: MichiganData, d: Districts | null): Set<string> {
  const b = ballotFor(data, d);
  return new Set([...b.races, ...b.measures].map((x) => x.id));
}
