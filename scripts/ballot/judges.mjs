// Judges, from Injustice Watch's Cook County judicial election guide
// (https://2026retention.injusticewatch.org/): a link to each judge's profile,
// the bar associations' ratings of each judge up for retention, and judges who
// withdrew after the ballots were printed (still on the ballot, votes not
// counted), whom the Board's candidate list leaves out. Their reporting itself
// stays on their site: we link to it rather than copy it.

const SITE = 'https://2026retention.injusticewatch.org/';
const DATA = `${SITE}cacheddata/current-en.json`;
const UA = 'KnowYourBallot/1.0 (https://github.com/frankies2727/frankie-labs)';

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const key = (s) => fold(s).replace(/[^a-z]/g, '');
// The judge whose seat it was: "Curry, Jr." and "McLean Meyerson" vs "Meyerson".
const seat = (s) => key(s.replace(/,?\s*Jr\.?$/i, ''));
// Their profile pages: /candidate/<name as a slug>-<candidate id>.
const profileUrl = (c) => `${SITE}candidate/${fold(c.nameFormatted).replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${c.candidateId}`;
const POSITIVE = /^(yes|qualified|well qualified|highly qualified|recommended)$/i;
const NEGATIVE = /^(no|not qualified|not recommended)$/i;

/** How many bar groups rated the judge, and how many found them qualified. */
function barRatings(c) {
  const rated = (c.ratings ?? []).map((r) => r.fields.rating).filter((r) => POSITIVE.test(r) || NEGATIVE.test(r));
  return rated.length ? { yes: rated.filter((r) => POSITIVE.test(r)).length, of: rated.length } : undefined;
}

async function fetchGuide() {
  const res = await fetch(DATA, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${DATA}: HTTP ${res.status}`);
  const races = await res.json();
  if (!Array.isArray(races) || races.length < 20) throw new Error(`${DATA}: unexpected shape`);
  return races.map((r) => ({ ...r.fields, candidates: r.fields.candidates.map((c) => c.fields) }));
}

/** Judges up for retention, in ballot order, and judicial candidates' profiles by "race id|name". */
function fromGuide(guide, races) {
  const judges = guide.filter((r) => r.raceType === 'Retention').flatMap((r) => r.candidates.map((c) => ({
    id: `retain-${fold(c.nameFormatted).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    court: r.level, judge: c.nameFormatted, profile: profileUrl(c), bar: barRatings(c),
    withdrawn: /\bwithdrew\b/i.test(c.notable ?? '') || undefined,
  })));
  // Contested judgeships: "Burke Vacancy" ~ "(Vacancy of Burke)" or
  // "(… Associate Judgeship of Baird)", then the candidate's last name.
  const profiles = new Map();
  const judicial = races.filter((r) => /^Judge/.test(r.office));
  for (const v of guide.filter((r) => r.raceType === 'Vacancy')) {
    const vacated = seat(v.name.replace(/\s*Vacancy$/, ''));
    const race = judicial.find((r) => seat(r.office.match(/(?:Vacancy|Judgeship) of ([^)]+)\)/)?.[1] ?? '').endsWith(vacated));
    for (const c of v.candidates) {
      const cand = race?.candidates.find((x) => key(x.name).includes(key(c.lastName)));
      if (cand) profiles.set(`${race.id}|${cand.name}`, profileUrl(c));
    }
  }
  return { judges, profiles };
}

/** The same, from the last build, for when the guide can't be read. */
const fromPrev = (prev) => ({
  judges: prev?.retentions ?? [],
  profiles: new Map((prev?.races ?? []).flatMap((r) => r.candidates.filter((c) => c.profile).map((c) => [`${r.id}|${c.name}`, c.profile]))),
});

/**
 * Adds `profile` and `bar` to `ballot.retentions`, slots in withdrawn judges,
 * and adds `profile` to judicial candidates. The Board's list sets the order.
 */
export async function addJudges(ballot, prev) {
  let found, note = '';
  try { found = fromGuide(await fetchGuide(), ballot.races); } catch (e) { found = fromPrev(prev); note = ` (${e.message}; kept the last copy)`; }
  const { judges, profiles } = found;

  const details = new Map(judges.map((j) => [key(j.judge), j]));
  const retentions = ballot.retentions.map((r) => {
    const j = details.get(key(r.judge));
    return j ? { ...r, profile: j.profile, bar: j.bar } : r;
  });
  // A withdrawn judge goes back in after the judge they followed in the guide.
  judges.forEach((j, i) => {
    if (!j.withdrawn || retentions.some((r) => key(r.judge) === key(j.judge))) return;
    const at = retentions.findIndex((r) => key(r.judge) === key(judges[i - 1]?.judge ?? ''));
    retentions.splice(at + 1, 0, { id: j.id, court: j.court, judge: j.judge, withdrawn: true, profile: j.profile });
  });
  ballot.retentions = retentions;

  let linked = 0, total = 0;
  for (const r of ballot.races) for (const c of r.candidates) {
    const url = profiles.get(`${r.id}|${c.name}`);
    if (url) { c.profile = url; linked++; } else delete c.profile;
    if (/^Judge/.test(r.office)) total++;
  }
  return { log: [`judges: ${retentions.filter((r) => r.bar).length}/${retentions.length} retentions rated, ${retentions.filter((r) => r.withdrawn).length} withdrawn, ${linked}/${total} judicial candidates linked${note}`] };
}
