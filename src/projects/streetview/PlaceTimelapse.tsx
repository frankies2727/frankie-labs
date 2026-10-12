import { useState } from 'react';
import { ArrowLeft, Clock, Satellite } from 'lucide-react';
import { StreetViewMode } from './StreetViewMode';
import { SatelliteMode } from './SatelliteMode';

type Mode = 'streetview' | 'satellite';

/**
 * Place Timelapse — watch anywhere on Earth change over time, two ways:
 *  - Street View: ground-level historical panoramas (bring your own Google key).
 *  - Satellite: a year of NASA GIBS satellite imagery, no key, with real
 *    client-side video export.
 * The heavier Street View / Satellite views mount only for the active mode.
 */
export function PlaceTimelapse({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<Mode>('satellite');

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-100">
      {/* Shared chrome: back + mode toggle */}
      <div className="flex-none flex items-center gap-3 px-4 md:px-6 py-3 border-b border-neutral-800 bg-neutral-950">
        <button
          onClick={onExit}
          title="Back to projects"
          className="group inline-flex items-center justify-center w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-100 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        </button>

        <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-full p-1">
          <button
            onClick={() => setMode('satellite')}
            className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              mode === 'satellite'
                ? 'bg-sky-500 text-neutral-950'
                : 'text-neutral-100 hover:text-white'
            }`}
          >
            <Satellite className="w-3.5 h-3.5" />
            Satellite
          </button>
          <button
            onClick={() => setMode('streetview')}
            className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              mode === 'streetview'
                ? 'bg-emerald-500 text-neutral-950'
                : 'text-neutral-100 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Street View
          </button>
        </div>

        <span className="ml-auto hidden md:block text-[10px] font-mono uppercase tracking-widest text-neutral-100">
          {mode === 'satellite'
            ? 'NASA GIBS · no key needed'
            : 'Google Street View · your key'}
        </span>
      </div>

      {/* Active mode fills the rest. Keep both mounted? No — mount only the
          active one so their timers/effects don't run in the background. */}
      <div className="flex-1 min-h-0">
        {mode === 'satellite' ? <SatelliteMode /> : <StreetViewMode />}
      </div>
    </div>
  );
}
