import { useEffect, useState } from 'react';
import type { Districts } from './types';

// Everything the voter does stays in this browser: picks, plan, districts.
// The street address itself is not kept, only the short label we show back.
export type Choice = number[] | 'yes' | 'no' | 'skip';

export interface Saved {
  place: { label: string; districts: Districts } | null;
  picks: Record<string, Choice>;
  plan: Record<string, boolean | string>;
  /** Looking at every race without an address; reopens there next time. */
  browsing?: boolean;
  /** When this device last opened the guide (ISO), for "since your last visit". */
  seen?: string;
}

const KEY = 'know-your-ballot:2026-11-03';
const EMPTY: Saved = { place: null, picks: {}, plan: {} };

// ---- validation ----------------------------------------------------------------
// Storage can be corrupted and resume links can be hand-made, so anything read
// back is rebuilt field by field: unknown keys and wrong types are dropped.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const shortStr = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);

function sanitize(raw: unknown): Saved {
  if (!isObj(raw)) return EMPTY;
  const picks: Record<string, Choice> = {};
  if (isObj(raw.picks)) {
    for (const [id, c] of Object.entries(raw.picks)) {
      if (id.length > 120) continue;
      if (c === 'yes' || c === 'no' || c === 'skip') picks[id] = c;
      else if (Array.isArray(c) && c.length <= 10 && c.every((n) => Number.isInteger(n) && n > 0 && n < 1000)) picks[id] = c as number[];
    }
  }
  const plan: Record<string, boolean | string> = {};
  if (isObj(raw.plan)) {
    for (const [k, v] of Object.entries(raw.plan)) {
      if (k.length <= 40 && (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40))) plan[k] = v;
    }
  }
  let place: Saved['place'] = null;
  if (isObj(raw.place) && isObj(raw.place.districts)) {
    const districts: Districts = {};
    for (const [k, v] of Object.entries(raw.place.districts)) {
      const s = shortStr(v, 20);
      if (s && /^[a-z]{2,12}$/.test(k)) districts[k as keyof Districts] = s;
    }
    place = { label: shortStr(raw.place.label, 120) ?? 'Your saved ballot', districts };
  }
  const seen = typeof raw.seen === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]{8,12}Z$/.test(raw.seen) ? raw.seen : undefined;
  return { place, picks, plan, browsing: raw.browsing === true || undefined, seen };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY; // private mode / blocked storage: start fresh, still works
  }
}

// Ask the browser not to clear our data under storage pressure or after a
// stretch without visits (Safari does that after ~7 days). Chrome and Safari
// decide quietly; Firefox would pop a permission prompt, so we skip it there.
let askedToPersist = false;
function keepData() {
  if (askedToPersist || /firefox/i.test(navigator.userAgent)) return;
  askedToPersist = true;
  navigator.storage?.persist?.().catch(() => { /* best effort */ });
}

export function useSaved() {
  const [saved, setSaved] = useState<Saved>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* not persisted; app still works */ }
    if (Object.keys(saved.picks).length) keepData();
  }, [saved]);
  return [saved, setSaved] as const;
}

export const isDecided = (c: Choice | undefined) => c !== undefined && (!Array.isArray(c) || c.length > 0);
export const hasProgress = (s: Saved) => Object.keys(s.picks).length > 0;

// ---- resume links ------------------------------------------------------------------
// "#resume=<format>.<payload>": everything after # stays in the browser and is
// never sent to any server. The street label is left out on purpose, so a
// forwarded link doesn't carry where you live; districts are enough.
// Format "z" is deflate-compressed JSON (ids repeat a lot, so it shrinks ~5x);
// "j" is plain JSON for browsers without CompressionStream.

const toB64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function resumeLink(s: Saved, base: string): Promise<string> {
  const payload = { picks: s.picks, plan: s.plan, browsing: s.browsing, place: s.place && { districts: s.place.districts } };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  let packed = `j.${toB64url(json)}`;
  try { packed = `z.${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`; } catch { /* older browser: plain */ }
  return `${base}#resume=${packed}`;
}

/** Saved progress carried in this page's #resume=… link, if any (validated). */
export async function readResumeLink(hash: string): Promise<Saved | null> {
  const m = hash.match(/^#resume=([zj])\.([A-Za-z0-9_-]{1,20000})$/);
  if (!m) return null;
  try {
    let bytes = fromB64url(m[2]);
    if (m[1] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    const saved = sanitize(JSON.parse(new TextDecoder().decode(bytes)));
    if (saved.place) saved.place.label = 'Your saved ballot';
    return saved;
  } catch {
    return null; // a mangled link restores nothing rather than half of something
  }
}

// ---- formatting ----------------------------------------------------------------------

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export function money(n: number): string {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `$${Math.round(n / 1e3)}K`;
  return usd.format(n);
}

/** The current time, refreshed every minute so countdowns roll over at midnight. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  return now;
}

/** Whole days from today (Chicago time) until a YYYY-MM-DD date. */
export function daysUntil(isoDate: string, now = new Date()): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now); // YYYY-MM-DD
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86_400_000);
}
