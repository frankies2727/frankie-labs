// Shape of the static data built by scripts/know-your-ballot/michigan.mjs.
import type { Change, Measure, NewsItem, Race } from '../types';

export interface MichiganData {
  election: { name: string; date: string };
  sources: {
    /** Each office's candidate page, and the day the list was last read. */
    candidates: { pages: Record<string, string>; asOf: string };
    money: { url: string; file: string };
    proposals: { lwv: string; ballotpedia: string };
  };
  races: Race[];
  measures: Measure[];
  /** County name -> Court of Appeals election district. */
  coa: Record<string, string>;
  /** What the daily refresh found different, newest last. */
  changes?: Change[];
  /** Recent headlines about the election, newest first. */
  news?: NewsItem[];
}

/** The state's outline as an SVG path, with what's needed to place a point on it. */
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
