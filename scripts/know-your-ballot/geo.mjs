// Geometry helpers shared by the state builds: fetch GeoJSON, simplify rings,
// pack them into the compact [lng, lat, lng, lat, ...] form the app reads, and
// point-in-ring tests for checking the maps against the races.

export async function getJson(url) {
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
export function simplify(points, tolerance) {
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
    if (worst > tolerance) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export const ringsOf = (geometry) =>
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : [];

/** Simplified rings, flattened to [lng, lat, ...] with 5 decimals (~1 m). */
export const pack = (rings, tolerance) =>
  rings.map((r) => simplify(r, tolerance)).filter((r) => r.length >= 4).map((r) => r.flatMap(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]));

// "001" / 1 / "1" -> "1": candidate lists number districts without zeros.
export const normalizeId = (v) => String(v).trim().replace(/^0+(?=\d)/, '');

export function inRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    if ((r[i + 1] > y) !== (r[j + 1] > y) && x < ((r[j] - r[i]) * (y - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) inside = !inside;
  }
  return inside;
}
