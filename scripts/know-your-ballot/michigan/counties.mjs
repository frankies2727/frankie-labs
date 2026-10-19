// Which Michigan counties each congressional and legislative district on the
// ballot reaches into, from the same Census maps the address lookup uses, so
// someone can browse their county's races without typing an address. Two
// shapes touch when a corner of one falls inside the other (a bounding-box
// check first keeps it quick).

import { inRing } from '../geo.mjs';

const bbox = (rings) => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) { w = Math.min(w, r[i]); e = Math.max(e, r[i]); s = Math.min(s, r[i + 1]); n = Math.max(n, r[i + 1]); }
  return [w, s, e, n];
};
const overlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const inside = (rings, x, y) => rings.filter((r) => inRing(x, y, r)).length % 2 === 1;
const anyCornerIn = (of, inRings) => of.some((r) => { for (let i = 0; i < r.length; i += 2) if (inside(inRings, r[i], r[i + 1])) return true; return false; });

/** { "Wayne": ["cd:12", "sldu:1", …], … } from the pre-baked layers (cd, sldu, sldl, county), counties A–Z. */
export function countiesFromLayers(layers) {
  const out = {};
  const counties = (layers.county ?? []).map((c) => ({ ...c, box: bbox(c.rings) }));
  for (const type of ['cd', 'sldu', 'sldl']) {
    for (const d of layers[type] ?? []) {
      const box = bbox(d.rings);
      for (const c of counties) {
        if (!overlap(box, c.box)) continue;
        if (anyCornerIn(d.rings, c.rings) || anyCornerIn(c.rings, d.rings)) (out[c.id] ??= []).push(`${type}:${d.id}`);
      }
    }
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  // Every county is in one of each kind of district; a county with none means a broken map.
  const thin = Object.entries(sorted).filter(([, list]) => !['cd', 'sldu', 'sldl'].every((t) => list.some((k) => k.startsWith(t + ':'))));
  if (Object.keys(sorted).length < 80 || thin.length) throw new Error(`county coverage looks wrong: ${Object.keys(sorted).length} counties, ${thin.map(([c]) => c).join(', ') || 'none'} missing a district`);
  return sorted;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const dir = new URL('../../../src/projects/know-your-ballot/data/michigan/', import.meta.url);
  const counties = countiesFromLayers(JSON.parse(readFileSync(new URL('districts.json', dir), 'utf8')).layers);
  const file = new URL('ballot.json', dir);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data.counties = counties;
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  console.log(`Counties: ${Object.keys(counties).length}; Wayne -> ${counties.Wayne.join(', ')}`);
}
