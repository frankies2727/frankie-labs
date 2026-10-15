import raw from '../data/michigan/outline.json';
import type { Outline } from './types';

const outline = raw as Outline;

/**
 * Michigan's outline, drawn from the Census Bureau's state boundary by the
 * data build. With `at`, a pulsing pin marks the voter's spot.
 */
export function MichiganMap({ at, className = '' }: { at?: { lat: number; lng: number } | null; className?: string }) {
  const { width, height, path, bbox, kx, ky } = outline;
  const pin = at && { x: (at.lng - bbox[0]) * kx, y: (bbox[3] - at.lat) * ky };
  return (
    <svg viewBox={`-20 -20 ${width + 40} ${height + 40}`} className={`mi-map ${className}`} role="img" aria-label={pin ? 'Michigan, with your location marked' : 'Michigan'}>
      <defs>
        <linearGradient id="mi-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--mi-lake)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mi-lake-2)' }} />
        </linearGradient>
      </defs>
      <path d={path} fill="url(#mi-grad)" stroke="var(--gb-bg)" strokeWidth="6" strokeLinejoin="round" />
      {pin && (
        <g transform={`translate(${pin.x.toFixed(0)} ${pin.y.toFixed(0)})`}>
          <circle r="34" fill="var(--kyb-gold)" opacity="0.35" className="mi-pin-ring" />
          <circle r="16" fill="var(--kyb-gold)" stroke="var(--gb-bg)" strokeWidth="5" />
        </g>
      )}
    </svg>
  );
}
