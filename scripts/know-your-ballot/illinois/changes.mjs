// What a refresh changed since the last one, for the app's "since your last
// visit" note. Candidates are matched by name within a contest.

const KEEP_DAYS = 60;

function contests(b) {
  return new Map([
    ...b.races.map((r) => [r.id, { what: r.office, candidates: r.candidates }]),
    // A withdrawn judge isn't a new contest: their votes won't count.
    ...b.retentions.filter((r) => !r.withdrawn).map((r) => [r.id, { what: `Retain ${r.judge}?` }]),
    ...b.measures.map((m) => [m.id, { what: m.title }]),
  ]);
}

/** Changes from `prev` to `next`, stamped `at`, appended to prev's recent ones. */
export function changeLog(prev, next, at) {
  const kept = (prev?.changes ?? []).filter((c) => Date.parse(at) - Date.parse(c.at) < KEEP_DAYS * 86_400_000);
  if (!prev) return kept;
  const before = contests(prev);
  const after = contests(next);
  const out = [];
  for (const [id, c] of after) {
    const old = before.get(id);
    if (!old) { out.push({ at, id, what: c.what, kind: 'contest-added' }); continue; }
    if (!c.candidates) continue;
    const oldByName = new Map(old.candidates.map((x) => [x.name, x]));
    const names = new Set(c.candidates.map((x) => x.name));
    for (const x of old.candidates) if (!names.has(x.name)) out.push({ at, id, what: c.what, kind: 'candidate-removed', name: x.name, ballot: x.ballot });
    for (const x of c.candidates) {
      const was = oldByName.get(x.name);
      if (!was) out.push({ at, id, what: c.what, kind: 'candidate-added', name: x.name });
      else if (x.money && x.money.through !== was.money?.through) out.push({ at, id, what: c.what, kind: 'money', name: x.name, raised: x.money.raised });
    }
  }
  for (const [id, c] of before) if (!after.has(id)) out.push({ at, id, what: c.what, kind: 'contest-removed' });
  return [...kept, ...out];
}
