import { X } from 'lucide-react';

/**
 * The ✕ inside a search box. Place it in the input's `relative` wrapper and
 * give it a right offset and colours; it empties the box and puts the cursor
 * back so the next search can start straight away.
 */
export function ClearButton({ onClear, className = '' }: { onClear: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Clear"
      onClick={(e) => { onClear(); e.currentTarget.parentElement?.querySelector('input')?.focus(); }}
      className={`absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center ${className}`}
    >
      <X className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
