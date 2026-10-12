// Shapes of the static data built by scripts/ballot-build.mjs.

export type Section = 'federal' | 'state' | 'county' | 'judicial' | 'school';

/** Which voters see a contest. `null` on a race = every Chicago voter. */
export type AreaType = 'cd' | 'sldu' | 'sldl' | 'commissioner' | 'bor' | 'subcircuit' | 'school' | 'ward';
export interface Area { type: AreaType; id: string }

export interface Money {
  fecId: string;
  incumbent: boolean;
  raised: number;
  spent: number;
  cash: number;
  fromIndividuals: number;
  /** MM/DD/YYYY, end of the latest report. */
  through: string;
}

export interface Candidate {
  ballot: number;
  name: string;
  party: string;
  money?: Money;
}

export interface Race {
  id: string;
  office: string;
  section: Section;
  area: Area | null;
  voteFor: number;
  candidates: Candidate[];
  writeIn: boolean;
}

export interface Retention { id: string; court: string; judge: string }

export type MeasureScope =
  | { type: 'county' | 'city' }
  | { type: 'ward'; id: string }
  | { type: 'precinct'; ward: string; precinct: string }
  | { type: 'named'; name: string };

export interface Measure { id: string; title: string; question: string; scope: MeasureScope }

export interface BallotData {
  election: { name: string; date: string };
  sources: {
    candidates: { url: string; page: string; asOf: string | null };
    money: { url: string; file: string };
    earlyVoting: { page: string };
  };
  races: Race[];
  retentions: Retention[];
  measures: Measure[];
  /** Each ward's early voting / vote center site, keyed by ward number. */
  earlyVotingSites: Record<string, EarlyVotingSite>;
}

export interface EarlyVotingSite { site: string; address: string; language?: string }

/** The voter's districts, as resolved from their address. */
export type Districts = Partial<Record<AreaType | 'precinct', string>>;
