import type { Outline } from './types';

export interface MapColors {
  /** The fill's gradient, corner to corner. */
  fill: [string, string, string];
  stroke: string;
  /** The pin's dot and its ring. */
  pin: string;
  pinStroke: string;
}

/**
 * A state's outline, drawn from the Census Bureau's state boundary by the
 * data build. With `at`, a pulsing pin marks the voter's spot. `id` keeps
 * two maps' gradients apart on one page.
 */
export function StateMap({ outline, name, colors, id, at, className = '' }: { outline: Outline; name: string; colors: MapColors; id: string; at?: { lat: number; lng: number } | null; className?: string }) {
  const { width, height, path, bbox, kx, ky } = outline;
  const pin = at && { x: (at.lng - bbox[0]) * kx, y: (bbox[3] - at.lat) * ky };
  const grad = `kyb-grad-${id}`;
  return (
    <svg viewBox={`-20 -20 ${width + 40} ${height + 40}`} className={`kyb-map ${className}`} role="img" aria-label={pin ? `${name}, with your location marked` : name}>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: colors.fill[0] }} />
          <stop offset="0.55" style={{ stopColor: colors.fill[1] }} />
          <stop offset="1" style={{ stopColor: colors.fill[2] }} />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${grad})`} stroke={colors.stroke} strokeWidth="5" strokeLinejoin="round" />
      {pin && (
        <g transform={`translate(${pin.x.toFixed(0)} ${pin.y.toFixed(0)})`}>
          <circle r="34" fill={colors.pin} opacity="0.4" className="kyb-pin-ring" />
          <circle r="16" fill={colors.pin} stroke={colors.pinStroke} strokeWidth="5" />
        </g>
      )}
    </svg>
  );
}
