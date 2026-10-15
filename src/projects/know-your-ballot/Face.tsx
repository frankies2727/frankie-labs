import { useState } from 'react';
import type { Candidate } from './types';

// A candidate's face: their photo, or their initials.

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

/** First and last initials of the person (the first name on a ticket). */
export function initials(name: string) {
  const words = fold(name.split(' & ')[0]).replace(/["“”][^"“”]*["“”]/g, ' ').replace(/\b(Jr|Sr|II|III|IV)\b\.?/g, '').split(/[\s,]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/**
 * A candidate's photo in a circle, or their initials when there's no photo
 * (or it doesn't load). Photos are saved with the site, so no third party is
 * called from the visitor's browser.
 */
export function Face({ c, className }: { c: Pick<Candidate, 'name' | 'photo'>; className: string }) {
  const [broken, setBroken] = useState(false);
  const photo = c.photo && !broken ? `${import.meta.env.BASE_URL}${c.photo.file}` : null;
  return (
    <span className={`relative shrink-0 overflow-hidden rounded-full bg-[#E9EAEE] flex items-center justify-center font-[family-name:var(--gb-font-display)] font-medium text-[#0B1119] ${className}`}>
      {photo
        ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover object-top" />
        : <span aria-hidden="true">{initials(c.name)}</span>}
    </span>
  );
}
