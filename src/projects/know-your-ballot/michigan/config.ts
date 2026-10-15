import type { ResearchLink } from '../research';
import type { StateConfig } from '../state';
import type { Candidate, Race } from '../types';

// Everything Michigan-specific that the shared components ask for, plus the
// guide's links and section list. Facts are from the Michigan Department of
// State (michigan.gov/sos/elections), checked October 15, 2026.

// Michigan.gov/Vote is the Michigan Voter Information Center: registration
// status, sample ballot, polling place, clerk, early voting sites and
// absentee ballot tracking, all from one address lookup.
export const LINKS = {
  myInfo: 'https://www.michigan.gov/vote',
  register: 'https://www.michigan.gov/sos/elections/voting/register-to-vote',
  absentee: 'https://www.michigan.gov/sos/elections/voting/absentee-voting',
  early: 'https://www.michigan.gov/sos/elections/voting/early-in-person-voting',
  dates: 'https://www.michigan.gov/sos/elections/voting',
  disclosure: 'https://www.michigan.gov/sos/elections/disclosure',
  countyResults: 'https://www.michigan.gov/sos/elections/election-results-and-data/candidate-listings-and-election-results-by-county',
};

export const SHARE_URL = `https://frankies2727.github.io${import.meta.env.BASE_URL}projects/know-your-ballot-michigan`;
export const STORAGE_KEY = 'know-your-ballot:michigan:2026-11-03';

// Ballot order: the partisan section (federal, state, legislature, boards),
// then the nonpartisan section (judges), then proposals. Colours are the
// guide's tokens (ballot.css, michigan.css); the page background is the ink
// on each. Party never gets a colour.
const INK = 'var(--gb-bg)';
export const SECTIONS = [
  { id: 'federal', title: 'Federal', color: 'var(--gb-blue-hi)', ink: INK, emoji: '🏛️' },
  { id: 'state', title: 'Michigan statewide', color: 'var(--mi-lake)', ink: INK, emoji: '🧤' },
  { id: 'legislature', title: 'Lansing', color: 'var(--gb-purple)', ink: INK, emoji: '⭐' },
  { id: 'education', title: 'Schools & universities', color: 'var(--kyb-gold)', ink: INK, emoji: '🎓' },
  { id: 'judicial', title: 'Judges', color: 'var(--mi-copper)', ink: INK, emoji: '⚖️' },
  { id: 'measures', title: 'Proposals', color: 'var(--gb-red)', ink: INK, emoji: '🗳️' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];
export const SECTION_TITLES: Record<string, string> = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title]));

// Plain-English "what does this job actually do", factual and neutral.
const EXPLAINERS: [RegExp, string][] = [
  [/^United States Senator/, 'One of Michigan’s two U.S. senators. Votes on federal laws, confirms federal judges and cabinet members, and approves treaties. 6-year term; this is the seat Gary Peters is leaving.'],
  [/^Representative in Congress/, 'Your district’s seat in the U.S. House. Writes and votes on federal laws and the federal budget. 2-year term.'],
  [/^Governor and Lieutenant Governor/, 'Runs Michigan’s executive branch: proposes the state budget, signs or vetoes bills, appoints department heads. Governor and lieutenant governor run as one ticket. 4-year term; Gretchen Whitmer is term-limited.'],
  [/^Secretary of State/, 'Runs Michigan’s elections and the voter rolls, plus driver’s licenses, IDs and vehicle registration, and files campaign finance reports. 4-year term.'],
  [/^Attorney General/, 'Michigan’s top lawyer. Represents the state in court and enforces consumer-protection, civil-rights and environmental laws. 4-year term.'],
  [/^State Senator/, 'Your seat in the Michigan Senate. Writes and votes on state laws and the state budget in Lansing. 4-year term; all 38 seats are up.'],
  [/^Representative in State Legislature/, 'Your seat in the Michigan House. Writes and votes on state laws and the state budget in Lansing. 2-year term.'],
  [/^Member of the State Board of Education/, 'Sets statewide education policy and hires the state superintendent. Eight members, elected statewide; two seats this year. 8-year term.'],
  [/^Regent of the University of Michigan/, 'Governs the University of Michigan: its budget, tuition and president. Eight regents, elected statewide; two seats this year. 8-year term.'],
  [/^Trustee of Michigan State University/, 'Governs Michigan State University: its budget, tuition and president. Eight trustees, elected statewide; two seats this year. 8-year term.'],
  [/^Governor of Wayne State University/, 'Governs Wayne State University in Detroit: its budget, tuition and president. Eight governors, elected statewide; two seats this year. 8-year term.'],
  [/^Justice of the Supreme Court/, 'Michigan’s highest court: the final word on state law. Listed without party on the ballot’s nonpartisan section, though parties nominate the candidates. Seven justices; two seats this year. 8-year term.'],
  [/^Judge of the Court of Appeals/, 'Hears appeals from trial courts across your Court of Appeals district. Sitting judges are usually unopposed; a “yes” is voting for the name, leaving it blank is not. 6-year term.'],
];
const explainOffice = (office: string) => EXPLAINERS.find(([re]) => re.test(office))?.[1] ?? '';

const AREA_LABEL: Record<string, string> = { cd: 'Congressional District', sldu: 'State Senate District', sldl: 'State House District', coa: 'Court of Appeals District' };
const areaLabel = (r: Race) => (r.area ? `${AREA_LABEL[r.area.type] ?? r.area.type} ${r.area.id}` : 'Statewide');

const q = encodeURIComponent;
const lead = (name: string) => name.split(' & ')[0];

function researchLinks(c: Candidate, race: Race): ResearchLink[] {
  const who = lead(c.name);
  const links: ResearchLink[] = [];
  if (c.profile) links.push({ label: 'Ballotpedia profile', href: c.profile, note: 'Bio, experience, survey answers and campaign site' });
  if (c.website) links.push({ label: 'Their campaign site', href: c.website, note: 'Their own words on the issues' });
  else links.push({ label: 'Find their campaign site', href: `https://duckduckgo.com/?q=${q(`${who} ${race.office.replace(/ \(\d+ seats\)$/, '')} Michigan 2026 campaign`)}`, note: 'Their own words on the issues' });
  if (c.money?.source === 'FEC') links.push({ label: 'FEC filings', href: `https://www.fec.gov/data/candidate/${c.money.id}/`, note: 'Every donor and expense, officially' });
  else if (race.section !== 'federal') links.push({ label: 'Michigan campaign finance', href: LINKS.disclosure, note: 'Search the state’s disclosure database for their committee' });
  return links;
}

export const MICHIGAN: StateConfig = {
  region: 'Michigan',
  areaLabel,
  scopeLabel: () => 'Statewide proposal',
  explainOffice,
  researchLinks,
  moneySource: () => 'Federal Election Commission',
  noMoney: (r) => (r.section === 'federal'
    ? 'No FEC filings found. Federal candidates who raise or spend under $5,000 don’t have to file.'
    : 'State and local campaign money isn’t in this guide yet. The Michigan Bureau of Elections’ disclosure database has every report.'),
  compareNote: 'Federal money comes from FEC records; incumbency from the candidate lists. Tap “ⓘ Details” under a name for their profile and campaign site.',
};

/** A district's number as a chip: "Congress 7", "County Ingham". */
export const DISTRICT_CHIPS: [string, string][] = [
  ['county', 'County'], ['cd', 'Congress'], ['sldu', 'State Senate'], ['sldl', 'State House'], ['coa', 'Court of Appeals'],
];
