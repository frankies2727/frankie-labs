// Parse the Chicago Board of Elections candidate list (the PDF linked from
// chicagoelections.gov/getting-ballot/candidates, run through `pdftotext
// -layout`) into races, judicial retentions and referenda.
//
// The list covers every contest on any Chicago ballot, in ballot order. Which
// of them a given voter sees depends on their districts — that's the `area`
// on each contest, resolved against district maps in the browser.

const ORDINAL = /(\d+)(?:st|nd|rd|th)/;

const clean = (s) => s.replace(/\s+/g, ' ').trim();

// Where an office's voters live. `null` area = every voter in Cook County
// (statewide and countywide contests). `city` = Chicago only; `mwrd` = inside
// the Water Reclamation District, which covers most but not all of Cook.
function areaFor(office) {
  let m;
  if (/^President of the Chicago Board of Education/.test(office)) return { type: 'city', id: 'chicago' };
  if (/^Metropolitan Water Reclamation District/.test(office)) return { type: 'mwrd', id: '1' };
  if ((m = office.match(/^U\.S\. Representative, (\d+)\w\w District/))) return { type: 'cd', id: m[1] };
  if ((m = office.match(/^State Senator, (\d+)\w\w District/))) return { type: 'sldu', id: m[1] };
  if ((m = office.match(/^State Representative, (\d+)\w\w District/))) return { type: 'sldl', id: m[1] };
  if ((m = office.match(/^County Commissioner, (\d+)\w\w District/))) return { type: 'commissioner', id: m[1] };
  if ((m = office.match(/^Board of Review, (\d+)\w\w District/))) return { type: 'bor', id: m[1] };
  if ((m = office.match(/^Judge, (\d+)\w\w Subcircuit/))) return { type: 'subcircuit', id: m[1] };
  if ((m = office.match(/Board of Education, Subdistrict (\d+[AB])$/))) return { type: 'school', id: m[1] };
  return null;
}

function sectionFor(office) {
  if (/^(United States Senator|U\.S\. Representative)/.test(office)) return 'federal';
  if (/^(Governor|Attorney General|Secretary of State|Comptroller|Treasurer$|State Senator|State Representative)/.test(office)) return 'state';
  if (/^Judge/.test(office)) return 'judicial';
  if (/Board of Education/.test(office)) return 'school';
  return 'county'; // Cook County offices, Board of Review, water reclamation
}

const VOTE_FOR = { one: 1, two: 2, three: 3, four: 4, five: 5 };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function measureScope(text) {
  let m;
  if (/^Cook County$/i.test(text)) return { type: 'county' };
  if (/City of Chicago|Chicago Public Schools/i.test(text)) return { type: 'city' };
  if ((m = text.match(new RegExp(`${ORDINAL.source} Precinct of the ${ORDINAL.source} Ward`)))) return { type: 'precinct', ward: m[2], precinct: m[1] };
  if ((m = text.match(new RegExp(`^the ${ORDINAL.source} Ward$`)))) return { type: 'ward', id: m[1] };
  // Special-purpose territories described in words on the ballot itself; we
  // have no map for them, so the app says "if you live in …".
  return { type: 'named', name: text.replace(/^the proposed /, '') };
}

export function parseCandidateList(text) {
  const asOf = (text.match(/Status as of ([\d/]+ [\d:]+ [AP]M)/) || [])[1] ?? null;
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  const isNoise = (l) => !l.trim() || /^\s*Page \d+ of \d+/.test(l) || /^\s*Ballot No\.\s+Candidate/.test(l);

  const races = [];
  const retentions = [];
  const measures = [];
  let mode = 'races';
  let race = null;
  let pending = []; // retention/measure line buffer

  // Referenda state
  let scope = null;
  let scopeBuf = null;
  let title = [];
  let question = null;
  let questionOpen = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (isNoise(raw)) continue;
    const line = clean(raw);

    if (/^General Election Judicial Retention/.test(line)) { mode = 'retention'; race = null; continue; }
    if (/^Referenda and Local Options$/.test(line)) { mode = 'measures'; continue; }

    if (mode === 'races') {
      const next = lines.slice(i + 1).find((l) => !isNoise(l));
      const vf = next && clean(next).match(/^Vote for (?:not more than )?(\w+)$/i);
      if (vf) {
        const office = line;
        race = {
          id: slug(office),
          office,
          section: sectionFor(office),
          area: areaFor(office),
          voteFor: VOTE_FOR[vf[1].toLowerCase()] ?? Number(vf[1]),
          candidates: [],
          writeIn: false,
        };
        races.push(race);
        i = lines.indexOf(next, i + 1);
        continue;
      }
      const c = line.match(/^\((\d+)\) (.+) \(([^)]+)\) (\S.*)$/);
      if (c && race) {
        race.candidates.push({ ballot: Number(c[1]), name: c[2], party: c[3], status: c[4] });
        continue;
      }
      if (/^Write-in\b/.test(line) && race) { race.writeIn = true; continue; }
      continue; // the intro paragraph and headers
    }

    if (mode === 'retention') {
      if (/^Judge, (.+) \(Retention\)$/.test(line)) { pending = [line.match(/^Judge, (.+) \(Retention\)$/)[1]]; continue; }
      if (/^\(\d+\) (Yes|No)$/.test(line) || /^(Yes|No)$/.test(line)) {
        if (pending.length === 2 && /No$/.test(line)) {
          retentions.push({ id: slug(`retain-${pending[1]}`), court: pending[0], judge: pending[1] });
          pending = [];
        }
        continue;
      }
      if (pending.length === 1) pending.push(line);
      continue;
    }

    // mode === 'measures'
    if (scopeBuf !== null) {
      scopeBuf += ' ' + line;
      if (scopeBuf.endsWith(':')) { scope = measureScope(clean(scopeBuf.slice(0, -1))); scopeBuf = null; }
      continue;
    }
    const to = line.match(/^To the Voters of (.+)$/);
    if (to) {
      if (to[1].endsWith(':')) scope = measureScope(to[1].slice(0, -1));
      else scopeBuf = to[1];
      title = [];
      continue;
    }
    if (questionOpen) {
      question += ' ' + line;
      if (/["”]$/.test(line)) questionOpen = false;
      continue;
    }
    if (/^["“]/.test(line)) {
      question = line;
      questionOpen = !/["”]$/.test(line.slice(1));
      continue;
    }
    if (/^(Yes|No)$/.test(line)) {
      if (line === 'No' && question) {
        const t = clean(title.join(' '));
        measures.push({
          id: slug(`${scope.type}-${scope.ward ?? ''}-${scope.precinct ?? scope.id ?? ''}-${t}`).slice(0, 90),
          title: t,
          question: question.replace(/^["“]|["”]$/g, ''),
          scope,
        });
        title = [];
        question = null;
      }
      continue;
    }
    title.push(line);
  }

  // Candidates the board has marked anything other than "Candidate" (e.g.
  // withdrawn or removed) won't be on the ballot; keep them out of the app.
  for (const r of races) r.candidates = r.candidates.filter((c) => c.status === 'Candidate').map(({ status, ...c }) => c);
  return { asOf, races: races.filter((r) => r.candidates.length || r.writeIn), retentions, measures };
}
