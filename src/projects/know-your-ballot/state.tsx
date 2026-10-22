import { createContext, useContext } from 'react';
import { explainOffice } from './offices';
import { areaLabel, SCOPE } from './Race';
import { researchLinks, type ResearchLink } from './research';
import type { Candidate, Measure, Race } from './types';

// What differs from state to state in the shared race, candidate and search
// components: how a contest's area and a question's scope are described,
// what each office does, where to read more, and whose money reports these
// are. Illinois is the default, so its guide needs no provider.

export interface StateConfig {
  /** "Michigan", "Cook County": the whole area the guide covers. */
  region: string;
  areaLabel: (r: Race) => string;
  scopeLabel: (m: Measure) => string;
  explainOffice: (office: string) => string;
  researchLinks: (c: Candidate, r: Race) => ResearchLink[];
  /** The agency behind a candidate's money figures, by `Money.source`. */
  moneySource: (source: string) => string;
  /** When no money report was found for a candidate in this race. */
  noMoney: (r: Race) => string;
  /** Under the head-to-head table. */
  compareNote: string;
}

export const ILLINOIS: StateConfig = {
  region: 'Cook County',
  areaLabel,
  scopeLabel: (m) => SCOPE[m.scope.type](m),
  explainOffice,
  researchLinks,
  moneySource: (s) => (s === 'FEC' ? 'Federal Election Commission' : 'Illinois State Board of Elections'),
  noMoney: (r) => (r.section === 'federal'
    ? 'No FEC filings found. Federal candidates who raise or spend under $5,000 don’t have to file.'
    : 'No campaign reports found for this cycle. Illinois candidates who raise or spend under $5,000 in a year don’t need a campaign committee.'),
  compareNote: 'Money and incumbency come from official FEC and Illinois State Board of Elections records. Tap “ⓘ Details” under a name for donors, background and their campaign site.',
};

export const StateContext = createContext<StateConfig>(ILLINOIS);
export const useStateConfig = () => useContext(StateContext);

/**
 * True while the voter has no address (browsing every race): cards show the
 * candidates but picks, skips and yes/no are off, and no trophies are earned.
 */
export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);
