// District maps for Michigan, pre-baked so the browser turns a lat/lng into
// "your districts" without any further request. All from the Census Bureau's
// TIGERweb (official, key-free): the 120th Congress districts, the 2026
// Michigan Senate and House maps, and the 83 counties (which decide the Court
// of Appeals district and which clerk runs a voter's election).
//
// Output per layer: [{ id, rings: [[lng, lat, lng, lat, ...], ...] }]. A point
// is inside a feature when it falls inside an odd number of its rings.

import { getJson, normalizeId, pack, ringsOf, simplify } from '../geo.mjs';

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
const query = (service, layer, fields) =>
  `${TIGER}/${service}/MapServer/${layer}/query?where=STATE%3D%2726%27&outFields=${fields}&returnGeometry=true&outSR=4326&f=geojson`;

// ~10 m: far below a geocoder's own error; the four layers come to ~1.3 MB.
const TOLERANCE = 0.0001;

const LAYERS = {
  cd: { url: query('Legislative', 0, 'CD120'), id: (p) => p.CD120, count: 13 },
  sldu: { url: query('Legislative', 1, 'SLDU'), id: (p) => p.SLDU, count: 38 },
  sldl: { url: query('Legislative', 2, 'SLDL'), id: (p) => p.SLDL, count: 110 },
  county: { url: query('State_County', 1, 'BASENAME'), id: (p) => p.BASENAME, count: 83 },
};

export async function buildDistricts() {
  const layers = {};
  for (const [type, { url, id, count }] of Object.entries(LAYERS)) {
    const fc = await getJson(url);
    if (fc.exceededTransferLimit) throw new Error(`${type}: TIGERweb returned a partial layer`);
    layers[type] = fc.features
      .map((f) => ({ id: normalizeId(id(f.properties)), rings: pack(ringsOf(f.geometry), TOLERANCE) }))
      .filter((f) => f.rings.length && !/^Z+$/.test(f.id)); // TIGER's "not defined" filler
    if (new Set(layers[type].map((f) => f.id)).size !== count) throw new Error(`${type}: expected ${count} districts, got ${layers[type].length}`);
    console.log(`  ${type}: ${layers[type].length}`);
  }
  return { layers };
}

/**
 * The state's outline as an SVG path (for the hero), drawn on a 1000-wide
 * canvas with the aspect ratio of the state's bounding box. Coarse on
 * purpose: it's a picture, not a map.
 */
export async function buildOutline() {
  const fc = await getJson(query('State_County', 0, 'BASENAME'));
  const rings = ringsOf(fc.features[0].geometry).map((r) => simplify(r, 0.03)).filter((r) => r.length >= 8);
  const xs = rings.flat().map(([x]) => x);
  const ys = rings.flat().map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Longitude degrees are shorter than latitude degrees this far north.
  const kx = 1000 / (x1 - x0);
  const ky = kx * Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const height = Math.round((y1 - y0) * ky);
  const path = rings.map((r) => `M${r.map(([x, y]) => `${((x - x0) * kx).toFixed(0)} ${((y1 - y) * ky).toFixed(0)}`).join('L')}Z`).join('');
  // The bounding box and scales, so the app can place a point on the outline.
  return { width: 1000, height, path, bbox: [+x0.toFixed(4), +y0.toFixed(4), +x1.toFixed(4), +y1.toFixed(4)], kx: +kx.toFixed(3), ky: +ky.toFixed(3) };
}
