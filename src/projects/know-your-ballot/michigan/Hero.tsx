import { StateMap } from '../Hero';
import raw from '../data/michigan/outline.json';
import type { Outline } from '../types';

const COLORS = { fill: ['var(--mi-blue)', 'var(--mi-arboretum)', 'var(--mi-teal)'] as [string, string, string], stroke: 'var(--mi-maize)', pin: 'var(--mi-maize)', pinStroke: 'var(--mi-blue)' };

/** Michigan in maize and blue. */
export function MichiganMap({ at, className }: { at?: { lat: number; lng: number } | null; className?: string }) {
  return <StateMap outline={raw as Outline} name="Michigan" colors={COLORS} id="mi" at={at} className={className} />;
}
