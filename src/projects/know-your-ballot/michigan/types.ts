// Shape of the static data built by scripts/know-your-ballot/michigan.mjs.
import type { Change, Law, Measure, NewsItem, Race } from '../types';

export interface MichiganData {
  election: { name: string; date: string };
  sources: {
    /** Each office's candidate page, and the day the list was last read. */
    candidates: { pages: Record<string, string>; asOf: string };
    money: { url: string; file: string };
    /** MiTN's all-transaction exports. */
    stateMoney?: { url: string };
    proposals: { lwv: string; ballotpedia: string };
  };
  races: Race[];
  measures: Measure[];
  /** County name -> Court of Appeals election district. */
  coa: Record<string, string>;
  /** The districts ("cd:6", "sldu:21") that reach into each county, for browsing a county without an address. */
  counties?: Record<string, string[]>;
  /** What the daily refresh found different, newest last. */
  changes?: Change[];
  /** Recent headlines about the election, newest first. */
  news?: NewsItem[];
  /** Lansing's bills on elections and schools, from govbot, newest action first. */
  laws?: Law[];
}
