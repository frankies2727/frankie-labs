import { useEffect, useState } from 'react';
import type { Districts } from './types';

// Everything the voter does stays in this browser: picks, plan, districts.
// The street address itself is not kept, only the short label we show back.
export type Choice = number[] | 'yes' | 'no' | 'skip';

export interface Saved {
  place: { label: string; districts: Districts } | null;
  picks: Record<string, Choice>;
  plan: Record<string, boolean | string>;
}

const KEY = 'know-your-ballot:2026-11-03';
const EMPTY: Saved = { place: null, picks: {}, plan: {} };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY; // private mode / blocked storage: start fresh, still works
  }
}

export function useSaved() {
  const [saved, setSaved] = useState<Saved>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* not persisted; app still works */ }
  }, [saved]);
  return [saved, setSaved] as const;
}

export const isDecided = (c: Choice | undefined) => c !== undefined && (!Array.isArray(c) || c.length > 0);

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export function money(n: number): string {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `$${Math.round(n / 1e3)}K`;
  return usd.format(n);
}

/** Whole days from today (Chicago time) until a YYYY-MM-DD date. */
export function daysUntil(isoDate: string, now = new Date()): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now); // YYYY-MM-DD
  return Math.round((Date.parse(isoDate) - Date.parse(today)) / 86_400_000);
}
