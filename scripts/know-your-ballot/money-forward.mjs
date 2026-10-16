// Money figures only move forward. The disclosure agencies' bulk files are
// served from several snapshots at once (Illinois' index and totals files
// came from different days; a report present one hour was gone the next),
// so a build can see less than yesterday's did. When the same source's
// report period for a candidate is older than what we published, keep
// what we published: the agency's data only grows.

const iso = (mdy) => { const m = (mdy ?? '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : ''; };

/** Keep `prev`'s money for any candidate whose fresh figures end earlier. Returns how many were kept. */
export function keepMoneyForward(races, prev) {
  const before = new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => c.money).map((c) => [`${r.id}|${c.name}`, c.money])));
  let kept = 0;
  for (const r of races) for (const c of r.candidates) {
    const old = before.get(`${r.id}|${c.name}`);
    if (!old) continue;
    const stale = !c.money || (c.money.source === old.source && iso(c.money.through) < iso(old.through));
    if (stale) { c.money = old; kept++; }
  }
  return kept;
}
