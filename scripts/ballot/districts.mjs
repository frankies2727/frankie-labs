// District maps for Chicago, pre-baked so the browser can turn a lat/lng into
// "your districts" offline. Every source is official and key-free:
//   - Census TIGERweb: 120th Congress, 2026 Illinois Senate and House maps
//   - Cook County GIS: commissioner, Board of Review and judicial subcircuit
//     maps in force since 12/2022 (each has an older map beside it on the
//     same server, with the same district count; these layer numbers are the
//     current ones)
//   - Illinois Senate Redistricting: Chicago Board of Education subdistricts
//     enacted by P.A. 103-0584 (published only as a WGS84 shapefile)
//   - City of Chicago: wards (2023-) and ward precincts (2025-, first used in
//     the March 2026 primary)
//
// Output per layer: [{ id, rings: [[lng, lat, lng, lat, ...], ...] }]. A point
// is inside a feature when it falls inside an odd number of its rings, which
// handles holes and multi-part districts alike.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHICAGO_BBOX = '-87.94,41.64,-87.52,42.03';
const tiger = (layer, field) =>
  `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/${layer}/query?where=STATE%3D%2717%27&geometry=${CHICAGO_BBOX}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${field}&returnGeometry=true&outSR=4326&f=geojson`;
const cook = (layer) =>
  `https://gis.cookcountyil.gov/traditional/rest/services/politicalBoundary/MapServer/${layer}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;

const SOURCES = {
  cd: { url: tiger(0, 'CD120'), id: (p) => p.CD120 },
  sldu: { url: tiger(1, 'SLDU'), id: (p) => p.SLDU },
  sldl: { url: tiger(2, 'SLDL'), id: (p) => p.SLDL },
  commissioner: { url: cook(9), id: (p) => p.DISTRICT_TXT },
  bor: { url: cook(10), id: (p) => p.DISTRICT_TXT },
  subcircuit: { url: cook(5), id: (p) => p.DISTRICT },
  ward: { url: 'https://data.cityofchicago.org/resource/p293-wvbd.geojson?$limit=5000', id: (p) => p.ward },
};
const SCHOOL_SHP = 'https://ilsenateredistricting.com/images/shape-files/ERSB_20_Sub_District_Map_FA1_SB_15.zip';
const PRECINCTS = 'https://data.cityofchicago.org/resource/i8fv-xe4b.geojson?$limit=5000';

// ~3 m: far below a geocoder's own error, and it shrinks the file ~10x.
const TOLERANCE = 0.00003;

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 4) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// Douglas–Peucker on one ring of [lng, lat] points.
function simplify(points) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      // A closed ring starts and ends on the same point: measure from it.
      const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > TOLERANCE) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Clip a ring to Chicago's bounding box (Sutherland–Hodgman against each
// edge). Most districts here spill far into the suburbs; only the part over
// Chicago can ever match a Chicago address, and the rest is dead weight.
const [MINX, MINY, MAXX, MAXY] = CHICAGO_BBOX.split(',').map(Number);
function clip(ring) {
  const edges = [
    [(p) => p[0] >= MINX, (a, b) => cut(a, b, 0, MINX)],
    [(p) => p[0] <= MAXX, (a, b) => cut(a, b, 0, MAXX)],
    [(p) => p[1] >= MINY, (a, b) => cut(a, b, 1, MINY)],
    [(p) => p[1] <= MAXY, (a, b) => cut(a, b, 1, MAXY)],
  ];
  let out = ring;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (!out.length) return out;
  }
  return out;
}
function cut(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return axis === 0 ? [value, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), value];
}

const ringsOf = (geometry) =>
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : [];

const pack = (rings) =>
  rings.map(clip).map(simplify).filter((r) => r.length >= 4).map((r) => r.flatMap(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]));

// "001" / 1 / "1" -> "1": the candidate list numbers districts without zeros.
const normalizeId = (v) => String(v).trim().replace(/^0+(?=\d)/, '');

function fromGeoJson(fc, idOf) {
  return fc.features
    .map((f) => ({ id: normalizeId(idOf(f.properties)), rings: pack(ringsOf(f.geometry)) }))
    .filter((f) => f.rings.length && !/^Z+$/.test(f.id)); // TIGER's "not defined" filler
}

// Minimal reader for a polygon shapefile + its .dbf (all we need, no deps).
function readShapefile(shpPath, dbfPath) {
  const shp = readFileSync(shpPath);
  const shapes = [];
  for (let o = 100; o < shp.length;) {
    const contentBytes = shp.readInt32BE(o + 4) * 2;
    const r = o + 8;
    if (shp.readInt32LE(r) === 5) {
      const numParts = shp.readInt32LE(r + 36);
      const numPoints = shp.readInt32LE(r + 40);
      const parts = Array.from({ length: numParts }, (_, i) => shp.readInt32LE(r + 44 + i * 4));
      const p0 = r + 44 + numParts * 4;
      const pts = Array.from({ length: numPoints }, (_, i) => [shp.readDoubleLE(p0 + i * 16), shp.readDoubleLE(p0 + i * 16 + 8)]);
      shapes.push(parts.map((start, i) => pts.slice(start, parts[i + 1] ?? numPoints)));
    } else shapes.push([]);
    o = r + contentBytes;
  }
  const dbf = readFileSync(dbfPath);
  const nRecords = dbf.readUInt32LE(4);
  const headerLen = dbf.readUInt16LE(8);
  const recordLen = dbf.readUInt16LE(10);
  const fields = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) {
    fields.push({ name: dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: dbf[o + 16] });
  }
  const records = [];
  for (let i = 0; i < nRecords; i++) {
    let o = headerLen + i * recordLen + 1; // skip deletion flag
    const rec = {};
    for (const f of fields) { rec[f.name] = dbf.toString('latin1', o, o + f.len).trim(); o += f.len; }
    records.push(rec);
  }
  return shapes.map((rings, i) => ({ properties: records[i], rings }));
}

async function schoolSubdistricts() {
  const dir = mkdtempSync(join(tmpdir(), 'school-'));
  const res = await fetch(SCHOOL_SHP);
  if (!res.ok) throw new Error(`${SCHOOL_SHP} -> HTTP ${res.status}`);
  writeFileSync(join(dir, 'map.zip'), Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-o', '-q', '-j', join(dir, 'map.zip'), '-d', dir]);
  const base = execFileSync('ls', [dir]).toString().split('\n').find((f) => f.endsWith('.shp')).slice(0, -4);
  return readShapefile(join(dir, base + '.shp'), join(dir, base + '.dbf')).map(({ properties, rings }) => ({
    // LONGNAME is "District 1a"; SHORTNAME/DISTRICT number the 20 subdistricts
    // 1–20 and must not be used ("D2" is subdistrict 1b).
    id: properties.LONGNAME.replace(/^District\s+/i, '').toUpperCase(),
    rings: pack(rings),
  }));
}

/**
 * @param {string[]} precinctKeys "ward-precinct" keys that have a referendum;
 *   only those precincts are kept (all 1,291 would be most of the file).
 */
export async function buildDistricts(precinctKeys) {
  const layers = {};
  for (const [type, { url, id }] of Object.entries(SOURCES)) {
    layers[type] = fromGeoJson(await getJson(url), id);
  }
  layers.school = await schoolSubdistricts();
  const wanted = new Set(precinctKeys);
  layers.precinct = fromGeoJson(await getJson(PRECINCTS), (p) => `${normalizeId(p.ward)}-${normalizeId(p.precinct)}`)
    .filter((f) => wanted.has(f.id));

  // Chicago-only maps must be complete; the county and state ones are clipped
  // to Chicago, so the build checks them against the races instead.
  const expect = { school: 20, ward: 50 };
  for (const [type, n] of Object.entries(expect)) {
    if (new Set(layers[type].map((f) => f.id)).size !== n) throw new Error(`${type}: expected ${n} districts, got ${layers[type].length}`);
  }
  if (layers.precinct.length !== wanted.size) throw new Error(`precincts: wanted ${wanted.size}, got ${layers.precinct.length}`);
  for (const [type, feats] of Object.entries(layers)) console.log(`  ${type}: ${feats.length}`);
  return { layers };
}
