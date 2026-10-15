// Shapes of the static data built by scripts/know-your-ballot/illinois.mjs.

export type Section = 'federal' | 'state' | 'county' | 'judicial' | 'school' | 'legislature' | 'education';

/** Which voters see a contest. `null` on a race = every voter in Cook County. */
export type AreaType = 'cd' | 'sldu' | 'sldl' | 'commissioner' | 'bor' | 'subcircuit' | 'school' | 'ward' | 'mwrd' | 'city' | 'police' | 'county' | 'coa';
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
  /** Nonpartisan-section candidates (Michigan judges): the party that nominated them. */
  nominatedBy?: string;
  /** Campaign website: their State Board filing, else their official homepage. */
  website?: string;
  money?: Money;
  /** Their social media accounts (scripts/know-your-ballot/illinois/social.mjs says where each comes from). */
  social?: Partial<Record<SocialPlatform, string>>;
  /** A profile written by someone else: Injustice Watch (Illinois judges), Ballotpedia (Michigan). */
  profile?: string;
  /** Their photo, saved with the site (scripts/know-your-ballot/illinois/photos.mjs): `file` under the site root, with its credit. */
  photo?: { file: string; credit: string; link?: string; from?: string };
  /** Judicial candidates: each bar group's rating, by its short name, and where the Alliance publishes it. */
  bar?: Record<string, string>;
  barSource?: string;
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
  /** Where this contest's candidate list was read from. */
  source?: string;
}

export interface Retention {
  id: string; court: string; judge: string;
  /** Withdrew after the ballots were printed: still on the ballot, votes not counted. */
  withdrawn?: boolean;
  /** Injustice Watch's profile of the judge. */
  profile?: string;
  /** Each bar group's rating, by its short name ({ CCL: "Yes", ... }). */
  bar?: Record<string, string>;
  /** Where the Alliance publishes this judge's ratings. */
  barSource?: string;
  /** From Injustice Watch's guide. */
  photo?: Candidate['photo'];
}

export type MeasureScope =
  | { type: 'state' | 'county' | 'city' }
  | { type: 'ward'; id: string }
  | { type: 'precinct'; ward: string; precinct: string }
  | { type: 'named'; name: string };

export interface Measure {
  id: string; title: string; question: string; scope: MeasureScope;
  /** What a yes or no does, in plain words. */
  plain?: string;
}

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
  /** The neighborhoods and suburbs covering most of each district, by "type:id" ("cd:6"). */
  places?: Record<string, string[]>;
  /** Recent headlines about the election, newest first. */
  news?: NewsItem[];
}

/** From govbot's election data (github.com/chihacknight/govbot), refreshed daily. */
export interface Govbot {
  asOf: string;
  /** Illinois bills on elections and schools, newest action first. */
  laws: Law[];
  /** Chicago's Feb 23, 2027 city races. */
  city: CityRace[];
  /** govbot's race ids (its search and old #race= links) -> ours, or "2027" for Feb 2027 races. */
  legacy?: Record<string, string>;
}

export interface Law {
  /** With session and id, the bill's key in govbot's catalog. */
  state?: string;
  session?: string;
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

/** A recent headline (scripts/know-your-ballot/news.mjs), with the outlet that wrote it. */
export interface NewsItem { at: string; title: string; url: string; source: string; /** "money" for campaign-finance stories. */ topic?: 'money' }

/** The voter's districts, as resolved from their address. */
export type Districts = Partial<Record<AreaType | 'precinct', string>>;

/** A state's outline as an SVG path, with what's needed to place a point on it. */
export interface Outline {
  width: number;
  height: number;
  path: string;
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  /** Pixels per degree of longitude and latitude. */
  kx: number;
  ky: number;
}
