import type { Candidate, Race } from './types';

// Where to dig deeper on a candidate. Search links rather than guessed profile
// URLs: a guessed URL can land on a different person with the same name.
export interface ResearchLink { label: string; href: string; note: string }

const q = encodeURIComponent;
// A governor ticket is "A & B": research the person at the top of it.
const lead = (name: string) => name.split(' & ')[0];

export function researchLinks(c: Candidate, race: Race): ResearchLink[] {
  const who = lead(c.name);
  const links: ResearchLink[] = [
    c.website
      ? { label: 'Their campaign site', href: c.website, note: 'Their own words: from their state filing or official homepage' }
      : { label: 'Search the web for their campaign', href: `https://duckduckgo.com/?q=${q(`${who} ${race.office} Illinois 2026 campaign`)}`, note: 'They listed no site in their filing, so this opens a web search, not their site' },
    { label: 'Ballotpedia', href: `https://ballotpedia.org/wiki/index.php?search=${q(who)}`, note: 'Bio, experience and survey answers' },
  ];
  if (c.money?.source === 'FEC') {
    links.push({ label: 'FEC filings', href: `https://www.fec.gov/data/candidate/${c.money.id}/`, note: 'Every donor and expense, officially' });
  } else if (race.section !== 'federal') {
    // Illinois Sunshine indexes the State Board of Elections filings by name.
    links.push({ label: 'Every donor', href: `https://illinoissunshine.org/search/?term=${q(who)}`, note: 'Itemized state & local donors (Illinois Sunshine)' });
  }
  if (c.profile) {
    links.push({ label: 'Injustice Watch profile', href: c.profile, note: 'Their background and experience, researched by reporters' });
  }
  if (race.section === 'school') {
    links.push({ label: 'Sun-Times / WBEZ voter guide', href: 'https://chicago.suntimes.com/elections/2026/graphics/chicago-school-board-education-voter-guide/', note: 'Each school board candidate’s answers to the same questions' });
  }
  // The League of Women Voters asks every candidate the same questions; answers are listed by address.
  links.push({ label: 'Vote411 candidate Q&A', href: 'https://www.vote411.org/ballot', note: 'League of Women Voters: their answers to the League’s questions, by your address' });
  return links;
}
