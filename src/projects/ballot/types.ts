// Shapes of the static data built by scripts/ballot-build.mjs.

export type Section = 'federal' | 'state' | 'county' | 'judicial' | 'school';

/** Which voters see a contest. `null` on a race = every voter in Cook County. */
export type AreaType = 'cd' | 'sldu' | 'sldl' | 'commissioner' | 'bor' | 'subcircuit' | 'school' | 'ward' | 'mwrd' | 'city' | 'police';
export interface Area { type: AreaType; id: string }

/** Campaign totals this cycle (since Jan 1, 2025), from official filings. */
export interface Money {
  /** FEC for federal candidates, the Illinois State Board of Elections otherwise. */
  source: 'FEC' | 'ISBE';
  /** FEC candidate ID, or ISBE committee ID. */
  id: string;
  raised: number;
  spent: number;
  /** Cash on hand at the end of the latest report. */
  cash: number;
  /** MM/DD/YYYY, end of the latest report. */
  through: string;
}

export interface Candidate {
  ballot: number;
  name: string;
  party: string;
  /** Only set when official records (FEC or ISBE) say so. */
  incumbent?: boolean;
  /** Campaign website: their State Board filing, else their official homepage. */
  website?: string;
  money?: Money;
  /** Their social media accounts (scripts/ballot/social.mjs says where each comes from). */
  social?: Partial<Record<SocialPlatform, string>>;
}

export type SocialPlatform = 'x' | 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'bluesky' | 'threads' | 'linkedin';

export interface Race {
  id: string;
  office: string;
  section: Section;
  area: Area | null;
  voteFor: number;
  candidates: Candidate[];
  writeIn: boolean;
  /**
   * false for suburban contests from the State Board list, which has no
   * ballot positions; their `ballot` numbers only identify picks.
   */
  numbered?: boolean;
  /** A congressional or legislative district with no part in Cook County. */
  outsideCook?: boolean;
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
    stateCandidates: { url: string };
    money: { url: string; file: string };
    stateMoney: { url: string };
    earlyVoting: { page: string };
  };
  races: Race[];
  retentions: Retention[];
  measures: Measure[];
  /** Each ward's early voting / vote center site, keyed by ward number. */
  earlyVotingSites: Record<string, EarlyVotingSite>;
  /** What the daily refresh found different, newest last (about 60 days kept). */
  changes?: Change[];
  govbot: Govbot;
}

/** From govbot's election data (github.com/chihacknight/govbot), refreshed daily. */
export interface Govbot {
  asOf: string;
  /** Illinois bills on elections and schools, newest action first. */
  laws: Law[];
  /** Chicago's Feb 23, 2027 city races. */
  city: CityRace[];
}

export interface Law {
  id: string;
  title: string;
  url?: string;
  tags: string[];
  latest_action?: string;
  latest_action_desc?: string;
  hearing?: { committee?: string; scheduled_display?: string; details_url?: string; witness_slip_url?: string };
}

export interface CityRace {
  id: string;
  office: string;
  group: 'citywide' | 'council' | 'police_district_council';
  /** Ward or police district number; null for citywide. */
  district: string | null;
  seats: number;
  why: string | null;
  incumbent: string | null;
  /** Official candidates, once the Board certifies them. */
  candidates: string[];
}

/** One thing the daily refresh found different from the day before. */
export interface Change {
  /** ISO timestamp of the refresh that noticed it. */
  at: string;
  /** Contest id. */
  id: string;
  /** Office, judge or question title, kept so a contest that's gone can still be named. */
  what: string;
  kind: 'candidate-added' | 'candidate-removed' | 'money' | 'contest-added' | 'contest-removed';
  name?: string;
  ballot?: number;
  /** Total raised as of the new report. */
  raised?: number;
}

export interface EarlyVotingSite { site: string; address: string; language?: string }

/** The voter's districts, as resolved from their address. */
export type Districts = Partial<Record<AreaType | 'precinct', string>>;
